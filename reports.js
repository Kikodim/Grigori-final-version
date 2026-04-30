import crypto from "crypto";
import { generateStrategicReportWithGemini, getAIStatus } from "./ai.js";
import { getConfig } from "./config.js";
import {
  deriveEventClassification,
  deriveRecentTrend,
  getEventSourceSignals,
  sanitizeBulletList,
  sanitizeNarrativeText,
} from "./event-insights.js";
import { createLogger } from "./logger.js";
import { BRAND, PREMIUM_PLANS, REPORT_INPUT_OPTIONS, REPORTS_WIP_COPY } from "./premium-config.js";
import { getBearerToken, getClientIp, requireAdmin } from "./security.js";
import {
  getAIUsageStatsBySource,
  getAuthenticatedSupabaseUser,
  getEvents,
  getRefreshState,
  getStats,
  getUserProfile,
  getUserReports,
  getUserWatchlists,
  getWaitlistEntries,
  saveUserReport,
  saveWaitlistEntry,
  upsertUserProfile,
} from "./supabase.js";

const log = createLogger("reports");
const REPORT_PROVIDER = "gemini";
const REPORT_MODEL = "gemini-2.5-flash";

const REGION_KEYWORDS = {
  "Europe / Balkans": ["europe", "eu", "european", "balkans", "serbia", "kosovo", "bosnia", "bulgaria", "romania", "greece", "turkey", "poland", "hungary", "moldova", "black sea"],
  "Black Sea": ["black sea", "crimea", "odesa", "romania", "bulgaria", "sevastopol", "grain corridor"],
  "Middle East": ["middle east", "gaza", "israel", "iran", "iraq", "syria", "lebanon", "saudi", "uae", "gulf"],
  "Red Sea": ["red sea", "yemen", "houthi", "bab el-mandeb", "aden", "suez"],
  "Strait of Hormuz": ["hormuz", "gulf", "oman", "iran", "tanker", "strait of hormuz"],
  "Taiwan Strait": ["taiwan", "taipei", "pla", "median line", "taiwan strait", "semiconductor"],
  "Russia / Ukraine": ["ukraine", "russia", "donbas", "kyiv", "crimea", "black sea"],
  "China / South China Sea": ["china", "south china sea", "beijing", "spratly", "paracel", "taiwan", "philippines"],
};

const FOCUS_KEYWORDS = {
  Military: ["military", "strike", "missile", "drone", "naval", "troops", "airstrike", "exercise"],
  "Political Risk": ["political", "coalition", "parliament", "government", "resignation", "commission", "diplomatic"],
  Elections: ["election", "vote", "ballot", "polls", "coalition"],
  Energy: ["oil", "gas", "lng", "pipeline", "refinery", "energy", "opec", "power"],
  Shipping: ["shipping", "tanker", "freight", "port", "suez", "hormuz", "red sea"],
  "Cyber / Infrastructure": ["cyber", "hack", "breach", "telecom", "grid", "railway", "infrastructure", "blackout"],
  "Trade / Sanctions": ["trade", "tariff", "sanctions", "export control", "blacklist", "customs"],
  "Supply Chains": ["supply chain", "shipment", "factory", "logistics", "port", "shipping"],
  "Technology / Semiconductors": ["semiconductor", "chip", "tsmc", "technology", "export control", "rare earth", "fab"],
  "Financial Markets": ["market", "equities", "stocks", "vix", "gold", "bond", "currency"],
  "General Strategic Risk": [],
};

const FOCUS_CATEGORY_MAP = {
  Military: ["Military", "Shipping"],
  "Political Risk": ["Political", "Diplomatic", "Protest", "Migration"],
  Elections: ["Election", "Political"],
  Energy: ["Energy", "Shipping", "Infrastructure"],
  Shipping: ["Shipping", "Energy"],
  "Cyber / Infrastructure": ["Cyber", "Infrastructure"],
  "Trade / Sanctions": ["Trade", "Sanctions", "Diplomatic"],
  "Supply Chains": ["Trade", "Shipping", "Infrastructure", "Technology / Semiconductors"],
  "Technology / Semiconductors": ["Cyber", "Trade", "Market"],
  "Financial Markets": ["Market", "Energy", "Trade", "Sanctions"],
  "General Strategic Risk": [],
};

const DEFAULT_REPORT_FORM = {
  region: "Global",
  focusArea: "General Strategic Risk",
  timeHorizon: "72 hours",
  audienceType: "Executive",
  riskFraming: "Balanced",
  customQuestion: "",
};

const REPORT_LIMITS = {
  title: 160,
  executiveSummary: 900,
  currentSituation: 2500,
  trendAnalysis: 1800,
  scenarioSummary: 900,
  marketImpactSummary: 1200,
  watchIndicator: 220,
  keyJudgment: 280,
};

function dailyResetIso(now = Date.now()) {
  const date = new Date(now);
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
}

function safeCompareToken(left, right) {
  return typeof left === "string" && typeof right === "string" && left.length > 0 && left === right;
}

function isAdminRequest(req) {
  const adminSecret = process.env.ADMIN_SECRET?.trim();
  const token = getBearerToken(req);
  return Boolean(adminSecret) && safeCompareToken(token, adminSecret);
}

function tierUsageForProfile(profile) {
  const tier = getTierConfig(profile.subscription_tier ?? "free");
  const now = Date.now();
  const resetAt = Date.parse(profile.reset_daily_at ?? dailyResetIso(now));
  const needsReset = !Number.isFinite(resetAt) || resetAt <= now;
  const usedToday = needsReset ? 0 : Number(profile.reports_used_today ?? 0);
  const limit = Number(tier.reportsPerDay ?? 0);
  return {
    tier: tier.tier,
    tierName: tier.name,
    reportsPerDay: limit,
    reportsUsedToday: usedToday,
    remainingToday: Math.max(0, limit - usedToday),
    resetDailyAt: needsReset ? dailyResetIso(now) : profile.reset_daily_at,
  };
}

function getTierConfig(tier = "free") {
  if (tier === "confidential") return PREMIUM_PLANS[0];
  if (tier === "top_secret") return PREMIUM_PLANS[1];
  return {
    tier: "free",
    name: "Free Access",
    priceLabel: "€0",
    reportsPerDay: 0,
    watchlists: 0,
    features: ["Globe UI", "Intel Board", "Daily briefing", "Situational layers"],
  };
}

function timeHorizonHours(label) {
  switch (label) {
    case "24 hours":
      return 24;
    case "72 hours":
      return 72;
    case "7 days":
      return 24 * 7;
    case "30 days":
      return 24 * 30;
    default:
      return 72;
  }
}

function clampText(value, maxLen, fallback = "") {
  return sanitizeNarrativeText(value, { maxLen, maxSentences: 12, fallback });
}

function compactRelativeAge(iso) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function getEventActivityTimestamp(event) {
  return (
    event.aiUpdatedAt ??
    event.ai_updated_at ??
    event.updatedAt ??
    event.updated_at ??
    event.refreshedAt ??
    event.refreshed_at ??
    event.lastSeenAt ??
    event.last_seen_at ??
    event.createdAt ??
    event.created_at ??
    event.timestamp ??
    null
  );
}

function summarizeFreshnessLabel(iso) {
  if (!iso) return "Awaiting next refresh";
  const hours = Math.max(0, (Date.now() - new Date(iso).getTime()) / 3600_000);
  const age = compactRelativeAge(iso);
  if (hours < 2) return `Fresh · ${age}`;
  if (hours < 6) return `Recent · ${age}`;
  if (hours < 12) return `Aging · ${age}`;
  return `Stale · ${age}`;
}

function sanitizeReportPayload(payload = {}) {
  const normalized = {
    region: REPORT_INPUT_OPTIONS.regions.includes(payload.region) ? payload.region : DEFAULT_REPORT_FORM.region,
    focusArea: REPORT_INPUT_OPTIONS.focusAreas.includes(payload.focusArea) ? payload.focusArea : DEFAULT_REPORT_FORM.focusArea,
    timeHorizon: REPORT_INPUT_OPTIONS.timeHorizons.includes(payload.timeHorizon) ? payload.timeHorizon : DEFAULT_REPORT_FORM.timeHorizon,
    audienceType: REPORT_INPUT_OPTIONS.audienceTypes.includes(payload.audienceType) ? payload.audienceType : DEFAULT_REPORT_FORM.audienceType,
    riskFraming: REPORT_INPUT_OPTIONS.riskAppetites.includes(payload.riskFraming ?? payload.riskAppetite)
      ? (payload.riskFraming ?? payload.riskAppetite)
      : DEFAULT_REPORT_FORM.riskFraming,
    customQuestion: clampText(payload.customQuestion ?? payload.question ?? "", 240, ""),
  };
  return normalized;
}

function extractSourceCatalog(events) {
  const seen = new Set();
  const sources = [];
  for (const event of events) {
    const domains = Array.isArray(event.sourceDomains) ? event.sourceDomains : [];
    const titles = Array.isArray(event.sourceTitles) ? event.sourceTitles : [];
    const urls = Array.isArray(event.sourceUrls) ? event.sourceUrls : [];
    for (let index = 0; index < Math.max(domains.length, titles.length, urls.length, 1); index += 1) {
      const domain = String(domains[index] ?? domains[0] ?? "").trim();
      const title = String(titles[index] ?? event.title ?? "").trim();
      const url = String(urls[index] ?? "").trim();
      const key = `${domain}|${url}|${title}`;
      if (!key || seen.has(key)) continue;
      if (!domain && !url) continue;
      seen.add(key);
      sources.push({
        domain: domain || "Source under review",
        title: clampText(title, 180, event.title),
        url: /^https?:\/\//i.test(url) ? url : "",
      });
      if (sources.length >= 16) {
        return sources;
      }
    }
  }
  return sources;
}

function enrichEvent(event, allEvents = []) {
  const classification = deriveEventClassification(event);
  const sourceSignals = getEventSourceSignals(event);
  const sourceUrls = (event.articleIds ?? event.article_ids ?? [])
    .filter((item) => typeof item === "string" && /^https?:\/\//i.test(item))
    .slice(0, 8);
  const sourceTitles = [event.title, ...(Array.isArray(event.sources) ? event.sources : [])]
    .filter(Boolean)
    .slice(0, 8);
  return {
    ...event,
    category: event.category ?? classification.category,
    severityScore: Number(event.severityScore ?? event.severity_score ?? classification.severityScore),
    impactScore: Number(event.impactScore ?? event.impact_score ?? event.importanceScore ?? event.importance_score ?? classification.impactScore),
    confidenceScore: Number(event.confidenceScore ?? event.confidence_score ?? classification.confidenceScore),
    recentTrend: event.recentTrend ?? deriveRecentTrend(event, allEvents),
    sourceCount: event.sourceAssessment?.sourceCount ?? sourceSignals.sourceCount,
    sourceDomains: sourceSignals.uniqueSources,
    sourceUrls,
    sourceTitles,
    activityTimestamp: getEventActivityTimestamp(event),
  };
}

function eventMatchesRegion(event, region) {
  if (!region || region === "Global" || region === "Custom") return true;
  const corpus = [
    event.title,
    event.summary,
    event.assessment,
    event.location?.label,
    ...(event.keywords ?? []),
    ...(event.sourceDomains ?? []),
  ].join(" ").toLowerCase();
  const keywords = REGION_KEYWORDS[region] ?? [region.toLowerCase()];
  return keywords.some((keyword) => corpus.includes(keyword.toLowerCase()));
}

function eventMatchesFocus(event, focusArea) {
  if (!focusArea || focusArea === "General Strategic Risk") return true;
  if ((FOCUS_CATEGORY_MAP[focusArea] ?? []).includes(event.category)) return true;
  const corpus = [
    event.title,
    event.summary,
    event.assessment,
    event.category,
    ...(event.keywords ?? []),
  ].join(" ").toLowerCase();
  return (FOCUS_KEYWORDS[focusArea] ?? []).some((keyword) => corpus.includes(keyword.toLowerCase()));
}

function sortReportEvents(events) {
  return [...events].sort((left, right) => {
    const leftPriority =
      Number(left.impactScore ?? 0) * 0.4 +
      Number(left.severityScore ?? 0) * 0.3 +
      Number(left.importanceScore ?? 0) * 0.2 +
      Number(left.confidenceScore ?? 0) * 0.1;
    const rightPriority =
      Number(right.impactScore ?? 0) * 0.4 +
      Number(right.severityScore ?? 0) * 0.3 +
      Number(right.importanceScore ?? 0) * 0.2 +
      Number(right.confidenceScore ?? 0) * 0.1;
    return (
      rightPriority - leftPriority ||
      new Date(right.activityTimestamp ?? 0).getTime() - new Date(left.activityTimestamp ?? 0).getTime()
    );
  });
}

function filterRelevantEvents(events, request, config) {
  const cutoff = Date.now() - timeHorizonHours(request.timeHorizon) * 3600_000;
  const filtered = events.filter((event) => {
    const activityTs = new Date(event.activityTimestamp ?? event.timestamp ?? 0).getTime();
    if (!Number.isFinite(activityTs) || activityTs < cutoff) return false;
    if (!eventMatchesRegion(event, request.region)) return false;
    if (!eventMatchesFocus(event, request.focusArea)) return false;
    return true;
  });
  return sortReportEvents(filtered).slice(0, Math.max(1, config.geminiReportMaxEvents));
}

function deriveScenarioProbabilities(events) {
  const escalatoryWeight = events.reduce((sum, event) => {
    const toneBoost = event.tone === "Deteriorating" ? 18 : event.tone === "Escalating" ? 14 : event.tone === "Volatile" ? 9 : 0;
    return sum + Number(event.impactScore ?? 0) * 0.18 + Number(event.severityScore ?? 0) * 0.14 + toneBoost;
  }, 0);
  if (escalatoryWeight >= 220) return { containment: 20, base: 45, escalation: 35 };
  if (escalatoryWeight >= 150) return { containment: 25, base: 50, escalation: 25 };
  return { containment: 35, base: 45, escalation: 20 };
}

function deriveMarketImpact(events) {
  const categories = new Set(events.map((event) => event.category));
  const hasOil = events.some((event) => /oil|gas|hormuz|red sea|pipeline|opec/i.test(`${event.title} ${event.summary} ${event.assessment}`));
  const hasShipping = events.some((event) => /shipping|tanker|port|freight|suez|rerouting/i.test(`${event.title} ${event.summary} ${event.assessment}`));
  const hasDefense = categories.has("Military") || events.some((event) => Number(event.severityScore ?? 0) >= 70);
  const hasTech = events.some((event) => /semiconductor|chip|technology|cyber|telecom/i.test(`${event.title} ${event.summary} ${event.assessment}`));
  const hasMarket = categories.has("Market") || categories.has("Trade") || categories.has("Sanctions");
  return {
    oil: hasOil ? "Elevated pressure if disruption signals persist around supply routes, sanctions, or production expectations." : "Limited direct oil pressure from the current signal set.",
    shipping: hasShipping ? "Shipping pressure remains sensitive to route security, insurance repricing, and rerouting signals." : "Shipping effects appear secondary unless route or port disruption widens.",
    equities: hasMarket ? "Risk sentiment could stay selective and headline-driven rather than broadly directional." : "Broader equities impact remains indirect unless signals widen into sanctions, energy, or logistics stress.",
    defense: hasDefense ? "Defense exposure stays sensitive to posture changes, procurement talk, and alliance signaling." : "Defense implications are present but not the dominant transmission channel in this report window.",
    tech: hasTech ? "Technology and cyber-sensitive names remain exposed to export-control, telecom, or semiconductor spillover." : "Technology spillover remains limited unless cyber or semiconductor signals intensify.",
  };
}

function deriveSectorImpact(events) {
  const sectorSet = new Set();
  for (const event of events) {
    if (event.category === "Energy") sectorSet.add("Energy markets remain exposed to supply, transit, and sanctions pressure.");
    if (event.category === "Shipping") sectorSet.add("Shipping and logistics remain exposed to route security, insurance, and freight volatility.");
    if (event.category === "Military") sectorSet.add("Defense and security monitoring remain sensitive to posture changes and escalation signaling.");
    if (event.category === "Cyber" || event.category === "Infrastructure") sectorSet.add("Critical infrastructure and cyber-exposed operators should monitor service continuity and advisories.");
    if (event.category === "Trade" || event.category === "Sanctions") sectorSet.add("Trade-linked sectors remain sensitive to sanctions, export controls, and customs friction.");
    if (event.category === "Market") sectorSet.add("Financial markets remain sensitive to headline-driven risk repricing and cross-asset hedging.");
  }
  return [...sectorSet].slice(0, 6);
}

function buildRuleBasedReport(request, events) {
  const topEvents = events.slice(0, 5);
  const uniqueRegions = [...new Set(topEvents.map((event) => event.location?.label).filter(Boolean))].slice(0, 3);
  const sourceCount = topEvents.reduce((sum, event) => sum + Number(event.sourceCount ?? 0), 0);
  const sourceDomains = [...new Set(topEvents.flatMap((event) => event.sourceDomains ?? []))];
  const probabilities = deriveScenarioProbabilities(topEvents);
  const marketImpact = deriveMarketImpact(topEvents);
  const sectorImpact = deriveSectorImpact(topEvents);
  const sourceCatalog = extractSourceCatalog(topEvents);

  return {
    title: clampText(`${request.region} ${request.focusArea} Strategic Risk Brief`, REPORT_LIMITS.title, `${request.region} Strategic Risk Brief`),
    generatedAt: new Date().toISOString(),
    region: request.region,
    focusArea: request.focusArea,
    timeHorizon: request.timeHorizon,
    audienceType: request.audienceType,
    riskFraming: request.riskFraming,
    executiveSummary: clampText(
      `${topEvents.length} relevant signals were identified for ${request.region} over the selected ${request.timeHorizon.toLowerCase()} horizon. The current picture centers on ${topEvents.slice(0, 2).map((event) => event.location?.label ?? event.category).join(" and ")}, with the strongest pressure points tied to ${topEvents[0]?.title ?? "recent geopolitical developments"}. Confidence remains conditioned by source corroboration, recent signal freshness, and how quickly operational indicators clarify the direction of change.`,
      REPORT_LIMITS.executiveSummary
    ),
    keyJudgments: sanitizeBulletList(topEvents.map((event) => `${event.title} remains one of the highest-priority signals in this report window because it combines ${event.impactScore} impact, ${event.severityScore} severity, and ${event.confidence} confidence.`), {
      maxItems: 5,
      maxLen: REPORT_LIMITS.keyJudgment,
      maxSentences: 2,
      fallback: ["Signal density remains concentrated in the highest-impact theaters selected for this briefing."],
    }),
    currentSituation: clampText(topEvents.map((event) => `${event.location?.label ?? "Region under review"}: ${event.summary || event.assessment || event.title}`).join(" "), REPORT_LIMITS.currentSituation),
    whatChanged: sanitizeBulletList(topEvents.map((event) => {
      const freshness = compactRelativeAge(event.activityTimestamp);
      return `${event.recentTrend ?? "Recent activity"} in ${event.location?.label ?? event.category} remains visible, with ${event.title} refreshed ${freshness}.`;
    }), {
      maxItems: 6,
      maxLen: 240,
      maxSentences: 2,
      fallback: ["Signal flow remains active, but the most important shift is the persistence of high-impact themes rather than a clean de-escalation."],
    }),
    trendAnalysis: clampText(
      `The current trend picture looks ${topEvents.some((event) => event.recentTrend === "Increasing") ? "increasing" : topEvents.some((event) => event.recentTrend === "Decreasing") ? "fragmented" : "stable"} rather than fully resolved. The strongest concentration of activity remains around ${uniqueRegions.join(", ") || request.region}, while lower-confidence edges of the picture still depend on additional corroboration. Taken together, the signal base suggests continued pressure rather than a clean reset, especially where high-impact categories such as ${[...new Set(topEvents.map((event) => event.category))].join(", ")} overlap.`,
      REPORT_LIMITS.trendAnalysis
    ),
    scenarioMatrix: [
      {
        name: "Containment / de-escalation",
        probability: probabilities.containment,
        summary: "Pressure eases as official signaling, route security, or political management limits spillover.",
        triggers: ["Calmer official messaging", "No new operational disruptions", "Stronger corroboration of stabilizing signals"],
        implications: "Containment would reduce immediate spillover risk, though monitoring should remain elevated in case the signal picture reverses.",
        affectedSectors: sectorImpact.slice(0, 3),
      },
      {
        name: "Base case / continued pressure",
        probability: probabilities.base,
        summary: "The most likely path is continued friction without a decisive break toward resolution or major disruption.",
        triggers: ["Recurring but contained incidents", "Mixed official statements", "Persistent but uneven corroboration"],
        implications: "This keeps planning pressure elevated for operators, analysts, and risk teams while preserving room for rapid repricing if conditions worsen.",
        affectedSectors: sectorImpact.slice(0, 4),
      },
      {
        name: "Escalation / disruption",
        probability: probabilities.escalation,
        summary: "Additional military, political, cyber, or sanctions triggers push the situation into a more disruptive phase.",
        triggers: ["New attacks or force posture changes", "Route disruption or sanctions widening", "Credible confirmation of operational spillover"],
        implications: "Escalation would increase cross-sector exposure, amplify market sensitivity, and compress decision time for monitoring teams.",
        affectedSectors: sectorImpact,
      },
    ],
    marketImpact: {
      ...marketImpact,
      summary: clampText(`${marketImpact.oil} ${marketImpact.shipping} ${marketImpact.equities}`, REPORT_LIMITS.marketImpactSummary),
    },
    sectorImpact,
    watchIndicators: sanitizeBulletList(topEvents.flatMap((event) => event.watchIndicators ?? []), {
      maxItems: 10,
      maxLen: REPORT_LIMITS.watchIndicator,
      maxSentences: 2,
      fallback: [
        "Monitor official statements and force posture updates.",
        "Monitor route, port, or transport disruption indicators.",
        "Monitor sanctions, regulatory, or export-control announcements.",
        "Monitor source corroboration across independent domains.",
        "Monitor market-sensitive spillover into energy, shipping, and equities context.",
      ],
    }),
    confidenceAssessment: {
      level: sourceDomains.length >= 6 ? "High" : sourceDomains.length >= 3 ? "Medium" : "Low",
      rationale: clampText(`This assessment is based on ${sourceCount} source signals across ${sourceDomains.length || 1} distinct domains, weighted toward the highest-impact and freshest events in the selected horizon. Confidence would improve with additional independent corroboration and clearer official confirmation on the most market-sensitive developments.`, 500),
      increaseConfidence: ["Additional corroboration from independent high-trust outlets", "Clearer official statements or operational evidence", "Repeated confirmation across multiple refresh cycles"].slice(0, 4),
      reduceConfidence: ["Contradictory reporting from core sources", "Unclear location or authorship of key claims", "Rapid changes without corroboration"].slice(0, 4),
    },
    sourceAssessment: {
      sourceCount,
      sourceDiversity: `${sourceDomains.length || 1} distinct domains represented in the selected signal set.`,
      corroborationLevel: sourceDomains.length >= 6 ? "High corroboration" : sourceDomains.length >= 3 ? "Mixed corroboration" : "Limited corroboration",
      limitations: "Source quality is uneven across fast-moving developments, and some claims remain constrained by incomplete operational confirmation.",
    },
    limitations: [
      "This report uses stored Grigori event data only and does not trigger new collection during generation.",
      "Some developments remain sensitive to source lag, especially in fast-moving conflict or political events.",
      "Location precision varies when signals are region-level rather than site-specific.",
      "Scenario probabilities are analytic estimates rather than statistical forecasts.",
    ].slice(0, 5),
    recommendedMonitoringActions: [
      "Monitor official statements and force posture changes in the selected theater.",
      "Monitor whether corroboration strengthens or weakens the highest-impact signals.",
      "Monitor energy, shipping, sanctions, or cyber spillover linked to the selected focus area.",
      "Monitor whether the trend picture remains concentrated or begins to fragment across new regions.",
    ].slice(0, 6),
    sources: sourceCatalog,
  };
}

function composeReportText(report) {
  return [
    report.title,
    "",
    `Generated: ${report.generatedAt}`,
    `Region: ${report.region}`,
    `Focus: ${report.focusArea}`,
    `Horizon: ${report.timeHorizon}`,
    `Audience: ${report.audienceType}`,
    `Risk framing: ${report.riskFraming}`,
    "",
    "Executive Summary",
    report.executiveSummary,
    "",
    "Key Judgments",
    ...(report.keyJudgments ?? []).map((item) => `- ${item}`),
    "",
    "Current Situation",
    report.currentSituation,
    "",
    "What Changed",
    ...(report.whatChanged ?? []).map((item) => `- ${item}`),
    "",
    "Trend Analysis",
    report.trendAnalysis,
  ].join("\n");
}

async function getActor(req) {
  const token = getBearerToken(req);
  if (isAdminRequest(req) || req.headers["x-vercel-cron-secret"]) {
    return { type: "admin", token };
  }

  if (token) {
    const user = await getAuthenticatedSupabaseUser(token);
    if (user) {
      const profile = await getUserProfile(user.id, user.email ?? "");
      const usage = tierUsageForProfile(profile);
      if (usage.resetDailyAt !== profile.reset_daily_at || usage.reportsUsedToday !== profile.reports_used_today) {
        await upsertUserProfile({
          ...profile,
          reports_used_today: usage.reportsUsedToday,
          reset_daily_at: usage.resetDailyAt,
        });
      }
      return { type: "user", token, user, profile, usage };
    }
  }

  return null;
}

async function collectReportDataset(request, config) {
  const eventResult = await getEvents({ limit: Math.max(200, config.geminiReportMaxEvents * 8), offset: 0, scope: "all" });
  const baseEvents = eventResult.events ?? [];
  const enrichedEvents = baseEvents.map((event) => enrichEvent(event, baseEvents));
  const relevantEvents = filterRelevantEvents(enrichedEvents, request, config);
  const latestActivity = relevantEvents[0]?.activityTimestamp ?? enrichedEvents[0]?.activityTimestamp ?? null;
  return {
    eventMode: eventResult.mode,
    totalSignals: enrichedEvents.length,
    relevantEvents,
    latestActivity,
  };
}

function buildSourceSummary(events) {
  const domains = [...new Set(events.flatMap((event) => event.sourceDomains ?? []))];
  return {
    sourceCount: events.reduce((sum, event) => sum + Number(event.sourceCount ?? 0), 0),
    domainCount: domains.length,
    domains,
  };
}

export async function buildSubscriptionStatus(req) {
  const auth = await getActor(req);
  if (!auth || auth.type !== "user") {
    return {
      ok: true,
      authenticated: false,
      checkoutEnabled: false,
      portalEnabled: false,
      profile: null,
      usage: tierUsageForProfile({ subscription_tier: "free", reports_used_today: 0, reset_daily_at: dailyResetIso() }),
      plans: PREMIUM_PLANS,
      badge: "Work in Progress",
      message: REPORTS_WIP_COPY,
    };
  }

  return {
    ok: true,
    authenticated: true,
    checkoutEnabled: false,
    portalEnabled: false,
    profile: auth.profile,
    usage: auth.usage,
    plans: PREMIUM_PLANS,
    badge: "Work in Progress",
    message: REPORTS_WIP_COPY,
  };
}

export async function getReportStatus(req, query = {}) {
  const config = getConfig();
  const actor = await getActor(req);
  const request = sanitizeReportPayload(query);
  const [usage, aiStatus, newsRefresh, aiRefresh, stats, dataset] = await Promise.all([
    getAIUsageStatsBySource("reports"),
    getAIStatus(),
    getRefreshState("news"),
    getRefreshState("ai"),
    getStats(),
    collectReportDataset(request, config),
  ]);

  const remainingToday = Math.max(0, config.geminiReportDailyLimit - usage.totalCalls);
  const matchingSignals = dataset.relevantEvents.length;
  const enoughData = matchingSignals >= config.geminiReportMinEvents;
  const generationAllowed = Boolean(actor) && (actor.type === "admin" || actor.type === "user");
  const reportAiAvailable = config.enableReportAi && aiStatus.configured && remainingToday > 0 && aiStatus.aiRemainingToday > 0;

  return {
    status: 200,
    body: {
      ok: true,
      badge: "Work in Progress",
      message: REPORTS_WIP_COPY,
      authenticated: actor?.type === "user",
      adminUnlocked: actor?.type === "admin",
      generationAllowed,
      aiProvider: REPORT_PROVIDER,
      enableReportAi: config.enableReportAi,
      reportAiAvailable,
      usage: {
        dailyLimit: config.geminiReportDailyLimit,
        usedToday: usage.totalCalls,
        remainingToday,
        resetAt: dailyResetIso(),
        sharedGeminiRemainingToday: aiStatus.aiRemainingToday,
      },
      dataSummary: {
        totalSignals: dataset.totalSignals,
        matchingSignals,
        minimumSignalsRequired: config.geminiReportMinEvents,
        maximumSignalsUsed: config.geminiReportMaxEvents,
        latestSignalFreshness: summarizeFreshnessLabel(dataset.latestActivity),
        latestSignalAt: dataset.latestActivity,
        activeEventCount: stats.activeEventCount ?? 0,
        historicalEventCount: stats.historicalEventCount ?? 0,
        newsFreshness: newsRefresh.record?.metadata?.message?.includes("no new relevant")
          ? "News checked · no new relevant signals"
          : summarizeFreshnessLabel(newsRefresh.record?.lastRefresh ?? null),
        aiFreshness: aiRefresh.record?.lastRefresh
          ? `AI ${summarizeFreshnessLabel(aiRefresh.record.lastRefresh)}`
          : "AI awaiting refresh",
      },
      previewAvailable: enoughData,
      requestDefaults: DEFAULT_REPORT_FORM,
      adminDiagnostics: actor?.type === "admin"
        ? {
            actorType: actor.type,
            reportAiAvailable,
            eventsDataSource: dataset.eventMode,
          }
        : null,
    },
  };
}

export async function generateAlphaReport(req, payload) {
  const config = getConfig();
  const actor = await getActor(req);
  if (!actor) {
    return { status: 401, body: { success: false, error: "Sign in or unlock admin mode to generate reports." } };
  }

  const request = sanitizeReportPayload(payload);
  const [usage, aiStatus, dataset] = await Promise.all([
    getAIUsageStatsBySource("reports"),
    getAIStatus(),
    collectReportDataset(request, config),
  ]);

  const relevantEvents = dataset.relevantEvents;
  if (relevantEvents.length === 0) {
    return {
      status: 200,
      body: {
        ok: false,
        badge: "Work in Progress",
        message: "Not enough relevant signals found for this report. Try a broader region or longer time horizon.",
        report: null,
        usage: {
          dailyLimit: config.geminiReportDailyLimit,
          usedToday: usage.totalCalls,
          remainingToday: Math.max(0, config.geminiReportDailyLimit - usage.totalCalls),
        },
      },
    };
  }

  const fallbackReport = buildRuleBasedReport(request, relevantEvents);
  let report = fallbackReport;
  let aiStatusLabel = "rule_based";
  let statusLabel = "ready";
  let message = "Rule-based preview report generated.";
  let aiModel = null;
  const reportLimitRemaining = Math.max(0, config.geminiReportDailyLimit - usage.totalCalls);
  const canUseGemini =
    config.enableReportAi &&
    aiStatus.configured &&
    reportLimitRemaining > 0 &&
    aiStatus.aiRemainingToday > 0 &&
    relevantEvents.length >= config.geminiReportMinEvents;

  if (canUseGemini) {
    const generated = await generateStrategicReportWithGemini({
      request,
      events: relevantEvents,
      fallbackReport,
    });

    if (generated.ok) {
      report = generated.report;
      aiStatusLabel = "enriched";
      aiModel = generated.aiModel;
      message = "Gemini strategic report generated.";
    } else {
      aiStatusLabel = generated.reason === "gemini_not_configured" ? "rule_based" : "provider_error";
      message = "Gemini report generation was unavailable. Showing rule-based preview report.";
    }
  } else if (!config.enableReportAi || !aiStatus.configured) {
    message = "Gemini report generation is disabled. Showing rule-based preview report.";
  } else if (reportLimitRemaining <= 0) {
    message = "Daily report generation limit reached. Showing rule-based preview report.";
  } else if (aiStatus.aiRemainingToday <= 0) {
    message = "Gemini daily budget is exhausted. Showing rule-based preview report.";
  } else if (relevantEvents.length < config.geminiReportMinEvents) {
    message = "Not enough relevant signals found for a Gemini report. Showing rule-based preview report.";
  }

  const sourceSummary = buildSourceSummary(relevantEvents);
  const persistedReport = {
    id: crypto.randomUUID(),
    user_id: actor.type === "user" ? actor.user.id : null,
    title: report.title,
    region: request.region,
    focus_area: request.focusArea,
    time_horizon: request.timeHorizon,
    audience_type: request.audienceType,
    risk_appetite: request.riskFraming,
    input_question: request.customQuestion || null,
    status: statusLabel,
    content: {
      ...report,
      aiStatus: aiStatusLabel,
      sourceEventCount: relevantEvents.length,
      sourceEventIds: relevantEvents.map((event) => event.id),
      request,
    },
    report_text: composeReportText(report),
    source_event_ids: relevantEvents.map((event) => event.id),
    ai_provider: REPORT_PROVIDER,
    ai_model: aiModel,
    generated_at: report.generatedAt,
    confidence_level: report.confidenceAssessment?.level ?? null,
    favorite: false,
    created_at: new Date().toISOString(),
  };

  await saveUserReport(persistedReport);

  const remainingToday = aiStatusLabel === "enriched"
    ? Math.max(0, reportLimitRemaining - 1)
    : reportLimitRemaining;

  return {
    status: 202,
    body: {
      ok: true,
      badge: "Work in Progress",
      message,
      report: persistedReport,
      usage: {
        dailyLimit: config.geminiReportDailyLimit,
        usedToday: usage.totalCalls + (aiStatusLabel === "enriched" ? 1 : 0),
        remainingToday,
      },
      matchingSignals: relevantEvents.length,
      sourceSummary,
      aiStatus: aiStatusLabel,
    },
  };
}

export async function getReportHistory(req, query = {}) {
  const actor = await getActor(req);
  if (!actor) {
    return {
      status: 200,
      body: {
        ok: true,
        badge: "Work in Progress",
        reports: [],
        watchlists: [],
        usage: null,
      },
    };
  }

  const [history, watchlists, usage] = await Promise.all([
    getUserReports(actor.type === "user" ? actor.user.id : null, {
      limit: Math.min(Number(query.limit ?? 20), 50),
      query: query.q ?? "",
    }),
    actor.type === "user" ? getUserWatchlists(actor.user.id) : Promise.resolve({ watchlists: [] }),
    getAIUsageStatsBySource("reports"),
  ]);

  return {
    status: 200,
    body: {
      ok: true,
      badge: "Work in Progress",
      reports: history.reports,
      watchlists: watchlists.watchlists,
      usage: {
        dailyLimit: getConfig().geminiReportDailyLimit,
        usedToday: usage.totalCalls,
        remainingToday: Math.max(0, getConfig().geminiReportDailyLimit - usage.totalCalls),
      },
    },
  };
}

export async function exportReportPreview(req, reportId) {
  const actor = await getActor(req);
  if (!actor) {
    return { status: 401, body: { success: false, error: "Authentication required" } };
  }

  return {
    status: 501,
    body: {
      success: false,
      error: "Export is not live yet. Use copy-to-clipboard for the alpha workflow.",
      badge: "Work in Progress",
      reportId,
    },
  };
}

export async function captureWaitlistInterest(payload, req) {
  const email = String(payload.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { success: false, error: "Valid email required" } };
  }

  const serializedNote = [
    payload.note ? `Notes: ${String(payload.note).trim()}` : "",
    payload.focusArea ? `Focus area: ${String(payload.focusArea).trim()}` : "",
    payload.intendedUseCase ? `Use case: ${String(payload.intendedUseCase).trim()}` : "",
    payload.linkedinProfile ? `LinkedIn: ${String(payload.linkedinProfile).trim()}` : "",
  ].filter(Boolean).join("\n");

  const saved = await saveWaitlistEntry({
    email,
    interestTier: payload.interestTier ?? "confidential",
    requestedRegion: payload.requestedRegion ?? "Global",
    note: serializedNote,
    source_ip: getClientIp(req),
  });

  if (saved.mode === "supabase" && saved.persisted === false) {
    return {
      status: 503,
      body: {
        success: false,
        error: "We couldn't save your request just now. Please try again shortly.",
      },
    };
  }

  return {
    status: 202,
    body: {
      ok: true,
      message: "Request received. You’re on the early access list for Grigori Reports.",
      brand: BRAND.fullName,
    },
  };
}

export async function getWaitlistAdminEntries(req, query = {}) {
  if (!requireAdmin(req)) {
    return { status: 401, body: { success: false, error: "Unauthorized" } };
  }

  const limit = Math.min(Math.max(Number(query.limit ?? 200), 1), 500);
  const result = await getWaitlistEntries({ limit });

  return {
    status: 200,
    body: {
      ok: true,
      mode: result.mode,
      total: result.entries.length,
      entries: result.entries,
    },
  };
}
