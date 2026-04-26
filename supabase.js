import { createLogger } from "./logger.js";
import { describeEnvVar } from "./config.js";
import {
  clearStaleEvents,
  getAllEvents,
  getEventById as getMemoryEventById,
  saveEvent as saveMemoryEvent,
  stats as memoryStats,
} from "./store.js";

const log = createLogger("storage");
const EQUIVALENT_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const memoryAIUsageLog = [];
const memoryLayerCache = new Map();
const memoryLayerUsageLog = [];
const memoryRefreshState = new Map();
const memoryWaitlistEntries = [];
const memoryUserProfiles = new Map();
const memoryReports = [];
const memoryWatchlists = [];

let clientPromise = null;
let clientDisabled = false;

function getSupabaseConfigStatus() {
  const url = describeEnvVar("SUPABASE_URL");
  const key = describeEnvVar("SUPABASE_SERVICE_ROLE_KEY");

  return {
    url,
    key,
    present: url.present && key.present,
    usable: url.usable && key.usable,
  };
}

function validateSupabaseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return { ok: false, reason: "must use https" };
    if (!parsed.hostname.includes("supabase.co")) {
      return { ok: false, reason: "hostname must include supabase.co" };
    }
    return { ok: true, reason: "valid" };
  } catch {
    return { ok: false, reason: "invalid url" };
  }
}

function normalizeEvent(row) {
  if (!row) return null;
  const location = row.location ?? {};
  const normalizedLocationLabel = String(location.label ?? "").trim().toLowerCase() === "unknown region"
    ? "Region under review"
    : (location.label ?? "Region under review");

  return {
    ...row,
    location: {
      ...location,
      label: normalizedLocationLabel,
      confidence: location.confidence ?? (normalizedLocationLabel === "Region under review" ? "Low" : undefined),
      reason: location.reason ?? (normalizedLocationLabel === "Region under review" ? "Location signals remain under review." : undefined),
    },
    articleIds: row.articleIds ?? row.article_ids ?? [],
    aiStatus: row.aiStatus ?? row.ai_status ?? "fallback",
    aiUpdatedAt: row.aiUpdatedAt ?? row.ai_updated_at ?? null,
    clusterSignature: row.clusterSignature ?? row.cluster_signature ?? null,
    importanceScore: row.importanceScore ?? row.importance_score ?? 0,
  };
}

function normalizeArticleIds(articleIds) {
  return [...new Set((articleIds ?? []).filter(Boolean))].sort();
}

function makeArticleSignature(event) {
  const ids = normalizeArticleIds(event.articleIds ?? event.article_ids);
  return ids.length > 0 ? ids.join("|") : null;
}

function normalizeTitle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeLocationLabel(event) {
  return String(event.location?.label ?? "")
    .trim()
    .toLowerCase();
}

function areEventsEquivalent(a, b) {
  const sigA = makeArticleSignature(a);
  const sigB = makeArticleSignature(b);

  if (sigA && sigB) {
    return sigA === sigB;
  }

  const titleMatches = normalizeTitle(a.title) === normalizeTitle(b.title);
  const locationMatches = normalizeLocationLabel(a) === normalizeLocationLabel(b);
  const timeDelta = Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return titleMatches && locationMatches && timeDelta <= EQUIVALENT_EVENT_WINDOW_MS;
}

function mergeEvent(existing, incoming) {
  const mergedTimestamp = [existing.timestamp, incoming.timestamp]
    .filter(Boolean)
    .sort()
    .at(-1) ?? incoming.timestamp;

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    timestamp: mergedTimestamp,
    articleIds: normalizeArticleIds(incoming.articleIds ?? incoming.article_ids),
  };
}

function buildSupabaseRow(event, id = event.id) {
  return {
    id,
    title: event.title,
    location: event.location,
    timestamp: event.timestamp,
    summary: event.summary,
    developments: event.developments,
    tone: event.tone,
    confidence: event.confidence,
    scenarios: event.scenarios,
    sources: event.sources,
    keywords: event.keywords,
    article_ids: normalizeArticleIds(event.articleIds ?? event.article_ids),
    ai_status: event.aiStatus ?? "fallback",
    ai_updated_at: event.aiUpdatedAt ?? null,
    cluster_signature: event.clusterSignature ?? null,
    importance_score: event.importanceScore ?? 0,
  };
}

function utcDayStartIso(now = Date.now()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function utcMonthStartIso(now = Date.now()) {
  const date = new Date(now);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function getMemoryAIUsageSnapshot() {
  const start = Date.parse(utcDayStartIso());
  const today = memoryAIUsageLog.filter((entry) => Date.parse(entry.created_at) >= start);

  return {
    mode: "memory",
    totalCalls: today.length,
    automationCalls: today.filter((entry) => entry.source === "automation").length,
  };
}

function getMemoryLayerUsageSnapshot(layerKey) {
  const dayStart = Date.parse(utcDayStartIso());
  const monthStart = Date.parse(utcMonthStartIso());
  const rows = memoryLayerUsageLog.filter((entry) => entry.layer_key === layerKey);

  return {
    mode: "memory",
    callsToday: rows.filter((entry) => Date.parse(entry.created_at) >= dayStart).length,
    callsThisMonth: rows.filter((entry) => Date.parse(entry.created_at) >= monthStart).length,
  };
}

function getMemoryLayerCacheRecord(layerKey) {
  return memoryLayerCache.get(layerKey) ?? null;
}

function getMemoryRefreshRecord(key) {
  return memoryRefreshState.get(key) ?? null;
}

function findEquivalentMemoryEvent(event) {
  return getAllEvents().find((candidate) => areEventsEquivalent(candidate, event)) ?? null;
}

async function findEquivalentSupabaseEvent(db, event) {
  const cutoff = new Date(Date.now() - EQUIVALENT_EVENT_WINDOW_MS).toISOString();

  const { data, error } = await db
    .from("events")
    .select("*")
    .gte("timestamp", cutoff)
    .order("timestamp", { ascending: false })
    .limit(200);

  if (error) {
    throw error;
  }

  return (data ?? []).map(normalizeEvent).find((candidate) => areEventsEquivalent(candidate, event)) ?? null;
}

async function getClient() {
  if (clientDisabled) return null;
  if (clientPromise) return clientPromise;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const status = getSupabaseConfigStatus();

  if (!url || !key || !status.usable) return null;

  const urlValidation = validateSupabaseUrl(url);
  if (!urlValidation.ok) {
    clientDisabled = true;
    log.warn(`Supabase disabled — SUPABASE_URL ${urlValidation.reason}`);
    return null;
  }

  clientPromise = import("@supabase/supabase-js")
    .then(({ createClient }) => createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "grigori-watcher" } },
    }))
    .catch((err) => {
      clientDisabled = true;
      log.warn(`Supabase client unavailable — falling back to in-memory storage (${err.message})`);
      return null;
    });

  return clientPromise;
}

export async function getSupabaseServiceClient() {
  return getClient();
}

function filterMemoryEvents(events, { tone, confidence, region } = {}) {
  let filtered = [...events];

  if (tone) {
    filtered = filtered.filter((event) => event.tone === tone);
  }

  if (confidence) {
    filtered = filtered.filter((event) => event.confidence === confidence);
  }

  if (region) {
    const needle = region.toLowerCase();
    filtered = filtered.filter((event) =>
      event.location?.label?.toLowerCase().includes(needle)
    );
  }

  return filtered;
}

function getMemoryStatsSnapshot() {
  const currentEvents = getAllEvents();
  const currentStoreStats = memoryStats();

  return {
    mode: "memory",
    eventCount: currentEvents.length,
    oldestEvent: currentEvents.at(-1)?.timestamp ?? null,
    newestEvent: currentEvents[0]?.timestamp ?? null,
    articles: currentStoreStats.articles,
    unclustered: currentStoreStats.unclustered,
  };
}

export async function insertEvent(event) {
  const equivalentMemoryEvent = findEquivalentMemoryEvent(event);
  const memoryEvent = equivalentMemoryEvent
    ? mergeEvent(equivalentMemoryEvent, event)
    : { ...event, articleIds: normalizeArticleIds(event.articleIds) };

  saveMemoryEvent(memoryEvent);

  const db = await getClient();
  if (!db) {
    return {
      persisted: false,
      mode: "memory",
      action: equivalentMemoryEvent ? "updated" : "inserted",
      id: memoryEvent.id,
    };
  }

  try {
    const equivalentSupabaseEvent = await findEquivalentSupabaseEvent(db, event);
    const row = buildSupabaseRow(
      equivalentSupabaseEvent ? mergeEvent(equivalentSupabaseEvent, event) : event,
      equivalentSupabaseEvent?.id ?? event.id
    );

    const { error } = await db.from("events").upsert(row);
    if (error) {
      log.warn(`Supabase upsert failed for event ${event.id}: ${error.message}`);
      return { persisted: false, mode: "memory", error: error.message };
    }

    return {
      persisted: true,
      mode: "supabase",
      action: equivalentSupabaseEvent ? "updated" : "inserted",
      id: row.id,
    };
  } catch (err) {
    log.warn(`Supabase upsert failed for event ${event.id}: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message };
  }
}

export async function getEvents({ limit = 50, offset = 0, tone, confidence, region } = {}) {
  const db = await getClient();

  if (!db) {
    const filtered = filterMemoryEvents(getAllEvents(), { tone, confidence, region });
    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
      mode: "memory",
    };
  }

  try {
    let query = db
      .from("events")
      .select("*", { count: "exact" })
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    if (tone) query = query.eq("tone", tone);
    if (confidence) query = query.eq("confidence", confidence);
    if (region) query = query.ilike("location->>label", `%${region}%`);

    const { data, error, count } = await query;

    if (error) {
      log.warn(`Supabase query failed — serving in-memory events instead (${error.message})`);
      throw error;
    }

    return {
      events: (data ?? []).map(normalizeEvent),
      total: count ?? 0,
      mode: "supabase",
    };
  } catch (err) {
    log.warn(`Supabase query failed — serving in-memory events instead (${err.message})`);
    const filtered = filterMemoryEvents(getAllEvents(), { tone, confidence, region });
    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
      mode: "memory",
    };
  }
}

export async function getEventById(id) {
  const db = await getClient();

  if (!db) {
    return getMemoryEventById(id);
  }

  try {
    const { data, error } = await db
      .from("events")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      log.warn(`Supabase getEventById failed — checking in-memory store (${error.message})`);
      return getMemoryEventById(id);
    }

    return normalizeEvent(data);
  } catch (err) {
    log.warn(`Supabase getEventById failed — checking in-memory store (${err.message})`);
    return getMemoryEventById(id);
  }
}

export async function deleteOldEvents(hours = 24) {
  const removedInMemory = clearStaleEvents(hours * 3600_000);
  const db = await getClient();

  if (!db) {
    return removedInMemory;
  }

  try {
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
    const { error, count } = await db
      .from("events")
      .delete({ count: "exact" })
      .lt("timestamp", cutoff);

    if (error) {
      log.warn(`Supabase purge failed — retained in-memory cleanup (${error.message})`);
      return removedInMemory;
    }

    return Math.max(removedInMemory, count ?? 0);
  } catch (err) {
    log.warn(`Supabase purge failed — retained in-memory cleanup (${err.message})`);
    return removedInMemory;
  }
}

export async function getStats() {
  const db = await getClient();

  if (!db) {
    return getMemoryStatsSnapshot();
  }

  try {
    const [countRes, oldestRes, newestRes] = await Promise.all([
      db.from("events").select("id", { count: "exact", head: true }),
      db.from("events").select("timestamp").order("timestamp", { ascending: true }).limit(1).maybeSingle(),
      db.from("events").select("timestamp").order("timestamp", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (countRes.error) {
      log.warn(`Supabase stats failed — falling back to memory (${countRes.error.message})`);
      return getMemoryStatsSnapshot();
    }

    return {
      mode: "supabase",
      eventCount: countRes.count ?? 0,
      oldestEvent: oldestRes.data?.timestamp ?? null,
      newestEvent: newestRes.data?.timestamp ?? null,
      articles: memoryStats().articles,
      unclustered: memoryStats().unclustered,
    };
  } catch (err) {
    log.warn(`Supabase stats failed — falling back to memory (${err.message})`);
    return getMemoryStatsSnapshot();
  }
}

export async function getRecentEvents(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
  const db = await getClient();

  if (!db) {
    return getAllEvents().filter((event) => event.timestamp >= cutoff);
  }

  try {
    const { data, error } = await db
      .from("events")
      .select("*")
      .gte("timestamp", cutoff)
      .order("timestamp", { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return (data ?? []).map(normalizeEvent);
  } catch (err) {
    log.warn(`Supabase recent events lookup failed — using memory fallback (${err.message})`);
    return getAllEvents().filter((event) => event.timestamp >= cutoff);
  }
}

export async function recordAIUsage({ source = "automation", clusterSignature = null, inputTokens = 0 } = {}) {
  const entry = {
    source,
    cluster_signature: clusterSignature,
    input_tokens: inputTokens,
    created_at: new Date().toISOString(),
  };

  memoryAIUsageLog.push(entry);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory" };
  }

  try {
    const { error } = await db.from("ai_usage_logs").insert(entry);
    if (error) {
      log.warn(`Supabase AI usage insert failed: ${error.message}`);
      return { persisted: false, mode: "memory", error: error.message };
    }
    return { persisted: true, mode: "supabase" };
  } catch (err) {
    log.warn(`Supabase AI usage insert failed: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message };
  }
}

export async function getAIUsageStats() {
  const db = await getClient();
  const start = utcDayStartIso();

  if (!db) {
    return getMemoryAIUsageSnapshot();
  }

  try {
    const { data, error } = await db
      .from("ai_usage_logs")
      .select("source, input_tokens, created_at")
      .gte("created_at", start);

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    return {
      mode: "supabase",
      totalCalls: rows.length,
      automationCalls: rows.filter((entry) => entry.source === "automation").length,
    };
  } catch (err) {
    log.warn(`Supabase AI usage lookup failed — using memory fallback (${err.message})`);
    return getMemoryAIUsageSnapshot();
  }
}

export async function healthCheck() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const status = getSupabaseConfigStatus();

  if (!url || !key) {
    return {
      ok: true,
      mode: "memory",
      detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
    };
  }

  if (!status.usable) {
    return {
      ok: true,
      mode: "memory",
      detail: "Supabase credentials are placeholders or incomplete",
    };
  }

  const urlValidation = validateSupabaseUrl(url);
  if (!urlValidation.ok) {
    return {
      ok: true,
      mode: "memory",
      detail: `SUPABASE_URL ${urlValidation.reason}`,
    };
  }

  const db = await getClient();
  if (!db) {
    return {
      ok: true,
      mode: "memory",
      detail: "Supabase client unavailable",
    };
  }

  try {
    const { error } = await db.from("events").select("id", { head: true }).limit(1);
    return {
      ok: !error,
      mode: error ? "memory" : "supabase",
      detail: error?.message ?? "Connected",
    };
  } catch (err) {
    return {
      ok: false,
      mode: "memory",
      detail: err.message,
    };
  }
}

export async function getAuthenticatedSupabaseUser(accessToken) {
  if (!accessToken) return null;
  const db = await getClient();
  if (!db) return null;

  try {
    const { data, error } = await db.auth.getUser(accessToken);
    if (error) {
      log.warn(`Supabase auth lookup failed: ${error.message}`);
      return null;
    }
    return data.user ?? null;
  } catch (err) {
    log.warn(`Supabase auth lookup failed: ${err.message}`);
    return null;
  }
}

function defaultUserProfile(userId, email = "") {
  return {
    user_id: userId,
    email,
    subscription_tier: "free",
    subscription_status: "inactive",
    reports_used_today: 0,
    reset_daily_at: utcDayStartIso(Date.now() + 24 * 3600_000),
    stripe_customer_id: null,
    waitlist_opt_in: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function getUserProfile(userId, email = "") {
  const db = await getClient();
  const memoryProfile = memoryUserProfiles.get(userId) ?? defaultUserProfile(userId, email);

  if (!db) {
    memoryUserProfiles.set(userId, memoryProfile);
    return { ...memoryProfile };
  }

  try {
    const { data, error } = await db
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const fresh = defaultUserProfile(userId, email);
      memoryUserProfiles.set(userId, fresh);
      return fresh;
    }

    memoryUserProfiles.set(userId, data);
    return data;
  } catch (err) {
    log.warn(`Supabase user profile lookup failed — using memory fallback (${err.message})`);
    memoryUserProfiles.set(userId, memoryProfile);
    return { ...memoryProfile };
  }
}

export async function upsertUserProfile(profile) {
  const merged = {
    ...defaultUserProfile(profile.user_id, profile.email ?? ""),
    ...profile,
    updated_at: new Date().toISOString(),
  };
  memoryUserProfiles.set(merged.user_id, merged);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory", profile: merged };
  }

  try {
    const { error } = await db.from("user_profiles").upsert(merged);
    if (error) throw error;
    return { persisted: true, mode: "supabase", profile: merged };
  } catch (err) {
    log.warn(`Supabase user profile upsert failed: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message, profile: merged };
  }
}

export async function saveWaitlistEntry(entry) {
  const normalized = {
    email: String(entry.email ?? "").trim().toLowerCase(),
    interest_tier: entry.interestTier ?? "confidential",
    requested_region: entry.requestedRegion ?? "Global",
    note: entry.note ?? "",
    created_at: new Date().toISOString(),
  };
  memoryWaitlistEntries.push(normalized);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory" };
  }

  try {
    const { error } = await db.from("report_waitlist").insert(normalized);
    if (error) throw error;
    return { persisted: true, mode: "supabase" };
  } catch (err) {
    log.warn(`Supabase waitlist insert failed: ${err.message}`);
    return { persisted: false, mode: "supabase", error: err.message };
  }
}

export async function getWaitlistEntries({ limit = 200 } = {}) {
  const db = await getClient();

  if (!db) {
    return {
      mode: "memory",
      entries: [...memoryWaitlistEntries]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit),
    };
  }

  try {
    const { data, error } = await db
      .from("report_waitlist")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return {
      mode: "supabase",
      entries: data ?? [],
    };
  } catch (err) {
    log.warn(`Supabase waitlist lookup failed — using memory fallback (${err.message})`);
    return {
      mode: "memory",
      entries: [...memoryWaitlistEntries]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit),
    };
  }
}

export async function getUserReports(userId, { limit = 20, query = "" } = {}) {
  const db = await getClient();
  const needle = query.trim().toLowerCase();

  if (!db) {
    const filtered = memoryReports
      .filter((report) => report.user_id === userId)
      .filter((report) => !needle || `${report.title} ${report.region} ${report.focus_area}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { mode: "memory", reports: filtered.slice(0, limit) };
  }

  try {
    let qb = db
      .from("reports")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (needle) {
      qb = qb.or(`title.ilike.%${needle}%,region.ilike.%${needle}%,focus_area.ilike.%${needle}%`);
    }

    const { data, error } = await qb;
    if (error) throw error;
    return { mode: "supabase", reports: data ?? [] };
  } catch (err) {
    log.warn(`Supabase report history lookup failed — using memory fallback (${err.message})`);
    const filtered = memoryReports
      .filter((report) => report.user_id === userId)
      .filter((report) => !needle || `${report.title} ${report.region} ${report.focus_area}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { mode: "memory", reports: filtered.slice(0, limit) };
  }
}

export async function saveUserReport(report) {
  const normalized = {
    id: report.id,
    user_id: report.user_id,
    title: report.title,
    region: report.region,
    focus_area: report.focus_area,
    time_horizon: report.time_horizon,
    audience_type: report.audience_type,
    risk_appetite: report.risk_appetite,
    status: report.status ?? "draft",
    content: report.content ?? {},
    favorite: Boolean(report.favorite),
    created_at: report.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memoryReports.push(normalized);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory", report: normalized };
  }

  try {
    const { error } = await db.from("reports").upsert(normalized);
    if (error) throw error;
    return { persisted: true, mode: "supabase", report: normalized };
  } catch (err) {
    log.warn(`Supabase report upsert failed: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message, report: normalized };
  }
}

export async function getUserWatchlists(userId) {
  const db = await getClient();

  if (!db) {
    return {
      mode: "memory",
      watchlists: memoryWatchlists.filter((watchlist) => watchlist.user_id === userId),
    };
  }

  try {
    const { data, error } = await db
      .from("watchlists")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { mode: "supabase", watchlists: data ?? [] };
  } catch (err) {
    log.warn(`Supabase watchlist lookup failed — using memory fallback (${err.message})`);
    return {
      mode: "memory",
      watchlists: memoryWatchlists.filter((watchlist) => watchlist.user_id === userId),
    };
  }
}

export async function getLayerCache(layerKey) {
  const memoryRecord = getMemoryLayerCacheRecord(layerKey);
  const db = await getClient();

  if (!db) {
    return { record: memoryRecord, mode: "memory" };
  }

  try {
    const { data, error } = await db
      .from("external_layer_cache")
      .select("*")
      .eq("layer_key", layerKey)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const record = data ? {
      layerKey: data.layer_key,
      payload: data.payload ?? [],
      metadata: data.metadata ?? {},
      lastRefresh: data.last_refresh ?? null,
      nextRefresh: data.next_refresh ?? null,
      updatedAt: data.updated_at ?? null,
    } : null;

    return { record: record ?? memoryRecord, mode: record ? "supabase" : "memory" };
  } catch (err) {
    log.warn(`Supabase layer cache lookup failed for ${layerKey} — using memory fallback (${err.message})`);
    return { record: memoryRecord, mode: "memory" };
  }
}

export async function setLayerCache(layerKey, payload, metadata = {}, nextRefresh = null) {
  const now = new Date().toISOString();
  const record = {
    layerKey,
    payload,
    metadata,
    lastRefresh: now,
    nextRefresh,
    updatedAt: now,
  };
  memoryLayerCache.set(layerKey, record);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory", record };
  }

  try {
    const row = {
      layer_key: layerKey,
      payload,
      metadata,
      last_refresh: now,
      next_refresh: nextRefresh,
      updated_at: now,
    };
    const { error } = await db.from("external_layer_cache").upsert(row);
    if (error) {
      throw error;
    }
    return { persisted: true, mode: "supabase", record };
  } catch (err) {
    log.warn(`Supabase layer cache upsert failed for ${layerKey}: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message, record };
  }
}

export async function recordLayerUsage(layerKey, source = "api") {
  const entry = {
    layer_key: layerKey,
    source,
    created_at: new Date().toISOString(),
  };
  memoryLayerUsageLog.push(entry);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory" };
  }

  try {
    const { error } = await db.from("external_layer_usage").insert(entry);
    if (error) {
      throw error;
    }
    return { persisted: true, mode: "supabase" };
  } catch (err) {
    log.warn(`Supabase layer usage insert failed for ${layerKey}: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message };
  }
}

export async function getLayerUsageStats(layerKey) {
  const db = await getClient();
  const dayStart = utcDayStartIso();
  const monthStart = utcMonthStartIso();

  if (!db) {
    return getMemoryLayerUsageSnapshot(layerKey);
  }

  try {
    const { data, error } = await db
      .from("external_layer_usage")
      .select("created_at")
      .eq("layer_key", layerKey)
      .gte("created_at", monthStart);

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    return {
      mode: "supabase",
      callsToday: rows.filter((entry) => entry.created_at >= dayStart).length,
      callsThisMonth: rows.length,
    };
  } catch (err) {
    log.warn(`Supabase layer usage lookup failed for ${layerKey} — using memory fallback (${err.message})`);
    return getMemoryLayerUsageSnapshot(layerKey);
  }
}

export async function getRefreshState(key) {
  const memoryRecord = getMemoryRefreshRecord(key);
  const db = await getClient();

  if (!db) {
    return { record: memoryRecord, mode: "memory" };
  }

  try {
    const { data, error } = await db
      .from("external_layer_cache")
      .select("*")
      .eq("layer_key", `refresh_${key}`)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const record = data ? {
      key,
      metadata: data.metadata ?? {},
      lastRefresh: data.last_refresh ?? null,
      nextRefresh: data.next_refresh ?? null,
      updatedAt: data.updated_at ?? null,
    } : null;

    return { record: record ?? memoryRecord, mode: record ? "supabase" : "memory" };
  } catch (err) {
    log.warn(`Supabase refresh state lookup failed for ${key} — using memory fallback (${err.message})`);
    return { record: memoryRecord, mode: "memory" };
  }
}

export async function setRefreshState(key, metadata = {}, nextRefresh = null) {
  const now = new Date().toISOString();
  const record = {
    key,
    metadata,
    lastRefresh: now,
    nextRefresh,
    updatedAt: now,
  };
  memoryRefreshState.set(key, record);

  const db = await getClient();
  if (!db) {
    return { persisted: false, mode: "memory", record };
  }

  try {
    const row = {
      layer_key: `refresh_${key}`,
      payload: [],
      metadata,
      last_refresh: now,
      next_refresh: nextRefresh,
      updated_at: now,
    };
    const { error } = await db.from("external_layer_cache").upsert(row);
    if (error) {
      throw error;
    }
    return { persisted: true, mode: "supabase", record };
  } catch (err) {
    log.warn(`Supabase refresh state upsert failed for ${key}: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message, record };
  }
}
