/**
 * lib/config.js — Environment Variable Validation
 *
 * Call validateEnv() at the top of any handler that needs certain keys.
 * Returns a typed config object or throws with a clear message.
 *
 * WHY: Missing env vars only fail when first used, producing confusing
 * errors deep in the call stack. This surfaces them immediately with
 * actionable messages.
 */

import { createLogger } from "./logger.js";
const log = createLogger("config");

const PLACEHOLDER_PATTERNS = [
  "your_",
  "replace_me",
  "xxxxx",
  "example",
  "placeholder",
];

export function isPlaceholderValue(value) {
  if (typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern));
}

export function describeEnvVar(name) {
  const raw = process.env[name];
  if (!raw) return { present: false, usable: false, reason: "missing" };
  if (isPlaceholderValue(raw)) return { present: true, usable: false, reason: "placeholder" };
  return { present: true, usable: true, reason: "set" };
}

export function getIntegrationConfigStatus() {
  const newsApi = describeEnvVar("NEWS_API_KEY");
  const gemini = describeEnvVar("GEMINI_API_KEY");
  const supabaseUrl = describeEnvVar("SUPABASE_URL");
  const supabaseServiceRoleKey = describeEnvVar("SUPABASE_SERVICE_ROLE_KEY");
  const adminSecret = describeEnvVar("ADMIN_SECRET");

  return {
    newsApi,
    gemini,
    supabase: {
      present: supabaseUrl.present && supabaseServiceRoleKey.present,
      usable: supabaseUrl.usable && supabaseServiceRoleKey.usable,
      reason: supabaseUrl.usable && supabaseServiceRoleKey.usable
        ? "set"
        : (!supabaseUrl.present || !supabaseServiceRoleKey.present ? "missing" : "placeholder"),
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
    },
    adminSecret,
  };
}

/**
 * Validate that all required environment variables are set.
 * Throws with a list of missing keys if any are absent.
 * @param {string[]} required
 */
export function requireEnv(required) {
  const missing = required.filter((k) => !describeEnvVar(k).usable);
  if (missing.length > 0) {
    const msg = `Missing required environment variables: ${missing.join(", ")}. ` +
      "Set them in .env.local (development) or Vercel → Settings → Environment Variables (production).";
    log.error(msg);
    throw new Error(msg);
  }
}

/**
 * Get the full config object, validated.
 * Safe to call multiple times — values are read from process.env each time.
 */
export function getConfig() {
  return {
    port:                   parseInt(process.env.PORT ?? "3001", 10),
    nodeEnv:                process.env.NODE_ENV ?? "development",
    supabaseUrl:            process.env.SUPABASE_URL              ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    geminiApiKey:           process.env.GEMINI_API_KEY            ?? "",
    newsApiKey:             process.env.NEWS_API_KEY              ?? "",
    adminSecret:            process.env.ADMIN_SECRET              ?? "",
    maxArticlesPerRun:      parseInt(process.env.MAX_ARTICLES_PER_RUN ?? "40",   10),
    clusterThreshold:       parseFloat(process.env.CLUSTER_THRESHOLD   ?? "0.18"),
    eventMaxAgeHours:       parseInt(process.env.EVENT_MAX_AGE_HOURS   ?? "24",  10),
    rateLimitRpm:           parseInt(process.env.RATE_LIMIT_RPM        ?? "60",  10),
    ingestIntervalMinutes:  parseInt(process.env.INGEST_INTERVAL_MINUTES ?? "90", 10),
    enableAutomatedAi:      String(process.env.ENABLE_AUTOMATED_AI ?? "true").toLowerCase() !== "false",
    aiDailyLimit:           parseInt(process.env.AI_DAILY_LIMIT       ?? "20",  10),
    aiReservedCalls:        parseInt(process.env.AI_RESERVED_CALLS    ?? "2",   10),
    maxAiCallsPerRun:       parseInt(process.env.MAX_AI_CALLS_PER_RUN ?? "1",   10),
  };
}
