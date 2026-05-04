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

function sanitizeSupabaseError(error, context = {}) {
  if (!error) return null;
  const message = String(error.message ?? error.error_description ?? error.toString?.() ?? "Supabase operation failed");
  const details = error.details ? String(error.details) : null;
  const hint = error.hint ? String(error.hint) : null;
  const code = error.code ? String(error.code) : null;
  const missingColumn = message.match(/column ["']?([a-zA-Z0-9_]+)["']?/i)?.[1]
    ?? details?.match(/column ["']?([a-zA-Z0-9_]+)["']?/i)?.[1]
    ?? null;
  return {
    stage: context.stage ?? "supabase",
    table: context.table ?? null,
    operation: context.operation ?? null,
    code,
    message,
    hint: missingColumn ? `Missing ${context.table ?? "table"}.${missingColumn}. Run the latest Supabase migrations.` : hint,
    details,
    eventId: context.eventId ?? null,
    eventTitle: context.eventTitle ? String(context.eventTitle).slice(0, 160) : null,
    key: context.key ?? null,
    rejectedFields: context.rejectedFields ?? [],
  };
}

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

function getSupabaseEnvDiagnostics() {
  const status = getSupabaseConfigStatus();
  return {
    hasSupabaseUrl: status.url.usable,
    hasSupabaseServiceRoleKey: status.key.usable,
    supabaseStatus: status.usable ? "ok" : status.present ? "missing_env" : "missing_env",
    supabaseError: status.usable ? null : "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing or not usable",
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
    newestSourceAt: row.newestSourceAt ?? row.newest_source_at ?? null,
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
    event.newestSourceAt ??
    event.newest_source_at ??
    event.updatedAt ??
    event.updated_at ??
    event.createdAt ??
    event.created_at ??
    event.timestamp ??
    null
  );
}

function getEventActivityTime(event) {
  return getEventActivityTimestamp(event);
}

function getEventAgeHours(event) {
  const value = getEventActivityTime(event);
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3600_000);
}

function getEventPrimaryTimestamp(event) {
  return (
    event.timestamp ??
    event.createdAt ??
    event.created_at ??
    getEventActivityTime(event) ??
    null
  );
}

function getEventFreshnessWindow(event) {
  if (event.isHistorical ?? event.is_historical) return "Historical";
  const hours = getEventAgeHours(event);
  if (!Number.isFinite(hours)) return "Stale";
  if (hours < 2) return "Fresh";
  if (hours < 6) return "Recent";
  if (hours <= 24) return "Aging";
  return "Stale";
}

function computeFreshnessStatus(event) {
  return getEventFreshnessWindow(event);
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

function isRecentWithinDays(event, days = 7) {
  const value = getEventActivityTime(event) ?? getEventPrimaryTimestamp(event);
  if (!value) return false;
  return Date.now() - new Date(value).getTime() <= days * 24 * 3600_000;
}

function isHighImpactFallbackEvent(event) {
  const impactScore = Number(event.impactScore ?? event.impact_score ?? 0);
  const severityScore = Number(event.severityScore ?? event.severity_score ?? 0);
  const importanceScore = Number(event.importanceScore ?? event.importance_score ?? 0);
  return impactScore >= 60 || severityScore >= 60 || importanceScore >= 60;
}

function getEventSourceCount(event) {
  const assessmentCount = Number(event?.sourceAssessment?.sourceCount ?? event?.source_assessment?.sourceCount ?? 0);
  if (Number.isFinite(assessmentCount) && assessmentCount > 0) return assessmentCount;
  if (Array.isArray(event?.sources)) return event.sources.length;
  if (Array.isArray(event?.articleIds)) return event.articleIds.length;
  if (Array.isArray(event?.article_ids)) return event.article_ids.length;
  return 0;
}

function getEventState(event) {
  if (event?.qualityState === "held_for_review" || event?.quality_state === "held_for_review") return "held_for_review";
  if (event?.qualityState === "rejected_quality" || event?.quality_state === "rejected_quality") return "rejected_quality";
  if (event?.isHistorical ?? event?.is_historical) return "archived";
  const hours = getEventAgeHours(event);
  if (!Number.isFinite(hours)) return isHighImpactFallbackEvent(event) ? "stored_relevant" : "archived";
  if (hours <= 24 && computeFreshnessStatus(event) !== "Stale") return "fresh_active";
  if (hours <= 72) return "recent_context";
  if (hours <= 30 * 24) return "stored_relevant";
  return "archived";
}

function decorateEventState(event, state = getEventState(event), extras = {}) {
  return {
    ...event,
    eventState: state,
    event_state: state,
    freshnessStatus: event.freshnessStatus ?? event.freshness_status ?? computeFreshnessStatus(event),
    freshness_status: event.freshness_status ?? event.freshnessStatus ?? computeFreshnessStatus(event),
    ...extras,
  };
}

const DUPLICATE_STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "after", "over",
  "amid", "says", "said", "saying", "new", "live", "latest", "update", "updates",
  "price", "prices", "market", "markets", "oil",
]);

function tokenizeSignalText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !DUPLICATE_STOP_WORDS.has(token))
    .slice(0, 18);
}

function jaccardSimilarity(leftTokens, rightTokens) {
  const left = new Set(leftTokens);
  const right = new Set(rightTokens);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection++;
  }
  return intersection / (left.size + right.size - intersection);
}

function getDuplicateRegionKey(event) {
  return String(event?.location?.label ?? event?.region?.label ?? "region-under-review")
    .trim()
    .toLowerCase();
}

function areNearDuplicateEvents(left, right) {
  if (!left || !right) return false;
  const sameRegion = getDuplicateRegionKey(left) === getDuplicateRegionKey(right);
  if (!sameRegion) return false;
  const leftSignature = left.clusterSignature ?? left.cluster_signature ?? null;
  const rightSignature = right.clusterSignature ?? right.cluster_signature ?? null;
  if (leftSignature && rightSignature && leftSignature === rightSignature) return true;

  const leftAge = new Date(getEventActivityTimestamp(left) ?? left.timestamp ?? 0).getTime();
  const rightAge = new Date(getEventActivityTimestamp(right) ?? right.timestamp ?? 0).getTime();
  if (Number.isFinite(leftAge) && Number.isFinite(rightAge) && Math.abs(leftAge - rightAge) > 7 * 24 * 3600_000) {
    return false;
  }

  const leftText = `${left.title ?? ""} ${(left.keywords ?? []).join(" ")}`;
  const rightText = `${right.title ?? ""} ${(right.keywords ?? []).join(" ")}`;
  return jaccardSimilarity(tokenizeSignalText(leftText), tokenizeSignalText(rightText)) >= 0.46;
}

function groupNearDuplicateEvents(events) {
  const visible = [];
  let groupedDuplicates = 0;

  for (const event of events) {
    const existingIndex = visible.findIndex((candidate) => areNearDuplicateEvents(candidate, event));
    if (existingIndex === -1) {
      visible.push(decorateEventState(event, getEventState(event), {
        relatedSignalCount: event.relatedSignalCount ?? event.related_signal_count ?? 0,
        relatedSignalsGrouped: event.relatedSignalsGrouped ?? event.related_signals_grouped ?? false,
      }));
      continue;
    }

    groupedDuplicates++;
    const existing = visible[existingIndex];
    const existingScore = scoreActivePriority(existing);
    const incomingScore = scoreActivePriority(event);
    const relatedSignalCount = Number(existing.relatedSignalCount ?? existing.related_signal_count ?? 0) + 1;
    const relatedTitles = [
      ...(existing.relatedSignalTitles ?? existing.related_signal_titles ?? []),
      String(event.title ?? "").slice(0, 140),
    ].filter(Boolean).slice(0, 4);

    if (incomingScore > existingScore + 4) {
      visible[existingIndex] = decorateEventState(event, getEventState(event), {
        relatedSignalCount,
        related_signal_count: relatedSignalCount,
        relatedSignalsGrouped: true,
        related_signals_grouped: true,
        relatedSignalTitles: relatedTitles,
        related_signal_titles: relatedTitles,
      });
    } else {
      visible[existingIndex] = {
        ...existing,
        relatedSignalCount,
        related_signal_count: relatedSignalCount,
        relatedSignalsGrouped: true,
        related_signals_grouped: true,
        relatedSignalTitles: relatedTitles,
        related_signal_titles: relatedTitles,
      };
    }
  }

  return { events: visible, groupedDuplicates };
}

function applyFeedDiversity(events) {
  const firstPass = [];
  const rest = [];
  const seenRegions = new Set();

  for (const event of events) {
    const regionKey = getDuplicateRegionKey(event);
    if (!seenRegions.has(regionKey)) {
      seenRegions.add(regionKey);
      firstPass.push(event);
    } else {
      rest.push(event);
    }
  }

  const result = [...firstPass];
  const regionCounts = new Map(firstPass.map((event) => [getDuplicateRegionKey(event), 1]));
  for (const event of rest) {
    const regionKey = getDuplicateRegionKey(event);
    const count = regionCounts.get(regionKey) ?? 0;
    if (count < 3 || result.length < 5) {
      result.push(event);
      regionCounts.set(regionKey, count + 1);
    } else {
      result.push(event);
    }
  }
  return result;
}

function countEventStates(events) {
  return events.reduce((acc, event) => {
    const state = getEventState(event);
    acc[state] = (acc[state] ?? 0) + 1;
    return acc;
  }, {
    fresh_active: 0,
    recent_context: 0,
    stored_relevant: 0,
    archived: 0,
    held_for_review: 0,
    rejected_quality: 0,
    duplicate_grouped: 0,
  });
}

function scoreActivePriority(event) {
  const impactScore = Number(event.impactScore ?? event.impact_score ?? event.importanceScore ?? event.importance_score ?? 0);
  const severityScore = Number(event.severityScore ?? event.severity_score ?? 0);
  const importanceScore = Number(event.importanceScore ?? event.importance_score ?? 0);
  const confidenceScore = Number(event.confidenceScore ?? event.confidence_score ?? 0);
  const freshnessScore = scoreFreshness(event);
  const aiBonus = ["enriched", "cached"].includes(event.aiStatus ?? event.ai_status ?? "") ? 100 : 0;

  return (
    impactScore * 0.35 +
    severityScore * 0.25 +
    importanceScore * 0.2 +
    freshnessScore * 0.15 +
    aiBonus * 0.05 +
    confidenceScore * 0.02
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
  const newestSourceAt = event.newestSourceAt ?? event.newest_source_at ?? event.timestamp ?? refreshedAt;
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
    newest_source_at: newestSourceAt,
    freshness_status: computeFreshnessStatus({
      ...event,
      isHistorical,
      updatedAt,
      lastSeenAt,
      refreshedAt,
      newestSourceAt,
    }),
  };
}

function classifyPersistenceError(errorInfo, fallback = "persistence_failed") {
  const text = `${errorInfo?.message ?? ""} ${errorInfo?.details ?? ""} ${errorInfo?.hint ?? ""}`.toLowerCase();
  if (text.includes("column") || text.includes("schema cache") || text.includes("relation") || text.includes("does not exist")) return "schema_mismatch";
  if (text.includes("permission") || text.includes("row-level security") || text.includes("rls") || text.includes("jwt")) return "supabase_write_error";
  return fallback;
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

function getMemoryAIUsageSnapshotForSource(source = "automation") {
  const start = Date.parse(utcDayStartIso());
  const today = memoryAIUsageLog.filter((entry) => Date.parse(entry.created_at) >= start && entry.source === source);

  return {
    mode: "memory",
    source,
    totalCalls: today.length,
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

  if (scope === "historical") {
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

function buildActiveScopeSelection(events, { limit = 50, offset = 0 } = {}) {
  const ranked = sortEventsForScope(events, "all");
  const nonHistorical = ranked.filter((event) => !(event.isHistorical ?? event.is_historical));
  const freshActive = nonHistorical.filter((event) => getEventState(event) === "fresh_active");
  const recentStored = nonHistorical.filter((event) => {
    const state = getEventState(event);
    return state === "recent_context" || (freshActive.length < 5 && state === "stored_relevant" && isRecentWithinDays(event, 7));
  });
  const highImpactStale = sortEventsForScope(
    nonHistorical.filter((event) => isHighImpactFallbackEvent(event) && !freshActive.some((fresh) => fresh.id === event.id)),
    "all"
  );
  const historicalContext = sortEventsForScope(
    ranked.filter((event) => Boolean(event.isHistorical ?? event.is_historical)),
    "historical"
  );
  const fallbackEligibleCount = new Set([
    ...recentStored.map((event) => event.id),
    ...highImpactStale.map((event) => event.id),
    ...historicalContext.map((event) => event.id),
  ]).size;

  const selectedById = new Map();
  let fallbackReason = "no_events_available";
  let fallbackUsed = false;
  let storedContextIncluded = 0;

  const appendEvents = (items, state) => {
    for (const event of items) {
      if (selectedById.has(event.id)) continue;
      selectedById.set(event.id, decorateEventState(event, state ?? getEventState(event)));
    }
  };

  if (freshActive.length > 0) {
    appendEvents(freshActive, "fresh_active");
    fallbackReason = "fresh_active";
  }

  if (selectedById.size < 5 && recentStored.length > 0) {
    const before = selectedById.size;
    appendEvents(recentStored);
    storedContextIncluded += Math.max(0, selectedById.size - before);
    fallbackReason = fallbackReason === "fresh_active" ? "fresh_with_recent_context" : "recent_context";
    fallbackUsed = true;
  }

  if (selectedById.size < 5 && highImpactStale.length > 0) {
    const before = selectedById.size;
    appendEvents(highImpactStale);
    storedContextIncluded += Math.max(0, selectedById.size - before);
    fallbackReason = fallbackReason === "no_events_available" ? "high_impact_stale" : fallbackReason;
    fallbackUsed = true;
  }

  if (selectedById.size === 0 && historicalContext.length > 0) {
    appendEvents(historicalContext, "archived");
    fallbackReason = "historical_context";
    fallbackUsed = true;
  }

  const selected = applyFeedDiversity(sortEventsForScope([...selectedById.values()], "all"));
  const grouped = groupNearDuplicateEvents(selected);
  const stateCounts = countEventStates(selected);
  stateCounts.duplicate_grouped = grouped.groupedDuplicates;

  return {
    events: grouped.events.slice(offset, offset + limit),
    total: grouped.events.length,
    fallbackUsed,
    fallbackReason,
    freshnessMode: fallbackReason === "fresh_active" ? "fresh_active" : "best_available",
    fallbackEligibleCount,
    groupedDuplicates: grouped.groupedDuplicates,
    storedContextIncluded,
    stateCounts,
    visibleWithFallbackCount: grouped.events.length,
  };
}

function getMemoryStatsSnapshot() {
  const currentEvents = getAllEvents();
  const currentStoreStats = memoryStats();
  const historicalEvents = currentEvents.filter((event) => event.isHistorical ?? event.is_historical);
  const nonHistoricalEvents = currentEvents.filter((event) => !(event.isHistorical ?? event.is_historical));
  const freshEventCount = nonHistoricalEvents.filter((event) => {
    const freshness = computeFreshnessStatus(event);
    return freshness === "Fresh" || freshness === "Recent";
  }).length;
  const staleEventCount = nonHistoricalEvents.filter((event) => computeFreshnessStatus(event) === "Stale").length;
  const newestUpdatedEvent = sortEventsForScope(currentEvents, "all")[0] ?? null;
  const activeSelection = buildActiveScopeSelection(currentEvents, { limit: currentEvents.length, offset: 0 });
  const stateCounts = countEventStates(currentEvents);

  return {
    mode: "memory",
    eventCount: currentEvents.length,
    totalStoredEvents: currentEvents.length,
    oldestEvent: currentEvents.at(-1)?.timestamp ?? null,
    newestEvent: sortEventsForScope(currentEvents, "all")[0]?.timestamp ?? currentEvents[0]?.timestamp ?? null,
    newestUpdatedEvent: getEventActivityTimestamp(newestUpdatedEvent),
    latestActivityAt: getEventActivityTimestamp(newestUpdatedEvent),
    activeEventCount: activeSelection.total,
    visibleActiveCount: activeSelection.stateCounts?.fresh_active ?? stateCounts.fresh_active ?? 0,
    visibleWithFallbackCount: activeSelection.visibleWithFallbackCount ?? activeSelection.total,
    activeFallbackReason: activeSelection.fallbackReason,
    groupedDuplicates: activeSelection.groupedDuplicates ?? 0,
    storedContextIncluded: activeSelection.storedContextIncluded ?? 0,
    freshActiveCount: stateCounts.fresh_active ?? 0,
    recentContextCount: stateCounts.recent_context ?? 0,
    storedRelevantCount: stateCounts.stored_relevant ?? 0,
    archivedCount: stateCounts.archived ?? 0,
    heldForReviewCount: stateCounts.held_for_review ?? 0,
    rejectedQualityCount: stateCounts.rejected_quality ?? 0,
    freshEventCount,
    historicalEventCount: historicalEvents.length,
    staleEventCount,
    fallbackEligibleCount: activeSelection.fallbackEligibleCount,
    articles: currentStoreStats.articles,
    unclustered: currentStoreStats.unclustered,
  };
}

export async function insertEvent(event) {
  const now = new Date().toISOString();
  const updatedTimestamp = event.updatedAt ?? event.updated_at ?? now;
  const lastSeenTimestamp = event.lastSeenAt ?? event.last_seen_at ?? updatedTimestamp;
  const refreshedTimestamp = event.refreshedAt ?? event.refreshed_at ?? updatedTimestamp;
  const equivalentMemoryEvent = findEquivalentMemoryEvent(event);
  const memoryEvent = equivalentMemoryEvent
    ? mergeEvent(equivalentMemoryEvent, event)
    : { ...event, articleIds: normalizeArticleIds(event.articleIds) };
  const hydratedMemoryEvent = normalizeEvent({
    ...memoryEvent,
    created_at: memoryEvent.createdAt ?? memoryEvent.created_at ?? equivalentMemoryEvent?.createdAt ?? equivalentMemoryEvent?.created_at ?? event.timestamp ?? now,
    updated_at: updatedTimestamp,
    last_seen_at: lastSeenTimestamp,
    refreshed_at: refreshedTimestamp,
    freshness_status: computeFreshnessStatus({
      ...memoryEvent,
      isHistorical: memoryEvent.isHistorical ?? memoryEvent.is_historical,
      updatedAt: updatedTimestamp,
      lastSeenAt: lastSeenTimestamp,
      refreshedAt: refreshedTimestamp,
    }),
  });

  saveMemoryEvent(hydratedMemoryEvent);

  const db = await getClient();
  if (!db) {
    const status = getSupabaseConfigStatus();
    return {
      persisted: false,
      mode: "memory",
      error: status.usable ? "Supabase client unavailable" : "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing or unusable",
      errorInfo: sanitizeSupabaseError(new Error(status.usable ? "Supabase client unavailable" : "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing or unusable"), {
        stage: "event_write",
        table: "events",
        operation: "upsert",
        eventId: hydratedMemoryEvent.id,
        eventTitle: hydratedMemoryEvent.title,
      }),
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
        updatedAt: updatedTimestamp,
        lastSeenAt: lastSeenTimestamp,
        refreshedAt: refreshedTimestamp,
      },
      equivalentSupabaseEvent?.id ?? event.id
    );

    const { error } = await db.from("events").upsert(row);
    if (error) {
      log.warn(`Supabase upsert failed for event ${event.id}: ${error.message}`);
      const errorInfo = sanitizeSupabaseError(error, {
        stage: event.persistenceStage ?? "event_write",
        table: "events",
        operation: "upsert",
        eventId: row.id,
        eventTitle: row.title,
        rejectedFields: Object.keys(row),
      });
      return { persisted: false, mode: "memory", error: error.message, errorInfo, status: classifyPersistenceError(errorInfo, "event_persistence_failed") };
    }

    return {
      persisted: true,
      mode: "supabase",
      action: equivalentSupabaseEvent ? "updated" : "inserted",
      id: row.id,
    };
  } catch (err) {
    log.warn(`Supabase upsert failed for event ${event.id}: ${err.message}`);
    const errorInfo = sanitizeSupabaseError(err, {
      stage: event.persistenceStage ?? "event_write",
      table: "events",
      operation: "upsert",
      eventId: event.id,
      eventTitle: event.title,
    });
    return { persisted: false, mode: "memory", error: err.message, errorInfo, status: classifyPersistenceError(errorInfo, "event_persistence_failed") };
  }
}

export async function getEvents({ limit = 50, offset = 0, tone, confidence, region, scope = "active" } = {}) {
  const db = await getClient();

  if (!db) {
    const filtered = filterMemoryEvents(getAllEvents(), { tone, confidence, region, scope });
    const selection = scope === "active"
      ? buildActiveScopeSelection(filtered, { limit, offset })
      : {
          events: sortEventsForScope(filtered, scope).slice(offset, offset + limit).map((event) => decorateEventState(event)),
          total: filtered.length,
          fallbackUsed: false,
          fallbackReason: scope === "historical" ? "historical_context" : "all_events",
          freshnessMode: scope === "historical" ? "historical_context" : "all_events",
          groupedDuplicates: 0,
          storedContextIncluded: 0,
          stateCounts: countEventStates(filtered),
          visibleWithFallbackCount: filtered.length,
        };
    return {
      events: selection.events,
      total: selection.total,
      mode: "memory",
      scope,
      count: selection.events.length,
      fallbackUsed: selection.fallbackUsed,
      fallbackReason: selection.fallbackReason,
      dataSource: "memory",
      freshnessMode: selection.freshnessMode,
      groupedDuplicates: selection.groupedDuplicates ?? 0,
      storedContextIncluded: selection.storedContextIncluded ?? 0,
      stateCounts: selection.stateCounts ?? countEventStates(selection.events ?? []),
      visibleWithFallbackCount: selection.visibleWithFallbackCount ?? selection.total,
    };
  }

  try {
    let query = db
      .from("events")
      .select("*", { count: "exact" });

    if (tone) query = query.eq("tone", tone);
    if (confidence) query = query.eq("confidence", confidence);
    if (region) query = query.ilike("location->>label", `%${region}%`);
    if (scope === "historical") query = query.eq("is_historical", true);

    const { data, error, count } = await query;

    if (error) {
      log.warn(`Supabase query failed — serving in-memory events instead (${error.message})`);
      throw error;
    }

    const normalized = (data ?? []).map(normalizeEvent);
    const selection = scope === "active"
      ? buildActiveScopeSelection(normalized, { limit, offset })
      : {
          events: sortEventsForScope(normalized, scope).slice(offset, offset + limit).map((event) => decorateEventState(event)),
          total: count ?? normalized.length,
          fallbackUsed: false,
          fallbackReason: scope === "historical" ? "historical_context" : "all_events",
          freshnessMode: scope === "historical" ? "historical_context" : "all_events",
          groupedDuplicates: 0,
          storedContextIncluded: 0,
          stateCounts: countEventStates(normalized),
          visibleWithFallbackCount: count ?? normalized.length,
        };

    return {
      events: selection.events,
      total: selection.total,
      mode: "supabase",
      scope,
      count: selection.events.length,
      fallbackUsed: selection.fallbackUsed,
      fallbackReason: selection.fallbackReason,
      dataSource: "supabase",
      freshnessMode: selection.freshnessMode,
      groupedDuplicates: selection.groupedDuplicates ?? 0,
      storedContextIncluded: selection.storedContextIncluded ?? 0,
      stateCounts: selection.stateCounts ?? countEventStates(selection.events ?? []),
      visibleWithFallbackCount: selection.visibleWithFallbackCount ?? selection.total,
    };
  } catch (err) {
    log.warn(`Supabase query failed — serving in-memory events instead (${err.message})`);
    const filtered = filterMemoryEvents(getAllEvents(), { tone, confidence, region, scope });
    const selection = scope === "active"
      ? buildActiveScopeSelection(filtered, { limit, offset })
      : {
          events: sortEventsForScope(filtered, scope).slice(offset, offset + limit).map((event) => decorateEventState(event)),
          total: filtered.length,
          fallbackUsed: false,
          fallbackReason: scope === "historical" ? "historical_context" : "all_events",
          freshnessMode: scope === "historical" ? "historical_context" : "all_events",
          groupedDuplicates: 0,
          storedContextIncluded: 0,
          stateCounts: countEventStates(filtered),
          visibleWithFallbackCount: filtered.length,
        };
    return {
      events: selection.events,
      total: selection.total,
      mode: "memory",
      scope,
      count: selection.events.length,
      fallbackUsed: selection.fallbackUsed,
      fallbackReason: selection.fallbackReason,
      dataSource: "memory",
      freshnessMode: selection.freshnessMode,
      groupedDuplicates: selection.groupedDuplicates ?? 0,
      storedContextIncluded: selection.storedContextIncluded ?? 0,
      stateCounts: selection.stateCounts ?? countEventStates(selection.events ?? []),
      visibleWithFallbackCount: selection.visibleWithFallbackCount ?? selection.total,
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
  const requestedMaxAgeMs = hours * 3600_000;
  const normalRetentionMs = Math.max(requestedMaxAgeMs, 30 * 24 * 3600_000);
  const protectedRetentionMs = Math.max(normalRetentionMs, 90 * 24 * 3600_000);
  const retentionCutoffFor = (event) => {
    const protectedEvent = isHighImpactFallbackEvent(event)
      || getEventSourceCount(event) >= 2
      || ["enriched", "cached"].includes(event.aiStatus ?? event.ai_status ?? "");
    return Date.now() - (protectedEvent ? protectedRetentionMs : normalRetentionMs);
  };
  const removedInMemory = clearStaleEvents(normalRetentionMs);
  const db = await getClient();

  if (!db) {
    return removedInMemory;
  }

  try {
    const { data, error } = await db
      .from("events")
      .select("id, timestamp, updated_at, last_seen_at, refreshed_at, newest_source_at, is_historical, ai_status, importance_score, source_assessment, sources, article_ids")
      .eq("is_historical", false);

    if (error) {
      log.warn(`Supabase purge failed — retained in-memory cleanup (${error.message})`);
      return removedInMemory;
    }

    const staleIds = (data ?? [])
      .filter((event) => {
        const activity = getEventActivityTimestamp(event);
        return new Date(activity ?? event.timestamp ?? 0).getTime() < retentionCutoffFor(normalizeEvent(event));
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
    return {
      ...getMemoryStatsSnapshot(),
      mode: "memory_fallback",
      eventsDataSource: "memory_fallback",
      memoryFallbackUsed: true,
      supabaseStatus: getSupabaseConfigStatus().usable ? "error" : "missing_env",
      supabaseError: getSupabaseConfigStatus().usable ? "Supabase client unavailable" : "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing or unusable",
    };
  }

  try {
    const [countRes, oldestRes, newestRes, eventRowsRes] = await Promise.all([
      db.from("events").select("id", { count: "exact", head: true }),
      db.from("events").select("timestamp").order("timestamp", { ascending: true }).limit(1).maybeSingle(),
      db.from("events").select("timestamp").order("timestamp", { ascending: false }).limit(1).maybeSingle(),
      db
        .from("events")
        .select("id, is_historical, timestamp, created_at, updated_at, last_seen_at, refreshed_at, newest_source_at, ai_updated_at, importance_score")
        .limit(1000),
    ]);

    if (countRes.error || eventRowsRes.error) {
      log.warn(`Supabase stats failed — falling back to memory (${countRes.error?.message ?? eventRowsRes.error?.message})`);
      return {
        ...getMemoryStatsSnapshot(),
        mode: "memory_fallback",
        eventsDataSource: "memory_fallback",
        memoryFallbackUsed: true,
        supabaseStatus: "error",
        supabaseError: countRes.error?.message ?? eventRowsRes.error?.message ?? "Supabase stats query failed",
      };
    }

    const normalizedRows = (eventRowsRes.data ?? []).map(normalizeEvent);
    const nonHistoricalEvents = normalizedRows.filter((event) => !event.isHistorical);
    const historicalEvents = normalizedRows.filter((event) => event.isHistorical);
    const freshEventCount = nonHistoricalEvents.filter((event) => {
      const freshness = computeFreshnessStatus(event);
      return freshness === "Fresh" || freshness === "Recent";
    }).length;
    const staleEventCount = nonHistoricalEvents.filter((event) => computeFreshnessStatus(event) === "Stale").length;
    const newestUpdatedEvent = sortEventsForScope(normalizedRows, "all")[0] ?? null;
    const activeSelection = buildActiveScopeSelection(normalizedRows, { limit: normalizedRows.length, offset: 0 });
    const stateCounts = countEventStates(normalizedRows);

    return {
      mode: "supabase",
      eventsDataSource: "supabase",
      memoryFallbackUsed: false,
      supabaseStatus: "ok",
      supabaseError: null,
      eventCount: countRes.count ?? 0,
      totalStoredEvents: countRes.count ?? 0,
      oldestEvent: oldestRes.data?.timestamp ?? null,
      newestEvent: newestRes.data?.timestamp ?? null,
      newestUpdatedEvent: getEventActivityTimestamp(newestUpdatedEvent),
      latestActivityAt: getEventActivityTimestamp(newestUpdatedEvent),
      activeEventCount: activeSelection.total,
      visibleActiveCount: activeSelection.stateCounts?.fresh_active ?? stateCounts.fresh_active ?? 0,
      visibleWithFallbackCount: activeSelection.visibleWithFallbackCount ?? activeSelection.total,
      activeFallbackReason: activeSelection.fallbackReason,
      groupedDuplicates: activeSelection.groupedDuplicates ?? 0,
      storedContextIncluded: activeSelection.storedContextIncluded ?? 0,
      freshActiveCount: stateCounts.fresh_active ?? 0,
      recentContextCount: stateCounts.recent_context ?? 0,
      storedRelevantCount: stateCounts.stored_relevant ?? 0,
      archivedCount: stateCounts.archived ?? 0,
      heldForReviewCount: stateCounts.held_for_review ?? 0,
      rejectedQualityCount: stateCounts.rejected_quality ?? 0,
      freshEventCount,
      historicalEventCount: historicalEvents.length,
      staleEventCount,
      fallbackEligibleCount: activeSelection.fallbackEligibleCount,
      articles: memoryStats().articles,
      unclustered: memoryStats().unclustered,
    };
  } catch (err) {
    log.warn(`Supabase stats failed — falling back to memory (${err.message})`);
    return {
      ...getMemoryStatsSnapshot(),
      mode: "memory_fallback",
      eventsDataSource: "memory_fallback",
      memoryFallbackUsed: true,
      supabaseStatus: "error",
      supabaseError: err.message,
    };
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

export async function getAIUsageStatsBySource(source = "automation") {
  const db = await getClient();
  const start = utcDayStartIso();

  if (!db) {
    return getMemoryAIUsageSnapshotForSource(source);
  }

  try {
    const { data, error } = await db
      .from("ai_usage_logs")
      .select("source, created_at")
      .eq("source", source)
      .gte("created_at", start);

    if (error) {
      throw error;
    }

    return {
      mode: "supabase",
      source,
      totalCalls: (data ?? []).length,
    };
  } catch (err) {
    log.warn(`Supabase AI usage lookup failed for ${source} — using memory fallback (${err.message})`);
    return getMemoryAIUsageSnapshotForSource(source);
  }
}

export async function healthCheck() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const status = getSupabaseConfigStatus();
  const env = getSupabaseEnvDiagnostics();

  if (!url || !key) {
    return {
      ok: false,
      mode: "memory_fallback",
      supabaseStatus: "missing_env",
      supabaseError: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
      memoryFallbackUsed: true,
      detail: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
      env,
      storage: {
        eventsTableReadable: false,
        eventsCount: null,
        latestEventCreatedAt: null,
        latestEventUpdatedAt: null,
        latestNewestSourceAt: null,
        refreshStateReadable: false,
        refreshStateWritableKnown: false,
        readError: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set",
        writeError: null,
        writeCapableCheck: "not_checked",
      },
    };
  }

  if (!status.usable) {
    return {
      ok: false,
      mode: "memory_fallback",
      supabaseStatus: "missing_env",
      supabaseError: "Supabase credentials are placeholders or incomplete",
      memoryFallbackUsed: true,
      detail: "Supabase credentials are placeholders or incomplete",
      env,
      storage: {
        eventsTableReadable: false,
        eventsCount: null,
        latestEventCreatedAt: null,
        latestEventUpdatedAt: null,
        latestNewestSourceAt: null,
        refreshStateReadable: false,
        refreshStateWritableKnown: false,
        readError: "Supabase credentials are placeholders or incomplete",
        writeError: null,
        writeCapableCheck: "not_checked",
      },
    };
  }

  const urlValidation = validateSupabaseUrl(url);
  if (!urlValidation.ok) {
    return {
      ok: false,
      mode: "memory_fallback",
      supabaseStatus: "error",
      supabaseError: `SUPABASE_URL ${urlValidation.reason}`,
      memoryFallbackUsed: true,
      detail: `SUPABASE_URL ${urlValidation.reason}`,
      env,
      storage: {
        eventsTableReadable: false,
        eventsCount: null,
        latestEventCreatedAt: null,
        latestEventUpdatedAt: null,
        latestNewestSourceAt: null,
        refreshStateReadable: false,
        refreshStateWritableKnown: false,
        readError: `SUPABASE_URL ${urlValidation.reason}`,
        writeError: null,
        writeCapableCheck: "not_checked",
      },
    };
  }

  const db = await getClient();
  if (!db) {
    return {
      ok: false,
      mode: "memory_fallback",
      supabaseStatus: "error",
      supabaseError: "Supabase client unavailable",
      memoryFallbackUsed: true,
      detail: "Supabase client unavailable",
      env,
      storage: {
        eventsTableReadable: false,
        eventsCount: null,
        latestEventCreatedAt: null,
        latestEventUpdatedAt: null,
        latestNewestSourceAt: null,
        refreshStateReadable: false,
        refreshStateWritableKnown: false,
        readError: "Supabase client unavailable",
        writeError: null,
        writeCapableCheck: "not_checked",
      },
    };
  }

  try {
    const [countRes, latestCreatedRes, latestUpdatedRes, latestSourceRes, refreshStateRes] = await Promise.all([
      db.from("events").select("id", { count: "exact", head: true }),
      db.from("events").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("events").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("events").select("newest_source_at").order("newest_source_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
      db.from("external_layer_cache").select("layer_key, updated_at").limit(1),
    ]);
    const error = countRes.error ?? latestCreatedRes.error ?? latestUpdatedRes.error ?? latestSourceRes.error ?? refreshStateRes.error ?? null;
    const statusLabel = error ? classifyPersistenceError(sanitizeSupabaseError(error, { stage: "health_read", table: "events", operation: "select" }), "error") : "ok";
    return {
      ok: !error,
      mode: error ? "memory_fallback" : "supabase",
      supabaseStatus: error ? statusLabel : "ok",
      supabaseError: error?.message ?? null,
      memoryFallbackUsed: Boolean(error),
      detail: error?.message ?? "Connected",
      env,
      storage: {
        eventsTableReadable: !error,
        eventsCount: error ? null : countRes.count ?? 0,
        latestEventCreatedAt: latestCreatedRes.data?.created_at ?? null,
        latestEventUpdatedAt: latestUpdatedRes.data?.updated_at ?? null,
        latestNewestSourceAt: latestSourceRes.data?.newest_source_at ?? null,
        refreshStateReadable: !refreshStateRes.error,
        refreshStateWritableKnown: status.key.usable,
        readError: error?.message ?? null,
        writeError: null,
        writeCapableCheck: status.key.usable ? "service_role_configured" : "not_configured",
      },
    };
  } catch (err) {
    return {
      ok: false,
      mode: "memory_fallback",
      supabaseStatus: "error",
      supabaseError: err.message,
      memoryFallbackUsed: true,
      detail: err.message,
      env,
      storage: {
        eventsTableReadable: false,
        eventsCount: null,
        latestEventCreatedAt: null,
        latestEventUpdatedAt: null,
        latestNewestSourceAt: null,
        refreshStateReadable: false,
        refreshStateWritableKnown: false,
        readError: err.message,
        writeError: null,
        writeCapableCheck: "not_checked",
      },
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
      .filter((report) => (userId ? report.user_id === userId : true))
      .filter((report) => !needle || `${report.title} ${report.region} ${report.focus_area}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.generated_at ?? b.created_at).getTime() - new Date(a.generated_at ?? a.created_at).getTime());
    return { mode: "memory", reports: filtered.slice(0, limit) };
  }

  try {
    let qb = db
      .from("reports")
      .select("*")
      .order("generated_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (userId) {
      qb = qb.eq("user_id", userId);
    }

    if (needle) {
      qb = qb.or(`title.ilike.%${needle}%,region.ilike.%${needle}%,focus_area.ilike.%${needle}%`);
    }

    const { data, error } = await qb;
    if (error) throw error;
    return { mode: "supabase", reports: data ?? [] };
  } catch (err) {
    log.warn(`Supabase report history lookup failed — using memory fallback (${err.message})`);
    const filtered = memoryReports
      .filter((report) => (userId ? report.user_id === userId : true))
      .filter((report) => !needle || `${report.title} ${report.region} ${report.focus_area}`.toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.generated_at ?? b.created_at).getTime() - new Date(a.generated_at ?? a.created_at).getTime());
    return { mode: "memory", reports: filtered.slice(0, limit) };
  }
}

export async function saveUserReport(report) {
  const normalized = {
    id: report.id,
    user_id: report.user_id ?? null,
    title: report.title,
    region: report.region,
    focus_area: report.focus_area,
    time_horizon: report.time_horizon,
    audience_type: report.audience_type,
    risk_appetite: report.risk_appetite,
    input_question: report.input_question ?? null,
    status: report.status ?? "draft",
    content: report.content ?? {},
    report_text: report.report_text ?? null,
    source_event_ids: Array.isArray(report.source_event_ids) ? report.source_event_ids.filter(Boolean) : [],
    ai_provider: report.ai_provider ?? "gemini",
    ai_model: report.ai_model ?? null,
    generated_at: report.generated_at ?? report.created_at ?? new Date().toISOString(),
    confidence_level: report.confidence_level ?? null,
    favorite: Boolean(report.favorite),
    created_at: report.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const existingIndex = memoryReports.findIndex((candidate) => candidate.id === normalized.id);
  if (existingIndex >= 0) {
    memoryReports[existingIndex] = normalized;
  } else {
    memoryReports.push(normalized);
  }

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
        .select("timestamp, created_at, updated_at, refreshed_at, last_seen_at, newest_source_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const derivedLastRefresh = latestEvent?.refreshed_at ?? latestEvent?.last_seen_at ?? latestEvent?.newest_source_at ?? latestEvent?.updated_at ?? latestEvent?.created_at ?? null;
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
    const status = getSupabaseConfigStatus();
    const message = status.usable ? "Supabase client unavailable" : "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing or unusable";
    return {
      persisted: false,
      mode: "memory",
      error: message,
      errorInfo: sanitizeSupabaseError(new Error(message), {
        stage: "heartbeat_write",
        key,
        table: "external_layer_cache",
        operation: "upsert",
      }),
      record,
    };
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
    return {
      persisted: false,
      mode: "memory",
      error: err.message,
      errorInfo: sanitizeSupabaseError(err, {
        stage: "heartbeat_write",
        key,
        table: "external_layer_cache",
        operation: "upsert",
      }),
      record,
    };
  }
}

export async function getRefreshUsageStats(key) {
  return getLayerUsageStats(`refresh_${key}`);
}
