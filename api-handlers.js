import { getAIStatus } from "./ai.js";
import { describeEnvVar, getConfig, getIntegrationConfigStatus } from "./config.js";
import { buildBriefing } from "./event-insights.js";
import { createLogger } from "./logger.js";
import { runPipeline } from "./pipeline.js";
import {
  checkRateLimit,
  getClientIp,
  parsePagination,
  requireAdmin,
  sanitizeId,
  sanitizeRegion,
  sendError,
} from "./security.js";
import { getEventById, getEvents, getStats, healthCheck } from "./supabase.js";

const log = createLogger("api");

const VALID_TONES = new Set(["Escalating", "Stable", "De-escalating"]);
const VALID_CONFIDENCE = new Set(["Low", "Medium", "High"]);

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
  const config = getConfig();
  const integrations = getIntegrationConfigStatus();
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
      aiDailyLimit: config.aiDailyLimit,
      aiReservedCalls: config.aiReservedCalls,
      maxAiCallsPerRun: config.maxAiCallsPerRun,
      maxArticlesPerRun: config.maxArticlesPerRun,
      clusterThreshold: config.clusterThreshold,
      nodeEnv: config.nodeEnv,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function handleEvents(req, res) {
  if (!applyRateLimit(req, res)) return;

  const { limit, offset } = parsePagination(req.query ?? {});
  const { tone, confidence } = req.query ?? {};
  const region = sanitizeRegion(req.query?.region);

  if (tone && !VALID_TONES.has(tone)) {
    return sendError(res, 400, `tone must be one of: ${[...VALID_TONES].join(", ")}`);
  }

  if (confidence && !VALID_CONFIDENCE.has(confidence)) {
    return sendError(res, 400, `confidence must be one of: ${[...VALID_CONFIDENCE].join(", ")}`);
  }

  const result = await getEvents({ limit, offset, tone, confidence, region });
  return res.status(200).json({
    ok: true,
    total: result.total,
    limit,
    offset,
    mode: result.mode,
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
  const stats = await getStats();
  return res.status(200).json({ ok: true, stats, ai: await getAIStatus() });
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

export async function handlePipelineRun(req, res) {
  if (missingProductionSecret()) {
    return sendError(res, 503, "Pipeline trigger disabled: ADMIN_SECRET is not configured");
  }

  if (!requireAdmin(req)) {
    return sendError(res, 401, "Unauthorized");
  }

  const noAi = req.query?.noAi === "true" || req.body?.noAi === true;
  const source = req.headers["x-vercel-cron-secret"] ? "automation" : "manual";
  const result = await runPipeline({ source, noAi });
  const status = result.ok ? 202 : 500;
  log.info(`Pipeline run completed: ok=${result.ok} mode=${result.mode} events=${result.events}`);
  return res.status(status).json({ success: result.ok, result });
}
