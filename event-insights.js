const SOURCE_TRUST_RULES = [
  { pattern: /reuters|apnews|associated press|bbc|financial times|wsj|wall street journal|bloomberg/i, score: 0.95 },
  { pattern: /aljazeera|economist|guardian|ft\.com|nytimes|washington post|dw|france24/i, score: 0.85 },
  { pattern: /newswire|newsdata|currents|xinhuanet|cnbc|cnn|npr|sky/i, score: 0.72 },
];

export function normalizeSourceName(source) {
  const raw = String(source ?? "").trim();
  if (!raw) return "Unknown";

  try {
    const url = raw.startsWith("http") ? new URL(raw) : null;
    if (url) {
      return url.hostname.replace(/^www\./, "");
    }
  } catch {
    // fall through
  }

  return raw
    .replace(/^www\./i, "")
    .replace(/\?.*$/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getSourceTrustScore(source) {
  const name = normalizeSourceName(source);
  const match = SOURCE_TRUST_RULES.find((rule) => rule.pattern.test(name));
  return match?.score ?? 0.58;
}

export function getEventSourceSignals(event) {
  const uniqueSources = [...new Set((event.sources ?? []).map(normalizeSourceName).filter(Boolean))];
  const sourceCount = uniqueSources.length || Math.max(1, (event.articleIds ?? []).length || 0);
  const trustScores = uniqueSources.map(getSourceTrustScore);
  const corroboratedCount = trustScores.filter((score) => score >= 0.75).length || Math.min(1, sourceCount);
  const averageTrust = trustScores.length > 0
    ? trustScores.reduce((sum, score) => sum + score, 0) / trustScores.length
    : 0.58;

  return {
    uniqueSources,
    sourceCount,
    corroboratedCount,
    averageTrust,
    trustLabel: averageTrust >= 0.85 ? "High" : averageTrust >= 0.7 ? "Medium" : "Low",
  };
}

export function explainConfidence(event) {
  const signals = getEventSourceSignals(event);
  const level = event.confidence ?? "Low";
  if (level === "High") {
    return `High confidence: ${signals.corroboratedCount} corroborated source${signals.corroboratedCount === 1 ? "" : "s"} with strong source trust.`;
  }
  if (level === "Medium") {
    return `Medium confidence: ${signals.sourceCount} source signals with partial corroboration.`;
  }
  return `Low confidence: early or thin reporting, monitor for stronger corroboration.`;
}

export function deriveRiskLevel(event) {
  const score = Number(event.priorityScore ?? event.importanceScore ?? 0);
  if (score >= 78) return "Critical";
  if (score >= 58) return "High";
  if (score >= 38) return "Watch";
  return "Low";
}

export function getOneLineSummary(event) {
  const summary = String(event.summary ?? "").trim();
  if (summary) {
    const firstSentence = summary.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence) return firstSentence;
    return summary;
  }

  const firstDevelopment = event.developments?.[0];
  if (firstDevelopment) return firstDevelopment;
  return "Monitoring for material developments.";
}

export function getMarketImpactTags(event) {
  const tags = new Set();
  for (const scenario of event.scenarios ?? []) {
    const impact = scenario.impact ?? {};
    if (impact.oil === "Up") tags.add("Oil Up");
    if (impact.oil === "Down") tags.add("Oil Down");
    if (impact.markets === "Risk-off") tags.add("Equities Risk-off");
    if (impact.markets === "Risk-on") tags.add("Equities Risk-on");
    if (impact.tradeRoutes === "Disrupted") tags.add("Shipping Risk");
    for (const sector of impact.sectors ?? []) {
      tags.add(sector);
    }
  }

  return [...tags].slice(0, 4);
}

export function computeFreshnessScore(timestamp) {
  const ageHours = Math.max(0, (Date.now() - new Date(timestamp ?? Date.now()).getTime()) / 3600_000);
  if (ageHours <= 6) return 40;
  if (ageHours <= 24) return 32;
  if (ageHours <= 72) return 22;
  if (ageHours <= 24 * 7) return 12;
  return 4;
}

export function deriveImportance(event) {
  const base = Number(event.importanceScore ?? event.priorityScore ?? 0);
  if (base > 0) return base;

  let score = 10;
  if (event.tone === "Escalating") score += 20;
  if (event.confidence === "High") score += 16;
  else if (event.confidence === "Medium") score += 10;
  const signals = getEventSourceSignals(event);
  score += Math.min(18, signals.sourceCount * 4);
  score += Math.round(signals.averageTrust * 16);
  return score;
}

export function rankBriefingEvents(events, limit = 5) {
  return [...events]
    .map((event) => {
      const importance = deriveImportance(event);
      const freshness = computeFreshnessScore(event.timestamp);
      return {
        ...event,
        briefingScore: importance + freshness,
      };
    })
    .sort((a, b) => b.briefingScore - a.briefingScore)
    .slice(0, limit);
}

export function buildBriefing(events) {
  const ranked = rankBriefingEvents(events, 5);
  return {
    generatedAt: new Date().toISOString(),
    items: ranked.map((event) => ({
      id: event.id,
      title: event.title ?? "Untitled Event",
      summary: getOneLineSummary(event),
      riskLevel: deriveRiskLevel(event),
      marketImpactTags: getMarketImpactTags(event),
      importanceScore: deriveImportance(event),
      freshnessScore: computeFreshnessScore(event.timestamp),
      timestamp: event.timestamp,
      location: event.location ?? null,
    })),
  };
}

function accumulateEventImpact(event) {
  let oil = 0;
  let shipping = 0;
  let defense = 0;
  let tech = 0;
  let equities = 0;

  for (const scenario of event.scenarios ?? []) {
    const probabilityWeight = Math.max(0, Number(scenario.probability ?? 0)) / 100;
    const impact = scenario.impact ?? {};

    if (impact.oil === "Up") oil += 1.2 * probabilityWeight;
    if (impact.oil === "Down") oil -= 0.7 * probabilityWeight;
    if (impact.tradeRoutes === "Disrupted") shipping += 1.1 * probabilityWeight;
    if ((impact.sectors ?? []).includes("Shipping")) shipping += 0.8 * probabilityWeight;
    if ((impact.sectors ?? []).includes("Defense")) defense += 1.0 * probabilityWeight;
    if ((impact.sectors ?? []).includes("Tech")) tech += 1.0 * probabilityWeight;
    if (impact.markets === "Risk-off") equities -= 1.1 * probabilityWeight;
    if (impact.markets === "Risk-on") equities += 0.8 * probabilityWeight;
  }

  return { oil, shipping, defense, tech, equities };
}

function toTrafficLight(score) {
  if (score >= 1.15) return "red";
  if (score >= 0.45) return "amber";
  if (score <= -0.45) return "green";
  return "neutral";
}

export function aggregateMarketImpact(events) {
  const totals = { oil: 0, shipping: 0, defense: 0, tech: 0, equities: 0 };
  for (const event of events) {
    const eventImpact = accumulateEventImpact(event);
    totals.oil += eventImpact.oil;
    totals.shipping += eventImpact.shipping;
    totals.defense += eventImpact.defense;
    totals.tech += eventImpact.tech;
    totals.equities += eventImpact.equities;
  }

  return {
    oil: { label: "Oil", score: totals.oil, level: toTrafficLight(Math.abs(totals.oil)), trend: totals.oil >= 0 ? "Up" : "Down" },
    shipping: { label: "Shipping", score: totals.shipping, level: toTrafficLight(totals.shipping), trend: totals.shipping >= 0.45 ? "Stressed" : "Stable" },
    defense: { label: "Defense", score: totals.defense, level: toTrafficLight(totals.defense), trend: totals.defense >= 0.45 ? "Supported" : "Neutral" },
    tech: { label: "Tech", score: totals.tech, level: toTrafficLight(totals.tech), trend: totals.tech >= 0.45 ? "Sensitive" : "Neutral" },
    equities: {
      label: "Equities sentiment",
      score: totals.equities,
      level: totals.equities <= -1.0 ? "red" : totals.equities < -0.3 ? "amber" : totals.equities >= 0.5 ? "green" : "neutral",
      trend: totals.equities <= -0.3 ? "Risk-off" : totals.equities >= 0.5 ? "Risk-on" : "Neutral",
    },
  };
}

export function filterEventsByTimeWindow(events, hours, sliderPercent = 100) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const newest = Math.max(...events.map((event) => new Date(event.timestamp ?? Date.now()).getTime()));
  const windowStart = newest - hours * 3600_000;
  const cutoff = windowStart + (Math.max(0, Math.min(100, sliderPercent)) / 100) * (newest - windowStart);

  return events.filter((event) => {
    const eventTime = new Date(event.timestamp ?? Date.now()).getTime();
    return eventTime >= windowStart && eventTime <= cutoff;
  });
}

export function eventMatchesWatchlist(event, watchlist) {
  const regions = watchlist?.regions ?? [];
  const topics = watchlist?.topics ?? [];
  const haystack = `${event.title ?? ""} ${(event.summary ?? "")} ${(event.location?.label ?? "")} ${((event.keywords ?? []).join(" "))}`.toLowerCase();

  const regionMatch = regions.find((region) =>
    String(event.location?.label ?? "").toLowerCase().includes(region.toLowerCase())
  );
  const topicMatch = topics.find((topic) => haystack.includes(topic.toLowerCase()));

  return {
    matched: Boolean(regionMatch || topicMatch),
    regionMatch: regionMatch ?? null,
    topicMatch: topicMatch ?? null,
  };
}
