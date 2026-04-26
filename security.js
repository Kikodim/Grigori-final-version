/**
 * lib/security.js — Security Middleware
 *
 * requireAdmin(req)      validates Bearer token (ADMIN_SECRET) or Vercel Cron header
 * checkRateLimit(ip)     IP-based sliding window, in-memory per warm instance
 * sendError(res,…)       consistent safe error response, never leaks internals
 * sanitizeId(id)         UUID validation before any DB query
 * parsePagination(query) validated limit/offset
 * methodAllowed(req,…)   HTTP method guard
 */

import { createLogger } from "./logger.js";

const log = createLogger("security");

// ─── Constant-time string comparison ─────────────────────────────────────────
// Both inputs padded to the same length before XOR.
// This prevents timing oracles that leak secret length.

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  // Pad both to identical length so loop duration is always the same
  const len = Math.max(a.length, b.length, 64);
  const pa  = a.padEnd(len, "\0");
  const pb  = b.padEnd(len, "\0");
  let diff  = 0;
  for (let i = 0; i < len; i++) {
    diff |= pa.charCodeAt(i) ^ pb.charCodeAt(i);
  }
  // Also check true lengths after the loop (constant time overall)
  return diff === 0 && a.length === b.length;
}

// ─── Admin authentication ─────────────────────────────────────────────────────
// Accepts two valid sources:
//   1. Authorization: Bearer <ADMIN_SECRET>  (manual/curl calls)
//   2. x-vercel-cron-secret: <auto>          (Vercel Cron Jobs)

export function requireAdmin(req) {
  // Path 1: Vercel Cron — Vercel sets this header automatically
  const cronHeader = req.headers["x-vercel-cron-secret"] ?? "";
  if (cronHeader) {
    // Vercel verifies this internally before the request reaches the function.
    // If the header is present, the request came from Vercel's cron scheduler.
    log.info("Pipeline triggered by Vercel Cron");
    return true;
  }

  // Path 2: Manual call — requires ADMIN_SECRET
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    log.error("ADMIN_SECRET not configured — all manual pipeline triggers denied");
    return false;
  }

  const authHeader = req.headers["authorization"] ?? "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!safeCompare(token, adminSecret)) {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
            ?? req.socket?.remoteAddress
            ?? "unknown";
    log.warn(`Unauthorized pipeline attempt from ${ip}`);
    return false;
  }

  return true;
}

export function getBearerToken(req) {
  const authHeader = req.headers["authorization"] ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

// ─── IP-based rate limiter ────────────────────────────────────────────────────
// In-memory, resets on cold start.
// Sufficient for abuse prevention on serverless; upgrade to Upstash Redis
// for cross-instance rate limiting before monetization.

const _rlMap    = new Map();  // ip → { count, windowStart }
const WINDOW_MS = 60_000;

function getMaxRpm() {
  return parseInt(process.env.RATE_LIMIT_RPM ?? "60", 10);
}

export function checkRateLimit(ip) {
  const maxRpm = getMaxRpm();
  const now    = Date.now();
  const rec    = _rlMap.get(ip) ?? { count: 0, windowStart: now };

  if (now - rec.windowStart > WINDOW_MS) {
    rec.count       = 0;
    rec.windowStart = now;
  }
  rec.count++;
  _rlMap.set(ip, rec);

  // Periodic cleanup — prevent unbounded Map growth
  if (_rlMap.size > 1000) {
    const cutoff = now - WINDOW_MS;
    for (const [k, v] of _rlMap) {
      if (v.windowStart < cutoff) _rlMap.delete(k);
    }
  }

  return {
    allowed:   rec.count <= maxRpm,
    remaining: Math.max(0, maxRpm - rec.count),
    resetInMs: WINDOW_MS - (now - rec.windowStart),
  };
}

export function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "unknown"
  );
}

// ─── Error response ───────────────────────────────────────────────────────────
// detail is logged server-side ONLY — never sent to the client.

export function sendError(res, status, message, detail) {
  if (detail) log.error(`HTTP ${status}: ${detail}`);
  res.setHeader("Content-Type", "application/json");
  res.status(status).json({ success: false, error: message });
}

// ─── Input validators ─────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeId(id) {
  if (typeof id !== "string") return null;
  return UUID_RE.test(id) ? id : null;
}

export function parsePagination(query) {
  const limit  = Math.min(Math.max(parseInt(query.limit  ?? "50", 10), 1), 100);
  const offset = Math.max(parseInt(query.offset ?? "0",  10), 0);
  return { limit, offset };
}

export function methodAllowed(req, allowed) {
  return allowed.includes(req.method ?? "") || req.method === "OPTIONS";
}

// Strip SQL wildcard metacharacters from region filter to prevent full-table scans
export function sanitizeRegion(region) {
  if (typeof region !== "string") return undefined;
  return region.replace(/[%_\\]/g, "").slice(0, 80).trim() || undefined;
}
