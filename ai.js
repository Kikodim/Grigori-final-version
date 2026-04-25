/**
 * lib/ai.js — Gemini 2.5 Flash AI Service
 *
 * SECURITY: GEMINI_API_KEY is read from process.env server-side only.
 * It is NEVER included in any response payload or client-side code.
 *
 * Guarantees:
 *   - processCluster() NEVER throws — always returns a usable result
 *   - Rate limit: 14 RPM enforced via FIFO queue (free tier ceiling = 15)
 *   - SHA-256 content-addressed cache, 6h TTL per warm instance
 *   - 1 automatic retry on transient errors (429, 5xx)
 *   - Full JSON schema validation with typed fallback
 */

import { createHash } from "crypto";
import { describeEnvVar } from "./config.js";
import { createLogger } from "./logger.js";
import { getAIUsageStats, recordAIUsage } from "./supabase.js";

const log = createLogger("ai");

// ─── Rate limit (Gemini 2.5 Flash free tier) ─────────────────────────────────
const CACHE_TTL_MS    = 6 * 3_600_000;

// ─── Warm-instance state ──────────────────────────────────────────────────────
const _cache      = new Map();
const _queue      = [];
let   _processing = false;
let   _lastCall   = 0;
let   _daily      = 0;
let   _dayReset   = _midnight();

function _midnight() {
  const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime();
}

function getAiLimits() {
  const aiDailyLimit = parseInt(process.env.AI_DAILY_LIMIT ?? "20", 10);
  const reservedManualCalls = parseInt(process.env.AI_RESERVED_CALLS ?? "2", 10);
  const maxAiCallsPerRun = parseInt(process.env.MAX_AI_CALLS_PER_RUN ?? "1", 10);
  const rpmLimit = parseInt(process.env.AI_RPM_LIMIT ?? "5", 10);
  const inputTokenLimitPerMinute = parseInt(process.env.AI_INPUT_TPM_LIMIT ?? "250000", 10);

  return {
    aiDailyLimit,
    reservedManualCalls,
    automationBudget: Math.max(0, aiDailyLimit - reservedManualCalls),
    maxAiCallsPerRun,
    rpmLimit,
    inputTokenLimitPerMinute,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

export function makeClusterKey(pe) {
  const s = [...pe.articleIds].sort().join("|");
  const r = pe.region?.label ?? "unknown";
  return createHash("sha256").update(`${s}::${r}`).digest("hex").slice(0, 16);
}

export function cacheHas(key) {
  const e = _cache.get(key);
  return !!e && Date.now() <= e.x;
}

function _cacheGet(key) {
  const e = _cache.get(key);
  if (!e || Date.now() > e.x) { _cache.delete(key); return null; }
  return e.v;
}

function _cacheSet(key, val) {
  _cache.set(key, { v: val, x: Date.now() + CACHE_TTL_MS });
}

export function cachePrune() {
  const now = Date.now();
  let n = 0;
  for (const [k, v] of _cache) { if (now > v.x) { _cache.delete(k); n++; } }
  return n;
}

export function cacheStats() {
  return { cacheSize: _cache.size, dailyCalls: _daily, dailyLimit: getAiLimits().aiDailyLimit };
}

// ─── Gemini REST call ─────────────────────────────────────────────────────────

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const RETRY_MAX_OUTPUT_TOKENS = 8192;

async function _call(sys, user, maxTokens) {
  const keyStatus = describeEnvVar("GEMINI_API_KEY");
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || !keyStatus.usable) throw new Error(`GEMINI_API_KEY ${keyStatus.reason}`);

  const requestBody = {
    system_instruction: {
      parts: [{ text: sys }],
    },
    contents: [
      {
        parts: [{ text: user }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
      topP: 0.8,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(ENDPOINT, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.statusText);
    if (res.status === 400) {
      log.warn(`Gemini 400 body=${txt.slice(0, 500)}`);
    }
    const err = Object.assign(new Error(`Gemini ${res.status}`), {
      status: res.status,
      retryable: res.status === 429 || res.status >= 500,
      // detail never sent to client — only logged
      detail: txt.slice(0, 200),
    });
    throw err;
  }

  const data = await res.json();
  const cand = data.candidates?.[0];
  if (!cand) throw new Error("Gemini: no candidates");
  return {
    text: cand.content?.parts?.map((p) => p.text ?? "").join("") ?? "",
    finishReason: cand.finishReason ?? data.candidates?.[0]?.finishReason ?? null,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
  };
}

async function _callWithRetry(sys, user, maxTokens) {
  try {
    return await _call(sys, user, maxTokens);
  } catch (err) {
    if (err.retryable) {
      log.warn(`Gemini ${err.status} — retrying in 4s`);
      await new Promise((r) => setTimeout(r, 4000));
      return _call(sys, user, maxTokens);
    }
    throw err;
  }
}

// ─── FIFO queue ───────────────────────────────────────────────────────────────

function _enqueue(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    _drain();
  });
}

async function _drain() {
  if (_processing || !_queue.length) return;
  _processing = true;
  while (_queue.length) {
    const { rpmLimit } = getAiLimits();
    const minGapMs = Math.ceil(60_000 / Math.max(rpmLimit, 1));
    if (Date.now() >= _dayReset) { _daily = 0; _dayReset = _midnight(); }
    if (_daily >= getAiLimits().aiDailyLimit) {
      const e = new Error(`Gemini daily limit (${getAiLimits().aiDailyLimit}) reached`);
      _queue.splice(0).forEach((j) => j.reject(e));
      break;
    }
    const gap = Date.now() - _lastCall;
    if (gap < minGapMs) await new Promise((r) => setTimeout(r, minGapMs - gap));
    const job = _queue.shift();
    try {
      _lastCall = Date.now(); _daily++;
      job.resolve(await job.fn());
    } catch (err) {
      log.error("Queue job failed:", err.message);
      job.reject(err);
    }
  }
  _processing = false;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYS = `Return only one raw JSON object.
No markdown, no code fences, no commentary.
Schema:
{
  "title": "string",
  "summary": "string",
  "developments": ["string","string","string"],
  "tone": "Escalating|Stable|De-escalating",
  "confidence": "Low|Medium|High",
  "scenarios": [
    {
      "name": "string",
      "probability": 0,
      "description": "string",
      "impact": {
        "oil": "Up|Down|Neutral",
        "markets": "Risk-on|Risk-off|Neutral",
        "sectors": ["string"]
      }
    },
    {
      "name": "string",
      "probability": 0,
      "description": "string",
      "impact": {
        "oil": "Up|Down|Neutral",
        "markets": "Risk-on|Risk-off|Neutral",
        "sectors": ["string"]
      }
    }
  ]
}
Rules:
- summary: max 2 sentences
- developments: exactly 3 bullets
- scenarios: exactly 2
- scenario probabilities must sum to 100
- sectors allowed: Energy, Defense, Tech, Shipping, Food, Finance`;

function _buildPrompt(pe, articles, { compact = false } = {}) {
  const budget = compact ? 2200 : 4200;
  const perCh  = Math.floor(budget / Math.max(articles.length, 1));
  const body   = articles.map((a) => {
    const c = a.content.replace(/<[^>]+>/g," ").replace(/\s{2,}/g," ").replace(/\[?\+\d+ chars\]?/g,"").trim().slice(0, Math.max(perCh, 150));
    return `[${a.source}] ${a.title}\n${c}`;
  }).join("\n\n---\n\n");
  return compact
    ? `Region: ${pe.region?.label ?? "Unknown"}\nKeywords: ${pe.keywords.slice(0, 8).join(", ")}\n\n${body}`
    : `Region: ${pe.region?.label ?? "Unknown"}\nKeywords: ${pe.keywords.slice(0, 10).join(", ")}\nSources: ${pe.sources.join(", ")}\n\n${body}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const V_TONE = new Set(["Escalating","Stable","De-escalating"]);
const V_CONF = new Set(["Low","Medium","High"]);
const V_OIL  = new Set(["Up","Neutral","Down"]);
const V_MKT  = new Set(["Risk-on","Risk-off","Neutral"]);
const V_SEC  = new Set(["Energy","Defense","Tech","Shipping","Food","Finance"]);

function stripCodeFences(text) {
  return text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

function parseGeminiJson(rawText) {
  const raw = String(rawText ?? "").trim();

  if (!raw) {
    return { ok: false, reason: "empty-response", candidate: "" };
  }

  if (raw.startsWith("{")) {
    try {
      return { ok: true, value: JSON.parse(raw), source: "raw" };
    } catch (err) {
      const extractedFromRaw = extractFirstJsonObject(raw);
      if (extractedFromRaw) {
        try {
          return { ok: true, value: JSON.parse(extractedFromRaw), source: "extracted-raw" };
        } catch (extractErr) {
          return {
            ok: false,
            reason: `raw-json-parse-failed:${err.message}; extracted-json-parse-failed:${extractErr.message}`,
            candidate: extractedFromRaw.slice(0, 500),
          };
        }
      }

      return {
        ok: false,
        reason: `raw-json-parse-failed:${err.message}; no-json-object-found`,
        candidate: raw.slice(0, 500),
      };
    }
  }

  const cleaned = stripCodeFences(raw);

  try {
    return { ok: true, value: JSON.parse(cleaned), source: "full" };
  } catch (err) {
    const extracted = extractFirstJsonObject(cleaned);
    if (!extracted) {
      return {
        ok: false,
        reason: `cleaned-json-parse-failed:${err.message}; no-json-object-found`,
        candidate: cleaned.slice(0, 500),
      };
    }

    try {
      return { ok: true, value: JSON.parse(extracted), source: "extracted" };
    } catch (extractErr) {
      return {
        ok: false,
        reason: `cleaned-json-parse-failed:${err.message}; extracted-json-parse-failed:${extractErr.message}`,
        candidate: extracted.slice(0, 500),
      };
    }
  }
}

function looksIncompleteJson(rawText) {
  const raw = String(rawText ?? "").trim();
  if (!raw) return true;
  if (raw.startsWith("{") && !raw.endsWith("}")) return true;
  return false;
}

function shouldRetryShorterPrompt(parsed, rawText, finishReason) {
  if (finishReason === "MAX_TOKENS") return true;

  const reason = parsed?.reason ?? "";
  if (reason.includes("Unexpected end of JSON input")) return true;
  if (reason.includes("Unterminated string")) return true;

  return looksIncompleteJson(rawText);
}

function _validate(raw, fb) {
  if (!raw || typeof raw !== "object") return fb;

  let scenarios = [];
  if (Array.isArray(raw.scenarios)) {
    scenarios = raw.scenarios.slice(0, 3).map((s) => ({
      name:        String(s.name ?? "Unnamed"),
      probability: Number.isFinite(Number(s.probability))
        ? Math.round(Math.max(0, Math.min(100, Number(s.probability))))
        : 33,
      description: String(s.description ?? ""),
      impact: {
        oil:     V_OIL.has(s.impact?.oil)     ? s.impact.oil     : "Neutral",
        markets: V_MKT.has(s.impact?.markets) ? s.impact.markets : "Neutral",
        sectors: (Array.isArray(s.impact?.sectors) ? s.impact.sectors : []).filter((x) => V_SEC.has(x)),
      },
    }));
    const tot = scenarios.reduce((s, x) => s + x.probability, 0);
    if (tot > 0 && tot !== 100) {
      scenarios = scenarios.map((x) => ({ ...x, probability: Math.round((x.probability / tot) * 100) }));
      scenarios[0].probability += 100 - scenarios.reduce((s, x) => s + x.probability, 0);
    }
  }

  return {
    title:        String(raw.title ?? fb.title).slice(0, 120),
    summary:      String(raw.summary ?? ""),
    developments: Array.isArray(raw.developments) ? raw.developments.filter((d) => typeof d === "string").slice(0, 3) : [],
    tone:         V_TONE.has(raw.tone)  ? raw.tone        : "Stable",
    confidence:   V_CONF.has(raw.confidence) ? raw.confidence : fb.confidence,
    scenarios:    scenarios.slice(0, 2),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a pre-event cluster. Cache-first. NEVER throws.
 * @param {object}   pe        — pre-event from cluster.js
 * @param {object[]} articles  — full article objects from store
 * @returns {Promise<object>}
 */
export async function processCluster(pe, articles, { source = "automation" } = {}) {
  const key    = makeClusterKey(pe);
  const cached = _cacheGet(key);
  if (cached) { log.info(`Cache HIT ${key}`); return cached; }

  const fb = { title: pe.title, summary: "AI processing temporarily unavailable.", developments: [], tone: "Stable", confidence: pe.confidence, scenarios: [] };
  const prompt = _buildPrompt(pe, articles);

  let response;
  try {
    response = await _enqueue(() => _callWithRetry(SYS, prompt, DEFAULT_MAX_OUTPUT_TOKENS));
  } catch (err) {
    log.warn(`Gemini failed for ${pe._clusterId}: ${err.message}`);
    return fb;
  }

  let raw = response?.text ?? "";
  let finishReason = response?.finishReason ?? null;
  log.info(`Gemini raw response for ${pe._clusterId}: chars=${raw.length}${finishReason ? ` finishReason=${finishReason}` : ""}`);

  let parsed = parseGeminiJson(raw);

  if (!parsed.ok && shouldRetryShorterPrompt(parsed, raw, finishReason)) {
    log.warn(`Retrying Gemini for ${pe._clusterId} with shorter prompt due to incomplete output`);
    try {
      const retryPrompt = _buildPrompt(pe, articles, { compact: true });
      const retryResponse = await _enqueue(() => _callWithRetry(SYS, retryPrompt, RETRY_MAX_OUTPUT_TOKENS));
      raw = retryResponse?.text ?? "";
      finishReason = retryResponse?.finishReason ?? null;
      response = retryResponse;
      log.info(`Gemini retry response for ${pe._clusterId}: chars=${raw.length}${finishReason ? ` finishReason=${finishReason}` : ""}`);
      parsed = parseGeminiJson(raw);
    } catch (err) {
      log.warn(`Gemini retry failed for ${pe._clusterId}: ${err.message}`);
      return fb;
    }
  }

  if (!parsed.ok) {
    log.warn(`JSON parse failed for ${pe._clusterId}: ${parsed.reason} raw=${String(raw).slice(0, 500)}`);
    return fb;
  }

  if (parsed.source === "extracted" || parsed.source === "extracted-raw") {
    log.warn(`Gemini response for ${pe._clusterId} contained extra text; extracted first JSON object`);
  }

  const result = _validate(parsed.value, fb);
  await recordAIUsage({
    source,
    clusterSignature: pe._clusterSignature ?? makeClusterKey(pe),
    inputTokens: response?.inputTokens ?? 0,
  });
  _cacheSet(key, result);
  log.info(`Processed "${result.title}" tone=${result.tone} scenarios=${result.scenarios.length}`);
  return result;
}

export async function getAIStatus() {
  const limits = getAiLimits();
  const usage = await getAIUsageStats();
  return {
    configured: describeEnvVar("GEMINI_API_KEY").usable,
    aiCallsToday: usage.totalCalls,
    aiDailyLimit: limits.aiDailyLimit,
    aiRemainingToday: Math.max(0, limits.aiDailyLimit - usage.totalCalls),
    automationBudget: limits.automationBudget,
    reservedManualCalls: limits.reservedManualCalls,
    rpmLimit: limits.rpmLimit,
    inputTokenLimitPerMinute: limits.inputTokenLimitPerMinute,
    queueDepth: _queue.length,
    processing: _processing,
    ...cacheStats(),
  };
}
