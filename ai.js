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
import { sanitizeBulletList, sanitizeEventNarrative, sanitizeNarrativeText, BRIEF_LIMITS } from "./event-insights.js";
import { createLogger } from "./logger.js";
import { getCachedMarketContextSummary } from "./market-data.js";
import { buildRuleBasedBriefing } from "./rule-based-briefing.js";
import { getAIUsageStats, getRefreshState, recordAIUsage } from "./supabase.js";

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
  const configuredAutomationBudget = parseInt(process.env.AI_AUTOMATION_BUDGET ?? "", 10);
  const maxAiCallsPerRun = parseInt(process.env.MAX_AI_CALLS_PER_RUN ?? "1", 10);
  const rpmLimit = parseInt(process.env.AI_RPM_LIMIT ?? "5", 10);
  const inputTokenLimitPerMinute = parseInt(process.env.AI_INPUT_TPM_LIMIT ?? "250000", 10);
  const automationBudget = Number.isFinite(configuredAutomationBudget)
    ? Math.max(0, Math.min(aiDailyLimit, configuredAutomationBudget))
    : Math.max(0, aiDailyLimit - reservedManualCalls);

  return {
    aiDailyLimit,
    reservedManualCalls,
    automationBudget,
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
const REPORT_MODEL = "gemini-2.5-flash";

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

const SYS = `You are writing for a strategic risk and OSINT dashboard.
You are not predicting the future. You are producing a structured intelligence assessment from limited open-source signals. Be useful, cautious, and explicit about uncertainty.
Use only the supplied article and event data. Do not invent facts. If evidence is weak, say so.
Return structured JSON only. No markdown. No code fences. No commentary.
No direct investment advice. Market impact is directional risk context, not trading advice.
Do not copy or quote long passages from source articles.
Do not output raw article sections or scraped feed fragments.
Do not include source IDs, article IDs, UUIDs, or labels like "SECTIONS" in any user-facing field.
Do not prefix developments with source names or domains.
Developments must be original concise analytic bullets, not copied article text.
Source links and domains belong only in sourceAssessment or sources fields, never inside analysis sections.
Write like a senior strategic intelligence analyst. The goal is paid intelligence briefing quality, not scraped article reproduction.
Scenario probabilities are analytic estimates, not statistical certainties, and must sum to 100.
Allowed tone values: Stable, Escalating, Deteriorating, Volatile, De-escalating.
Allowed confidence values: Low, Medium, High.
Required schema:
{
  "title": "string",
  "summary": "string",
  "assessment": "string",
  "developments": ["string", "string", "string"],
  "whyThisMatters": ["string", "string"],
  "watchIndicators": ["string", "string", "string", "string"],
  "scenarios": [
    {
      "name": "De-escalation / containment",
      "probability": 0,
      "description": "string",
      "triggers": ["string"],
      "impact": {
        "oil": "Up|Down|Neutral",
        "markets": "Risk-on|Risk-off|Neutral",
        "sectors": ["Energy","Defense","Tech","Shipping","Food","Finance","Trade","Semiconductors"],
        "tradeRoutes": "Open|Stressed|Disrupted|Neutral",
        "regionalStability": "Improving|Fragile|Deteriorating|Contained"
      }
    },
    {
      "name": "Base case / continuation",
      "probability": 0,
      "description": "string",
      "triggers": ["string"],
      "impact": {
        "oil": "Up|Down|Neutral",
        "markets": "Risk-on|Risk-off|Neutral",
        "sectors": ["Energy","Defense","Tech","Shipping","Food","Finance","Trade","Semiconductors"],
        "tradeRoutes": "Open|Stressed|Disrupted|Neutral",
        "regionalStability": "Improving|Fragile|Deteriorating|Contained"
      }
    },
    {
      "name": "Escalation / disruption",
      "probability": 0,
      "description": "string",
      "triggers": ["string"],
      "impact": {
        "oil": "Up|Down|Neutral",
        "markets": "Risk-on|Risk-off|Neutral",
        "sectors": ["Energy","Defense","Tech","Shipping","Food","Finance","Trade","Semiconductors"],
        "tradeRoutes": "Open|Stressed|Disrupted|Neutral",
        "regionalStability": "Improving|Fragile|Deteriorating|Contained"
      }
    }
  ],
  "tone": "Stable|Escalating|Deteriorating|Volatile|De-escalating",
  "confidence": "Low|Medium|High",
  "confidenceRationale": "string",
  "location": {
    "label": "string",
    "lat": 0,
    "lng": 0,
    "confidence": "Low|Medium|High",
    "reason": "string"
  },
  "marketImpact": {
    "oil": "Up|Down|Neutral",
    "shipping": "Stressed|Watch|Neutral|Supported",
    "defense": "Supported|Watch|Neutral",
    "tech": "Sensitive|Watch|Neutral",
    "equities": "Risk-on|Risk-off|Neutral",
    "summary": "string"
  },
  "sourceAssessment": {
    "sourceCount": 0,
    "corroborationLevel": "High corroboration|Mixed corroboration|Limited corroboration",
    "limitations": "string"
  }
}`;

function _buildPrompt(pe, articles, marketContextSummary, { compact = false } = {}) {
  const budget = compact ? 2200 : 4200;
  const perCh  = Math.floor(budget / Math.max(articles.length, 1));
  const body   = articles.map((a) => {
    const c = a.content.replace(/<[^>]+>/g," ").replace(/\s{2,}/g," ").replace(/\[?\+\d+ chars\]?/g,"").trim().slice(0, Math.max(perCh, 150));
    return `[${a.source}] ${a.title}\n${c}`;
  }).join("\n\n---\n\n");
  const marketLine = marketContextSummary ? `Cached market context: ${marketContextSummary}\n` : "";
  return compact
    ? `Region: ${pe.region?.label ?? "Unknown"}\nKeywords: ${pe.keywords.slice(0, 8).join(", ")}\n${marketLine}\n${body}`
    : `Region: ${pe.region?.label ?? "Unknown"}\nKeywords: ${pe.keywords.slice(0, 10).join(", ")}\nSources: ${pe.sources.join(", ")}\n${marketLine}\n${body}`;
}

const REPORT_LIMITS = {
  title: 160,
  executiveSummary: 900,
  keyJudgment: 280,
  currentSituation: 2500,
  whatChanged: 240,
  trendAnalysis: 1800,
  scenarioSummary: 900,
  scenarioTrigger: 180,
  marketImpactSummary: 1200,
  watchIndicator: 220,
  confidenceRationale: 500,
  sourceLimitations: 320,
  monitoringAction: 220,
  sectorImpact: 220,
  sourceTitle: 180,
};

const REPORT_SYS = `You are generating a premium strategic intelligence report for Grigori by oryth.io.
Use only the provided Grigori event data. Do not invent facts. Do not reproduce full article text.
Do not include raw URLs inside narrative sections. Source domains, titles, and URLs belong only in the sources field.
Do not copy or quote long passages from source articles. Do not include source IDs, UUIDs, scrape residue, or labels like SECTIONS.
Be explicit about uncertainty and source limitations. Scenario probabilities are analytic estimates, not statistical facts, and must sum to 100.
Market context is not financial advice. Output structured JSON only. No markdown. No code fences. No generic filler.
Write like a senior geopolitical risk analyst producing a paid strategic intelligence briefing.
Required schema:
{
  "title": "string",
  "generatedAt": "ISO string",
  "region": "string",
  "focusArea": "string",
  "timeHorizon": "string",
  "audienceType": "string",
  "riskFraming": "string",
  "executiveSummary": "string",
  "keyJudgments": ["string", "string", "string"],
  "currentSituation": "string",
  "whatChanged": ["string", "string", "string"],
  "trendAnalysis": "string",
  "scenarioMatrix": [
    {
      "name": "Containment / de-escalation",
      "probability": 0,
      "summary": "string",
      "triggers": ["string"],
      "implications": "string",
      "affectedSectors": ["string"]
    },
    {
      "name": "Base case / continued pressure",
      "probability": 0,
      "summary": "string",
      "triggers": ["string"],
      "implications": "string",
      "affectedSectors": ["string"]
    },
    {
      "name": "Escalation / disruption",
      "probability": 0,
      "summary": "string",
      "triggers": ["string"],
      "implications": "string",
      "affectedSectors": ["string"]
    }
  ],
  "marketImpact": {
    "oil": "string",
    "shipping": "string",
    "equities": "string",
    "defense": "string",
    "tech": "string",
    "summary": "string"
  },
  "sectorImpact": ["string"],
  "watchIndicators": ["string"],
  "confidenceAssessment": {
    "level": "Low|Medium|High",
    "rationale": "string",
    "increaseConfidence": ["string"],
    "reduceConfidence": ["string"]
  },
  "sourceAssessment": {
    "sourceCount": 0,
    "sourceDiversity": "string",
    "corroborationLevel": "string",
    "limitations": "string"
  },
  "limitations": ["string"],
  "recommendedMonitoringActions": ["string"],
  "sources": [{"domain": "string", "title": "string", "url": "string"}]
}`;

function buildReportPrompt(request, events, { compact = false } = {}) {
  const eventPayload = events.map((event) => ({
    id: event.id,
    title: event.title,
    summary: event.summary,
    assessment: event.assessment,
    location: event.location?.label ?? "Region under review",
    category: event.category ?? "Political",
    tone: event.tone,
    confidence: event.confidence,
    impactScore: event.impactScore ?? event.importanceScore ?? 0,
    severityScore: event.severityScore ?? 0,
    confidenceScore: event.confidenceScore ?? 0,
    recentTrend: event.recentTrend ?? "Insufficient data",
    freshnessStatus: event.freshnessStatus ?? "Unknown",
    createdAt: event.createdAt ?? event.created_at ?? event.timestamp ?? null,
    updatedAt: event.updatedAt ?? event.updated_at ?? event.timestamp ?? null,
    aiStatus: event.aiStatus ?? event.ai_status ?? "rule_based",
    marketImpact: event.marketImpact ?? {},
    sourceAssessment: event.sourceAssessment ?? {},
    sourceDomains: event.sourceDomains ?? [],
    sourceCount: event.sourceCount ?? 0,
  }));

  const requestBlock = {
    region: request.region,
    focusArea: request.focusArea,
    timeHorizon: request.timeHorizon,
    audienceType: request.audienceType,
    riskFraming: request.riskFraming,
    customQuestion: request.customQuestion ?? "",
    compact,
  };

  return [
    "Create a structured intelligence report from the following request and event set.",
    "Keep narrative detailed but disciplined. No source dumps. No raw URLs in analysis sections.",
    `REQUEST=${JSON.stringify(requestBlock)}`,
    `EVENTS=${JSON.stringify(eventPayload)}`,
  ].join("\n\n");
}

function buildReportRepairPrompt(request, events) {
  return `${buildReportPrompt(request, events, { compact: true })}

Your first attempt included raw-looking or overlong sections. Repair it.
Keep developments-style lists concise. No copied source wording. No UUIDs. No SECTIONS labels.`;
}

function normalizeScenarioProbabilities(items) {
  const total = items.reduce((sum, item) => sum + item.probability, 0);
  if (total === 100) return items;
  if (total <= 0) {
    return [
      { ...items[0], probability: 25 },
      { ...items[1], probability: 50 },
      { ...items[2], probability: 25 },
    ];
  }
  const normalized = items.map((item) => ({
    ...item,
    probability: Math.round((item.probability / total) * 100 / 5) * 5,
  }));
  const delta = 100 - normalized.reduce((sum, item) => sum + item.probability, 0);
  normalized[1].probability += delta;
  return normalized;
}

function sanitizeSourceList(items, fallback = []) {
  const cleaned = [];
  for (const item of Array.isArray(items) ? items : []) {
    const domain = sanitizeNarrativeText(item?.domain ?? "", {
      maxLen: 80,
      maxSentences: 1,
      fallback: "",
    });
    const title = sanitizeNarrativeText(item?.title ?? "", {
      maxLen: REPORT_LIMITS.sourceTitle,
      maxSentences: 2,
      fallback: "",
    });
    const url = typeof item?.url === "string" && /^https?:\/\//i.test(item.url.trim()) ? item.url.trim() : "";
    if (!domain && !url) continue;
    cleaned.push({ domain: domain || url, title, url });
    if (cleaned.length >= 16) break;
  }
  return cleaned.length > 0 ? cleaned : fallback.slice(0, 16);
}

function sanitizeReportDocument(raw, fallback) {
  const confidenceLevel = ["Low", "Medium", "High"].includes(raw?.confidenceAssessment?.level)
    ? raw.confidenceAssessment.level
    : (fallback.confidenceAssessment?.level ?? "Medium");

  const scenarios = normalizeScenarioProbabilities(
    (Array.isArray(raw?.scenarioMatrix) ? raw.scenarioMatrix : fallback.scenarioMatrix).slice(0, 3).map((scenario, index) => {
      const fallbackScenario = fallback.scenarioMatrix[index] ?? {};
      return {
        name: sanitizeNarrativeText(
          scenario?.name ?? fallbackScenario.name ?? ["Containment / de-escalation", "Base case / continued pressure", "Escalation / disruption"][index],
          { maxLen: 80, maxSentences: 1, fallback: ["Containment / de-escalation", "Base case / continued pressure", "Escalation / disruption"][index] }
        ),
        probability: Number.isFinite(Number(scenario?.probability))
          ? Math.round(Math.max(0, Math.min(100, Number(scenario.probability))) / 5) * 5
          : Number(fallbackScenario.probability ?? (index === 1 ? 50 : 25)),
        summary: sanitizeNarrativeText(scenario?.summary ?? fallbackScenario.summary ?? "", {
          maxLen: REPORT_LIMITS.scenarioSummary,
          maxSentences: 6,
          fallback: fallbackScenario.summary ?? "Monitoring for directional shifts in the operating picture.",
        }),
        triggers: sanitizeBulletList(scenario?.triggers, {
          maxItems: 4,
          maxLen: REPORT_LIMITS.scenarioTrigger,
          maxSentences: 1,
          fallback: Array.isArray(fallbackScenario.triggers) ? fallbackScenario.triggers : [],
        }),
        implications: sanitizeNarrativeText(scenario?.implications ?? fallbackScenario.implications ?? "", {
          maxLen: REPORT_LIMITS.scenarioSummary,
          maxSentences: 4,
          fallback: fallbackScenario.implications ?? "Implications remain tied to the direction of escalation, market sensitivity, and source corroboration.",
        }),
        affectedSectors: sanitizeBulletList(scenario?.affectedSectors, {
          maxItems: 6,
          maxLen: 40,
          maxSentences: 1,
          fallback: Array.isArray(fallbackScenario.affectedSectors) ? fallbackScenario.affectedSectors : [],
        }),
      };
    })
  );

  const cleaned = {
    title: sanitizeNarrativeText(raw?.title ?? fallback.title, {
      maxLen: REPORT_LIMITS.title,
      maxSentences: 1,
      fallback: fallback.title,
    }),
    generatedAt: raw?.generatedAt ?? fallback.generatedAt ?? new Date().toISOString(),
    region: sanitizeNarrativeText(raw?.region ?? fallback.region, { maxLen: 80, maxSentences: 1, fallback: fallback.region }),
    focusArea: sanitizeNarrativeText(raw?.focusArea ?? fallback.focusArea, { maxLen: 80, maxSentences: 1, fallback: fallback.focusArea }),
    timeHorizon: sanitizeNarrativeText(raw?.timeHorizon ?? fallback.timeHorizon, { maxLen: 40, maxSentences: 1, fallback: fallback.timeHorizon }),
    audienceType: sanitizeNarrativeText(raw?.audienceType ?? fallback.audienceType, { maxLen: 40, maxSentences: 1, fallback: fallback.audienceType }),
    riskFraming: sanitizeNarrativeText(raw?.riskFraming ?? fallback.riskFraming, { maxLen: 40, maxSentences: 1, fallback: fallback.riskFraming }),
    executiveSummary: sanitizeNarrativeText(raw?.executiveSummary ?? fallback.executiveSummary, {
      maxLen: REPORT_LIMITS.executiveSummary,
      maxSentences: 6,
      fallback: fallback.executiveSummary,
    }),
    keyJudgments: sanitizeBulletList(raw?.keyJudgments, {
      maxItems: 5,
      maxLen: REPORT_LIMITS.keyJudgment,
      maxSentences: 2,
      fallback: fallback.keyJudgments,
    }),
    currentSituation: sanitizeNarrativeText(raw?.currentSituation ?? fallback.currentSituation, {
      maxLen: REPORT_LIMITS.currentSituation,
      maxSentences: 12,
      fallback: fallback.currentSituation,
    }),
    whatChanged: sanitizeBulletList(raw?.whatChanged, {
      maxItems: 6,
      maxLen: REPORT_LIMITS.whatChanged,
      maxSentences: 2,
      fallback: fallback.whatChanged,
    }),
    trendAnalysis: sanitizeNarrativeText(raw?.trendAnalysis ?? fallback.trendAnalysis, {
      maxLen: REPORT_LIMITS.trendAnalysis,
      maxSentences: 10,
      fallback: fallback.trendAnalysis,
    }),
    scenarioMatrix: scenarios,
    marketImpact: {
      oil: sanitizeNarrativeText(raw?.marketImpact?.oil ?? fallback.marketImpact?.oil ?? "", { maxLen: 120, maxSentences: 2, fallback: fallback.marketImpact?.oil ?? "" }),
      shipping: sanitizeNarrativeText(raw?.marketImpact?.shipping ?? fallback.marketImpact?.shipping ?? "", { maxLen: 120, maxSentences: 2, fallback: fallback.marketImpact?.shipping ?? "" }),
      equities: sanitizeNarrativeText(raw?.marketImpact?.equities ?? fallback.marketImpact?.equities ?? "", { maxLen: 120, maxSentences: 2, fallback: fallback.marketImpact?.equities ?? "" }),
      defense: sanitizeNarrativeText(raw?.marketImpact?.defense ?? fallback.marketImpact?.defense ?? "", { maxLen: 120, maxSentences: 2, fallback: fallback.marketImpact?.defense ?? "" }),
      tech: sanitizeNarrativeText(raw?.marketImpact?.tech ?? fallback.marketImpact?.tech ?? "", { maxLen: 120, maxSentences: 2, fallback: fallback.marketImpact?.tech ?? "" }),
      summary: sanitizeNarrativeText(raw?.marketImpact?.summary ?? fallback.marketImpact?.summary ?? "", {
        maxLen: REPORT_LIMITS.marketImpactSummary,
        maxSentences: 8,
        fallback: fallback.marketImpact?.summary ?? "",
      }),
    },
    sectorImpact: sanitizeBulletList(raw?.sectorImpact, {
      maxItems: 6,
      maxLen: REPORT_LIMITS.sectorImpact,
      maxSentences: 2,
      fallback: fallback.sectorImpact,
    }),
    watchIndicators: sanitizeBulletList(raw?.watchIndicators, {
      maxItems: 10,
      maxLen: REPORT_LIMITS.watchIndicator,
      maxSentences: 2,
      fallback: fallback.watchIndicators,
    }),
    confidenceAssessment: {
      level: confidenceLevel,
      rationale: sanitizeNarrativeText(raw?.confidenceAssessment?.rationale ?? fallback.confidenceAssessment?.rationale ?? "", {
        maxLen: REPORT_LIMITS.confidenceRationale,
        maxSentences: 4,
        fallback: fallback.confidenceAssessment?.rationale ?? "",
      }),
      increaseConfidence: sanitizeBulletList(raw?.confidenceAssessment?.increaseConfidence, {
        maxItems: 4,
        maxLen: 180,
        maxSentences: 1,
        fallback: fallback.confidenceAssessment?.increaseConfidence ?? [],
      }),
      reduceConfidence: sanitizeBulletList(raw?.confidenceAssessment?.reduceConfidence, {
        maxItems: 4,
        maxLen: 180,
        maxSentences: 1,
        fallback: fallback.confidenceAssessment?.reduceConfidence ?? [],
      }),
    },
    sourceAssessment: {
      sourceCount: Number.isFinite(Number(raw?.sourceAssessment?.sourceCount))
        ? Number(raw.sourceAssessment.sourceCount)
        : Number(fallback.sourceAssessment?.sourceCount ?? 0),
      sourceDiversity: sanitizeNarrativeText(raw?.sourceAssessment?.sourceDiversity ?? fallback.sourceAssessment?.sourceDiversity ?? "", {
        maxLen: 180,
        maxSentences: 2,
        fallback: fallback.sourceAssessment?.sourceDiversity ?? "",
      }),
      corroborationLevel: sanitizeNarrativeText(raw?.sourceAssessment?.corroborationLevel ?? fallback.sourceAssessment?.corroborationLevel ?? "", {
        maxLen: 120,
        maxSentences: 1,
        fallback: fallback.sourceAssessment?.corroborationLevel ?? "",
      }),
      limitations: sanitizeNarrativeText(raw?.sourceAssessment?.limitations ?? fallback.sourceAssessment?.limitations ?? "", {
        maxLen: REPORT_LIMITS.sourceLimitations,
        maxSentences: 3,
        fallback: fallback.sourceAssessment?.limitations ?? "",
      }),
    },
    limitations: sanitizeBulletList(raw?.limitations, {
      maxItems: 5,
      maxLen: 220,
      maxSentences: 2,
      fallback: fallback.limitations,
    }),
    recommendedMonitoringActions: sanitizeBulletList(raw?.recommendedMonitoringActions, {
      maxItems: 6,
      maxLen: REPORT_LIMITS.monitoringAction,
      maxSentences: 2,
      fallback: fallback.recommendedMonitoringActions,
    }),
    sources: sanitizeSourceList(raw?.sources, fallback.sources ?? []),
  };

  const requiresFallback =
    cleaned.keyJudgments.length < 3 ||
    cleaned.whatChanged.length < 3 ||
    cleaned.watchIndicators.length < 4 ||
    cleaned.sources.length < 1 ||
    cleaned.scenarioMatrix.length !== 3 ||
    normalizeScenarioProbabilities(cleaned.scenarioMatrix).reduce((sum, scenario) => sum + scenario.probability, 0) !== 100;

  return { cleaned, requiresFallback };
}

export async function generateStrategicReportWithGemini({ request, events, fallbackReport }) {
  const geminiConfigured = describeEnvVar("GEMINI_API_KEY").usable;
  if (!geminiConfigured) {
    return { ok: false, reason: "gemini_not_configured" };
  }

  let response;
  try {
    response = await _enqueue(() => _callWithRetry(REPORT_SYS, buildReportPrompt(request, events), RETRY_MAX_OUTPUT_TOKENS));
  } catch (err) {
    log.warn(`Gemini report generation failed: ${err.message}`);
    return { ok: false, reason: "provider_error", detail: err.message };
  }

  let raw = response?.text ?? "";
  let parsed = parseGeminiJson(raw);

  if (!parsed.ok || looksIncompleteJson(raw)) {
    try {
      const retryResponse = await _enqueue(() => _callWithRetry(REPORT_SYS, buildReportRepairPrompt(request, events), RETRY_MAX_OUTPUT_TOKENS));
      response = retryResponse;
      raw = retryResponse?.text ?? "";
      parsed = parseGeminiJson(raw);
    } catch (err) {
      log.warn(`Gemini report retry failed: ${err.message}`);
      return { ok: false, reason: "provider_error", detail: err.message };
    }
  }

  if (!parsed.ok) {
    return { ok: false, reason: "provider_error", detail: parsed.reason };
  }

  const sanitized = sanitizeReportDocument(parsed.value, fallbackReport);
  if (sanitized.requiresFallback) {
    return { ok: false, reason: "sanitizer_rejected_output", detail: "report_sanitizer_rejected_output" };
  }

  await recordAIUsage({
    source: "reports",
    clusterSignature: `report:${request.region}:${request.focusArea}:${request.timeHorizon}`,
    inputTokens: response?.inputTokens ?? 0,
  });

  return {
    ok: true,
    report: sanitized.cleaned,
    aiModel: REPORT_MODEL,
  };
}

function _buildRepairPrompt(pe, articles, marketContextSummary) {
  return `${_buildPrompt(pe, articles, marketContextSummary, { compact: true })}

Rewrite from scratch.
Keep title specific and under ${BRIEF_LIMITS.title} characters.
Keep summary under ${BRIEF_LIMITS.summary} characters.
Keep assessment under ${BRIEF_LIMITS.assessment} characters.
Developments must be 3 to 5 concise bullets, each under ${BRIEF_LIMITS.development} characters, no more than 2 sentences, with no source prefixes, UUIDs, article IDs, "SECTIONS", or copied body text.
WhyThisMatters bullets must be under ${BRIEF_LIMITS.whyThisMatters} characters.
WatchIndicators bullets must be under ${BRIEF_LIMITS.watchIndicator} characters.
Scenario descriptions must be under ${BRIEF_LIMITS.scenarioDescription} characters.
ConfidenceRationale must be under ${BRIEF_LIMITS.confidenceRationale} characters.
Do not reproduce source passages.`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const V_TONE = new Set(["Stable","Escalating","Deteriorating","Volatile","De-escalating"]);
const V_CONF = new Set(["Low","Medium","High"]);
const V_OIL  = new Set(["Up","Neutral","Down"]);
const V_MKT  = new Set(["Risk-on","Risk-off","Neutral"]);
const V_SEC  = new Set(["Energy","Defense","Tech","Shipping","Food","Finance","Trade","Semiconductors"]);
const V_CORROBORATION = new Set(["High corroboration", "Mixed corroboration", "Limited corroboration"]);

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
      triggers: Array.isArray(s.triggers) ? s.triggers.filter((item) => typeof item === "string").slice(0, 4) : [],
      impact: {
        oil:     V_OIL.has(s.impact?.oil)     ? s.impact.oil     : "Neutral",
        markets: V_MKT.has(s.impact?.markets) ? s.impact.markets : "Neutral",
        sectors: (Array.isArray(s.impact?.sectors) ? s.impact.sectors : []).filter((x) => V_SEC.has(x)),
        tradeRoutes: ["Open", "Stressed", "Disrupted", "Neutral"].includes(s.impact?.tradeRoutes)
          ? s.impact.tradeRoutes
          : "Neutral",
        regionalStability: ["Improving", "Fragile", "Deteriorating", "Contained"].includes(s.impact?.regionalStability)
          ? s.impact.regionalStability
          : "Fragile",
      },
    }));
    const tot = scenarios.reduce((s, x) => s + x.probability, 0);
    if (tot > 0 && tot !== 100) {
      scenarios = scenarios.map((x) => ({ ...x, probability: Math.round((x.probability / tot) * 100) }));
      scenarios[0].probability += 100 - scenarios.reduce((s, x) => s + x.probability, 0);
    }
  }

  return {
    title:        String(raw.title ?? fb.title).slice(0, BRIEF_LIMITS.title),
    summary:      String(raw.summary ?? fb.summary ?? ""),
    assessment:   String(raw.assessment ?? fb.assessment ?? ""),
    developments: Array.isArray(raw.developments) ? raw.developments.filter((d) => typeof d === "string").slice(0, 5) : (fb.developments ?? []),
    tone:         V_TONE.has(raw.tone)  ? raw.tone        : "Stable",
    confidence:   V_CONF.has(raw.confidence) ? raw.confidence : fb.confidence,
    location: {
      ...(fb.location ?? {}),
      label: String(raw.location?.label ?? raw.locationLabel ?? fb.location?.label ?? "Region under review"),
      lat: Number.isFinite(Number(raw.location?.lat ?? raw.locationLat)) ? Number(raw.location?.lat ?? raw.locationLat) : fb.location?.lat ?? null,
      lng: Number.isFinite(Number(raw.location?.lng ?? raw.locationLng)) ? Number(raw.location?.lng ?? raw.locationLng) : fb.location?.lng ?? null,
      confidence: V_CONF.has(raw.location?.confidence ?? raw.locationConfidence) ? (raw.location?.confidence ?? raw.locationConfidence) : fb.location?.confidence ?? "Low",
      reason: String(raw.location?.reason ?? raw.locationReason ?? fb.location?.reason ?? "Location derived from source signals."),
    },
    whyThisMatters: Array.isArray(raw.whyThisMatters)
      ? raw.whyThisMatters.filter((item) => typeof item === "string").slice(0, 4)
      : (Array.isArray(fb.whyThisMatters) ? fb.whyThisMatters : [String(fb.whyThisMatters ?? "")].filter(Boolean)),
    watchIndicators: Array.isArray(raw.watchIndicators)
      ? raw.watchIndicators.filter((item) => typeof item === "string").slice(0, 7)
      : (fb.watchIndicators ?? fb.watchIndicators72h ?? []),
    watchIndicators72h: Array.isArray(raw.watchIndicators)
      ? raw.watchIndicators.filter((item) => typeof item === "string").slice(0, 7)
      : (fb.watchIndicators ?? fb.watchIndicators72h ?? []),
    confidenceRationale: String(raw.confidenceRationale ?? fb.confidenceRationale ?? ""),
    marketImpact: {
      oil: V_OIL.has(raw.marketImpact?.oil) ? raw.marketImpact.oil : (fb.marketImpact?.oil ?? "Neutral"),
      shipping: ["Stressed", "Watch", "Neutral", "Supported"].includes(raw.marketImpact?.shipping) ? raw.marketImpact.shipping : (fb.marketImpact?.shipping ?? "Neutral"),
      defense: ["Supported", "Watch", "Neutral"].includes(raw.marketImpact?.defense) ? raw.marketImpact.defense : (fb.marketImpact?.defense ?? "Neutral"),
      tech: ["Sensitive", "Watch", "Neutral"].includes(raw.marketImpact?.tech) ? raw.marketImpact.tech : (fb.marketImpact?.tech ?? "Neutral"),
      equities: V_MKT.has(raw.marketImpact?.equities) ? raw.marketImpact.equities : (fb.marketImpact?.equities ?? "Neutral"),
      summary: String(raw.marketImpact?.summary ?? fb.marketImpact?.summary ?? ""),
    },
    sourceAssessment: {
      sourceCount: Number.isFinite(Number(raw.sourceAssessment?.sourceCount)) ? Number(raw.sourceAssessment.sourceCount) : (fb.sourceAssessment?.sourceCount ?? 0),
      corroborationLevel: V_CORROBORATION.has(raw.sourceAssessment?.corroborationLevel) ? raw.sourceAssessment.corroborationLevel : (fb.sourceAssessment?.corroborationLevel ?? "Limited corroboration"),
      limitations: String(raw.sourceAssessment?.limitations ?? fb.sourceAssessment?.limitations ?? ""),
    },
    scenarios:    scenarios.length > 0 ? scenarios.slice(0, 3) : (fb.scenarios ?? []).slice(0, 3),
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

  const fb = buildRuleBasedBriefing(pe, articles);
  const marketContextSummary = await getCachedMarketContextSummary();
  const prompt = _buildPrompt(pe, articles, marketContextSummary);
  const geminiConfigured = describeEnvVar("GEMINI_API_KEY").usable;
  let usedRepairRetry = false;

  let response;
  try {
    response = await _enqueue(() => _callWithRetry(SYS, prompt, DEFAULT_MAX_OUTPUT_TOKENS));
  } catch (err) {
    log.warn(`Gemini failed for ${pe._clusterId}: ${err.message}`);
    return {
      ...fb,
      aiAttempted: true,
      aiCallsUsed: 0,
      aiSkippedReason: geminiConfigured ? "provider_error" : "gemini_not_configured",
      aiProviderError: err.message,
    };
  }

  let raw = response?.text ?? "";
  let finishReason = response?.finishReason ?? null;
  log.info(`Gemini raw response for ${pe._clusterId}: chars=${raw.length}${finishReason ? ` finishReason=${finishReason}` : ""}`);

  let parsed = parseGeminiJson(raw);

  if (!parsed.ok && shouldRetryShorterPrompt(parsed, raw, finishReason)) {
    log.warn(`Retrying Gemini for ${pe._clusterId} with shorter prompt due to incomplete output`);
    try {
      const retryPrompt = _buildPrompt(pe, articles, marketContextSummary, { compact: true });
      const retryResponse = await _enqueue(() => _callWithRetry(SYS, retryPrompt, RETRY_MAX_OUTPUT_TOKENS));
      raw = retryResponse?.text ?? "";
      finishReason = retryResponse?.finishReason ?? null;
      response = retryResponse;
      log.info(`Gemini retry response for ${pe._clusterId}: chars=${raw.length}${finishReason ? ` finishReason=${finishReason}` : ""}`);
      parsed = parseGeminiJson(raw);
    } catch (err) {
      log.warn(`Gemini retry failed for ${pe._clusterId}: ${err.message}`);
      return {
        ...fb,
        aiAttempted: true,
        aiCallsUsed: 0,
        aiSkippedReason: "provider_error",
        aiProviderError: err.message,
      };
    }
  }

  if (!parsed.ok) {
    log.warn(`JSON parse failed for ${pe._clusterId}: ${parsed.reason} raw=${String(raw).slice(0, 500)}`);
    return {
      ...fb,
      aiAttempted: true,
      aiCallsUsed: 0,
      aiSkippedReason: "provider_error",
      aiProviderError: parsed.reason,
    };
  }

  if (parsed.source === "extracted" || parsed.source === "extracted-raw") {
    log.warn(`Gemini response for ${pe._clusterId} contained extra text; extracted first JSON object`);
  }

  let result = _validate(parsed.value, fb);
  let sanitized = sanitizeEventNarrative(result, fb);
  result = sanitized.cleaned;

  if (sanitized.meta.requiresRetry && !usedRepairRetry) {
    usedRepairRetry = true;
    log.warn(`Retrying Gemini for ${pe._clusterId} due to scraped or overlong narrative fields`);
    try {
      const repairResponse = await _enqueue(() => _callWithRetry(SYS, _buildRepairPrompt(pe, articles, marketContextSummary), RETRY_MAX_OUTPUT_TOKENS));
      raw = repairResponse?.text ?? "";
      finishReason = repairResponse?.finishReason ?? null;
      response = repairResponse;
      parsed = parseGeminiJson(raw);
      if (parsed.ok) {
        result = _validate(parsed.value, fb);
        sanitized = sanitizeEventNarrative(result, fb);
        result = sanitized.cleaned;
      }
    } catch (err) {
      log.warn(`Gemini repair retry failed for ${pe._clusterId}: ${err.message}`);
    }
  }

  if (sanitized.meta.requiresRetry) {
    return {
      ...fb,
      aiAttempted: true,
      aiCallsUsed: 0,
      aiSkippedReason: "provider_error",
      aiProviderError: "sanitizer_rejected_raw_like_output",
    };
  }

  result.generationMethod = "ai";
  result.aiAttempted = true;
  result.aiCallsUsed = 1;
  result.aiSkippedReason = null;
  result.aiProviderError = null;
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
  const [newsRefresh, aiRefresh] = await Promise.all([
    getRefreshState("news"),
    getRefreshState("ai"),
  ]);
  return {
    configured: describeEnvVar("GEMINI_API_KEY").usable,
    aiCallsToday: usage.totalCalls,
    aiDailyLimit: limits.aiDailyLimit,
    aiRemainingToday: Math.max(0, limits.aiDailyLimit - usage.totalCalls),
    automationBudget: limits.automationBudget,
    reservedManualCalls: limits.reservedManualCalls,
    rpmLimit: limits.rpmLimit,
    inputTokenLimitPerMinute: limits.inputTokenLimitPerMinute,
    lastAiRefreshAt: aiRefresh.record?.lastRefresh ?? null,
    lastNewsRefreshAt: newsRefresh.record?.lastRefresh ?? null,
    queueDepth: _queue.length,
    processing: _processing,
    ...cacheStats(),
  };
}
