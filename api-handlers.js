import { getAIStatus } from "./ai.js";
import { describeEnvVar, getConfig, getIntegrationConfigStatus } from "./config.js";
import { buildBriefing } from "./event-insights.js";
import { getFlightsLayer, getLayersStatus, getSatellitesLayer, getSocialSignalsLayer, getVesselsLayer } from "./layers.js";
import { createLogger } from "./logger.js";
import { getMarketContext } from "./market-data.js";
import { runPipeline } from "./pipeline.js";
import {
  buildSubscriptionStatus,
  captureWaitlistInterest,
  exportReportPreview,
  generatePreviewReport,
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

export async function handleHealth(_req, res) {
  applyNoStore(res);
  const config = getConfig();
  const integrations = getIntegrationConfigStatus();
  const [layers, ai, newsRefresh, aiRefresh, newsRefreshUsage, aiRefreshUsage, stats] = await Promise.all([
    getLayersStatus(),
    getAIStatus(),
    getRefreshState("news"),
    getRefreshState("ai"),
    getRefreshUsageStats("news"),
    getRefreshUsageStats("ai"),
    getStats(),
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
  const lastNewsRefreshAt = newsRefresh.record?.lastRefresh ?? null;
  const refreshAgeHours = lastNewsRefreshAt
    ? Math.max(0, (Date.now() - new Date(lastNewsRefreshAt).getTime()) / 3600_000)
    : null;
  const cacheStatus = storage.mode === "memory"
    ? "memory_fallback"
    : refreshAgeHours === null
      ? "stale"
      : refreshAgeHours <= 12 ? "fresh" : "stale";

  return res.status(200).json({
    ok: true,
    label: integrations.newsApi.usable && integrations.gemini.usable && storage.ok ? "ok" : "degraded",
    checks: {
      env: { ok: missing.length === 0, missing },
      integrations: {
        newsApi: integrations.newsApi,
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
    data: {
      eventsDataSource: stats.mode ?? storage.mode ?? "memory",
      newestArticleAt,
      newestEventAt,
      activeEventCount: stats.activeEventCount ?? 0,
      staleEventCount: stats.staleEventCount ?? 0,
      historicalEventCount: stats.historicalEventCount ?? 0,
      cacheStatus,
    },
    automation: {
      aiCallsToday: ai.aiCallsToday,
      aiRemainingToday: ai.aiRemainingToday,
      lastNewsRefreshAt,
      lastAiRefreshAt: aiRefresh.record?.lastRefresh ?? null,
      nextEstimatedNewsRefresh: newsRefresh.record?.nextRefresh ?? null,
      nextEstimatedAiRefresh: aiRefresh.record?.nextRefresh ?? null,
      newsRefreshesToday: newsRefreshUsage.callsToday ?? 0,
      aiRefreshesToday: aiRefreshUsage.callsToday ?? 0,
      newestArticleAt,
      newestEventAt,
      activeEventCount: stats.activeEventCount ?? 0,
      staleEventCount: stats.staleEventCount ?? 0,
      historicalEventCount: stats.historicalEventCount ?? 0,
      eventsDataSource: stats.mode ?? storage.mode ?? "memory",
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
    limit,
    offset,
    mode: result.mode,
    scope: result.scope ?? scope,
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
  const [stats, ai, newsRefresh, aiRefresh, newsRefreshUsage, aiRefreshUsage] = await Promise.all([
    getStats(),
    getAIStatus(),
    getRefreshState("news"),
    getRefreshState("ai"),
    getRefreshUsageStats("news"),
    getRefreshUsageStats("ai"),
  ]);
  return res.status(200).json({
    ok: true,
    stats,
    ai,
    automation: {
      lastNewsRefreshAt: newsRefresh.record?.lastRefresh ?? null,
      lastAiRefreshAt: aiRefresh.record?.lastRefresh ?? null,
      nextEstimatedNewsRefresh: newsRefresh.record?.nextRefresh ?? null,
      nextEstimatedAiRefresh: aiRefresh.record?.nextRefresh ?? null,
      newsRefreshesToday: newsRefreshUsage.callsToday ?? 0,
      aiRefreshesToday: aiRefreshUsage.callsToday ?? 0,
      newestArticleAt: newsRefresh.record?.metadata?.newestArticleAt ?? null,
      newestEventAt: newsRefresh.record?.metadata?.newestEventAt ?? stats.newestUpdatedEvent ?? stats.newestEvent ?? null,
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
  return res.status(200).json(await buildSubscriptionStatus(req));
}

export async function handleReportsGenerate(req, res) {
  const payload = req.body ?? {};
  const result = await generatePreviewReport(req, payload);
  return res.status(result.status).json(result.body);
}

export async function handleReportsHistory(req, res) {
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
  const source = mode === "news" || mode === "ai" || req.headers["x-vercel-cron-secret"] ? "automation" : "manual";
  const result = await runPipeline({ source, noAi, mode, days });
  const nextNewsRefresh = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const nextAiRefresh = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
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
  const status = result.ok ? 202 : 500;
  log.info(`Pipeline run completed: ok=${result.ok} mode=${result.mode} refreshMode=${mode} events=${result.events}`);
  return res.status(status).json({ success: result.ok, result: enrichedResult });
}
