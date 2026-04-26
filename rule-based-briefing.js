import { buildWatchIndicators, buildWhyThisMatters, inferLocationDetails } from "./event-insights.js";

const SECTOR_RULES = [
  { pattern: /\b(oil|tanker|hormuz|gulf|red sea|shipping|port|freight|strait|suez|maritime)\b/i, sectors: ["Energy", "Shipping"] },
  { pattern: /\b(taiwan|semiconductor|chip|chips|tsmc|semiconductor|fab)\b/i, sectors: ["Tech"] },
  { pattern: /\b(missile|strike|nato|war|drone|troops|naval|military|airstrike|artillery)\b/i, sectors: ["Defense", "Shipping"] },
  { pattern: /\b(sanctions|trade|currency|bank|financial|equity|equities|bond)\b/i, sectors: ["Finance"] },
  { pattern: /\b(grain|food|wheat|crop|fertilizer)\b/i, sectors: ["Food"] },
  { pattern: /\b(export|trade|tariff|customs|shipment)\b/i, sectors: ["Trade"] },
];

const ESCALATION_HINTS = /\b(attack|strike|missile|drone|war|troops|harassment|disrupt|offensive|incursion|escalat|blockade|sanction|crisis|military|naval)\b/i;
const STABILIZATION_HINTS = /\b(ceasefire|talks|diplom|restraint|contain|stabil|resume|agreement|corridor|reopen|mediat)\b/i;
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

function buildScenarios(preEvent, locationLabel, tone, sectors, oilImpact, marketsImpact) {
  const escalationProbability = tone === "Escalating" ? 62 : tone === "De-escalating" ? 38 : 52;
  const stabilizationProbability = 100 - escalationProbability;
  const stabilizedMarkets = tone === "De-escalating" ? "Risk-on" : "Neutral";
  const tradeRoutesImpact = sectors.includes("Shipping") || sectors.includes("Trade")
    ? (tone === "Escalating" ? "Disrupted" : "Stressed")
    : "Neutral";

  return [
    {
      name: "Escalation / Disruption",
      probability: escalationProbability,
      description: buildScenarioDescription("escalation", locationLabel, sectors, tone),
      impact: {
        oil: oilImpact === "Up" ? "Up" : "Neutral",
        markets: marketsImpact === "Risk-off" ? "Risk-off" : "Neutral",
        tradeRoutes: tradeRoutesImpact,
        sectors,
      },
    },
    {
      name: "Stabilization / Containment",
      probability: stabilizationProbability,
      description: buildScenarioDescription("stabilization", locationLabel, sectors, tone),
      impact: {
        oil: "Neutral",
        markets: stabilizedMarkets,
        tradeRoutes: sectors.includes("Shipping") ? "Stressed" : "Neutral",
        sectors: sectors.filter((sector, index) => index < 3),
      },
    },
  ];
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

  return {
    title: preEvent.title,
    summary: buildSummary(preEvent, locationLabel, tone, confidence, sectors, marketsImpact, articles),
    developments: developments.length > 0
      ? developments
      : [`Rule-based briefing generated from source signals around ${locationLabel}.`],
    tone,
    confidence,
    location: inferredLocation,
    whyThisMatters: buildWhyThisMatters({
      ...preEvent,
      location: inferredLocation,
      summary: buildSummary(preEvent, locationLabel, tone, confidence, sectors, marketsImpact, articles),
      scenarios: buildScenarios(preEvent, locationLabel, tone, sectors, oilImpact, marketsImpact),
    }),
    watchIndicators72h: buildWatchIndicators({
      ...preEvent,
      location: inferredLocation,
      summary: buildSummary(preEvent, locationLabel, tone, confidence, sectors, marketsImpact, articles),
    }).slice(0, 5),
    scenarios: buildScenarios(preEvent, locationLabel, tone, sectors, oilImpact, marketsImpact),
    generationMethod: "rule-based",
  };
}
