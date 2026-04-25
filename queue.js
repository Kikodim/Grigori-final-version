/**
 * queue.js — AI Request Queue
 *
 * Serialises all AI requests through a single FIFO queue.
 * This is the only place that talks to the rate limiter.
 *
 * Responsibilities:
 *   - Accept jobs from anywhere in the pipeline
 *   - Enforce minimum spacing between requests (60s / RPM = 4s)
 *   - Retry on retryable errors (429, 5xx) with exponential backoff
 *   - Reject when the daily cap is exhausted (non-retryable)
 *   - Expose queue depth and status for monitoring
 *
 * Architecture note:
 *   The queue is a singleton module — there is exactly one queue
 *   for the entire process. This prevents concurrent pipeline runs
 *   from independently hammering the rate limiter.
 *
 * Usage:
 *   import { enqueue } from "./queue.js";
 *   const result = await enqueue(() => provider.complete(req), { estimatedTokens: 900 });
 */

import { RateLimitError } from "./rate-limiter.js";
import { log } from "../utils/logger.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES        = 3;
const BASE_BACKOFF_MS    = 4_000;   // 4s between requests at 15 RPM
const MAX_BACKOFF_MS     = 64_000;  // cap at 64s
const INTER_REQUEST_MS   = 4_100;   // 60_000 / 15 RPM + 100ms buffer

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {QueueJob[]} */
let _queue     = [];
let _running   = false;
let _lastCallAt = 0;
let _rateLimiter = null;  // injected via init()

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} QueueJob
 * @property {string}   id
 * @property {function(): Promise<any>} fn   — the actual API call
 * @property {number}   estimatedTokens
 * @property {number}   addedAt
 * @property {function} resolve
 * @property {function} reject
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Inject the rate limiter (called from ai/index.js during init).
 * @param {import("./rate-limiter.js").RateLimiter} limiter
 */
export function setRateLimiter(limiter) {
  _rateLimiter = limiter;
}

/**
 * Add an AI call to the queue.
 * Returns a Promise that resolves with the provider response
 * or rejects with an error after MAX_RETRIES.
 *
 * @param {function(): Promise<any>} fn           — zero-argument async function
 * @param {{ estimatedTokens?: number }} [opts]
 * @returns {Promise<any>}
 */
export function enqueue(fn, opts = {}) {
  if (!_rateLimiter) throw new Error("Queue not initialised — call setRateLimiter() first");

  const estimatedTokens = opts.estimatedTokens ?? 800;

  return new Promise((resolve, reject) => {
    const job = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fn,
      estimatedTokens,
      addedAt: Date.now(),
      resolve,
      reject,
    };

    _queue.push(job);
    log.debug(`[queue] Job ${job.id} enqueued (depth=${_queue.length})`);

    if (!_running) _processNext();
  });
}

/** Current queue status (for monitoring) */
export function queueStatus() {
  return {
    depth:   _queue.length,
    running: _running,
    ..._rateLimiter?.remaining(),
  };
}

// ─── Internal runner ──────────────────────────────────────────────────────────

async function _processNext() {
  if (_queue.length === 0) {
    _running = false;
    return;
  }

  _running = true;
  const job = _queue[0];  // peek, don't shift yet

  // Enforce minimum inter-request spacing
  const msSinceLast = Date.now() - _lastCallAt;
  if (msSinceLast < INTER_REQUEST_MS) {
    const wait = INTER_REQUEST_MS - msSinceLast;
    log.debug(`[queue] Spacing wait ${wait}ms`);
    await sleep(wait);
  }

  // Attempt with retries
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    try {
      // Check rate limits BEFORE the call
      _rateLimiter.checkAndConsume(job.estimatedTokens);

      log.debug(`[queue] Executing job ${job.id} (attempt ${attempt + 1})`);
      _lastCallAt = Date.now();

      const result = await job.fn();

      // Update token tracking with actual usage
      if (result?.inputTokens !== undefined) {
        _rateLimiter.recordCompletion(
          result.inputTokens + result.outputTokens,
          job.estimatedTokens
        );
      }

      const waitedMs = Date.now() - job.addedAt;
      log.debug(`[queue] Job ${job.id} done (waited ${waitedMs}ms total)`);

      _queue.shift();         // remove completed job
      job.resolve(result);
      break;

    } catch (err) {
      attempt++;

      // Daily cap exhausted — non-retryable, reject immediately
      if (err instanceof RateLimitError && err.limitType === "rpd") {
        log.warn(`[queue] Daily cap exhausted — job ${job.id} rejected`);
        _queue.shift();
        job.reject(err);
        break;
      }

      // Retryable errors: wait with exponential backoff
      if (err.retryable && attempt <= MAX_RETRIES) {
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        log.warn(`[queue] Job ${job.id} retryable error (${err.message}) — backoff ${backoff}ms`);
        await sleep(backoff);
        continue;
      }

      // Non-retryable or max retries exceeded
      log.error(`[queue] Job ${job.id} failed after ${attempt} attempts: ${err.message}`);
      _queue.shift();
      job.reject(err);
      break;
    }
  }

  // Process next job (async, so we don't stack-overflow on large queues)
  setImmediate(_processNext);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
