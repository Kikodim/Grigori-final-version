/**
 * rate-limiter.js — AI Request Rate Limiter
 *
 * Enforces three independent constraints simultaneously:
 *
 *   RPM  — requests per minute   (sliding 60-second window)
 *   RPD  — requests per day      (rolling calendar-day counter)
 *   TPM  — tokens per minute     (sliding 60-second window, estimated)
 *
 * Design principles:
 *   - No external dependencies (pure in-memory)
 *   - Sliding window counters (more accurate than fixed buckets)
 *   - Throws a typed RateLimitError so callers can handle gracefully
 *   - Thread-safe for single-process Node.js (event loop guarantees)
 *
 * Usage:
 *   const limiter = new RateLimiter({ rpm: 15, rpd: 250, tpm: 250_000 });
 *   limiter.checkAndConsume(estimatedTokens);   // throws if over limit
 *   limiter.recordCompletion(actualTokens);     // call after success
 */

export class RateLimitError extends Error {
  /**
   * @param {"rpm"|"rpd"|"tpm"} limitType
   * @param {string}             message
   */
  constructor(limitType, message) {
    super(message);
    this.name      = "RateLimitError";
    this.limitType = limitType;
    this.retryable = true;
  }
}

export class RateLimiter {
  /**
   * @param {{ rpm: number, rpd: number, tpm: number }} limits
   */
  constructor(limits) {
    this.limits = limits;

    // Sliding window: array of { ts: number, tokens: number }
    this._minuteWindow = [];   // last 60s of requests
    this._dayRequests  = 0;    // resets at midnight
    this._dayResetAt   = this._nextMidnight();

    // Token tracking within the sliding minute window
    this._tokenWindow  = [];   // { ts: number, tokens: number }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Check all limits before making a request.
   * Throws RateLimitError if any limit would be exceeded.
   * Call BEFORE the API request.
   *
   * @param {number} [estimatedTokens=800]  — conservative prompt+response estimate
   */
  checkAndConsume(estimatedTokens = 800) {
    this._pruneWindows();

    // 1. Daily cap (hard limit — do not retry until tomorrow)
    if (this._dayRequests >= this.limits.rpd) {
      throw new RateLimitError(
        "rpd",
        `Daily request cap reached (${this.limits.rpd}/day). ` +
        `Resets at ${new Date(this._dayResetAt).toISOString()}`
      );
    }

    // 2. Requests per minute
    if (this._minuteWindow.length >= this.limits.rpm) {
      const oldestTs  = this._minuteWindow[0].ts;
      const retryInMs = 60_000 - (Date.now() - oldestTs) + 100; // +100ms buffer
      throw new RateLimitError(
        "rpm",
        `RPM limit reached (${this.limits.rpm}/min). ` +
        `Retry in ${Math.ceil(retryInMs / 1000)}s`
      );
    }

    // 3. Tokens per minute
    const tokensSoFar = this._tokenWindow.reduce((sum, e) => sum + e.tokens, 0);
    if (tokensSoFar + estimatedTokens > this.limits.tpm) {
      const oldestTs  = this._tokenWindow[0]?.ts ?? Date.now();
      const retryInMs = 60_000 - (Date.now() - oldestTs) + 100;
      throw new RateLimitError(
        "tpm",
        `TPM limit approached (${tokensSoFar}/${this.limits.tpm} tokens). ` +
        `Retry in ${Math.ceil(retryInMs / 1000)}s`
      );
    }

    // All checks passed — mark the request as consumed
    const now = Date.now();
    this._minuteWindow.push({ ts: now });
    this._tokenWindow.push({ ts: now, tokens: estimatedTokens });
    this._dayRequests++;
  }

  /**
   * Update token tracking with actual usage after a successful call.
   * Corrects the estimate used in checkAndConsume().
   *
   * @param {number} actualTokens  — inputTokens + outputTokens from provider
   * @param {number} [estimatedTokens=800]  — the estimate used earlier
   */
  recordCompletion(actualTokens, estimatedTokens = 800) {
    // Replace the most recent token entry with actual usage
    if (this._tokenWindow.length > 0) {
      const last = this._tokenWindow[this._tokenWindow.length - 1];
      if (last.tokens === estimatedTokens) {
        last.tokens = actualTokens;
      }
    }
  }

  /**
   * How many requests remain before hitting each limit.
   * Used for monitoring and the /ai/status endpoint.
   *
   * @returns {{ rpm: number, rpd: number, tpmUsed: number }}
   */
  remaining() {
    this._pruneWindows();
    const tpmUsed = this._tokenWindow.reduce((sum, e) => sum + e.tokens, 0);
    return {
      rpm:     this.limits.rpm - this._minuteWindow.length,
      rpd:     this.limits.rpd - this._dayRequests,
      tpmUsed,
      tpmFree: this.limits.tpm - tpmUsed,
    };
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  /** Remove entries older than 60 seconds from sliding windows */
  _pruneWindows() {
    const cutoff = Date.now() - 60_000;
    this._minuteWindow = this._minuteWindow.filter((e) => e.ts > cutoff);
    this._tokenWindow  = this._tokenWindow.filter((e) => e.ts > cutoff);

    // Reset daily counter at midnight
    if (Date.now() >= this._dayResetAt) {
      this._dayRequests = 0;
      this._dayResetAt  = this._nextMidnight();
    }
  }

  _nextMidnight() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.getTime();
  }
}
