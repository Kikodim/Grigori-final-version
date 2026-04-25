/**
 * GET /api/v1/events/:id
 *
 * Returns a single event by UUID.
 *
 * Response 200: { success: true, event: { ... } }
 * Response 400: { success: false, error: "Invalid event ID" }
 * Response 404: { success: false, error: "Event not found" }
 * Response 500: { success: false, error: "Failed to retrieve event" }
 */

import { getEventById } from "../../../lib/supabase.js";
import { requireEnv }   from "../../../lib/config.js";
import {
  checkRateLimit, getClientIp,
  sanitizeId, sendError, methodAllowed,
} from "../../../lib/security.js";
import { createLogger } from "../../../lib/logger.js";

const log = createLogger("api:events:id");

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
  res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
  if (!rl.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(rl.resetInMs / 1000)));
    return sendError(res, 429, "Too many requests");
  }

  // Vercel puts dynamic route segments in req.query
  const id = sanitizeId(req.query?.id);
  if (!id) return sendError(res, 400, "Invalid event ID — must be a valid UUID");

  try { requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]); }
  catch (err) { return sendError(res, 503, "Service not configured", err.message); }

  try {
    const event = await getEventById(id);
    if (!event) {
      log.info(`404 for id=${id}`);
      return sendError(res, 404, "Event not found");
    }
    log.info(`Served event id=${id}`);
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ success: true, event });
  } catch (err) {
    return sendError(res, 500, "Failed to retrieve event", err.message);
  }
}
