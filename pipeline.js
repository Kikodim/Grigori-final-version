import { createHash } from "crypto";
import { ingest } from "./ingest.js";
import { cluster } from "./cluster.js";
import { cacheHas, cachePrune, getAIStatus, makeClusterKey, processCluster } from "./ai.js";
import { describeEnvVar, getConfig } from "./config.js";
import { inferLocationDetails } from "./event-insights.js";
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
    const sameLocation = normalizeText(event.location?.label) === normalizeText(preEvent.region?.label ?? "Region under review");
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

function buildSyntheticArticlesForEvent(event, articleStore) {
  const fromStore = (event.articleIds ?? [])
    .map((id) => articleStore.get(id))
    .filter(Boolean);

  if (fromStore.length > 0) return fromStore;

  const developments = Array.isArray(event.developments) ? event.developments.join(" ") : "";
  return [{
    id: event.id,
    title: event.title,
    source: (event.sources ?? ["Stored Event"])[0] ?? "Stored Event",
    publishedAt: event.timestamp,
    content: `${event.summary ?? ""} ${developments}`.trim(),
    url: `https://grigori.local/event/${event.id}`,
    keywords: event.keywords ?? [],
    region: event.location ?? null,
    sourceQuality: 0.75,
  }];
}

function getElapsed(startedAt) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function shouldPublishPreEvent(preEvent, articles = []) {
  const relevanceScore = Number(preEvent.relevanceScore ?? 0);
  const sourceCount = new Set(preEvent.sources ?? []).size;
  const title = String(preEvent.title ?? "").toLowerCase();
  const lowValueTitle = /\b(morning update|evening update|daily briefing|marathon|celebrity|luxury resort)\b/i.test(title);
  const underReview = String(preEvent.region?.label ?? "").toLowerCase() === "region under review";

  if (lowValueTitle) return false;
  if (sourceCount <= 1 && relevanceScore < 4 && underReview) return false;
  if ((articles?.length ?? 0) <= 1 && relevanceScore < 3) return false;
  return true;
}

function buildAiDiagnostics(aiStatus, overrides = {}) {
  const config = getConfig();
  const geminiConfigured = describeEnvVar("GEMINI_API_KEY").usable;
  const automationBudget = config.aiAutomationBudget ?? aiStatus.automationBudget;
  const aiRemainingToday = Math.max(0, config.aiDailyLimit - aiStatus.aiCallsToday);
  const automationRemainingToday = Math.max(0, automationBudget - aiStatus.aiCallsToday);

  return {
    automatedAiEnabled: config.enableAutomatedAi && !overrides.noAi,
    geminiConfigured,
    maxAiCallsPerRun: config.maxAiCallsPerRun,
    aiCallsToday: aiStatus.aiCallsToday,
    aiDailyLimit: config.aiDailyLimit,
    aiReservedCalls: config.aiReservedCalls,
    aiAutomationBudget: automationBudget,
    aiRemainingToday,
    automationRemainingToday,
    targetEventId: null,
    targetTitle: null,
    targetAiStatusBefore: null,
    targetHadScenariosBefore: false,
    targetUpdatedAt: null,
    aiAttempted: false,
    aiCallsUsed: 0,
    aiSkippedReason: "unknown",
    aiProviderError: null,
    ...overrides,
  };
}

async function runAiOnlyRefresh({ source, noAi, startedAt }) {
  const config = getConfig();
  const geminiConfigured = describeEnvVar("GEMINI_API_KEY").usable;
  const automatedAiEnabled = !noAi && config.enableAutomatedAi;
  const articleStore = new Map(getAllArticles().map((article) => [article.id, article]));
  const previousEvents = await getRecentEvents(72);
  const aiStatus = await getAIStatus();
  const maxAiCallsPerRun = config.maxAiCallsPerRun;
  const automationRemaining = Math.max(0, aiStatus.automationBudget - aiStatus.aiCallsToday);
  const isAutomatedRun = source !== "manual";
  const allowedCallsThisRun = automatedAiEnabled
    ? Math.max(0, Math.min(maxAiCallsPerRun, isAutomatedRun ? automationRemaining : maxAiCallsPerRun))
    : 0;
  const baseDiagnostics = buildAiDiagnostics(aiStatus, { noAi });

  log.info(`Gemini configured? ${geminiConfigured}`);
  log.info(`AI budget check result source=${source} automatedAiEnabled=${automatedAiEnabled} maxAiCallsPerRun=${maxAiCallsPerRun} aiCallsToday=${aiStatus.aiCallsToday} aiRemainingToday=${baseDiagnostics.aiRemainingToday} automationRemainingToday=${automationRemaining}`);

  const candidates = previousEvents
    .filter((event) => !["enriched", "cached"].includes(event.aiStatus))
    .map((event) => {
      const preEvent = {
        _clusterId: `stored-${event.id}`,
        _clusterSignature: event.clusterSignature ?? makeClusterKey({
          articleIds: event.articleIds ?? [],
          region: event.location,
        }),
        title: event.title,
        region: event.location,
        timestamp: event.timestamp,
        keywords: event.keywords ?? [],
        confidence: event.confidence,
        articleIds: event.articleIds ?? [],
        sources: event.sources ?? [],
      };
      const articles = buildSyntheticArticlesForEvent(event, articleStore);
      const importanceScore = Number(event.importanceScore ?? scoreImportance({
        sources: event.sources ?? [],
        keywords: event.keywords ?? [],
        region: event.location,
      }, articles));
      return { event, preEvent, articles, importanceScore };
    })
    .filter((candidate) => !isAutomatedRun || candidate.importanceScore >= HIGH_IMPORTANCE_THRESHOLD)
    .sort((a, b) => {
      const scoreDelta = b.importanceScore - a.importanceScore;
      if (scoreDelta !== 0) return scoreDelta;
      return new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime();
    });

  if (!automatedAiEnabled) {
    log.info("AI skipped reason automated_ai_disabled");
    return {
      ok: true,
      events: 0,
      articles: 0,
      clusters: 0,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "ai",
      refreshMode: "ai",
      elapsed: getElapsed(startedAt),
      changed: false,
      reason: "Automated AI disabled",
      ...baseDiagnostics,
      aiSkippedReason: "automated_ai_disabled",
    };
  }

  if (!geminiConfigured) {
    log.info("AI skipped reason gemini_not_configured");
    return {
      ok: true,
      events: 0,
      articles: 0,
      clusters: 0,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "ai",
      refreshMode: "ai",
      elapsed: getElapsed(startedAt),
      changed: false,
      reason: "Gemini is not configured",
      ...baseDiagnostics,
      aiSkippedReason: "gemini_not_configured",
    };
  }

  if (maxAiCallsPerRun <= 0) {
    log.info("AI skipped reason max_ai_calls_per_run_zero");
    return {
      ok: true,
      events: 0,
      articles: 0,
      clusters: 0,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "ai",
      refreshMode: "ai",
      elapsed: getElapsed(startedAt),
      changed: false,
      reason: "MAX_AI_CALLS_PER_RUN is zero",
      ...baseDiagnostics,
      aiSkippedReason: "max_ai_calls_per_run_zero",
    };
  }

  if (baseDiagnostics.aiRemainingToday <= 0) {
    log.info("AI skipped reason daily_budget_exhausted");
    return {
      ok: true,
      events: 0,
      articles: 0,
      clusters: 0,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "ai",
      refreshMode: "ai",
      elapsed: getElapsed(startedAt),
      changed: false,
      reason: "AI daily budget exhausted",
      ...baseDiagnostics,
      aiSkippedReason: "daily_budget_exhausted",
    };
  }

  if (candidates.length === 0) {
    const previousTarget = previousEvents
      .slice()
      .sort((a, b) => (Number(b.importanceScore ?? 0) - Number(a.importanceScore ?? 0)))
      .find(Boolean);
    const skipReason = previousTarget && ["enriched", "cached"].includes(previousTarget.aiStatus)
      ? "event_already_enriched"
      : "no_eligible_event";
    log.info(`AI skipped reason ${skipReason}`);
    return {
      ok: true,
      events: 0,
      articles: 0,
      clusters: 0,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "ai",
      refreshMode: "ai",
      elapsed: getElapsed(startedAt),
      changed: false,
      reason: "No eligible fallback events for AI enrichment",
      ...baseDiagnostics,
      targetEventId: previousTarget?.id ?? null,
      targetTitle: previousTarget?.title ?? null,
      targetAiStatusBefore: previousTarget?.aiStatus ?? null,
      targetHadScenariosBefore: Array.isArray(previousTarget?.scenarios) && previousTarget.scenarios.length > 0,
      targetUpdatedAt: previousTarget?.aiUpdatedAt ?? previousTarget?.updated_at ?? previousTarget?.timestamp ?? null,
      aiSkippedReason: skipReason,
    };
  }

  const target = candidates[0];
  log.info(`AI mode selected target id=${target.event.id} title="${target.event.title}" aiStatus=${target.event.aiStatus ?? "unknown"} scenarios=${Array.isArray(target.event.scenarios) ? target.event.scenarios.length : 0} importance=${target.importanceScore}`);
  if (allowedCallsThisRun <= 0) {
    await insertEvent({
      ...target.event,
      aiStatus: "budget_exhausted",
      aiUpdatedAt: target.event.aiUpdatedAt ?? null,
    });
    log.info(`AI skipped reason automation_budget_exhausted`);
    return {
      ok: true,
      events: 1,
      articles: 0,
      clusters: 1,
      cached: 0,
      aiCalls: 0,
      purged: 0,
      mode: "ai",
      refreshMode: "ai",
      elapsed: getElapsed(startedAt),
      changed: true,
      reason: "AI automation budget exhausted",
      ...baseDiagnostics,
      targetEventId: target.event.id,
      targetTitle: target.event.title,
      targetAiStatusBefore: target.event.aiStatus ?? null,
      targetHadScenariosBefore: Array.isArray(target.event.scenarios) && target.event.scenarios.length > 0,
      targetUpdatedAt: target.event.aiUpdatedAt ?? target.event.updated_at ?? target.event.timestamp ?? null,
      aiSkippedReason: "automation_budget_exhausted",
    };
  }

  log.info("AI attempted true");
  const result = await processCluster(target.preEvent, target.articles, {
    source: isAutomatedRun ? "automation" : "manual",
  });
  const aiCallsUsed = result.generationMethod === "ai" ? 1 : 0;
  const aiSkippedReason = aiCallsUsed > 0
    ? null
    : (result.aiSkippedReason ?? "provider_error");
  const aiProviderError = result.aiProviderError ?? null;
  log.info(`AI calls used ${aiCallsUsed}`);
  if (aiSkippedReason) {
    log.info(`AI skipped reason ${aiSkippedReason}`);
  }

  await insertEvent({
    ...target.event,
    title: result.title,
    location: result.location ?? target.event.location,
    summary: result.summary,
    developments: result.developments,
    tone: result.tone,
    confidence: result.confidence,
    scenarios: result.scenarios,
    aiStatus: result.generationMethod === "rule-based" ? "fallback" : "enriched",
    aiUpdatedAt: new Date().toISOString(),
    clusterSignature: target.preEvent._clusterSignature,
    importanceScore: target.importanceScore,
  });

  return {
    ok: true,
    events: 1,
    articles: 0,
    clusters: 1,
    cached: 0,
    aiCalls: result.generationMethod === "rule-based" ? 0 : 1,
    purged: 0,
    mode: "ai",
    refreshMode: "ai",
    elapsed: getElapsed(startedAt),
    changed: true,
    targetEventId: target.event.id,
    targetTitle: target.event.title,
    ...baseDiagnostics,
    targetEventId: target.event.id,
    targetTitle: target.event.title,
    targetAiStatusBefore: target.event.aiStatus ?? null,
    targetHadScenariosBefore: Array.isArray(target.event.scenarios) && target.event.scenarios.length > 0,
    targetUpdatedAt: target.event.aiUpdatedAt ?? target.event.updated_at ?? target.event.timestamp ?? null,
    aiAttempted: true,
    aiCallsUsed,
    aiSkippedReason,
    aiProviderError,
  };
}

export async function runPipeline({ source = "manual", noAi = false, mode = "full" } = {}) {
  const startedAt = Date.now();
  log.info(`Pipeline starting mode=${mode} source=${source}`);

  if (mode === "ai") {
    return runAiOnlyRefresh({ source, noAi, startedAt });
  }

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
      refreshMode: mode,
      elapsed: getElapsed(startedAt),
    };
  }

  const threshold = parseFloat(process.env.CLUSTER_THRESHOLD ?? "0.18");
  const automatedAiEnabled = mode !== "news" && !noAi && String(process.env.ENABLE_AUTOMATED_AI ?? "true").toLowerCase() !== "false";
  const preEvents = cluster({ threshold });
  const articleStore = new Map(getAllArticles().map((article) => [article.id, article]));
  const publishablePreEvents = preEvents.filter((preEvent) => {
    const articles = preEvent.articleIds
      .map((id) => articleStore.get(id))
      .filter(Boolean);
    return shouldPublishPreEvent(preEvent, articles);
  });
  const cachedCount = publishablePreEvents.filter((preEvent) => cacheHas(makeClusterKey(preEvent))).length;
  const previousEvents = await getRecentEvents(24);

  if (publishablePreEvents.length === 0) {
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
      mode: mode === "news" ? "news" : ingestResult.mode,
      refreshMode: mode,
      filteredOutCount: ingestResult.filteredOutCount ?? 0,
      lowRelevanceCount: ingestResult.lowRelevanceCount ?? 0,
      regionUnderReviewCount: 0,
      suppressedClusterCount: preEvents.length,
      elapsed: getElapsed(startedAt),
    };
  }

  const results = new Map();
  const enrichedCandidates = publishablePreEvents
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
  const allowedCallsThisRun = automatedAiEnabled
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
        aiStatus: automatedAiEnabled && isAutomatedRun && automationRemaining <= 0
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
  for (const preEvent of publishablePreEvents) {
    const result = results.get(preEvent._clusterId);
    if (!result) continue;
    const articles = preEvent.articleIds
      .map((id) => articleStore.get(id))
      .filter(Boolean);
    const resolvedLocation = result.location ?? inferLocationDetails({
      ...preEvent,
      location: preEvent.region,
      summary: result.summary,
      sources: preEvent.sources,
      keywords: preEvent.keywords,
      articleIds: preEvent.articleIds,
    }, articles);

    await insertEvent({
      id: makeEventId(preEvent),
      title: result.title,
      location: resolvedLocation ?? { label: "Region under review", lat: null, lng: null, confidence: "Low", reason: "Location signals remain under review." },
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
  const regionUnderReviewCount = publishablePreEvents.filter((event) => {
    const label = String(event.region?.label ?? "").trim().toLowerCase();
    return !label || label === "region under review" || label === "unknown region";
  }).length;

  const summary = {
    ok: true,
    events: created,
    articles: ingestResult.saved,
    clusters: publishablePreEvents.length,
    cached: cachedCount,
    aiCalls: actualAiCalls,
    purged,
    mode: mode === "news" ? "news" : ingestResult.mode,
    refreshMode: mode,
    automatedAiEnabled,
    noAi,
    filteredOutCount: ingestResult.filteredOutCount ?? 0,
    lowRelevanceCount: ingestResult.lowRelevanceCount ?? 0,
    regionUnderReviewCount,
    suppressedClusterCount: Math.max(0, preEvents.length - publishablePreEvents.length),
    elapsed: getElapsed(startedAt),
  };

  log.info(`Pipeline done: events=${summary.events} clusters=${summary.clusters} mode=${summary.mode} elapsed=${summary.elapsed}`);
  return summary;
}
