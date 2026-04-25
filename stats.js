/**
 * GET /api/v1/events/stats
 *
 * Returns system diagnostics: DB counts, AI queue state, runtime info.
 * No authentication required (stats contain no sensitive data).
 *
 * Response 200:
 * {
 *   success: true,
 *   db:      { healthy, eventCount, oldestEvent, newestEvent },
 *   ai:      { queueDepth, processing, cacheSize, dailyCalls, dailyLimit },
 *   runtime: { nodeVersion, uptimeSeconds }
 * }
 */

import { getStats, healthCheck } from "../../../lib/supabase.js";
import { getAIStatus }           from "../../../lib/ai.js";
import { requireEnv }            from "../../../lib/config.js";
import {
  checkRateLimit, getClientIp,
  sendError, methodAllowed,
} from "../../../lib/security.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("api:stats");

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (!methodAllowed(req, ["GET"])) return sendError(res, 405, "Method not allowed");

  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rl.resetInMs / 1000)));
    return sendError(res, 429, "Too many requests");
  }

  try { requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]); }
  catch (err) { return sendError(res, 503, "Service not configured", err.message); }

  try {
    const [dbStats, dbHealthy] = await Promise.all([
      getStats().catch(() => null),
      healthCheck().catch(() => false),
    ]);

    log.info("Stats served");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      success: true,
      db: {
        healthy:     dbHealthy,
        eventCount:  dbStats?.eventCount  ?? 0,
        oldestEvent: dbStats?.oldestEvent ?? null,
        newestEvent: dbStats?.newestEvent ?? null,
      },
      ai:      getAIStatus(),
      runtime: {
        nodeVersion:    process.version,
        uptimeSeconds:  Math.floor(process.uptime()),
      },
    });
  } catch (err) {
    return sendError(res, 500, "Failed to retrieve stats", err.message);
  }
}
