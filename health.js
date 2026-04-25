/**
 * GET /api/v1/health
 *
 * Lightweight liveness probe. Checks:
 *   1. Function is reachable (always passes if this code runs)
 *   2. Required env vars are set
 *   3. Supabase DB is reachable (single lightweight query)
 *
 * Suitable for:
 *   - Vercel deployment health checks
 *   - Uptime monitoring (UptimeRobot, Better Uptime, etc.)
 *   - Pre-deploy smoke test
 *
 * Response 200: { status: "ok", ... }
 * Response 503: { status: "degraded", ... }
 */

import { healthCheck }  from "../../lib/supabase.js";
import { sendError, methodAllowed } from "../../lib/security.js";
import { createLogger } from "../../lib/logger.js";

const log = createLogger("api:health");

const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "NEWS_API_KEY",
  "ADMIN_SECRET",
];

export default async function handler(req, res) {
  if (!methodAllowed(req, ["GET"])) return sendError(res, 405, "Method not allowed");

  const checks = {};

  // ── 1. Env vars ──────────────────────────────────────────────────────────
  const missingEnv = REQUIRED_VARS.filter((k) => !process.env[k]);
  checks.env = missingEnv.length === 0
    ? { ok: true }
    : { ok: false, missing: missingEnv };

  // ── 2. Supabase connectivity ──────────────────────────────────────────────
  try {
    const dbOk  = await healthCheck();
    checks.db   = { ok: dbOk };
  } catch (err) {
    checks.db   = { ok: false, error: "DB unreachable" };
    // detail logged server-side, never sent to client
    log.error("DB health check failed:", err.message);
  }

  // ── Overall status ────────────────────────────────────────────────────────
  const allOk  = Object.values(checks).every((c) => c.ok);
  const status = allOk ? 200 : 503;
  const label  = allOk ? "ok" : "degraded";

  log.info(`Health: ${label}`);

  res.setHeader("Content-Type", "application/json");
  return res.status(status).json({
    status,
    label,
    checks,
    timestamp: new Date().toISOString(),
    version:   process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  });
}
