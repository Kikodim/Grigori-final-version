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
    assessment: row.assessment ?? "",
    whyThisMatters: row.whyThisMatters ?? row.why_this_matters ?? [],
    watchIndicators: row.watchIndicators ?? row.watch_indicators ?? [],
    confidenceRationale: row.confidenceRationale ?? row.confidence_rationale ?? "",
    marketImpact: row.marketImpact ?? row.market_impact ?? {},
    sourceAssessment: row.sourceAssessment ?? row.source_assessment ?? {},
    isHistorical: row.isHistorical ?? row.is_historical ?? false,
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
    lastSeenAt: row.lastSeenAt ?? row.last_seen_at ?? null,
    refreshedAt: row.refreshedAt ?? row.refreshed_at ?? null,
    freshnessStatus: row.freshnessStatus ?? row.freshness_status ?? null,
  };
}

function getEventActivityTimestamp(event) {
  if (!event) return null;
  return (
    event.refreshedAt ??
    event.refreshed_at ??
    event.lastSeenAt ??
    event.last_seen_at ??
    event.updatedAt ??
    event.updated_at ??
    event.aiUpdatedAt ??
    event.ai_updated_at ??
    event.createdAt ??
    event.created_at ??
    event.timestamp ??
    null
  );
}

function computeFreshnessStatus(event) {
  if (event.isHistorical ?? event.is_historical) return "Historical";
  const value = getEventActivityTimestamp(event);
  if (!value) return "Stale";
  const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 3600_000);
  if (hours < 2) return "Fresh";
  if (hours < 6) return "Recent";
  if (hours <= 12) return "Aging";
  return "Stale";
}

function scoreFreshness(event) {
  switch (computeFreshnessStatus(event)) {
    case "Fresh":
      return 100;
    case "Recent":
      return 74;
    case "Aging":
      return 48;
    case "Historical":
      return 8;
    default:
      return 18;
  }
}

function scoreActivePriority(event) {
  const impactScore = Number(event.impactScore ?? event.impact_score ?? event.importanceScore ?? event.importance_score ?? 0);
  const severityScore = Number(event.severityScore ?? event.severity_score ?? 0);
  const importanceScore = Number(event.importanceScore ?? event.importance_score ?? 0);
  const confidenceScore = Number(event.confidenceScore ?? event.confidence_score ?? 0);
  const freshnessScore = scoreFreshness(event);

  return (
    impactScore * 0.4 +
    severityScore * 0.3 +
    importanceScore * 0.2 +
    freshnessScore * 0.1 +
    confidenceScore * 0.03
  );
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
  const now = new Date().toISOString();
  const createdAt = event.createdAt ?? event.created_at ?? event.timestamp ?? now;
  const updatedAt = event.updatedAt ?? event.updated_at ?? now;
  const lastSeenAt = event.lastSeenAt ?? event.last_seen_at ?? updatedAt;
  const refreshedAt = event.refreshedAt ?? event.refreshed_at ?? updatedAt;
  const isHistorical = Boolean(event.isHistorical ?? event.is_historical);

  return {
    id,
    title: event.title,
    location: event.location,
    timestamp: event.timestamp,
    summary: event.summary,
    assessment: event.assessment ?? "",
    developments: event.developments,
    tone: event.tone,
    confidence: event.confidence,
    scenarios: event.scenarios,
    why_this_matters: event.whyThisMatters ?? [],
    watch_indicators: event.watchIndicators ?? event.watchIndicators72h ?? [],
    confidence_rationale: event.confidenceRationale ?? "",
    market_impact: event.marketImpact ?? {},
    source_assessment: event.sourceAssessment ?? {},
    sources: event.sources,
    keywords: event.keywords,
    article_ids: normalizeArticleIds(event.articleIds ?? event.article_ids),
    ai_status: event.aiStatus ?? "fallback",
    ai_updated_at: event.aiUpdatedAt ?? null,
    cluster_signature: event.clusterSignature ?? null,
    importance_score: event.importanceScore ?? 0,
    is_historical: isHistorical,
    created_at: createdAt,
    updated_at: updatedAt,
    last_seen_at: lastSeenAt,
    refreshed_at: refreshedAt,
    freshness_status: computeFreshnessStatus({
      ...event,
      isHistorical,
      updatedAt,
      lastSeenAt,
      refreshedAt,
    }),
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
  const lookbackMs = event.isHistorical
    ? 45 * 24 * 60 * 60 * 1000
    : 14 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - lookbackMs).toISOString();

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

function filterMemoryEvents(events, { tone, confidence, region, scope = "active" } = {}) {
  let filtered = [...events];

  if (scope === "active") {
    filtered = filtered.filter((event) => !(event.isHistorical ?? event.is_historical));
  } else if (scope === "historical") {
    filtered = filtered.filter((event) => Boolean(event.isHistorical ?? event.is_historical));
  }

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

function sortEventsForScope(events, scope = "active") {
  const ranked = [...events];
  ranked.sort((left, right) => {
    const leftHistorical = Boolean(left.isHistorical ?? left.is_historical);
    const rightHistorical = Boolean(right.isHistorical ?? right.is_historical);
    const leftActivity = new Date(getEventActivityTimestamp(left) ?? left.timestamp ?? 0).getTime();
    const rightActivity = new Date(getEventActivityTimestamp(right) ?? right.timestamp ?? 0).getTime();
    const leftPriority = scoreActivePriority(left);
    const rightPriority = scoreActivePriority(right);
    const leftImpact = Number(left.impactScore ?? left.impact_score ?? left.importanceScore ?? left.importance_score ?? 0);
    const rightImpact = Number(right.impactScore ?? right.impact_score ?? right.importanceScore ?? right.importance_score ?? 0);
    const leftSeverity = Number(left.severityScore ?? left.severity_score ?? 0);
    const rightSeverity = Number(right.severityScore ?? right.severity_score ?? 0);
    const leftTimestamp = new Date(left.timestamp ?? 0).getTime();
    const rightTimestamp = new Date(right.timestamp ?? 0).getTime();

    if (scope === "historical") {
      return rightTimestamp - leftTimestamp || rightActivity - leftActivity;
    }

    if (scope === "all" && leftHistorical !== rightHistorical) {
      return leftHistorical ? 1 : -1;
    }

    return (
      rightActivity - leftActivity ||
      rightPriority - leftPriority ||
      rightImpact - leftImpact ||
      rightSeverity - leftSeverity ||
      rightTimestamp - leftTimestamp
    );
  });
  return ranked;
}

function getMemoryStatsSnapshot() {
  const currentEvents = getAllEvents();
  const currentStoreStats = memoryStats();
  const activeEvents = currentEvents.filter((event) => !(event.isHistorical ?? event.is_historical));
  const historicalEvents = currentEvents.filter((event) => event.isHistorical ?? event.is_historical);
  const staleEventCount = activeEvents.filter((event) => computeFreshnessStatus(event) === "Stale").length;
  const newestUpdatedEvent = sortEventsForScope(currentEvents, "all")[0] ?? null;

  return {
    mode: "memory",
    eventCount: currentEvents.length,
    oldestEvent: currentEvents.at(-1)?.timestamp ?? null,
    newestEvent: currentEvents[0]?.timestamp ?? null,
    newestUpdatedEvent: getEventActivityTimestamp(newestUpdatedEvent),
    activeEventCount: activeEvents.length,
    historicalEventCount: historicalEvents.length,
    staleEventCount,
    articles: currentStoreStats.articles,
    unclustered: currentStoreStats.unclustered,
  };
}

export async function insertEvent(event) {
  const now = new Date().toISOString();
  const equivalentMemoryEvent = findEquivalentMemoryEvent(event);
  const memoryEvent = equivalentMemoryEvent
    ? mergeEvent(equivalentMemoryEvent, event)
    : { ...event, articleIds: normalizeArticleIds(event.articleIds) };
  const hydratedMemoryEvent = normalizeEvent({
    ...memoryEvent,
    created_at: memoryEvent.createdAt ?? memoryEvent.created_at ?? equivalentMemoryEvent?.createdAt ?? equivalentMemoryEvent?.created_at ?? event.timestamp ?? now,
    updated_at: now,
    last_seen_at: event.lastSeenAt ?? event.last_seen_at ?? now,
    refreshed_at: event.refreshedAt ?? event.refreshed_at ?? now,
    freshness_status: computeFreshnessStatus({
      ...memoryEvent,
      isHistorical: memoryEvent.isHistorical ?? memoryEvent.is_historical,
      updatedAt: now,
      lastSeenAt: event.lastSeenAt ?? event.last_seen_at ?? now,
      refreshedAt: event.refreshedAt ?? event.refreshed_at ?? now,
    }),
  });

  saveMemoryEvent(hydratedMemoryEvent);

  const db = await getClient();
  if (!db) {
    return {
      persisted: false,
      mode: "memory",
      action: equivalentMemoryEvent ? "updated" : "inserted",
      id: hydratedMemoryEvent.id,
    };
  }

  try {
    const equivalentSupabaseEvent = await findEquivalentSupabaseEvent(db, event);
    const mergedForDb = equivalentSupabaseEvent
      ? mergeEvent(equivalentSupabaseEvent, event)
      : {
          ...event,
          createdAt: event.createdAt ?? event.created_at ?? event.timestamp ?? now,
        };
    const row = buildSupabaseRow(
      {
        ...mergedForDb,
        updatedAt: now,
        lastSeenAt: event.lastSeenAt ?? event.last_seen_at ?? now,
        refreshedAt: event.refreshedAt ?? event.refreshed_at ?? now,
      },
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

export async function getEvents({ limit = 50, offset = 0, tone, confidence, region, scope = "active" } = {}) {
  const db = await getClient();

  if (!db) {
    const filtered = sortEventsForScope(
      filterMemoryEvents(getAllEvents(), { tone, confidence, region, scope }),
      scope
    );
    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
      mode: "memory",
      scope,
    };
  }

  try {
    let query = db
      .from("events")
      .select("*", { count: "exact" });

    if (tone) query = query.eq("tone", tone);
    if (confidence) query = query.eq("confidence", confidence);
    if (region) query = query.ilike("location->>label", `%${region}%`);
    if (scope === "active") query = query.eq("is_historical", false);
    if (scope === "historical") query = query.eq("is_historical", true);

    const { data, error, count } = await query;

    if (error) {
      log.warn(`Supabase query failed — serving in-memory events instead (${error.message})`);
      throw error;
    }

    return {
      events: sortEventsForScope((data ?? []).map(normalizeEvent), scope).slice(offset, offset + limit),
      total: count ?? 0,
      mode: "supabase",
      scope,
    };
  } catch (err) {
    log.warn(`Supabase query failed — serving in-memory events instead (${err.message})`);
    const filtered = sortEventsForScope(
      filterMemoryEvents(getAllEvents(), { tone, confidence, region, scope }),
      scope
    );
    return {
      events: filtered.slice(offset, offset + limit),
      total: filtered.length,
      mode: "memory",
      scope,
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
  const maxAgeMs = hours * 3600_000;
  const cutoff = Date.now() - maxAgeMs;
  const removedInMemory = clearStaleEvents(maxAgeMs);
  const db = await getClient();

  if (!db) {
    return removedInMemory;
  }

  try {
    const { data, error } = await db
      .from("events")
      .select("id, timestamp, updated_at, last_seen_at, refreshed_at, is_historical")
      .eq("is_historical", false);

    if (error) {
      log.warn(`Supabase purge failed — retained in-memory cleanup (${error.message})`);
      return removedInMemory;
    }

    const staleIds = (data ?? [])
      .filter((event) => {
        const activity = getEventActivityTimestamp(event);
        return new Date(activity ?? event.timestamp ?? 0).getTime() < cutoff;
      })
      .map((event) => event.id);

    if (staleIds.length === 0) return removedInMemory;

    const { error: deleteError, count } = await db
      .from("events")
      .delete({ count: "exact" })
      .in("id", staleIds);

    if (deleteError) {
      log.warn(`Supabase purge failed — retained in-memory cleanup (${deleteError.message})`);
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
    const [countRes, oldestRes, newestRes, eventRowsRes] = await Promise.all([
      db.from("events").select("id", { count: "exact", head: true }),
      db.from("events").select("timestamp").order("timestamp", { ascending: true }).limit(1).maybeSingle(),
      db.from("events").select("timestamp").order("timestamp", { ascending: false }).limit(1).maybeSingle(),
      db
        .from("events")
        .select("id, is_historical, timestamp, created_at, updated_at, last_seen_at, refreshed_at, ai_updated_at, importance_score")
        .limit(1000),
    ]);

    if (countRes.error || eventRowsRes.error) {
      log.warn(`Supabase stats failed — falling back to memory (${countRes.error?.message ?? eventRowsRes.error?.message})`);
      return getMemoryStatsSnapshot();
    }

    const normalizedRows = (eventRowsRes.data ?? []).map(normalizeEvent);
    const activeEvents = normalizedRows.filter((event) => !event.isHistorical);
    const historicalEvents = normalizedRows.filter((event) => event.isHistorical);
    const staleEventCount = activeEvents.filter((event) => computeFreshnessStatus(event) === "Stale").length;
    const newestUpdatedEvent = sortEventsForScope(normalizedRows, "all")[0] ?? null;

    return {
      mode: "supabase",
      eventCount: countRes.count ?? 0,
      oldestEvent: oldestRes.data?.timestamp ?? null,
      newestEvent: newestRes.data?.timestamp ?? null,
      newestUpdatedEvent: getEventActivityTimestamp(newestUpdatedEvent),
      activeEventCount: activeEvents.length,
      historicalEventCount: historicalEvents.length,
      staleEventCount,
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
    return sortEventsForScope(
      getAllEvents().filter((event) => {
        const activity = getEventActivityTimestamp(event);
        return new Date(activity ?? event.timestamp ?? 0).toISOString() >= cutoff;
      }),
      "active"
    );
  }

  try {
    const { data, error } = await db
      .from("events")
      .select("*")
      .eq("is_historical", false)
      .limit(400);

    if (error) {
      throw error;
    }

    return sortEventsForScope(
      (data ?? [])
        .map(normalizeEvent)
        .filter((event) => {
          const activity = getEventActivityTimestamp(event);
          return new Date(activity ?? event.timestamp ?? 0).toISOString() >= cutoff;
        }),
      "active"
    );
  } catch (err) {
    log.warn(`Supabase recent events lookup failed — using memory fallback (${err.message})`);
    return sortEventsForScope(
      getAllEvents().filter((event) => {
        const activity = getEventActivityTimestamp(event);
        return new Date(activity ?? event.timestamp ?? 0).toISOString() >= cutoff;
      }),
      "active"
    );
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

    let record = data ? {
      key,
      metadata: data.metadata ?? {},
      lastRefresh: data.last_refresh ?? null,
      nextRefresh: data.next_refresh ?? null,
      updatedAt: data.updated_at ?? null,
    } : null;

    if (!record && key === "news") {
      const { data: latestEvent, error: latestError } = await db
        .from("events")
        .select("timestamp, created_at, updated_at, refreshed_at, last_seen_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const derivedLastRefresh = latestEvent?.refreshed_at ?? latestEvent?.last_seen_at ?? latestEvent?.updated_at ?? latestEvent?.created_at ?? null;
      if (!latestError && derivedLastRefresh) {
        const derivedNextRefresh = new Date(new Date(derivedLastRefresh).getTime() + 60 * 60 * 1000).toISOString();
        record = {
          key,
          metadata: {
            derived: true,
            reason: "No explicit refresh_news row found; derived from latest event activity timestamp.",
          },
          lastRefresh: derivedLastRefresh,
          nextRefresh: derivedNextRefresh,
          updatedAt: derivedLastRefresh,
        };
      }
    }

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
    const { error } = await db.from("external_layer_cache").upsert(row, {
      onConflict: "layer_key",
      ignoreDuplicates: false,
    });
    if (error) {
      throw error;
    }
    await recordLayerUsage(`refresh_${key}`, metadata.source ?? "api");
    return { persisted: true, mode: "supabase", record };
  } catch (err) {
    log.warn(`Supabase refresh state upsert failed for ${key}: ${err.message}`);
    return { persisted: false, mode: "memory", error: err.message, record };
  }
}

export async function getRefreshUsageStats(key) {
  return getLayerUsageStats(`refresh_${key}`);
}
