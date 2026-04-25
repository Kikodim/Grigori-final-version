/**
 * POST /api/v1/pipeline/run
 *
 * Triggers one full pipeline cycle: INGEST → CLUSTER → AI → PERSIST → PURGE.
 *
 * ── Authentication ────────────────────────────────────────────────────────────
 * Two valid callers:
 *
 *   1. Vercel Cron (automatic, every 6 hours per vercel.json):
 *      Vercel injects the `x-vercel-cron-secret` header automatically.
 *      No action needed — the platform handles it.
 *
 *   2. Manual / curl trigger:
 *      Authorization: Bearer <ADMIN_SECRET>
 *
 * Any request missing both credentials receives 401.
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 *   202 Accepted — pipeline ran (check body for ok: true/false)
 *   401 Unauthorized
 *   405 Method not allowed
 *   503 Service not configured (missing env vars)
 *
 * Body (202):
 * {
 *   success: true,
 *   result: {
 *     ok, events, articles, clusters, cached, aiCalls, purged, elapsed
 *   }
 * }
 */

import { runPipeline } from "../../../lib/pipeline.js";
import { requireEnv }  from "../../../lib/config.js";
import { requireAdmin, sendError, methodAllowed } from "../../../lib/security.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("api:pipeline");

export default async function handler(req, res) {
  if (!methodAllowed(req, ["POST"])) return sendError(res, 405, "Method not allowed");

  // ── Auth ─────────────────────────────────────────────────────────────────
  if (!requireAdmin(req)) {
    return sendError(res, 401, "Unauthorized");
  }

  // ── Env check ────────────────────────────────────────────────────────────
  try {
    requireEnv([
      "NEWS_API_KEY",
      "GEMINI_API_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  } catch (err) {
    return sendError(res, 503, "Service not configured — check environment variables", err.message);
  }

  log.info("Pipeline triggered");

  // runPipeline() never throws — it always returns a stats object
  const result = await runPipeline();

  log.info(`Pipeline finished: ok=${result.ok} events=${result.events} elapsed=${result.elapsed}`);

  res.setHeader("Content-Type", "application/json");
  return res.status(202).json({ success: true, result });
}
