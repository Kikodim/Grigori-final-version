const SOURCE_TRUST_RULES = [
  { pattern: /reuters|apnews|associated press|bbc|financial times|wsj|wall street journal|bloomberg/i, score: 0.95 },
  { pattern: /aljazeera|economist|guardian|ft\.com|nytimes|washington post|dw|france24/i, score: 0.85 },
  { pattern: /newswire|newsdata|currents|xinhuanet|cnbc|cnn|npr|sky/i, score: 0.72 },
];

const REGION_UNDER_REVIEW = "Region under review";
const UNKNOWN_LABELS = new Set(["unknown region", "unknown", "n/a", ""]);
const STRATEGIC_REGIONS = [
  { label: "Strait of Hormuz", lat: 26.6, lng: 56.3, keywords: ["hormuz", "gulf", "iran", "tanker", "irgc", "oman"] },
  { label: "Yemen / Red Sea", lat: 15.6, lng: 48.5, keywords: ["red sea", "houthi", "aden", "bab el-mandeb", "yemen", "suez"] },
  { label: "Taiwan Strait", lat: 24.5, lng: 122, keywords: ["taiwan", "pla", "tsmc", "taipei", "median line", "semiconductor"] },
  { label: "Black Sea", lat: 44.8, lng: 33.5, keywords: ["black sea", "odesa", "crimea", "grain corridor", "ukraine", "sevastopol"] },
  { label: "South China Sea", lat: 12.5, lng: 114.2, keywords: ["spratly", "paracel", "south china sea", "philippines", "manila", "beijing"] },
  { label: "Balkans", lat: 43.7, lng: 20.8, keywords: ["balkans", "bosnia", "serbia", "kosovo", "montenegro", "north macedonia"] },
  { label: "Baltic Sea", lat: 57, lng: 24, keywords: ["baltic", "finland", "sweden", "gotland", "estonia", "latvia", "lithuania"] },
  { label: "Middle East", lat: 29.4, lng: 47.9, keywords: ["middle east", "gulf", "israel", "gaza", "lebanon", "syria", "saudi"] },
  { label: "Russia / Ukraine", lat: 49, lng: 32, keywords: ["ukraine", "russia", "donbas", "kharkiv", "kyiv", "moscow"] },
  { label: "Sudan", lat: 15.6, lng: 32.5, keywords: ["sudan", "khartoum", "rsf", "omdurman"] },
  { label: "Sahel", lat: 15.5, lng: 2.1, keywords: ["sahel", "mali", "gao", "niger", "burkina"] },
  { label: "Kashmir", lat: 34.5, lng: 74.3, keywords: ["kashmir", "loc", "india", "pakistan", "srinagar"] },
];

const WHY_THIS_MATTERS_RULES = [
  { pattern: /\b(hormuz|strait of hormuz)\b/i, text: "This matters because the Strait of Hormuz is a key oil transit chokepoint." },
  { pattern: /\b(taiwan|tsmc|semiconductor|chip)\b/i, text: "This matters because Taiwan-related instability can affect semiconductor supply chains and technology markets." },
  { pattern: /\b(red sea|houthi|suez|bab el-mandeb|shipping)\b/i, text: "This matters because Red Sea disruptions can raise shipping costs, insurance premiums, and delivery times." },
  { pattern: /\b(black sea|odesa|grain corridor|grain)\b/i, text: "This matters because Black Sea disruptions can affect grain exports, freight insurance, and regional security signaling." },
  { pattern: /\b(nato|baltic|eu|european union)\b/i, text: "This matters because allied signaling and European security commitments can widen the economic and military consequences." },
  { pattern: /\b(sanctions|currency|equit|bank|bond|trade)\b/i, text: "This matters because sanctions and financial frictions can spill into trade, funding conditions, and market sentiment." },
];

const WATCH_INDICATOR_RULES = [
  {
    pattern: /\b(hormuz|gulf|iran|tanker)\b/i,
    indicators: [
      "Tanker diversions and AIS route changes",
      "War-risk insurance premium spikes",
      "Naval escort or convoy announcements",
      "Oil price gaps and refinery risk hedging",
      "Statements from Iran, the US, and Gulf states",
    ],
  },
  {
    pattern: /\b(taiwan|pla|tsmc|semiconductor)\b/i,
    indicators: [
      "PLA sortie counts and naval exercise tempo",
      "Semiconductor export or fab disruption warnings",
      "US, Japan, and Taiwan official statements",
      "Shipping or airspace advisories near the strait",
      "Carrier or coast guard posture changes",
    ],
  },
  {
    pattern: /\b(ukraine|black sea|odesa|grain corridor)\b/i,
    indicators: [
      "Port strike reporting and satellite imagery",
      "Grain corridor or shipping lane announcements",
      "Insurance repricing by maritime underwriters",
      "NATO and Turkey signaling on maritime security",
      "Commercial vessel delays or rerouting notices",
    ],
  },
  {
    pattern: /\b(red sea|houthi|suez|yemen)\b/i,
    indicators: [
      "Rerouting announcements from major carriers",
      "Container shipping delay and freight-rate signals",
      "Houthi attack claims or interception reports",
      "Naval convoy or escort posture changes",
      "Freight and insurance price movement",
    ],
  },
  {
    pattern: /\b(balkans|kosovo|serbia|bosnia)\b/i,
    indicators: [
      "Election instability and protest escalation",
      "Energy grid stress or sabotage reports",
      "NATO and EU diplomatic signaling",
      "Border incidents or force-mobilization claims",
      "Transport disruption around key crossings",
    ],
  },
];

export const DECISION_LENSES = [
  {
    id: "global_risk",
    label: "Global Risk",
    description: "Broad geopolitical escalation and strategic spillover.",
    keywords: ["conflict", "strike", "missile", "drone", "naval", "shipping", "sanctions", "nato", "iran", "taiwan", "ukraine"],
    sectors: ["Defense", "Shipping", "Energy", "Finance", "Tech"],
    emphasis: ["shipping", "oil", "equities", "defense"],
  },
  {
    id: "investor",
    label: "Investor",
    description: "Market-sensitive events and macro spillover signals.",
    keywords: ["equities", "sanctions", "currency", "trade", "inflation", "oil", "shipping", "semiconductor", "supply"],
    sectors: ["Finance", "Energy", "Shipping", "Tech"],
    emphasis: ["equities", "oil", "tech", "shipping"],
  },
  {
    id: "energy",
    label: "Energy",
    description: "Oil, gas, chokepoints, sanctions, and energy infrastructure.",
    keywords: ["hormuz", "oil", "gas", "lng", "pipeline", "red sea", "tanker", "sanctions", "refinery"],
    sectors: ["Energy", "Shipping", "Defense"],
    emphasis: ["oil", "shipping", "defense"],
  },
  {
    id: "shipping",
    label: "Shipping",
    description: "Maritime routes, freight, insurance, and port disruption.",
    keywords: ["shipping", "freight", "port", "suez", "red sea", "hormuz", "container", "insurance", "rerouting"],
    sectors: ["Shipping", "Energy", "Defense", "Trade"],
    emphasis: ["shipping", "oil", "equities"],
  },
  {
    id: "tech_semiconductors",
    label: "Tech / Semiconductors",
    description: "Taiwan, semiconductors, export controls, cyber, and rare earths.",
    keywords: ["taiwan", "semiconductor", "chip", "tsmc", "export control", "cyber", "rare earth", "fab"],
    sectors: ["Tech", "Semiconductors", "Defense", "Shipping"],
    emphasis: ["tech", "equities", "shipping"],
  },
  {
    id: "defense",
    label: "Defense",
    description: "Military posture, alliance signaling, and escalation risk.",
    keywords: ["nato", "missile", "drone", "strike", "naval", "carrier", "exercise", "air defense", "article 4"],
    sectors: ["Defense", "Shipping", "Energy"],
    emphasis: ["defense", "shipping", "oil"],
  },
  {
    id: "eu_balkans",
    label: "EU / Balkans",
    description: "European security, energy, migration, and regional instability.",
    keywords: ["eu", "europe", "balkans", "bosnia", "serbia", "kosovo", "nato", "migration", "grid", "baltic"],
    sectors: ["Defense", "Energy", "Finance", "Shipping"],
    emphasis: ["defense", "equities", "shipping"],
  },
];

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function sentenceCase(text) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function compactText(text = "") {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value) {
  return compactText(value).toLowerCase();
}

function buildCorpus(eventLike, articles = []) {
  const parts = [
    eventLike.title,
    eventLike.summary,
    eventLike.location?.label,
    ...(eventLike.keywords ?? []),
    ...(eventLike.sources ?? []),
    ...(eventLike.articleIds ?? []),
    ...articles.flatMap((article) => [article.title, article.summary, article.content, article.url]),
  ];
  return compactText(parts.join(" ")).toLowerCase();
}

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

export function getSourceDomains(event) {
  const urlDomains = (event.articleIds ?? [])
    .map((item) => {
      try {
        return new URL(item).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return unique([
    ...(event.sourceDomains ?? []),
    ...urlDomains,
    ...(event.sources ?? []).map(normalizeSourceName),
  ]);
}

export function getEventSourceSignals(event) {
  const uniqueSources = getSourceDomains(event);
  const sourceCount = uniqueSources.length || Math.max(1, (event.articleIds ?? []).length || 0);
  const trustScores = uniqueSources.map(getSourceTrustScore);
  const corroboratedCount = trustScores.filter((score) => score >= 0.75).length || Math.min(1, sourceCount);
  const averageTrust = trustScores.length > 0
    ? trustScores.reduce((sum, score) => sum + score, 0) / trustScores.length
    : 0.58;
  const corroborationLabel = sourceCount >= 4 && corroboratedCount >= 3
    ? "High corroboration"
    : sourceCount >= 2
      ? "Mixed corroboration"
      : "Limited corroboration";

  return {
    uniqueSources,
    sourceCount,
    corroboratedCount,
    independentDomainCount: uniqueSources.length,
    averageTrust,
    trustLabel: averageTrust >= 0.85 ? "High" : averageTrust >= 0.7 ? "Medium" : "Low",
    corroborationLabel,
  };
}

export function inferLocationDetails(input, articles = []) {
  const eventLike = input ?? {};
  const existing = eventLike.location ?? eventLike.region ?? {};
  const existingLabel = String(existing.label ?? "").trim();
  const corpus = buildCorpus(eventLike, articles);
  const ranked = STRATEGIC_REGIONS
    .map((region) => ({
      region,
      hits: region.keywords.filter((keyword) => corpus.includes(keyword)).length,
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  if (existingLabel && !UNKNOWN_LABELS.has(existingLabel.toLowerCase())) {
    const matchingRegion = STRATEGIC_REGIONS.find((region) => region.label.toLowerCase() === existingLabel.toLowerCase());
    const bestInferred = ranked[0] ?? null;
    const existingHits = matchingRegion
      ? matchingRegion.keywords.filter((keyword) => corpus.includes(keyword)).length
      : 0;
    const shouldOverrideExisting = Boolean(
      bestInferred &&
      bestInferred.region.label.toLowerCase() !== existingLabel.toLowerCase() &&
      bestInferred.hits >= Math.max(2, existingHits + 1) &&
      String(existing.confidence ?? "Low") !== "High"
    );

    if (shouldOverrideExisting) {
      return {
        label: bestInferred.region.label,
        lat: bestInferred.region.lat,
        lng: bestInferred.region.lng,
        confidence: bestInferred.hits >= 3 ? "High" : "Medium",
        reason: `Location refined from stronger repeated context keywords: ${bestInferred.region.keywords.filter((keyword) => corpus.includes(keyword)).slice(0, 3).join(", ")}.`,
      };
    }

    return {
      label: existingLabel,
      lat: existing.lat ?? matchingRegion?.lat ?? null,
      lng: existing.lng ?? matchingRegion?.lng ?? null,
      confidence: existing.confidence ?? (existing.lat != null && existing.lng != null ? "Medium" : "Low"),
      reason: existing.reason ?? "Location carried forward from clustered source signals.",
    };
  }

  if (ranked.length > 0) {
    const best = ranked[0];
    return {
      label: best.region.label,
      lat: best.region.lat,
      lng: best.region.lng,
      confidence: best.hits >= 3 ? "High" : best.hits >= 2 ? "Medium" : "Low",
      reason: `Region inferred from repeated location and context keywords: ${best.region.keywords.filter((keyword) => corpus.includes(keyword)).slice(0, 3).join(", ")}.`,
    };
  }

  return {
    label: REGION_UNDER_REVIEW,
    lat: null,
    lng: null,
    confidence: "Low",
    reason: "Location signals are limited or conflicting and remain under review.",
  };
}

export function getLocationDisplay(location) {
  const inferred = inferLocationDetails({ location });
  return {
    label: inferred.label,
    lat: inferred.lat,
    lng: inferred.lng,
    confidence: inferred.confidence,
    reason: inferred.reason,
  };
}

export function explainConfidence(event) {
  const signals = getEventSourceSignals(event);
  const level = event.confidence ?? "Low";
  const location = getLocationDisplay(event.location);
  const ageHours = Math.max(0, (Date.now() - new Date(event.timestamp ?? Date.now()).getTime()) / 3600_000);
  const recencyText = ageHours <= 2 ? "recent within 2h" : ageHours <= 12 ? `recent within ${Math.ceil(ageHours)}h` : `age ${Math.ceil(ageHours)}h`;
  const aiMode = (event.aiStatus ?? event.ai_status) === "enriched" ? "AI-enriched" : "rule-based";
  return `${level} confidence: ${signals.sourceCount} sources, ${signals.independentDomainCount} independent domains, ${recencyText}, ${location.confidence.toLowerCase()} location match, ${signals.trustLabel.toLowerCase()} source quality, ${aiMode}.`;
}

export function buildConfidenceDrivers(event) {
  const signals = getEventSourceSignals(event);
  const location = getLocationDisplay(event.location);
  const ageHours = Math.max(0, (Date.now() - new Date(event.timestamp ?? Date.now()).getTime()) / 3600_000);
  return [
    `${signals.sourceCount} source signal${signals.sourceCount === 1 ? "" : "s"}`,
    `${signals.independentDomainCount} independent domain${signals.independentDomainCount === 1 ? "" : "s"}`,
    `${signals.trustLabel} source quality`,
    ageHours <= 2 ? "recent within 2h" : ageHours <= 12 ? `recent within ${Math.ceil(ageHours)}h` : `reported ${Math.ceil(ageHours)}h ago`,
    `${location.confidence} location confidence`,
    ((event.aiStatus ?? event.ai_status) === "enriched" || (event.aiStatus ?? event.ai_status) === "cached") ? "AI-enriched context available" : "rule-based synthesis",
  ];
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
    if (impact.tradeRoutes === "Disrupted" || impact.tradeRoutes === "Stressed") tags.add("Shipping Risk");
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

export function deriveEventClassification(event) {
  const corpus = buildCorpus(event);
  const sourceSignals = getEventSourceSignals(event);
  const location = inferLocationDetails(event);
  const importance = deriveImportance(event);
  let category = "Political";

  if (/\b(war|military|missile|drone|naval|exercise|troops|airstrike|artillery)\b/i.test(corpus)) category = "Military";
  else if (/\b(election|ballot|polls|snap election|vote)\b/i.test(corpus)) category = "Election";
  else if (/\b(protest|demonstration|riot|strike action)\b/i.test(corpus)) category = "Protest";
  else if (/\b(oil|gas|lng|pipeline|refinery|opec|energy security|power grid)\b/i.test(corpus)) category = "Energy";
  else if (/\b(cyber|cyberattack|ransomware|hack|breach|telecom)\b/i.test(corpus)) category = "Cyber";
  else if (/\b(trade|tariff|customs|export control|shipment|supply chain)\b/i.test(corpus)) category = "Trade";
  else if (/\b(sanctions|asset freeze|blacklist|export ban)\b/i.test(corpus)) category = "Sanctions";
  else if (/\b(infrastructure|grid|railway|port disruption|blackout|pipeline sabotage)\b/i.test(corpus)) category = "Infrastructure";
  else if (/\b(migration|migrant|asylum|refugee)\b/i.test(corpus)) category = "Migration";
  else if (/\b(diplomatic|talks|meeting|summit|mediation|ceasefire|agreement)\b/i.test(corpus)) category = "Diplomatic";
  else if (/\b(shipping|tanker|container|rerouting|suez|hormuz|red sea|black sea)\b/i.test(corpus)) category = "Shipping";
  else if (/\b(market|stocks|equities|vix|gold|bond|currency)\b/i.test(corpus)) category = "Market";

  let severityScore = 18;
  if (event.tone === "Escalating") severityScore += 26;
  if (event.tone === "Deteriorating") severityScore += 30;
  if (event.tone === "Volatile") severityScore += 22;
  if (sourceSignals.sourceCount >= 3) severityScore += 8;
  if (/attack|strike|missile|drone|blockade|seizure|offensive|riot|blackout|cyberattack/i.test(corpus)) severityScore += 18;
  if (/election|protest|coalition|parliament|regulator|commission/i.test(corpus)) severityScore += 8;
  severityScore = Math.max(0, Math.min(100, Math.round(severityScore)));

  let impactScore = Math.max(20, Math.min(100, Math.round(importance)));
  if (/\b(hormuz|red sea|black sea|taiwan|semiconductor|nato|eu|migration|pipeline|oil|gas|sanctions)\b/i.test(corpus)) impactScore += 12;
  if (location.label === "Region under review") impactScore -= 8;
  impactScore = Math.max(0, Math.min(100, Math.round(impactScore)));

  let confidenceScore = 28;
  confidenceScore += Math.round(sourceSignals.averageTrust * 35);
  confidenceScore += Math.min(20, sourceSignals.independentDomainCount * 4);
  confidenceScore += location.confidence === "High" ? 12 : location.confidence === "Medium" ? 6 : 0;
  if ((event.confidence ?? "Low") === "High") confidenceScore += 10;
  else if ((event.confidence ?? "Low") === "Medium") confidenceScore += 5;
  confidenceScore = Math.max(0, Math.min(100, Math.round(confidenceScore)));

  return { category, severityScore, impactScore, confidenceScore };
}

export function deriveRecentTrend(event, allEvents = []) {
  const now = Date.now();
  const lookback7 = now - 7 * 24 * 3600_000;
  const prior7 = now - 14 * 24 * 3600_000;
  const current30 = now - 30 * 24 * 3600_000;
  const location = String(inferLocationDetails(event).label ?? "").toLowerCase();
  const category = deriveEventClassification(event).category;

  const matches = (allEvents ?? []).filter((candidate) => {
    const candidateLocation = String(inferLocationDetails(candidate).label ?? "").toLowerCase();
    const candidateCategory = deriveEventClassification(candidate).category;
    const sameLocation = location && location !== "region under review" && candidateLocation === location;
    const sameCategory = candidateCategory === category;
    return sameLocation || sameCategory;
  });

  const countCurrent7 = matches.filter((candidate) => new Date(candidate.timestamp ?? now).getTime() >= lookback7).length;
  const countPrior7 = matches.filter((candidate) => {
    const ts = new Date(candidate.timestamp ?? now).getTime();
    return ts >= prior7 && ts < lookback7;
  }).length;
  const countCurrent30 = matches.filter((candidate) => new Date(candidate.timestamp ?? now).getTime() >= current30).length;

  if (countCurrent30 < 2) return "Insufficient data";
  if (countCurrent7 >= countPrior7 + 2) return "Increasing";
  if (countCurrent7 + 1 < countPrior7) return "Decreasing";
  return "Stable";
}

export function getDecisionLens(lensId = "global_risk") {
  return DECISION_LENSES.find((lens) => lens.id === lensId) ?? DECISION_LENSES[0];
}

export function scoreEventForLens(event, lensId = "global_risk") {
  const lens = getDecisionLens(lensId);
  if (lens.id === "global_risk") {
    return {
      lens,
      matched: true,
      score: deriveImportance(event),
      boost: 0,
      reasons: ["Default global escalation lens"],
    };
  }

  const corpus = buildCorpus(event);
  const sectorTags = unique([
    ...getMarketImpactTags(event),
    ...((event.scenarios ?? []).flatMap((scenario) => scenario.impact?.sectors ?? [])),
  ]).map((item) => String(item).toLowerCase());

  let boost = 0;
  const reasons = [];
  const matchedKeywords = lens.keywords.filter((keyword) => corpus.includes(keyword.toLowerCase()));
  const matchedSectors = lens.sectors.filter((sector) => sectorTags.some((tag) => tag.includes(String(sector).toLowerCase())));

  if (matchedKeywords.length > 0) {
    boost += Math.min(28, matchedKeywords.length * 7);
    reasons.push(...matchedKeywords.slice(0, 3));
  }
  if (matchedSectors.length > 0) {
    boost += Math.min(20, matchedSectors.length * 5);
    reasons.push(...matchedSectors.slice(0, 2));
  }

  const location = inferLocationDetails(event);
  if (lens.id === "energy" && /hormuz|red sea|middle east/i.test(location.label)) {
    boost += 12;
    reasons.push(location.label);
  }
  if (lens.id === "tech_semiconductors" && /taiwan/i.test(location.label)) {
    boost += 14;
    reasons.push(location.label);
  }
  if (lens.id === "eu_balkans" && /balkans|baltic|black sea|europe/i.test(location.label)) {
    boost += 12;
    reasons.push(location.label);
  }

  return {
    lens,
    matched: boost > 0,
    score: deriveImportance(event) + boost,
    boost,
    reasons: unique(reasons).slice(0, 4),
  };
}

export function applyDecisionLens(events, lensId = "global_risk") {
  return [...(events ?? [])]
    .map((event) => {
      const lensScore = scoreEventForLens(event, lensId);
      return {
        ...event,
        lensId: lensScore.lens.id,
        lensLabel: lensScore.lens.label,
        lensMatched: lensScore.matched,
        lensBoost: lensScore.boost,
        lensReasons: lensScore.reasons,
        lensPriorityScore: lensScore.score,
      };
    })
    .sort((a, b) => (b.lensPriorityScore ?? 0) - (a.lensPriorityScore ?? 0));
}

export function rankBriefingEvents(events, limit = 5, lensId = "global_risk") {
  return [...events]
    .map((event) => {
      const importance = scoreEventForLens(event, lensId).score;
      const freshness = computeFreshnessScore(event.timestamp);
      return {
        ...event,
        briefingScore: importance + freshness,
      };
    })
    .sort((a, b) => b.briefingScore - a.briefingScore)
    .slice(0, limit);
}

export function buildWhyThisMatters(event) {
  const corpus = buildCorpus(event);
  const direct = WHY_THIS_MATTERS_RULES.find((rule) => rule.pattern.test(corpus));
  if (Array.isArray(event.whyThisMatters) && event.whyThisMatters.length > 0) {
    return event.whyThisMatters;
  }
  if (direct) return [direct.text];

  const sectors = getMarketImpactTags(event);
  if (sectors.some((tag) => /Shipping|Oil/i.test(tag))) {
    return ["This matters because shipping and energy disruptions can spread quickly into insurance, freight, and broader market pricing."];
  }
  if (event.tone === "Escalating") {
    return ["This matters because escalating geopolitical events can widen into supply, security, and market sentiment shocks."];
  }
  return ["This matters because even contained geopolitical signals can alter regional risk pricing and strategic planning."];
}

export function buildWatchIndicators(event) {
  if (Array.isArray(event.watchIndicators) && event.watchIndicators.length > 0) {
    return event.watchIndicators;
  }
  const corpus = buildCorpus(event);
  const direct = WATCH_INDICATOR_RULES.find((rule) => rule.pattern.test(corpus));
  if (direct) return direct.indicators;

  const fallback = [];
  if (event.tone === "Escalating") fallback.push("Follow-on official security statements");
  fallback.push("Source corroboration from additional outlets");
  fallback.push("Transport, insurance, or freight-rate changes");
  fallback.push("Military or diplomatic posture changes");
  fallback.push("Market reaction across exposed sectors");
  return fallback.slice(0, 5);
}

export function getSourceTrace(event) {
  const signals = getEventSourceSignals(event);
  const links = unique((event.articleIds ?? []).filter((value) => String(value).startsWith("http")));
  return {
    domains: signals.uniqueSources,
    links,
    sourceCount: signals.sourceCount,
    independentDomainCount: signals.independentDomainCount,
    corroborationLabel: signals.corroborationLabel,
    trustLabel: signals.trustLabel,
  };
}

export function getRelatedEvents(event, events, limit = 3) {
  const eventKeywords = new Set((event.keywords ?? []).map((keyword) => String(keyword).toLowerCase()));
  return (events ?? [])
    .filter((candidate) => candidate.id !== event.id)
    .map((candidate) => {
      let score = 0;
      if (String(candidate.location?.label ?? "").toLowerCase() === String(event.location?.label ?? "").toLowerCase()) score += 4;
      if (candidate.tone === event.tone) score += 1;
      for (const keyword of candidate.keywords ?? []) {
        if (eventKeywords.has(String(keyword).toLowerCase())) score += 1;
      }
      for (const sector of getMarketImpactTags(candidate)) {
        if (getMarketImpactTags(event).includes(sector)) score += 1;
      }
      return { ...candidate, _relatedScore: score };
    })
    .filter((candidate) => candidate._relatedScore > 0)
    .sort((a, b) => b._relatedScore - a._relatedScore)
    .slice(0, limit);
}

function accumulateEventImpact(event) {
  let oil = 0;
  let shipping = 0;
  let defense = 0;
  let tech = 0;
  let equities = 0;
  const driverKeywords = new Set();

  for (const scenario of event.scenarios ?? []) {
    const probabilityWeight = Math.max(0, Number(scenario.probability ?? 0)) / 100;
    const impact = scenario.impact ?? {};

    if (impact.oil === "Up") {
      oil += 1.2 * probabilityWeight;
      driverKeywords.add("oil supply risk");
    }
    if (impact.oil === "Down") oil -= 0.7 * probabilityWeight;
    if (impact.tradeRoutes === "Disrupted" || impact.tradeRoutes === "Stressed") {
      shipping += 1.1 * probabilityWeight;
      driverKeywords.add("trade-route disruption");
    }
    if ((impact.sectors ?? []).includes("Shipping")) shipping += 0.8 * probabilityWeight;
    if ((impact.sectors ?? []).includes("Defense")) {
      defense += 1.0 * probabilityWeight;
      driverKeywords.add("defense demand");
    }
    if ((impact.sectors ?? []).includes("Tech")) {
      tech += 1.0 * probabilityWeight;
      driverKeywords.add("tech supply-chain stress");
    }
    if (impact.markets === "Risk-off") {
      equities -= 1.1 * probabilityWeight;
      driverKeywords.add("risk-off sentiment");
    }
    if (impact.markets === "Risk-on") equities += 0.8 * probabilityWeight;
  }

  return { oil, shipping, defense, tech, equities, driverKeywords: [...driverKeywords] };
}

function toTrafficLight(score) {
  if (score >= 1.15) return "red";
  if (score >= 0.45) return "amber";
  if (score <= -0.45) return "green";
  return "neutral";
}

function buildTrendSeries(events, categoryKey) {
  const windows = [
    { label: "24h", hours: 24, buckets: 6 },
    { label: "7d", hours: 24 * 7, buckets: 7 },
    { label: "30d", hours: 24 * 30, buckets: 6 },
  ];

  return windows.map((window) => {
    const now = Date.now();
    const start = now - window.hours * 3600_000;
    const bucketSize = (window.hours * 3600_000) / window.buckets;
    const series = Array.from({ length: window.buckets }, (_, index) => ({ label: index + 1, value: 0 }));

    for (const event of events) {
      const ts = new Date(event.timestamp ?? now).getTime();
      if (ts < start || ts > now) continue;
      const bucket = Math.min(window.buckets - 1, Math.floor((ts - start) / bucketSize));
      const impact = accumulateEventImpact(event)[categoryKey] ?? 0;
      series[bucket].value += impact;
    }

    return { window: window.label, series };
  });
}

function buildLineSeriesFromPoints(points = [], window) {
  const limit = window === "24h" ? 2 : window === "7d" ? 7 : 30;
  return (points ?? []).slice(-limit).map((point, index) => ({
    label: window === "24h" ? `${index + 1}` : String(point.timestamp ?? "").slice(5, 10),
    value: Number(point.value ?? 0),
    timestamp: point.timestamp,
  }));
}

function buildMarketCategory(label, score, level, trend, events, categoryKey, marketContext = null) {
  const contributingEvents = [...events]
    .map((event) => ({
      event,
      score: Math.abs(accumulateEventImpact(event)[categoryKey] ?? 0),
    }))
    .filter((entry) => entry.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.event);

  const driverSet = new Set();
  contributingEvents.forEach((event) => {
    accumulateEventImpact(event).driverKeywords.forEach((keyword) => driverSet.add(keyword));
    (event.keywords ?? []).slice(0, 3).forEach((keyword) => driverSet.add(keyword));
  });

  const relatedSectors = unique(contributingEvents.flatMap((event) => getMarketImpactTags(event))).slice(0, 5);
  const confidence = contributingEvents.length >= 3 ? "High" : contributingEvents.length === 2 ? "Medium" : "Low";

  const contextItem = marketContext?.instruments?.find((item) =>
    categoryKey === "oil"
      ? item.category === "oil"
      : categoryKey === "equities"
        ? item.symbol === "SPY"
        : categoryKey === "tech"
          ? item.symbol === "SPY"
          : false
  ) ?? null;

  return {
    key: categoryKey,
    label,
    score,
    level,
    trend,
    drivers: [...driverSet].slice(0, 6),
    contributingEvents,
    confidence,
    relatedSectors,
    lastUpdated: new Date().toISOString(),
    methodology: "Directional risk signal based on event importance, recency, source corroboration, chokepoint relevance, and scenario impact tags. Not financial advice.",
    series: contextItem?.series?.length
      ? contextItem.series
      : buildTrendSeries(events, categoryKey),
    priceContext: contextItem ? {
      currentPrice: contextItem.currentPrice,
      changePercent: contextItem.changePercent,
      changeAbsolute: contextItem.changeAbsolute,
      symbol: contextItem.symbol,
      lastUpdated: contextItem.lastUpdated,
    } : null,
    priceFeedStatus: contextItem
      ? `Market context source: ${contextItem.source}`
      : "Market price feed not configured yet.",
  };
}

export function aggregateMarketImpact(events, marketContext = null) {
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
    oil: buildMarketCategory("Oil", totals.oil, toTrafficLight(Math.abs(totals.oil)), totals.oil >= 0 ? "Up" : "Down", events, "oil", marketContext),
    shipping: buildMarketCategory("Shipping", totals.shipping, toTrafficLight(totals.shipping), totals.shipping >= 0.45 ? "Stressed" : "Stable", events, "shipping", marketContext),
    defense: buildMarketCategory("Defense", totals.defense, toTrafficLight(totals.defense), totals.defense >= 0.45 ? "Supported" : "Neutral", events, "defense", marketContext),
    tech: buildMarketCategory("Tech", totals.tech, toTrafficLight(totals.tech), totals.tech >= 0.45 ? "Sensitive" : "Neutral", events, "tech", marketContext),
    equities: buildMarketCategory(
      "Equities sentiment",
      totals.equities,
      totals.equities <= -1.0 ? "red" : totals.equities < -0.3 ? "amber" : totals.equities >= 0.5 ? "green" : "neutral",
      totals.equities <= -0.3 ? "Risk-off" : totals.equities >= 0.5 ? "Risk-on" : "Neutral",
      events,
      "equities",
      marketContext
    ),
  };
}

export function buildEventBrief(event, allEvents = []) {
  const sourceTrace = getSourceTrace(event);
  const location = inferLocationDetails(event);
  const executiveSummary = getOneLineSummary(event);
  const developments = (event.developments ?? []).slice(0, 3);
  const scenarios = (event.scenarios ?? []).slice(0, 3);
  const marketImpactTags = getMarketImpactTags(event);
  const watchIndicators = buildWatchIndicators(event);
  const relatedEvents = getRelatedEvents(event, allEvents);
  const classification = deriveEventClassification(event);

  return {
    executiveSummary,
    whatHappened: sentenceCase(event.summary || executiveSummary),
    whereItHappened: location.label,
    assessment: event.assessment ?? "",
    whyThisMatters: buildWhyThisMatters(event),
    keyDevelopments: developments.length > 0 ? developments : ["Monitoring for follow-on developments."],
    scenarios,
    marketImpactTags,
    marketImpact: event.marketImpact ?? {},
    sectorImpact: unique(scenarios.flatMap((scenario) => scenario.impact?.sectors ?? [])).slice(0, 6),
    sourceTrace,
    confidenceDrivers: buildConfidenceDrivers(event),
    confidenceExplanation: explainConfidence(event),
    confidenceRationale: event.confidenceRationale ?? explainConfidence(event),
    locationConfidence: location.confidence,
    locationReason: location.reason,
    watchIndicators,
    recentTrend: deriveRecentTrend(event, allEvents),
    category: classification.category,
    severityScore: classification.severityScore,
    impactScore: classification.impactScore,
    confidenceScore: classification.confidenceScore,
    relatedEvents,
    sourceAssessment: event.sourceAssessment ?? {
      sourceCount: sourceTrace.sourceCount,
      corroborationLevel: sourceTrace.corroborationLabel,
      limitations: "Open-source reporting can remain incomplete or lag operational developments.",
    },
    aiStatusLabel:
      (event.aiStatus ?? event.ai_status) === "enriched"
        ? "AI enriched"
        : (event.aiStatus ?? event.ai_status) === "cached"
          ? "Cached intelligence"
          : (event.aiStatus ?? event.ai_status) === "provider_error"
            ? "Rule-based briefing after provider error"
          : (event.aiStatus ?? event.ai_status) === "budget_exhausted"
            ? "Rule-based briefing, AI budget exhausted"
            : "Rule-based briefing",
  };
}

export function buildBriefing(events, lensId = "global_risk") {
  const ranked = rankBriefingEvents(events, 5, lensId);
  const lens = getDecisionLens(lensId);
  return {
    generatedAt: new Date().toISOString(),
    lens: {
      id: lens.id,
      label: lens.label,
      description: lens.description,
      emphasis: lens.emphasis,
    },
    items: ranked.map((event) => ({
      id: event.id,
      title: event.title ?? "Untitled Event",
      summary: getOneLineSummary(event),
      riskLevel: deriveRiskLevel(event),
      marketImpactTags: getMarketImpactTags(event),
      importanceScore: deriveImportance(event),
      freshnessScore: computeFreshnessScore(event.timestamp),
      timestamp: event.timestamp,
      location: inferLocationDetails(event),
      aiStatus: event.aiStatus ?? event.ai_status ?? "fallback",
      aiStatusLabel:
        (event.aiStatus ?? event.ai_status) === "enriched"
          ? "AI enriched"
          : (event.aiStatus ?? event.ai_status) === "cached"
            ? "Cached intelligence"
            : (event.aiStatus ?? event.ai_status) === "provider_error"
              ? "Rule-based briefing after provider error"
            : (event.aiStatus ?? event.ai_status) === "budget_exhausted"
              ? "Rule-based briefing, AI budget exhausted"
              : "Rule-based briefing",
    })),
  };
}

function pickChokepoint(events) {
  const chokepointTerms = [
    { key: "hormuz", label: "Strait of Hormuz" },
    { key: "red sea", label: "Red Sea" },
    { key: "suez", label: "Suez corridor" },
    { key: "black sea", label: "Black Sea" },
    { key: "taiwan", label: "Taiwan Strait" },
  ];
  const matched = [...(events ?? [])].find((event) => {
    const corpus = buildCorpus(event);
    return chokepointTerms.some((item) => corpus.includes(item.key));
  });
  if (!matched) return null;
  const corpus = buildCorpus(matched);
  return chokepointTerms.find((item) => corpus.includes(item.key))?.label ?? inferLocationDetails(matched).label;
}

export function buildStrategicBrief(events, systemStatus = {}, lensId = "global_risk") {
  const ranked = applyDecisionLens(events, lensId);
  const escalatingRegions = unique(
    ranked
      .filter((event) => event.tone === "Escalating")
      .map((event) => inferLocationDetails(event).label)
  ).slice(0, 3);
  const marketSensitiveEvents = ranked
    .filter((event) => getMarketImpactTags(event).some((tag) => /oil|shipping|equities|tech|finance/i.test(tag)))
    .slice(0, 2)
    .map((event) => ({
      id: event.id,
      title: event.title,
      summary: getOneLineSummary(event),
      location: inferLocationDetails(event).label,
      aiStatus: event.aiStatus ?? event.ai_status ?? "fallback",
    }));
  const chokepoint = pickChokepoint(ranked);

  return {
    lens: getDecisionLens(lensId),
    topEscalatingRegions: escalatingRegions,
    topMarketSensitiveEvents: marketSensitiveEvents,
    chokepointToWatch: chokepoint,
    aiRemainingToday: systemStatus?.aiRemainingToday ?? 0,
    lastNewsRefresh: systemStatus?.automation?.lastNewsRefreshAt ?? null,
    lastAiRefresh: systemStatus?.automation?.lastAiRefreshAt ?? null,
    marketSummary: systemStatus?.marketSummary ?? null,
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
  const haystack = `${event.title ?? ""} ${(event.summary ?? "")} ${(inferLocationDetails(event).label ?? "")} ${((event.keywords ?? []).join(" "))}`.toLowerCase();

  const regionMatch = regions.find((region) =>
    inferLocationDetails(event).label.toLowerCase().includes(region.toLowerCase())
  );
  const topicMatch = topics.find((topic) => haystack.includes(topic.toLowerCase()));

  return {
    matched: Boolean(regionMatch || topicMatch),
    regionMatch: regionMatch ?? null,
    topicMatch: topicMatch ?? null,
  };
}

export { REGION_UNDER_REVIEW };
