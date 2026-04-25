/**
 * ai-cache.js — AI Result Cache
 *
 * Stores the output of every AI call keyed by a deterministic
 * fingerprint of the input cluster. Identical clusters (same
 * article set, same region) NEVER trigger a second Gemini call.
 *
 * Cache key = SHA-256 of sorted article IDs + region label.
 * This is stable across pipeline runs as long as the cluster
 * composition doesn't change.
 *
 * In-memory implementation (Map). To persist across restarts,
 * swap the Map for a SQLite/Supabase implementation — the
 * exported interface stays identical.
 *
 * Stats exposed for monitoring:
 *   hits   — requests served from cache (zero AI cost)
 *   misses — requests that needed a real AI call
 */

import { createHash } from "crypto";
import { log } from "../utils/logger.js";

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * @type {Map<string, CacheEntry>}
 */
const _cache = new Map();

let _hits   = 0;
let _misses = 0;

/**
 * @typedef {Object} CacheEntry
 * @property {string} key
 * @property {object} result      — the AI-processed result
 * @property {number} createdAt   — Unix ms
 * @property {number} expiresAt   — Unix ms
 */

// ─── Config ───────────────────────────────────────────────────────────────────

/** Cache entries live for 6 hours by default */
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the deterministic cache key for a pre-event cluster.
 *
 * @param {{ articleIds: string[], region: { label: string }|null }} cluster
 * @returns {string}  hex SHA-256
 */
export function cacheKey(cluster) {
  const sorted  = [...cluster.articleIds].sort().join("|");
  const region  = cluster.region?.label ?? "unknown";
  return createHash("sha256")
    .update(`${sorted}::${region}`)
    .digest("hex")
    .slice(0, 16);  // 16 chars is collision-resistant enough for this scale
}

/**
 * Look up a cached result.
 *
 * @param {string} key
 * @returns {object|null}  cached result, or null on miss/expiry
 */
export function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) {
    _misses++;
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    _cache.delete(key);
    _misses++;
    log.debug(`[cache] Key ${key} expired`);
    return null;
  }
  _hits++;
  log.debug(`[cache] HIT  key=${key}`);
  return entry.result;
}

/**
 * Store an AI result.
 *
 * @param {string} key
 * @param {object} result
 * @param {number} [ttlMs]  — override default TTL
 */
export function cacheSet(key, result, ttlMs = DEFAULT_TTL_MS) {
  _cache.set(key, {
    key,
    result,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
  log.debug(`[cache] SET  key=${key}  expires=${new Date(Date.now() + ttlMs).toISOString()}`);
}

/**
 * Check existence without affecting stats.
 * @param {string} key
 * @returns {boolean}
 */
export function cacheHas(key) {
  const entry = _cache.get(key);
  return !!entry && Date.now() <= entry.expiresAt;
}

/** Remove all expired entries (call periodically from server.js) */
export function cachePrune() {
  const now = Date.now();
  let pruned = 0;
  for (const [key, entry] of _cache) {
    if (now > entry.expiresAt) {
      _cache.delete(key);
      pruned++;
    }
  }
  if (pruned > 0) log.debug(`[cache] Pruned ${pruned} expired entries`);
  return pruned;
}

/** Stats for monitoring */
export function cacheStats() {
  return {
    size:       _cache.size,
    hits:       _hits,
    misses:     _misses,
    hitRate:    _hits + _misses > 0
                  ? `${((_hits / (_hits + _misses)) * 100).toFixed(1)}%`
                  : "n/a",
  };
}
