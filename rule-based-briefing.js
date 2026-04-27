import { buildWatchIndicators, buildWhyThisMatters, getEventSourceSignals, inferLocationDetails } from "./event-insights.js";

const SECTOR_RULES = [
  { pattern: /\b(oil|tanker|hormuz|gulf|red sea|shipping|port|freight|strait|suez|maritime)\b/i, sectors: ["Energy", "Shipping"] },
  { pattern: /\b(taiwan|semiconductor|chip|chips|tsmc|semiconductor|fab)\b/i, sectors: ["Tech"] },
  { pattern: /\b(missile|strike|nato|war|drone|troops|naval|military|airstrike|artillery)\b/i, sectors: ["Defense", "Shipping"] },
  { pattern: /\b(sanctions|trade|currency|bank|financial|equity|equities|bond)\b/i, sectors: ["Finance"] },
  { pattern: /\b(grain|food|wheat|crop|fertilizer)\b/i, sectors: ["Food"] },
  { pattern: /\b(export|trade|tariff|customs|shipment)\b/i, sectors: ["Trade"] },
];

const ESCALATION_HINTS = /\b(attack|strike|missile|drone|war|troops|harassment|disrupt|offensive|incursion|escalat|blockade|sanction|crisis|military|naval|mine|seizure)\b/i;
const STABILIZATION_HINTS = /\b(ceasefire|talks|diplom|restraint|contain|stabil|resume|agreement|corridor|reopen|mediat|proposal)\b/i;
const OIL_UP_HINTS = /\b(oil|tanker|hormuz|gulf|red sea|shipping|strait|pipeline|lng|energy)\b/i;
const RISK_OFF_HINTS = /\b(attack|strike|war|shipping|blockade|sanction|drone|missile|offensive|disrupt|energy|tanker|hormuz|red sea|crisis)\b/i;
const RISK_ON_HINTS = /\b(ceasefire|talks|deal|agreement|contained|resume|mediat|stabil)\b/i;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function compactText(text = "") {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCorpus(preEvent, articles) {
  const parts = [
    preEvent.title,
    preEvent.region?.label,
    ...(preEvent.keywords ?? []),
    ...(preEvent.sources ?? []),
    ...articles.flatMap((article) => [article.title, article.summary, article.content]),
  ];

  return compactText(parts.filter(Boolean).join(" "));
}

function inferSectors(preEvent, articles) {
  const text = buildCorpus(preEvent, articles);
  const sectors = new Set();

  for (const rule of SECTOR_RULES) {
    if (rule.pattern.test(text)) {
      rule.sectors.forEach((sector) => sectors.add(sector));
    }
  }

  if (sectors.size === 0) {
    sectors.add("Defense");
  }

  return [...sectors].filter((sector) => sector !== "Trade");
}

function inferTone(preEvent, articles) {
  const text = buildCorpus(preEvent, articles);
  const escalationCount = (text.match(new RegExp(ESCALATION_HINTS.source, "gi")) ?? []).length;
  const stabilizationCount = (text.match(new RegExp(STABILIZATION_HINTS.source, "gi")) ?? []).length;

  if (stabilizationCount >= escalationCount + 2) return "De-escalating";
  if (escalationCount >= stabilizationCount + 1) return "Escalating";
  return preEvent.confidence === "High" ? "Stable" : "Stable";
}

function inferConfidence(preEvent, articles) {
  const sourceCount = new Set(preEvent.sources ?? []).size;
  if (sourceCount >= 4 || articles.length >= 4) return "High";
  if (sourceCount >= 2 || articles.length >= 2) return "Medium";
  return preEvent.confidence ?? "Low";
}

function inferOilImpact(preEvent, articles, tone) {
  const text = buildCorpus(preEvent, articles);
  if (OIL_UP_HINTS.test(text) && tone === "Escalating") return "Up";
  if (RISK_ON_HINTS.test(text) && !OIL_UP_HINTS.test(text)) return "Neutral";
  return "Neutral";
}

function inferMarkets(preEvent, articles, tone) {
  const text = buildCorpus(preEvent, articles);
  if (tone === "Escalating" && RISK_OFF_HINTS.test(text)) return "Risk-off";
  if (RISK_ON_HINTS.test(text) && tone !== "Escalating") return "Risk-on";
  return "Neutral";
}

function sentenceCase(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildDevelopments(preEvent, articles, locationLabel) {
  const directDevelopments = [];
  for (const article of articles.slice(0, 5)) {
    const source = article.source ? `${article.source}: ` : "";
    const summary = compactText(article.summary || article.content || article.title);
    if (!summary) continue;
    directDevelopments.push(`${source}${sentenceCase(summary).replace(/[.!?]+$/, "")}.`);
  }

  const keywordLine = (preEvent.keywords ?? []).slice(0, 4).join(", ");
  if (keywordLine) {
    directDevelopments.push(`Signal cluster centred on ${locationLabel} with recurring themes: ${keywordLine}.`);
  }

  return unique(directDevelopments).slice(0, 3);
}

function buildSummary(preEvent, locationLabel, tone, confidence, sectors, markets, articles) {
  const headline = sentenceCase(preEvent.title.replace(/[.!?]+$/, ""));
  const sourceCount = new Set(preEvent.sources ?? []).size || Math.max(articles.length, 1);
  const sectorText = sectors.slice(0, 3).join(", ");
  const marketLine = markets === "Risk-off"
    ? "Market conditions skew defensive around the story."
    : markets === "Risk-on"
      ? "Market conditions look more contained around the story."
      : "Market signals remain balanced for now.";

  return `${headline} is driving a ${tone.toLowerCase()} signal cluster around ${locationLabel}, backed by ${sourceCount} source signal${sourceCount === 1 ? "" : "s"} and ${confidence.toLowerCase()} confidence. ${sectorText ? `${sectorText} exposure stands out. ` : ""}${marketLine}`;
}

function buildScenarioDescription(kind, locationLabel, sectors, tone) {
  if (kind === "escalation") {
    return `Pressure intensifies around ${locationLabel}, keeping transport, energy, and security exposure elevated while operators price in further disruption.`;
  }

  return `Diplomatic or operational containment around ${locationLabel} stabilizes the headline, reducing near-term disruption risk while keeping core monitoring in place.`;
}

function buildScenarioProbabilities(preEvent, tone, confidence, locationConfidence, articles = []) {
  const text = buildCorpus(preEvent, articles);
  const sourceCount = new Set(preEvent.sources ?? []).size || Math.max(1, articles.length);
  let escalation = tone === "Escalating" ? 40 : tone === "Deteriorating" ? 45 : tone === "Volatile" ? 35 : tone === "De-escalating" ? 20 : 28;
  let deescalation = tone === "De-escalating" ? 40 : STABILIZATION_HINTS.test(text) ? 30 : 20;
  let base = 100 - escalation - deescalation;

  if (/\b(hormuz|red sea|black sea|taiwan strait|suez|tankers?|naval|military|missile|drone)\b/i.test(text)) escalation += 10;
  if (/\b(talks|proposal|ceasefire|mediation|reopen|meeting|dialogue)\b/i.test(text)) deescalation += 10;
  if (sourceCount <= 1 || confidence === "Low") base += 10;
  if (locationConfidence === "Low") base += 5;
  if (sourceCount >= 4 && confidence === "High") base -= 5;

  escalation = Math.max(15, Math.min(60, Math.round(escalation / 5) * 5));
  deescalation = Math.max(15, Math.min(45, Math.round(deescalation / 5) * 5));
  base = 100 - escalation - deescalation;

  if (base < 20) {
    const deficit = 20 - base;
    if (escalation >= deescalation) escalation -= deficit;
    else deescalation -= deficit;
    base = 20;
  }

  return { deescalation, base, escalation };
}

function buildScenarios(preEvent, locationLabel, tone, sectors, oilImpact, marketsImpact, confidence, locationConfidence, articles = []) {
  const tradeRoutesImpact = sectors.includes("Shipping") || sectors.includes("Trade")
    ? (tone === "Escalating" || tone === "Deteriorating" ? "Disrupted" : "Stressed")
    : "Neutral";
  const probabilities = buildScenarioProbabilities(preEvent, tone, confidence, locationConfidence, articles);

  return [
    {
      name: "De-escalation / Containment",
      probability: probabilities.deescalation,
      description: buildScenarioDescription("stabilization", locationLabel, sectors, tone),
      triggers: ["Diplomatic engagement gains traction", "Operational restraint from primary actors", "No new corroborated escalation signals"],
      impact: {
        oil: "Neutral",
        markets: tone === "De-escalating" ? "Risk-on" : "Neutral",
        sectors: sectors.filter((sector, index) => index < 3),
        tradeRoutes: sectors.includes("Shipping") ? "Stressed" : "Neutral",
        regionalStability: "Improving",
      },
    },
    {
      name: "Base case / Continuation",
      probability: probabilities.base,
      description: `The current signal set around ${locationLabel} persists without decisive escalation or settlement, leaving operators pricing sustained friction and headline risk.`,
      triggers: ["Incremental official statements", "No decisive military or diplomatic break", "Market reaction remains contained but watchful"],
      impact: {
        oil: oilImpact === "Up" ? "Up" : "Neutral",
        markets: marketsImpact,
        sectors,
        tradeRoutes: tradeRoutesImpact === "Disrupted" ? "Stressed" : tradeRoutesImpact,
        regionalStability: "Fragile",
      },
    },
    {
      name: "Escalation / Disruption",
      probability: probabilities.escalation,
      description: buildScenarioDescription("escalation", locationLabel, sectors, tone),
      triggers: ["Follow-on military or security incidents", "More severe shipping or infrastructure disruption", "Hardening official rhetoric or force posture"],
      impact: {
        oil: oilImpact === "Up" ? "Up" : "Neutral",
        markets: marketsImpact === "Risk-off" ? "Risk-off" : "Neutral",
        sectors,
        tradeRoutes: tradeRoutesImpact,
        regionalStability: "Deteriorating",
      },
    },
  ];
}

function buildAssessment(preEvent, locationLabel, tone, confidence, sectors, sourceSignals) {
  const direction = tone === "De-escalating"
    ? "The current signal points to a contained but still important development."
    : tone === "Stable"
      ? "The current signal is material but not yet decisive."
      : "The current signal points to elevated near-term geopolitical friction.";
  return `${direction} Around ${locationLabel}, the event has relevance for ${sectors.slice(0, 3).join(", ").toLowerCase()} exposure and should be read as a directional risk signal rather than a settled outcome. Confidence is ${confidence.toLowerCase()}, supported by ${sourceSignals.sourceCount} source signal${sourceSignals.sourceCount === 1 ? "" : "s"} across ${sourceSignals.independentDomainCount} independent domain${sourceSignals.independentDomainCount === 1 ? "" : "s"}.`;
}

function buildConfidenceRationale(preEvent, confidence, location, sourceSignals, articles = []) {
  const recencyHours = Math.max(0, (Date.now() - new Date(preEvent.timestamp ?? Date.now()).getTime()) / 3600_000);
  const recency = recencyHours <= 2 ? "reported within 2h" : recencyHours <= 12 ? `reported within ${Math.ceil(recencyHours)}h` : `reported around ${Math.ceil(recencyHours)}h ago`;
  return `${confidence} confidence: ${sourceSignals.sourceCount} sources, ${sourceSignals.independentDomainCount} independent domains, ${sourceSignals.corroborationLabel.toLowerCase()}, ${recency}, and ${location.confidence.toLowerCase()} location confidence. ${articles.length <= 1 ? "Evidence remains narrow and should be treated cautiously." : "Corroboration is sufficient for a directional assessment, but uncertainty remains."}`;
}

function buildMarketImpactSummary(preEvent, sectors, oilImpact, marketsImpact, scenarios) {
  return {
    oil: oilImpact,
    shipping: scenarios.some((scenario) => /Shipping/.test((scenario.impact?.sectors ?? []).join(" "))) ? (scenarios.some((scenario) => scenario.impact?.tradeRoutes === "Disrupted") ? "Stressed" : "Watch") : "Neutral",
    defense: sectors.includes("Defense") ? (preEvent.confidence === "High" ? "Supported" : "Watch") : "Neutral",
    tech: sectors.includes("Tech") || sectors.includes("Semiconductors") ? "Sensitive" : "Neutral",
    equities: marketsImpact,
    summary: marketsImpact === "Risk-off"
      ? "The signal tilts toward defensive market conditions, with transport and energy sensitivity most relevant."
      : marketsImpact === "Risk-on"
        ? "Market spillover looks contained for now, though exposed sectors still warrant monitoring."
        : "Market impact is directional rather than decisive at this stage.",
  };
}

export function buildRuleBasedBriefing(preEvent, articles = []) {
  const inferredLocation = inferLocationDetails({
    ...preEvent,
    location: preEvent.region,
    summary: articles.map((article) => article.summary ?? article.content ?? "").join(" "),
  }, articles);
  const locationLabel = inferredLocation.label ?? "the affected region";
  const sectors = inferSectors(preEvent, articles);
  const tone = inferTone(preEvent, articles);
  const confidence = inferConfidence(preEvent, articles);
  const oilImpact = inferOilImpact(preEvent, articles, tone);
  const marketsImpact = inferMarkets(preEvent, articles, tone);
  const developments = buildDevelopments(preEvent, articles, locationLabel);
  const sourceSignals = getEventSourceSignals({
    sources: preEvent.sources,
    articleIds: preEvent.articleIds,
  });
  const scenarios = buildScenarios(preEvent, locationLabel, tone, sectors, oilImpact, marketsImpact, confidence, inferredLocation.confidence, articles);
  const whyThisMatters = buildWhyThisMatters({
    ...preEvent,
    location: inferredLocation,
    summary: buildSummary(preEvent, locationLabel, tone, confidence, sectors, marketsImpact, articles),
    scenarios,
  });
  const watchIndicators = buildWatchIndicators({
    ...preEvent,
    location: inferredLocation,
    summary: buildSummary(preEvent, locationLabel, tone, confidence, sectors, marketsImpact, articles),
  }).slice(0, 6);

  return {
    title: preEvent.title,
    summary: buildSummary(preEvent, locationLabel, tone, confidence, sectors, marketsImpact, articles),
    assessment: buildAssessment(preEvent, locationLabel, tone, confidence, sectors, sourceSignals),
    developments: developments.length > 0
      ? developments
      : [`Rule-based briefing generated from source signals around ${locationLabel}.`],
    tone,
    confidence,
    location: inferredLocation,
    whyThisMatters: Array.isArray(whyThisMatters) ? whyThisMatters : [whyThisMatters],
    watchIndicators: watchIndicators,
    watchIndicators72h: watchIndicators,
    scenarios,
    confidenceRationale: buildConfidenceRationale(preEvent, confidence, inferredLocation, sourceSignals, articles),
    marketImpact: buildMarketImpactSummary(preEvent, sectors, oilImpact, marketsImpact, scenarios),
    sourceAssessment: {
      sourceCount: sourceSignals.sourceCount,
      corroborationLevel: sourceSignals.corroborationLabel,
      limitations: sourceSignals.sourceCount <= 1
        ? "Single-source or lightly corroborated reporting limits confidence."
        : "Open-source reporting can lag operational reality and may omit classified or commercial context.",
    },
    generationMethod: "rule-based",
  };
}
