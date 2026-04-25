/**
 * GET /api/v1/events
 *
 * Query params:
 *   limit      1–100   (default 50)
 *   offset     ≥0      (default 0)
 *   tone       Escalating | Stable | De-escalating
 *   confidence Low | Medium | High
 *   region     partial match string
 *
 * Response: { success, total, limit, offset, events[] }
 */

import { getEvents }    from "../../../lib/supabase.js";
import { requireEnv }   from "../../../lib/config.js";
import {
  checkRateLimit, getClientIp, parsePagination,
  sendError, methodAllowed, sanitizeRegion,
} from "../../../lib/security.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("api:events");

const VALID_TONES = new Set(["Escalating", "Stable", "De-escalating"]);
const VALID_CONF  = new Set(["Low", "Medium", "High"]);

export default async function handler(req, res) {
  // OPTIONS preflight for CORS
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin",  "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  if (!methodAllowed(req, ["GET"])) return sendError(res, 405, "Method not allowed");

  const ip = getClientIp(req);
  const rl = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rl.resetInMs / 1000)));
    return sendError(res, 429, "Too many requests — retry in 60 seconds");
  }

  // Validate env before touching DB
  try { requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]); }
  catch (err) { return sendError(res, 503, "Service not configured", err.message); }

  const { limit, offset } = parsePagination(req.query ?? {});
  const { tone, confidence, region } = req.query ?? {};

  if (tone && !VALID_TONES.has(tone))
    return sendError(res, 400, `tone must be one of: ${[...VALID_TONES].join(", ")}`);
  if (confidence && !VALID_CONF.has(confidence))
    return sendError(res, 400, `confidence must be one of: ${[...VALID_CONF].join(", ")}`);

  try {
    const { events, total } = await getEvents({
      limit, offset, tone, confidence,
      region: sanitizeRegion(region),
    });
    log.info(`${events.length}/${total} events returned (ip=${ip})`);
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ success: true, total, limit, offset, events });
  } catch (err) {
    return sendError(res, 500, "Failed to retrieve events", err.message);
  }
}
