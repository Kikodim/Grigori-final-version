/**
 * ai-service.js — Central AI Service
 *
 * THE only module that knows about Gemini, the rate limiter, the queue,
 * and the cache. Everything else in the pipeline talks to this module.
 *
 * Public API:
 *
 *   processCluster(preEvent, articles)
 *     → full intelligence brief + scenarios
 *     → returns cached result if already processed
 *     → queues Gemini call if not cached
 *
 *   generateBriefMe(event)
 *     → on-demand deep-dive executive brief
 *     → always calls Gemini (not cached — user explicitly requested)
 *     → counts against rate limits like any other call
 *
 *   getStatus()
 *     → rate limiter remaining, queue depth, cache stats
 *
 * Switching providers:
 *   Change only the `provider` variable in init().
 *   The rest of this file is provider-agnostic.
 */

import { GeminiProvider }    from "./providers/gemini.provider.js";
import { RateLimiter }       from "./rate-limiter.js";
import { enqueue, setRateLimiter, queueStatus } from "./queue.js";
import { cacheKey, cacheGet, cacheSet, cacheStats } from "./ai-cache.js";
import {
  BRIEF_SYSTEM_PROMPT,
  BRIEF_ME_SYSTEM_PROMPT,
  buildBriefPrompt,
  buildBriefMePrompt,
} from "./prompts.js";
import { buildRuleBasedBriefing } from "./rule-based-briefing.js";
import { log } from "../utils/logger.js";

// ─── Singleton state ──────────────────────────────────────────────────────────

/** @type {import("./providers/gemini.provider.js").GeminiProvider|null} */
let _provider    = null;
let _rateLimiter = null;
let _initialised = false;

// ─── Init (called once from server.js) ───────────────────────────────────────

/**
 * Initialise the AI service. Must be called before any other function.
 * @param {{ geminiApiKey: string }} config
 */
export function initAIService({ geminiApiKey }) {
  if (_initialised) return;

  _provider    = new GeminiProvider(geminiApiKey);
  _rateLimiter = new RateLimiter(_provider.getLimits());

  setRateLimiter(_rateLimiter);

  _initialised = true;
  log.info(`[ai-service] Initialised — provider=${_provider.name}`);
  log.info(`[ai-service] Limits: RPM=${_provider.getLimits().rpm}  RPD=${_provider.getLimits().rpd}  TPM=${_provider.getLimits().tpm}`);
}

function assertInit() {
  if (!_initialised) throw new Error("AI service not initialised — call initAIService() first");
}

// ─── processCluster ───────────────────────────────────────────────────────────

/**
 * Process a pre-event cluster into a full intelligence brief.
 *
 * Cache-first:  if we've seen this exact cluster before, return the
 *               cached result instantly (zero AI cost).
 * Cache-miss:   queue a Gemini call, validate the response, cache it.
 *
 * @param {object}    preEvent   — from cluster.js
 * @param {object[]}  articles   — full Article objects (for prompt building)
 * @returns {Promise<ProcessedEvent>}
 */
export async function processCluster(preEvent, articles) {
  assertInit();

  const key = cacheKey(preEvent);

  // ── Cache hit ───────────────────────────────────────────────────────────────
  const cached = cacheGet(key);
  if (cached) {
    log.info(`[ai-service] CACHE HIT  key=${key}  "${preEvent.title.slice(0, 50)}"`);
    return cached;
  }

  // ── Cache miss — call Gemini ────────────────────────────────────────────────
  log.info(`[ai-service] CACHE MISS key=${key}  queuing Gemini call`);

  const { prompt, estimatedTokens } = buildBriefPrompt(preEvent, articles);

  const response = await enqueue(
    () => _provider.complete({
      systemPrompt: BRIEF_SYSTEM_PROMPT,
      userPrompt:   prompt,
      maxTokens:    1200,
    }),
    { estimatedTokens }
  );

  const result = parseBriefResponse(response.text, preEvent);

  // Cache the result so this cluster is never re-processed
  cacheSet(key, result);

  return result;
}

// ─── generateBriefMe ─────────────────────────────────────────────────────────

/**
 * Generate an on-demand executive brief for a stored event.
 * This is a deliberate user action — always calls Gemini.
 * Results are NOT cached (the user wants fresh analysis).
 *
 * @param {import("../store.js").GrigoriEvent} event
 * @returns {Promise<BriefMeResult>}
 */
export async function generateBriefMe(event) {
  assertInit();

  log.info(`[ai-service] Brief Me request for event="${event.id}"`);

  const { prompt, estimatedTokens } = buildBriefMePrompt(event);

  const response = await enqueue(
    () => _provider.complete({
      systemPrompt: BRIEF_ME_SYSTEM_PROMPT,
      userPrompt:   prompt,
      maxTokens:    1500,
    }),
    { estimatedTokens }
  );

  return parseBriefMeResponse(response.text);
}

// ─── getStatus ────────────────────────────────────────────────────────────────

/**
 * Current AI service status for monitoring.
 * Exposed via GET /api/v1/ai/status.
 */
export function getAIStatus() {
  assertInit();
  return {
    provider: _provider.name,
    queue:    queueStatus(),
    cache:    cacheStats(),
    limits:   _provider.getLimits(),
  };
}

// ─── Response parsers ─────────────────────────────────────────────────────────

const VALID_TONES      = new Set(["Escalating", "Stable", "De-escalating"]);
const VALID_CONFIDENCE = new Set(["Low", "Medium", "High"]);
const VALID_OIL        = new Set(["Up", "Neutral", "Down"]);
const VALID_MARKETS    = new Set(["Risk-on", "Risk-off"]);
const VALID_SECTORS    = new Set(["Energy", "Defense", "Tech", "Shipping", "Food", "Finance"]);

/**
 * Parse and validate the brief response from any provider.
 * Repairs common issues instead of throwing, so the pipeline never stalls.
 */
function parseBriefResponse(text, preEvent) {
  let raw;
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    raw = JSON.parse(cleaned);
  } catch {
    log.warn("[ai-service] JSON parse failed — using fallback");
    return buildFallback(preEvent);
  }

  // Validate scenarios and normalise probabilities
  let scenarios = [];
  if (Array.isArray(raw.scenarios)) {
    scenarios = raw.scenarios.slice(0, 3).map((s) => ({
      name:        String(s.name ?? "Unnamed"),
      probability: Number.isFinite(s.probability) ? Math.round(Math.max(0, Math.min(100, s.probability))) : 33,
      description: String(s.description ?? ""),
      impact: {
        oil:     VALID_OIL.has(s.impact?.oil)        ? s.impact.oil     : "Neutral",
        markets: VALID_MARKETS.has(s.impact?.markets) ? s.impact.markets : "Risk-off",
        sectors: (Array.isArray(s.impact?.sectors) ? s.impact.sectors : [])
                   .filter((sec) => VALID_SECTORS.has(sec)),
      },
    }));

    // Renormalise probabilities to sum exactly to 100
    const total = scenarios.reduce((sum, s) => sum + s.probability, 0);
    if (total > 0 && total !== 100) {
      scenarios = scenarios.map((s) => ({
        ...s,
        probability: Math.round((s.probability / total) * 100),
      }));
      // Fix rounding drift on first scenario
      const drift = 100 - scenarios.reduce((s, sc) => s + sc.probability, 0);
      if (scenarios[0]) scenarios[0].probability += drift;
    }
  }

  return {
    title:        String(raw.title ?? preEvent.title).slice(0, 120),
    summary:      String(raw.summary ?? ""),
    developments: Array.isArray(raw.developments)
                    ? raw.developments.filter((d) => typeof d === "string").slice(0, 5)
                    : [],
    tone:         VALID_TONES.has(raw.tone)           ? raw.tone       : "Stable",
    confidence:   VALID_CONFIDENCE.has(raw.confidence) ? raw.confidence : preEvent.confidence,
    scenarios,
  };
}

function parseBriefMeResponse(text) {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    log.warn("[ai-service] Brief Me JSON parse failed");
    return {
      executiveSummary:       "Analysis unavailable.",
      keyActors:              [],
      timeline:               [],
      strategicImplications:  [],
      watchItems:             [],
    };
  }
}

function buildFallback(preEvent) {
  return buildRuleBasedBriefing(preEvent, []);
}
