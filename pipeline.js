import { createHash } from "crypto";
import { ingest } from "./ingest.js";
import { cluster } from "./cluster.js";
import { cacheHas, cachePrune, getAIStatus, makeClusterKey, processCluster } from "./ai.js";
import { getAllArticles } from "./store.js";
import { buildRuleBasedBriefing } from "./rule-based-briefing.js";
import { deleteOldEvents, getRecentEvents, insertEvent } from "./supabase.js";
import { createLogger } from "./logger.js";

const log = createLogger("pipeline");
const HIGH_IMPORTANCE_THRESHOLD = 70;
const CONFLICT_KEYWORDS = new Set([
  "war","conflict","attack","strike","missile","drone","military","troops",
  "ceasefire","sanctions","naval","blockade","crisis","escalation","border",
]);
const MARKET_IMPACT_KEYWORDS = new Set([
  "oil","gas","shipping","strait","pipeline","trade","market","energy","uranium","grain",
]);
const REGION_IMPORTANCE = {
  "Ukraine": 20,
  "Russia": 16,
  "Taiwan Strait": 20,
  "Strait of Hormuz": 20,
  "Middle East": 18,
  "Yemen / Red Sea": 18,
  "Black Sea": 15,
  "Kashmir": 14,
  "China": 14,
};

function scoreImportance(preEvent, articles = []) {
  const sourceCountScore = Math.min(25, new Set(preEvent.sources ?? []).size * 8);
  const sourceQualityScore = Math.min(20, Math.round(
    articles.reduce((sum, article) => sum + (article.sourceQuality ?? 0.5), 0) * 6
  ));
  const conflictKeywordScore = Math.min(20, (preEvent.keywords ?? []).filter((kw) => CONFLICT_KEYWORDS.has(kw)).length * 4);
  const regionScore = REGION_IMPORTANCE[preEvent.region?.label ?? ""] ?? (preEvent.region?.label ? 8 : 0);
  const marketImpactScore = Math.min(15, (preEvent.keywords ?? []).filter((kw) => MARKET_IMPACT_KEYWORDS.has(kw)).length * 5);

  return sourceCountScore + sourceQualityScore + conflictKeywordScore + regionScore + marketImpactScore;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function articleOverlapRatio(a = [], b = []) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const id of left) {
    if (right.has(id)) intersection++;
  }

  return intersection / Math.max(left.size, right.size);
}

function findExistingEvent(preEvent, previousEvents) {
  const signature = preEvent._clusterSignature;
  const exact = previousEvents.find((event) => event.clusterSignature === signature);
  if (exact) return exact;

  return previousEvents.find((event) => {
    const sameTitle = normalizeText(event.title) === normalizeText(preEvent.title);
    const sameLocation = normalizeText(event.location?.label) === normalizeText(preEvent.region?.label ?? "Unknown Region");
    const delta = Math.abs(new Date(event.timestamp).getTime() - new Date(preEvent.timestamp).getTime());
    return sameTitle && sameLocation && delta <= 24 * 60 * 60 * 1000;
  }) ?? null;
}

function hasReusableAI(existingEvent) {
  return Boolean(
    existingEvent &&
    ["enriched", "cached"].includes(existingEvent.aiStatus) &&
    existingEvent.summary &&
    Array.isArray(existingEvent.scenarios) &&
    existingEvent.scenarios.length > 0
  );
}

function changedEnough(existingEvent, preEvent, importanceScore) {
  if (!existingEvent) return true;
  if (existingEvent.clusterSignature === preEvent._clusterSignature) return false;

  const overlap = articleOverlapRatio(existingEvent.articleIds, preEvent.articleIds);
  const newArticleCount = preEvent.articleIds.filter((id) => !(existingEvent.articleIds ?? []).includes(id)).length;
  const previousImportance = existingEvent.importanceScore ?? 0;

  return overlap < 0.7 || newArticleCount >= 2 || Math.abs(importanceScore - previousImportance) >= 20;
}

function makeEventId(preEvent) {
  const hex = createHash("sha256")
    .update(makeClusterKey(preEvent))
    .digest("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export async function runPipeline({ source = "manual", noAi = false } = {}) {
  const startedAt = Date.now();
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  log.info("Pipeline starting");

  let ingestResult;
  try {
    ingestResult = await ingest({
      apiKey: process.env.NEWS_API_KEY,
      maxPerRun: parseInt(process.env.MAX_ARTICLES_PER_RUN ?? "40", 10),
    });
  } catch (err) {
    log.error(`Ingest failed: ${err.message}`);
    return {
      ok: false,
      error: err.message,
      events: 0,
      articles: 0,
      clusters: 0,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "failed",
      elapsed: elapsed(),
    };
  }

  const threshold = parseFloat(process.env.CLUSTER_THRESHOLD ?? "0.18");
  const automatedAiEnabled = !noAi && String(process.env.ENABLE_AUTOMATED_AI ?? "true").toLowerCase() !== "false";
  const preEvents = cluster({ threshold });
  const articleStore = new Map(getAllArticles().map((article) => [article.id, article]));
  const cachedCount = preEvents.filter((preEvent) => cacheHas(makeClusterKey(preEvent))).length;
  const previousEvents = await getRecentEvents(24);

  if (preEvents.length === 0) {
    const purged = await deleteOldEvents(parseInt(process.env.EVENT_MAX_AGE_HOURS ?? "24", 10));
    cachePrune();
    return {
      ok: true,
      events: 0,
      articles: ingestResult.saved,
      clusters: 0,
      cached: cachedCount,
      aiCalls: 0,
      purged,
      mode: ingestResult.mode,
      elapsed: elapsed(),
    };
  }

  const results = new Map();
  const enrichedCandidates = preEvents
    .map((preEvent) => {
      const clusterSignature = makeClusterKey(preEvent);
      const articles = preEvent.articleIds
        .map((id) => articleStore.get(id))
        .filter(Boolean);
      const importanceScore = scoreImportance(preEvent, articles);
      const existingEvent = findExistingEvent({ ...preEvent, _clusterSignature: clusterSignature }, previousEvents);

      const candidatePreEvent = { ...preEvent, _clusterSignature: clusterSignature };
      const needsMeaningfulRefresh = changedEnough(existingEvent, candidatePreEvent, importanceScore);

      return {
        preEvent: candidatePreEvent,
        articles,
        importanceScore,
        existingEvent,
        canReuse: hasReusableAI(existingEvent) && !needsMeaningfulRefresh,
        needsMeaningfulRefresh,
      };
    })
    .sort((a, b) => b.importanceScore - a.importanceScore);

  const aiStatus = await getAIStatus();
  const maxAiCallsPerRun = parseInt(process.env.MAX_AI_CALLS_PER_RUN ?? "1", 10);
  const automationRemaining = Math.max(0, aiStatus.automationBudget - aiStatus.aiCallsToday);
  const isAutomatedRun = source !== "manual";
  const allowedCallsThisRun = automatedAiEnabled && !noAi
    ? Math.max(0, Math.min(maxAiCallsPerRun, isAutomatedRun ? automationRemaining : maxAiCallsPerRun))
    : 0;
  const aiTargets = new Set(
    enrichedCandidates
      .filter((candidate) =>
        !candidate.canReuse &&
        candidate.needsMeaningfulRefresh &&
        (!isAutomatedRun || candidate.importanceScore >= HIGH_IMPORTANCE_THRESHOLD)
      )
      .slice(0, allowedCallsThisRun)
      .map((candidate) => candidate.preEvent._clusterId)
  );

  let actualAiCalls = 0;
  for (const candidate of enrichedCandidates) {
    const { preEvent, articles, importanceScore, existingEvent, canReuse } = candidate;
    if (canReuse) {
      results.set(preEvent._clusterId, {
        title: existingEvent.title,
        summary: existingEvent.summary,
        developments: existingEvent.developments ?? [],
        tone: existingEvent.tone,
        confidence: existingEvent.confidence,
        scenarios: existingEvent.scenarios ?? [],
        aiStatus: "cached",
        aiUpdatedAt: existingEvent.aiUpdatedAt ?? existingEvent.timestamp,
        importanceScore,
      });
      continue;
    }

    if (!aiTargets.has(preEvent._clusterId)) {
      const fallbackBriefing = buildRuleBasedBriefing(preEvent, articles);
      results.set(preEvent._clusterId, {
        ...fallbackBriefing,
        aiStatus: automatedAiEnabled && !noAi && isAutomatedRun && automationRemaining <= 0
          ? "budget_exhausted"
          : "fallback",
        aiUpdatedAt: existingEvent?.aiUpdatedAt ?? null,
        importanceScore,
      });
      continue;
    }

    const result = await processCluster(preEvent, articles, {
      source: isAutomatedRun ? "automation" : "manual",
    });
    actualAiCalls++;
    results.set(preEvent._clusterId, {
      ...result,
      aiStatus: result.generationMethod === "rule-based" ? "fallback" : "enriched",
      aiUpdatedAt: new Date().toISOString(),
      importanceScore,
    });
  }

  let created = 0;
  for (const preEvent of preEvents) {
    const result = results.get(preEvent._clusterId);
    if (!result) continue;

    await insertEvent({
      id: makeEventId(preEvent),
      title: result.title,
      location: preEvent.region ?? { label: "Unknown Region", lat: null, lng: null },
      timestamp: preEvent.timestamp,
      summary: result.summary,
      developments: result.developments,
      tone: result.tone,
      confidence: result.confidence,
      scenarios: result.scenarios,
      sources: preEvent.sources,
      keywords: preEvent.keywords,
      articleIds: preEvent.articleIds,
      aiStatus: result.aiStatus ?? "fallback",
      aiUpdatedAt: result.aiUpdatedAt ?? null,
      clusterSignature: preEvent._clusterSignature,
      importanceScore: result.importanceScore ?? scoreImportance(preEvent, []),
    });
    created++;
  }

  const purged = await deleteOldEvents(parseInt(process.env.EVENT_MAX_AGE_HOURS ?? "24", 10));
  cachePrune();

  const summary = {
    ok: true,
    events: created,
    articles: ingestResult.saved,
    clusters: preEvents.length,
    cached: cachedCount,
    aiCalls: actualAiCalls,
    purged,
    mode: ingestResult.mode,
    automatedAiEnabled,
    noAi,
    elapsed: elapsed(),
  };

  log.info(`Pipeline done: events=${summary.events} clusters=${summary.clusters} mode=${summary.mode} elapsed=${summary.elapsed}`);
  return summary;
}
