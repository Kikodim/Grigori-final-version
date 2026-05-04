import { getAIStatus } from "./ai.js";
import { describeEnvVar, getConfig, getIntegrationConfigStatus } from "./config.js";
import { buildBriefing } from "./event-insights.js";
import { getFlightsLayer, getLayersStatus, getSatellitesLayer, getSocialSignalsLayer, getVesselsLayer } from "./layers.js";
import { createLogger } from "./logger.js";
import { getMarketContext } from "./market-data.js";
import { getNewsProviderStatuses } from "./ingest.js";
import { runPipeline } from "./pipeline.js";
import {
  buildSubscriptionStatus,
  captureWaitlistInterest,
  exportReportPreview,
  generateAlphaReport,
  getReportStatus,
  getWaitlistAdminEntries,
  getReportHistory,
} from "./reports.js";
import {
  checkRateLimit,
  getClientIp,
  parsePagination,
  requireAdmin,
  sanitizeId,
  sanitizeRegion,
  sendError,
} from "./security.js";
import { getEventById, getEvents, getRefreshState, getRefreshUsageStats, getStats, healthCheck, setRefreshState } from "./supabase.js";

const log = createLogger("api");

const VALID_TONES = new Set(["Stable", "Escalating", "Deteriorating", "Volatile", "De-escalating"]);
const VALID_CONFIDENCE = new Set(["Low", "Medium", "High"]);
const VALID_EVENT_SCOPES = new Set(["active", "historical", "all"]);

function applyNoStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function applyRateLimit(req, res) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining));

  if (!rl.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rl.resetInMs / 1000)));
    sendError(res, 429, "Too many requests");
    return false;
  }

  return true;
}

function missingProductionSecret() {
  return process.env.NODE_ENV === "production" && !process.env.ADMIN_SECRET;
}

function ageHours(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (Date.now() - ts) / 3600_000);
}

function buildScheduledHeartbeat(state, expectedIntervalHours) {
  const metadata = state?.record?.metadata ?? {};
  const lastScheduledRunAt = metadata.lastScheduledRunAt ?? state?.record?.lastRefresh ?? null;
  const lastScheduledSuccessAt = metadata.lastScheduledSuccessAt ?? (metadata.status === "success" ? state?.record?.lastRefresh : null);
  const lastScheduledFailureAt = metadata.lastScheduledFailureAt ?? (metadata.status === "failure" ? state?.record?.lastRefresh : null);
  const storedStatus = metadata.status ?? (lastScheduledSuccessAt ? "success" : lastScheduledFailureAt ? "failure" : "not_seen");
  const reference = lastScheduledSuccessAt ?? lastScheduledRunAt;
  const hours = ageHours(reference);
  const failureAfterSuccess = lastScheduledFailureAt
    && (!lastScheduledSuccessAt || new Date(lastScheduledFailureAt).getTime() > new Date(lastScheduledSuccessAt).getTime());
  let status = storedStatus;
  if (failureAfterSuccess) {
    status = "failure";
  } else if (!lastScheduledSuccessAt) {
    status = lastScheduledFailureAt ? "failure" : "not_seen";
  } else if (expectedIntervalHours <= 1) {
    if (hours === null || hours <= 2) status = "success";
    else if (hours <= 4) status = "delayed";
    else if (hours <= 8) status = "degraded";
    else status = "overdue";
  } else {
    if (hours === null || hours <= 3) status = "success";
    else if (hours <= 6) status = "delayed";
    else status = "overdue";
  }

  return {
    lastScheduledRunAt,
    lastScheduledSuccessAt,
    lastScheduledFailureAt,
    status,
    ageHours: hours,
    source: metadata.source ?? null,
    message: metadata.message ?? null,
    freshnessOutcome: metadata.freshnessOutcome ?? null,
    providerCoverageStatus: metadata.providerCoverageStatus ?? null,
    providerSummaryText: metadata.providerSummaryText ?? null,
    aiSkippedReason: metadata.aiSkippedReason ?? null,
  };
}

function normalizeRefreshSource(req, mode) {
  const raw = String(req.query?.source ?? req.body?.source ?? "").toLowerCase();
  if (["github_action", "automation", "manual"].includes(raw)) return raw;
  if (req.headers["x-vercel-cron-secret"]) return "automation";
  return mode === "backfill" ? "manual" : "manual";
}

function isScheduledSource(source) {
  return source === "github_action" || source === "automation";
}

function scheduledKeyForMode(mode) {
  if (mode === "news") return "scheduled_news";
  if (mode === "ai") return "scheduled_ai";
  return null;
}

async function recordScheduledRun(mode, source) {
  if (!isScheduledSource(source)) return null;
  const key = scheduledKeyForMode(mode);
  if (!key) return null;
  const previous = await getRefreshState(key);
  const now = new Date().toISOString();
  const metadata = {
    ...(previous.record?.metadata ?? {}),
    source,
    status: "running",
    lastScheduledRunAt: now,
    message: "Scheduled refresh started.",
  };
  const write = await setRefreshState(key, {
    ...metadata,
  }, null);
  const readBack = await getRefreshState(key);
  const heartbeatReadBack = readBack.mode === "supabase" &&
    readBack.record?.metadata?.lastScheduledRunAt === metadata.lastScheduledRunAt;
  return {
    metadata,
    heartbeatPersisted: Boolean(write.persisted),
    heartbeatReadBack,
    persistenceSource: write.mode ?? readBack.mode ?? "unknown",
    persistenceWarning: write.persisted && heartbeatReadBack ? null : (write.error ?? "Scheduled heartbeat was not durably persisted"),
    persistenceError: write.errorInfo ?? null,
  };
}

async function recordScheduledOutcome(mode, source, scheduledRun, { ok, result = null, error = null }) {
  if (!isScheduledSource(source)) return null;
  const key = scheduledKeyForMode(mode);
  if (!key) return null;
  const now = new Date().toISOString();
  const previousMetadata = scheduledRun?.metadata ?? {};
  const metadata = {
    ...previousMetadata,
    source,
    status: ok ? "success" : "failure",
    lastScheduledRunAt: previousMetadata?.lastScheduledRunAt ?? now,
    lastScheduledSuccessAt: ok ? now : previousMetadata?.lastScheduledSuccessAt ?? null,
    lastScheduledFailureAt: ok ? previousMetadata?.lastScheduledFailureAt ?? null : now,
    message: result?.message ?? error ?? null,
    mode: result?.mode ?? mode,
    refreshMode: result?.refreshMode ?? mode,
    freshnessOutcome: result?.freshnessOutcome ?? null,
    aiSkippedReason: result?.aiSkippedReason ?? null,
    providerDiagnostics: result?.providerDiagnostics ?? previousMetadata?.providerDiagnostics ?? [],
    providerCoverageStatus: result?.providerCoverageStatus ?? previousMetadata?.providerCoverageStatus ?? null,
    providerSummaryText: result?.providerSummaryText ?? previousMetadata?.providerSummaryText ?? null,
    providersSucceeded: result?.providersSucceeded ?? previousMetadata?.providersSucceeded ?? [],
    providersRateLimited: result?.providersRateLimited ?? previousMetadata?.providersRateLimited ?? [],
    providersErrored: result?.providersErrored ?? previousMetadata?.providersErrored ?? [],
    primaryProviderUsed: result?.primaryProviderUsed ?? previousMetadata?.primaryProviderUsed ?? null,
  };
  const write = await setRefreshState(key, metadata, null);
  const readBack = await getRefreshState(key);
  const heartbeatReadBack = readBack.mode === "supabase" &&
    readBack.record?.metadata?.lastScheduledRunAt === metadata.lastScheduledRunAt &&
    readBack.record?.metadata?.status === metadata.status;
  return {
    heartbeatPersisted: Boolean(write.persisted),
    heartbeatReadBack,
    persistenceSource: write.mode ?? readBack.mode ?? "unknown",
    persistenceWarning: write.persisted && heartbeatReadBack ? null : (write.error ?? "Scheduled heartbeat was not durably persisted"),
    persistenceError: write.errorInfo ?? null,
  };
}

export async function handleHealth(_req, res) {
  applyNoStore(res);
  const config = getConfig();
  const integrations = getIntegrationConfigStatus();
  const [layers, ai, newsRefresh, aiRefresh, scheduledNews, scheduledAi, newsRefreshUsage, aiRefreshUsage, stats, newsProviders] = await Promise.all([
    getLayersStatus(),
    getAIStatus(),
    getRefreshState("news"),
    getRefreshState("ai"),
    getRefreshState("scheduled_news"),
    getRefreshState("scheduled_ai"),
    getRefreshUsageStats("news"),
    getRefreshUsageStats("ai"),
    getStats(),
    getNewsProviderStatuses(),
  ]);
  const missing = [
    ["NEWS_API_KEY", integrations.newsApi],
    ["GEMINI_API_KEY", integrations.gemini],
    ["SUPABASE_URL", integrations.supabase.url],
    ["SUPABASE_SERVICE_ROLE_KEY", integrations.supabase.serviceRoleKey],
    ["ADMIN_SECRET", integrations.adminSecret],
  ]
    .filter(([, status]) => !status.usable)
    .map(([name]) => name);
  const storage = await healthCheck();
  const newestArticleAt = newsRefresh.record?.metadata?.newestArticleAt ?? null;
  const newestEventAt = newsRefresh.record?.metadata?.newestEventAt ?? stats.newestUpdatedEvent ?? stats.newestEvent ?? null;
  const latestActivityAt = stats.latestActivityAt ?? newestEventAt ?? null;
  const lastNewsRefreshAt = newsRefresh.record?.lastRefresh ?? null;
  const lastAiRefreshAt = aiRefresh.record?.lastRefresh ?? null;
  const scheduledNewsHeartbeat = buildScheduledHeartbeat(scheduledNews, 1);
  const scheduledAiHeartbeat = buildScheduledHeartbeat(scheduledAi, 2);
  const enabledProviders = [
    String(process.env.ENABLE_CURRENTS ?? "false").toLowerCase() === "true" ? "currents" : null,
    integrations.gnews?.usable ? "gnews" : null,
    String(process.env.ENABLE_NEWSDATA ?? "false").toLowerCase() === "true" ? "newsdata" : null,
    integrations.newsApi?.usable ? "newsapi" : null,
    String(process.env.ENABLE_GDELT ?? "false").toLowerCase() === "true" ? "gdelt" : null,
    String(process.env.ENABLE_RSS ?? "false").toLowerCase() === "true" ? "rss" : null,
  ].filter(Boolean);
  const refreshAgeHours = lastNewsRefreshAt
    ? Math.max(0, (Date.now() - new Date(lastNewsRefreshAt).getTime()) / 3600_000)
    : null;
  const cacheStatus = storage.supabaseStatus === "missing_env"
    ? "supabase_not_configured"
    : storage.supabaseStatus === "error"
      ? "supabase_error"
      : storage.mode === "memory" || storage.mode === "memory_fallback"
    ? "memory_fallback"
    : stats.activeFallbackReason && stats.activeFallbackReason !== "fresh_active"
      ? "fallback_available"
      : refreshAgeHours === null
        ? "stale"
        : refreshAgeHours <= 12 ? "fresh" : "stale";

  return res.status(200).json({
    ok: Boolean(storage.ok),
    label: integrations.newsApi.usable && integrations.gemini.usable && storage.ok ? "ok" : "degraded",
    checks: {
      env: { ok: missing.length === 0, missing },
      integrations: {
        newsApi: integrations.newsApi,
        gnews: integrations.gnews,
        gemini: integrations.gemini,
        supabase: {
          present: integrations.supabase.present,
          usable: integrations.supabase.usable,
          reason: integrations.supabase.reason,
        },
        adminSecret: describeEnvVar("ADMIN_SECRET"),
      },
      storage,
    },
    envStatus: {
      hasSupabaseUrl: Boolean(storage.env?.hasSupabaseUrl),
      hasSupabaseServiceRoleKey: Boolean(storage.env?.hasSupabaseServiceRoleKey),
      hasAdminSecret: integrations.adminSecret.usable,
      hasGeminiKey: integrations.gemini.usable,
      enabledProviders,
    },
    config: {
      port: config.port,
      ingestIntervalMinutes: config.ingestIntervalMinutes,
      enableAutomatedAi: config.enableAutomatedAi,
      enableHistoricalBackfill: config.enableHistoricalBackfill,
      backfillMaxDays: config.backfillMaxDays,
      backfillBatchDays: config.backfillBatchDays,
      aiDailyLimit: config.aiDailyLimit,
      aiReservedCalls: config.aiReservedCalls,
      aiAutomationBudget: config.aiAutomationBudget,
      maxAiCallsPerRun: config.maxAiCallsPerRun,
      maxArticlesPerRun: config.maxArticlesPerRun,
      clusterThreshold: config.clusterThreshold,
      nodeEnv: config.nodeEnv,
    },
    layers,
    providers: {
      news: newsProviders,
    },
    data: {
      dataSource: stats.eventsDataSource ?? stats.mode ?? storage.mode ?? "memory_fallback",
      eventsDataSource: stats.eventsDataSource ?? stats.mode ?? storage.mode ?? "memory_fallback",
      supabaseStatus: stats.supabaseStatus ?? storage.supabaseStatus ?? "unknown",
      supabaseError: stats.supabaseError ?? storage.supabaseError ?? null,
      memoryFallbackUsed: Boolean(stats.memoryFallbackUsed ?? storage.memoryFallbackUsed),
      totalStoredEvents: stats.totalStoredEvents ?? stats.eventCount ?? 0,
      newestArticleAt,
      newestEventAt,
      latestActivityAt,
      lastNewsRefreshAt,
      lastAiRefreshAt,
      lastAiCheckAt: lastAiRefreshAt,
      activeEventCount: stats.activeEventCount ?? 0,
      visibleActiveCount: stats.visibleActiveCount ?? stats.freshActiveCount ?? 0,
      visibleWithFallbackCount: stats.visibleWithFallbackCount ?? stats.activeEventCount ?? 0,
      freshActiveCount: stats.freshActiveCount ?? 0,
      recentContextCount: stats.recentContextCount ?? 0,
      storedRelevantCount: stats.storedRelevantCount ?? 0,
      archivedCount: stats.archivedCount ?? 0,
      heldForReviewCount: stats.heldForReviewCount ?? 0,
      rejectedQualityCount: stats.rejectedQualityCount ?? 0,
      groupedDuplicates: stats.groupedDuplicates ?? 0,
      storedContextIncluded: stats.storedContextIncluded ?? 0,
      freshEventCount: stats.freshEventCount ?? 0,
      staleEventCount: stats.staleEventCount ?? 0,
      historicalEventCount: stats.historicalEventCount ?? 0,
      fallbackEligibleCount: stats.fallbackEligibleCount ?? 0,
      cacheStatus,
    },
    storage: storage.storage ?? null,
    automation: {
      news: scheduledNewsHeartbeat,
      ai: scheduledAiHeartbeat,
      aiCallsToday: ai.aiCallsToday,
      aiRemainingToday: ai.aiRemainingToday,
      lastNewsRefreshAt,
      lastAiRefreshAt,
      lastAiCheckAt: lastAiRefreshAt,
      nextEstimatedNewsRefresh: newsRefresh.record?.nextRefresh ?? null,
      nextEstimatedAiRefresh: aiRefresh.record?.nextRefresh ?? null,
      newsRefreshesToday: newsRefreshUsage.callsToday ?? 0,
      aiRefreshesToday: aiRefreshUsage.callsToday ?? 0,
      newestArticleAt,
      newestEventAt,
      latestActivityAt,
      totalStoredEvents: stats.totalStoredEvents ?? stats.eventCount ?? 0,
      activeEventCount: stats.activeEventCount ?? 0,
      visibleActiveCount: stats.visibleActiveCount ?? stats.freshActiveCount ?? 0,
      visibleWithFallbackCount: stats.visibleWithFallbackCount ?? stats.activeEventCount ?? 0,
      freshActiveCount: stats.freshActiveCount ?? 0,
      recentContextCount: stats.recentContextCount ?? 0,
      storedRelevantCount: stats.storedRelevantCount ?? 0,
      archivedCount: stats.archivedCount ?? 0,
      heldForReviewCount: stats.heldForReviewCount ?? 0,
      rejectedQualityCount: stats.rejectedQualityCount ?? 0,
      groupedDuplicates: stats.groupedDuplicates ?? 0,
      storedContextIncluded: stats.storedContextIncluded ?? 0,
      freshEventCount: stats.freshEventCount ?? 0,
      staleEventCount: stats.staleEventCount ?? 0,
      historicalEventCount: stats.historicalEventCount ?? 0,
      fallbackEligibleCount: stats.fallbackEligibleCount ?? 0,
      providerCoverageStatus: scheduledNewsHeartbeat.providerCoverageStatus ?? newsRefresh.record?.metadata?.providerCoverageStatus ?? null,
      providerSummaryText: scheduledNewsHeartbeat.providerSummaryText ?? newsRefresh.record?.metadata?.providerSummaryText ?? null,
      eventsDataSource: stats.eventsDataSource ?? stats.mode ?? storage.mode ?? "memory_fallback",
      cacheStatus,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function handleEvents(req, res) {
  applyNoStore(res);
  if (!applyRateLimit(req, res)) return;

  const { limit, offset } = parsePagination(req.query ?? {});
  const { tone, confidence } = req.query ?? {};
  const region = sanitizeRegion(req.query?.region);
  const scope = VALID_EVENT_SCOPES.has(String(req.query?.scope ?? "active").toLowerCase())
    ? String(req.query?.scope ?? "active").toLowerCase()
    : "active";

  if (tone && !VALID_TONES.has(tone)) {
    return sendError(res, 400, `tone must be one of: ${[...VALID_TONES].join(", ")}`);
  }

  if (confidence && !VALID_CONFIDENCE.has(confidence)) {
    return sendError(res, 400, `confidence must be one of: ${[...VALID_CONFIDENCE].join(", ")}`);
  }

  const result = await getEvents({ limit, offset, tone, confidence, region, scope });
  return res.status(200).json({
    ok: true,
    total: result.total,
    count: result.count ?? result.events?.length ?? 0,
    limit,
    offset,
    mode: result.mode,
    scope: result.scope ?? scope,
    fallbackUsed: result.fallbackUsed ?? false,
    fallbackReason: result.fallbackReason ?? "unknown",
    dataSource: result.dataSource ?? result.mode,
    freshnessMode: result.freshnessMode ?? (scope === "active" ? "best_available" : scope),
    groupedDuplicates: result.groupedDuplicates ?? 0,
    storedContextIncluded: result.storedContextIncluded ?? 0,
    stateCounts: result.stateCounts ?? null,
    visibleWithFallbackCount: result.visibleWithFallbackCount ?? result.total,
    events: result.events,
  });
}

export async function handleEventById(req, res) {
  if (!applyRateLimit(req, res)) return;

  const id = sanitizeId(req.query?.id ?? req.params?.id);
  if (!id) {
    return sendError(res, 400, "Invalid event ID");
  }

  const event = await getEventById(id);
  if (!event) {
    return sendError(res, 404, "Event not found");
  }

  return res.status(200).json({ ok: true, event });
}

export async function handleEventStats(_req, res) {
  applyNoStore(res);
  const [stats, ai, newsRefresh, aiRefresh, scheduledNews, scheduledAi, newsRefreshUsage, aiRefreshUsage] = await Promise.all([
    getStats(),
    getAIStatus(),
    getRefreshState("news"),
    getRefreshState("ai"),
    getRefreshState("scheduled_news"),
    getRefreshState("scheduled_ai"),
    getRefreshUsageStats("news"),
    getRefreshUsageStats("ai"),
  ]);
  return res.status(200).json({
    ok: true,
    stats,
    ai,
    automation: {
      news: buildScheduledHeartbeat(scheduledNews, 1),
      ai: buildScheduledHeartbeat(scheduledAi, 2),
      lastNewsRefreshAt: newsRefresh.record?.lastRefresh ?? null,
      lastAiRefreshAt: aiRefresh.record?.lastRefresh ?? null,
      lastAiCheckAt: aiRefresh.record?.lastRefresh ?? null,
      nextEstimatedNewsRefresh: newsRefresh.record?.nextRefresh ?? null,
      nextEstimatedAiRefresh: aiRefresh.record?.nextRefresh ?? null,
      newsRefreshesToday: newsRefreshUsage.callsToday ?? 0,
      aiRefreshesToday: aiRefreshUsage.callsToday ?? 0,
      newestArticleAt: newsRefresh.record?.metadata?.newestArticleAt ?? null,
      newestEventAt: newsRefresh.record?.metadata?.newestEventAt ?? stats.newestUpdatedEvent ?? stats.newestEvent ?? null,
      latestActivityAt: stats.latestActivityAt ?? stats.newestUpdatedEvent ?? stats.newestEvent ?? null,
      providerCoverageStatus: newsRefresh.record?.metadata?.providerCoverageStatus ?? null,
      providerSummaryText: newsRefresh.record?.metadata?.providerSummaryText ?? null,
    },
  });
}

export async function handleBriefing(req, res) {
  if (!applyRateLimit(req, res)) return;

  const result = await getEvents({ limit: 100, offset: 0 });
  const briefing = buildBriefing(result.events ?? []);

  return res.status(200).json({
    ok: true,
    mode: result.mode,
    briefing,
  });
}

export async function handleAIStatus(_req, res) {
  return res.status(200).json({ ok: true, ...(await getAIStatus()) });
}

export async function handleFlightsLive(_req, res) {
  const result = await getFlightsLayer();
  return res.status(200).json(result);
}

export async function handleVesselsLive(_req, res) {
  const result = await getVesselsLayer();
  return res.status(200).json(result);
}

export async function handleSatellitesLive(_req, res) {
  const result = await getSatellitesLayer();
  return res.status(200).json(result);
}

export async function handleSocialSignalsLive(_req, res) {
  const result = await getSocialSignalsLayer();
  return res.status(200).json(result);
}

export async function handleMarketContext(req, res) {
  const forceRefresh = req.query?.refresh === "true";
  const result = await getMarketContext({ forceRefresh });
  return res.status(200).json(result);
}

export async function handleSubscriptionStatus(req, res) {
  applyNoStore(res);
  return res.status(200).json(await buildSubscriptionStatus(req));
}

export async function handleReportsGenerate(req, res) {
  applyNoStore(res);
  const payload = req.body ?? {};
  const result = await generateAlphaReport(req, payload);
  return res.status(result.status).json(result.body);
}

export async function handleReportsStatus(req, res) {
  applyNoStore(res);
  const result = await getReportStatus(req, req.query ?? {});
  return res.status(result.status).json(result.body);
}

export async function handleReportsHistory(req, res) {
  applyNoStore(res);
  const result = await getReportHistory(req, req.query ?? {});
  return res.status(result.status).json(result.body);
}

export async function handleReportsExport(req, res) {
  const result = await exportReportPreview(req, req.query?.id ?? req.params?.id);
  return res.status(result.status).json(result.body);
}

export async function handleReportsWaitlist(req, res) {
  if ((req.method ?? "GET") === "GET") {
    const result = await getWaitlistAdminEntries(req, req.query ?? {});
    return res.status(result.status).json(result.body);
  }

  const result = await captureWaitlistInterest(req.body ?? {}, req);
  return res.status(result.status).json(result.body);
}

export async function handlePipelineRun(req, res) {
  applyNoStore(res);
  if (missingProductionSecret()) {
    return sendError(res, 503, "Pipeline trigger disabled: ADMIN_SECRET is not configured");
  }

  if (!requireAdmin(req)) {
    return sendError(res, 401, "Unauthorized");
  }

  const requestedMode = String(req.query?.mode ?? req.body?.mode ?? "full").toLowerCase();
  const mode = ["news", "ai", "backfill"].includes(requestedMode) ? requestedMode : "full";
  const days = Number.parseInt(String(req.query?.days ?? req.body?.days ?? "30"), 10);
  const noAi = mode === "news" || req.query?.noAi === "true" || req.body?.noAi === true;
  const source = normalizeRefreshSource(req, mode);
  const nextNewsRefresh = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const nextAiRefresh = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const scheduledPreviousMetadata = await recordScheduledRun(mode, source);
  let result;
  try {
    result = await runPipeline({ source, noAi, mode, days });
  } catch (err) {
    const heartbeat = await recordScheduledOutcome(mode, source, scheduledPreviousMetadata, {
      ok: false,
      error: err?.message ?? "Pipeline failed",
    });
    log.warn(`Pipeline run failed before response: ${err?.message ?? err}; heartbeat=${JSON.stringify(heartbeat ?? {})}`);
    throw err;
  }
  let enrichedResult = { ...result };
  if (result.ok) {
    if (mode === "news" || mode === "full") {
      const refreshState = await setRefreshState("news", {
        mode,
        source,
        events: result.events,
        articles: result.articles,
        aiCalls: result.aiCalls,
        articlesFetched: result.articlesFetched ?? result.articles ?? 0,
        articlesSaved: result.articlesSaved ?? result.articles ?? 0,
        duplicatesSkipped: result.duplicatesSkipped ?? 0,
        eventsCreated: result.eventsCreated ?? 0,
        eventsUpdated: result.eventsUpdated ?? 0,
        eventsUnchanged: result.eventsUnchanged ?? 0,
        activeEventCount: result.activeEventCount ?? 0,
        filteredOutCount: result.filteredOutCount ?? 0,
        newestArticleAt: result.newestArticleAt ?? null,
        newestEventAt: result.newestEventAt ?? null,
        message: result.message ?? null,
        providerDiagnostics: result.providerDiagnostics ?? [],
        providerCoverageStatus: result.providerCoverageStatus ?? null,
        providerSummaryText: result.providerSummaryText ?? null,
        providersSucceeded: result.providersSucceeded ?? [],
        providersRateLimited: result.providersRateLimited ?? [],
        providersErrored: result.providersErrored ?? [],
        quality: result.quality ?? null,
        freshnessOutcome: result.freshnessOutcome ?? null,
      }, nextNewsRefresh);
      enrichedResult = {
        ...enrichedResult,
        lastNewsRefreshAt: refreshState.record?.lastRefresh ?? result.lastNewsRefreshAt ?? null,
        nextEstimatedNewsRefresh: nextNewsRefresh,
      };
    }
    if (mode === "ai" || (mode === "full" && !noAi)) {
      const refreshState = await setRefreshState("ai", {
        mode,
        source,
        events: result.events,
        aiCalls: result.aiCalls,
        targetEventId: result.targetEventId ?? null,
        targetTitle: result.targetTitle ?? null,
        reason: result.reason ?? null,
        changed: result.changed ?? null,
        aiSkippedReason: result.aiSkippedReason ?? null,
        lastAiRefreshAt: result.lastAiRefreshAt ?? null,
        lastAiCheckAt: result.lastAiRefreshAt ?? null,
        message: result.message ?? null,
      }, nextAiRefresh);
      enrichedResult = {
        ...enrichedResult,
        lastAiRefreshAt: refreshState.record?.lastRefresh ?? result.lastAiRefreshAt ?? null,
        nextEstimatedAiRefresh: nextAiRefresh,
      };
    }
    if (mode === "backfill") {
      await setRefreshState("backfill", {
        mode,
        source,
        daysRequested: result.daysRequested ?? days,
        windowsProcessed: result.windowsProcessed ?? 0,
        eventsCreated: result.eventsCreated ?? 0,
        articlesSaved: result.articlesSaved ?? 0,
      }, null);
    }
  }
  const heartbeat = await recordScheduledOutcome(mode, source, scheduledPreviousMetadata, {
    ok: Boolean(result.ok),
    result: enrichedResult,
  });
  if (heartbeat) {
    enrichedResult = {
      ...enrichedResult,
      heartbeatPersisted: heartbeat.heartbeatPersisted,
      heartbeatReadBack: heartbeat.heartbeatReadBack,
      persistenceSource: heartbeat.persistenceSource,
      persistenceWarning: heartbeat.persistenceWarning,
      persistenceErrors: [
        ...(enrichedResult.persistenceErrors ?? []),
        ...(heartbeat.persistenceError ? [heartbeat.persistenceError] : []),
      ],
    };
  }
  if (isScheduledSource(source) && (!heartbeat?.heartbeatPersisted || !heartbeat?.heartbeatReadBack || heartbeat?.persistenceSource !== "supabase")) {
    const failedResult = {
      ...enrichedResult,
      ok: false,
      status: heartbeat?.persistenceError?.stage === "heartbeat_write" ? "heartbeat_persistence_failed" : "persistence_failed",
      message: "Scheduled refresh ran but heartbeat was not durably persisted.",
    };
    log.warn(`Scheduled refresh persistence failed: mode=${mode} source=${source} heartbeat=${JSON.stringify(heartbeat ?? {})}`);
    return res.status(500).json({ success: false, result: failedResult });
  }
  const status = result.ok ? 202 : 500;
  log.info(`Pipeline run completed: ok=${result.ok} mode=${result.mode} refreshMode=${mode} events=${result.events}`);
  return res.status(status).json({ success: result.ok, result: enrichedResult });
}
