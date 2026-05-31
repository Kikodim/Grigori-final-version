const SOURCE_TRUST_RULES = [
  { pattern: /reuters|apnews|associated press|bbc|financial times|wsj|wall street journal|bloomberg/i, score: 0.95 },
  { pattern: /aljazeera|economist|guardian|ft\.com|nytimes|washington post|dw|france24/i, score: 0.85 },
  { pattern: /newswire|newsdata|currents|xinhuanet|cnbc|cnn|npr|sky/i, score: 0.72 },
  { pattern: /triblive|einnews|menafn|latestly|blogspot|substack|medium\.com/i, score: 0.42 },
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

const GEO_ACCURACY_LABELS = {
  exact: "Exact",
  city: "City-level",
  region: "Region-level",
  country: "Country-level",
  approximate: "Approximate",
  unresolved: "Unresolved",
};

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

export const BRIEF_LIMITS = {
  title: 140,
  summary: 500,
  assessment: 1200,
  development: 280,
  whyThisMatters: 240,
  watchIndicator: 180,
  scenarioDescription: 900,
  marketImpactSummary: 900,
  confidenceRationale: 500,
  sourceLimitations: 320,
};

const UUID_LIKE_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const RAW_SECTION_RE = /\bSECTIONS\b[:\s-]*/gi;
const SCRAPE_RESIDUE_RE = /\b(available on paid plans|newsletter|internal|email this|sign up for|continue reading|read more|all rights reserved)\b/i;
const SOURCE_PREFIX_RE = /^\s*(?:[a-z0-9][a-z0-9._-]{1,36}|[A-Z][A-Za-z0-9 ._-]{1,36})\s*:\s+/;

function clampText(value, maxLen) {
  const text = compactText(value);
  if (text.length <= maxLen) return text;
  const clipped = text.slice(0, maxLen);
  const lastBoundary = Math.max(clipped.lastIndexOf("."), clipped.lastIndexOf(";"), clipped.lastIndexOf(","), clipped.lastIndexOf(" "));
  return compactText(clipped.slice(0, lastBoundary > maxLen * 0.55 ? lastBoundary : maxLen)) + "…";
}

function stripScrapeResidue(value) {
  let text = compactText(value)
    .replace(new RegExp(UUID_LIKE_RE.source, "gi"), " ")
    .replace(RAW_SECTION_RE, " ")
    .replace(/\b(?:source|feed|domain|uuid)\b\s*:/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (SOURCE_PREFIX_RE.test(text)) {
    text = text.replace(SOURCE_PREFIX_RE, "");
  }

  return compactText(text);
}

function countSentences(value) {
  const matches = String(value ?? "").match(/[.!?](?:\s|$)/g);
  return matches ? matches.length : (String(value ?? "").trim() ? 1 : 0);
}

function looksLikeRawSourceDump(value) {
  const text = compactText(value);
  if (!text) return true;
  if (new RegExp(UUID_LIKE_RE.source, "i").test(text)) return true;
  if (SCRAPE_RESIDUE_RE.test(text)) return true;
  if (/^(?:[a-z0-9._-]{2,36}|[A-Z][A-Za-z0-9 ._-]{1,36})\s*:/.test(text) && text.length > 70) return true;
  if ((text.match(/;/g) ?? []).length >= 4) return true;
  if (countSentences(text) > 2) return true;
  if (text.length > 280) return true;
  return false;
}

export function sanitizeNarrativeText(value, { maxLen, maxSentences = null, fallback = "" } = {}) {
  let text = stripScrapeResidue(value);
  if (!text) return fallback;
  if (maxSentences && countSentences(text) > maxSentences) {
    const chunks = text.split(/(?<=[.!?])\s+/).slice(0, maxSentences);
    text = compactText(chunks.join(" "));
  }
  text = clampText(text, maxLen);
  return text || fallback;
}

export function sanitizeBulletList(items, { maxItems, maxLen, maxSentences = 2, fallback = [] } = {}) {
  const cleaned = [];
  for (const item of Array.isArray(items) ? items : []) {
    const text = sanitizeNarrativeText(item, { maxLen, maxSentences, fallback: "" });
    if (!text) continue;
    if (looksLikeRawSourceDump(text)) continue;
    cleaned.push(text);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned.length > 0 ? unique(cleaned).slice(0, maxItems) : fallback.slice(0, maxItems);
}

export function sanitizeEventNarrative(event, fallback = {}) {
  const cleanedDevelopments = sanitizeBulletList(event.developments, {
    maxItems: 5,
    maxLen: BRIEF_LIMITS.development,
    maxSentences: 2,
    fallback: Array.isArray(fallback.developments) ? fallback.developments : [],
  });
  const cleanedWhy = sanitizeBulletList(event.whyThisMatters, {
    maxItems: 5,
    maxLen: BRIEF_LIMITS.whyThisMatters,
    maxSentences: 2,
    fallback: Array.isArray(fallback.whyThisMatters) ? fallback.whyThisMatters : [],
  });
  const cleanedWatch = sanitizeBulletList(event.watchIndicators ?? event.watchIndicators72h, {
    maxItems: 7,
    maxLen: BRIEF_LIMITS.watchIndicator,
    maxSentences: 2,
    fallback: Array.isArray(fallback.watchIndicators ?? fallback.watchIndicators72h) ? (fallback.watchIndicators ?? fallback.watchIndicators72h) : [],
  });

  const scenarios = Array.isArray(event.scenarios) ? event.scenarios.slice(0, 3).map((scenario, index) => {
    const fbScenario = Array.isArray(fallback.scenarios) ? fallback.scenarios[index] ?? {} : {};
    return {
      ...scenario,
      description: sanitizeNarrativeText(scenario?.description, {
        maxLen: BRIEF_LIMITS.scenarioDescription,
        maxSentences: 6,
        fallback: fbScenario.description ?? "Monitoring for follow-on developments.",
      }),
      triggers: sanitizeBulletList(scenario?.triggers, {
        maxItems: 4,
        maxLen: 140,
        maxSentences: 1,
        fallback: Array.isArray(fbScenario.triggers) ? fbScenario.triggers : [],
      }),
    };
  }) : (fallback.scenarios ?? []);

  const title = sanitizeNarrativeText(event.title, {
    maxLen: BRIEF_LIMITS.title,
    maxSentences: 1,
    fallback: sanitizeNarrativeText(fallback.title ?? "Untitled Event", { maxLen: BRIEF_LIMITS.title, maxSentences: 1, fallback: "Untitled Event" }),
  });

  const summary = sanitizeNarrativeText(event.summary, {
    maxLen: BRIEF_LIMITS.summary,
    maxSentences: 4,
    fallback: sanitizeNarrativeText(fallback.summary ?? "", { maxLen: BRIEF_LIMITS.summary, maxSentences: 4, fallback: "" }),
  });

  const assessment = sanitizeNarrativeText(event.assessment, {
    maxLen: BRIEF_LIMITS.assessment,
    maxSentences: 8,
    fallback: sanitizeNarrativeText(fallback.assessment ?? "", { maxLen: BRIEF_LIMITS.assessment, maxSentences: 8, fallback: "" }),
  });

  const confidenceRationale = sanitizeNarrativeText(event.confidenceRationale, {
    maxLen: BRIEF_LIMITS.confidenceRationale,
    maxSentences: 4,
    fallback: sanitizeNarrativeText(fallback.confidenceRationale ?? "", { maxLen: BRIEF_LIMITS.confidenceRationale, maxSentences: 4, fallback: "" }),
  });

  const marketImpact = {
    ...(fallback.marketImpact ?? {}),
    ...(event.marketImpact ?? {}),
    summary: sanitizeNarrativeText(event.marketImpact?.summary, {
      maxLen: BRIEF_LIMITS.marketImpactSummary,
      maxSentences: 6,
      fallback: sanitizeNarrativeText(fallback.marketImpact?.summary ?? "", { maxLen: BRIEF_LIMITS.marketImpactSummary, maxSentences: 6, fallback: "" }),
    }),
  };

  const sourceAssessment = {
    ...(fallback.sourceAssessment ?? {}),
    ...(event.sourceAssessment ?? {}),
    limitations: sanitizeNarrativeText(event.sourceAssessment?.limitations, {
      maxLen: BRIEF_LIMITS.sourceLimitations,
      maxSentences: 3,
      fallback: sanitizeNarrativeText(fallback.sourceAssessment?.limitations ?? "", { maxLen: BRIEF_LIMITS.sourceLimitations, maxSentences: 3, fallback: "" }),
    }),
  };

  const usedFallbackDevelopments = cleanedDevelopments.length === 0 && Array.isArray(fallback.developments) && fallback.developments.length > 0;
  const sourceDumpDetected = Array.isArray(event.developments) && event.developments.some((item) => looksLikeRawSourceDump(item));

  return {
    cleaned: {
      ...event,
      title,
      summary,
      assessment,
      developments: cleanedDevelopments,
      whyThisMatters: cleanedWhy,
      watchIndicators: cleanedWatch,
      watchIndicators72h: cleanedWatch,
      confidenceRationale,
      marketImpact,
      sourceAssessment,
      scenarios,
    },
    meta: {
      sourceDumpDetected,
      usedFallbackDevelopments,
      requiresRetry: sourceDumpDetected || usedFallbackDevelopments,
    },
  };
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

export function computeGeoAccuracy(event = {}) {
  const location = inferLocationDetails(event);
  const label = String(location.label ?? "").trim();
  const corpus = buildCorpus(event);
  const hasCoordinates = Number.isFinite(location.lat) && Number.isFinite(location.lng);
  const existingConfidence = String(location.confidence ?? event.location?.confidence ?? "").toLowerCase();
  const explicitCoordinateHint = /\b(gps|coordinates?|geo(?:located)?|latitude|longitude|at\s+\d{1,2}\.\d+)/i.test(corpus);
  const cityHint = /\b(airport|port of|city of|capital|downtown|near [a-z][a-z\s-]{2,30})\b/i.test(corpus);
  const countryOnlyHint = /\b(countrywide|nationwide|government|parliament|capital markets|central bank|ministry)\b/i.test(corpus);
  const strategicRegion = STRATEGIC_REGIONS.find((region) => region.label.toLowerCase() === label.toLowerCase());

  let value = "approximate";
  let reason = "Location inferred from broad source context.";

  if (!hasCoordinates || !label || UNKNOWN_LABELS.has(label.toLowerCase()) || label === REGION_UNDER_REVIEW) {
    value = "unresolved";
    reason = "No reliable public location match is available.";
  } else if (explicitCoordinateHint && existingConfidence === "high") {
    value = "exact";
    reason = "Specific coordinates or high-confidence geolocation metadata were available.";
  } else if (strategicRegion) {
    value = "region";
    reason = "Location inferred from regional, theater, or chokepoint match.";
  } else if (cityHint || existingConfidence === "high") {
    value = "city";
    reason = "Location is precise enough for city-level situational awareness.";
  } else if (countryOnlyHint || existingConfidence === "medium") {
    value = "country";
    reason = "Location appears country-level rather than pinpoint-specific.";
  }

  return {
    value,
    label: GEO_ACCURACY_LABELS[value] ?? "Approximate",
    reason,
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
  const summary = sanitizeNarrativeText(event.summary ?? "", {
    maxLen: BRIEF_LIMITS.summary,
    maxSentences: 2,
    fallback: "",
  });
  if (summary) {
    const firstSentence = summary.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence) return firstSentence;
    return summary;
  }

  const firstDevelopment = sanitizeBulletList(event.developments ?? [], {
    maxItems: 1,
    maxLen: BRIEF_LIMITS.development,
    maxSentences: 2,
    fallback: [],
  })[0];
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

function relationReasons(event, candidate) {
  const reasons = [];
  const eventRegion = String(event.location?.label ?? "").toLowerCase();
  const candidateRegion = String(candidate.location?.label ?? "").toLowerCase();
  if (eventRegion && eventRegion === candidateRegion) reasons.push(`same region: ${candidate.location?.label}`);
  const eventTags = new Set(getMarketImpactTags(event).map((item) => item.toLowerCase()));
  const sharedSectors = getMarketImpactTags(candidate).filter((tag) => eventTags.has(tag.toLowerCase()));
  if (sharedSectors.length > 0) reasons.push(`same sector: ${sharedSectors.slice(0, 2).join(", ")}`);
  const eventKeywords = new Set((event.keywords ?? []).map((keyword) => String(keyword).toLowerCase()));
  const sharedKeywords = (candidate.keywords ?? []).filter((keyword) => eventKeywords.has(String(keyword).toLowerCase()));
  if (sharedKeywords.length > 0) reasons.push(`shared keywords: ${sharedKeywords.slice(0, 3).join(", ")}`);
  if ((event.clusterSignature ?? event.cluster_signature) && (event.clusterSignature ?? event.cluster_signature) === (candidate.clusterSignature ?? candidate.cluster_signature)) {
    reasons.push("same source cluster");
  }
  return reasons;
}

export function getRelatedSignalEvidence(event, events = [], limit = 4) {
  return getRelatedEvents(event, events, limit).map((candidate) => ({
    event: candidate,
    reasons: relationReasons(event, candidate),
  }));
}

export function buildEvidenceSummary(event = {}, allEvents = []) {
  const signals = getEventSourceSignals(event);
  const geoAccuracy = computeGeoAccuracy(event);
  const sourceAssessment = event.sourceAssessment ?? event.source_assessment ?? {};
  const contentTypes = Array.isArray(sourceAssessment.contentTypes) ? sourceAssessment.contentTypes : [];
  const sourceQuality = sourceAssessment.sourceQuality ?? sourceAssessment.sourceMix ?? null;
  const latestSourceTime = event.newestSourceAt ?? event.newest_source_at ?? event.refreshedAt ?? event.refreshed_at ?? event.lastSeenAt ?? event.last_seen_at ?? event.updatedAt ?? event.updated_at ?? event.timestamp ?? null;
  const relatedGrouped = Number(event.relatedSignalCount ?? event.related_signal_count ?? 0);
  const aiStatus = event.aiStatus ?? event.ai_status ?? "fallback";
  const related = getRelatedSignalEvidence(event, allEvents, 4);

  return {
    sourceCount: signals.sourceCount,
    domainCount: signals.independentDomainCount,
    sourceMix: sourceQuality || (signals.trustLabel === "Low" ? "limited classification" : `${signals.trustLabel.toLowerCase()} source quality`),
    contentTypeMix: contentTypes.length ? unique(contentTypes).join(", ") : "limited classification",
    confidence: event.confidence ?? "Low",
    geoAccuracy,
    latestSourceTime,
    relatedGrouped,
    aiStatus,
    aiLabel: aiStatus === "enriched" || aiStatus === "cached" ? "AI Enriched" : aiStatus === "budget_exhausted" ? "AI budget exhausted" : "Rule-based",
    providerCoverageCaveat: event.providerCoverageStatus ?? event.provider_coverage_status ?? null,
    related,
  };
}

function situationTemplateFor(corpus) {
  if (/\b(hormuz|gulf|iran|tanker|oil|shipping)\b/i.test(corpus)) {
    return {
      title: "Hormuz Shipping and Energy Pressure",
      underlyingPattern: "Coercive pressure around energy and shipping routes.",
      possibleMotives: ["Negotiation leverage", "Maritime enforcement escalation", "Domestic or alliance signalling"],
      competingHypotheses: ["Contained signalling cycle", "Maritime enforcement escalation", "Broader regional pressure campaign"],
      watchIndicators: ["Tanker rerouting", "War-risk insurance changes", "Naval deployments", "Official Gulf, Iranian, and US statements"],
    };
  }
  if (/\b(black sea|ukraine|russia|odesa|grain)\b/i.test(corpus)) {
    return {
      title: "Black Sea Maritime and Infrastructure Pressure",
      underlyingPattern: "Maritime and infrastructure pressure cycle around Black Sea access.",
      possibleMotives: ["Supply-route disruption", "Military pressure", "Negotiation leverage"],
      competingHypotheses: ["Localized disruption", "Sustained maritime pressure", "Escalation around export infrastructure"],
      watchIndicators: ["Port closures", "Grain/export disruption", "Naval warnings", "Infrastructure strikes"],
    };
  }
  if (/\b(election|protest|coalition|balkans|eu|parliament)\b/i.test(corpus)) {
    return {
      title: "Political Stability Pressure",
      underlyingPattern: "Political legitimacy, coalition, or alignment pressure.",
      possibleMotives: ["Domestic instability", "Coalition bargaining", "External alignment pressure"],
      competingHypotheses: ["Contained political dispute", "Wider legitimacy crisis", "External pressure amplifying domestic friction"],
      watchIndicators: ["Protest scale", "EU/NATO statements", "Coalition breakdown", "Court or election decisions"],
    };
  }
  if (/\b(cyber|infrastructure|outage|pipeline|sabotage)\b/i.test(corpus)) {
    return {
      title: "Cyber and Infrastructure Pressure",
      underlyingPattern: "Disruption, coercion, or pre-positioning pressure against infrastructure.",
      possibleMotives: ["Disruption/coercion", "Espionage or pre-positioning", "Deterrence signalling"],
      competingHypotheses: ["Criminal disruption", "State-linked pressure", "Operational pre-positioning"],
      watchIndicators: ["Cyber advisories", "Outage reports", "Attribution claims", "Sectoral spread"],
    };
  }
  return {
    title: "Emerging Strategic Situation",
    underlyingPattern: "Related signals indicate a broader situation may be forming.",
    possibleMotives: ["Signalling", "Operational pressure", "Negotiation leverage"],
    competingHypotheses: ["Contained incident pattern", "Wider strategic pressure", "Unrelated coincident reporting"],
    watchIndicators: ["Additional source corroboration", "Official statements", "Operational movement", "Market or infrastructure effects"],
  };
}

export function buildStrategicSituations(events = [], limit = 5) {
  const candidates = Array.isArray(events) ? events.filter(Boolean) : [];
  const groups = new Map();

  for (const event of candidates) {
    const region = inferLocationDetails(event).label ?? "Region under review";
    const corpus = buildCorpus(event);
    const template = situationTemplateFor(corpus);
    const key = `${region.toLowerCase()}::${template.title.toLowerCase()}`;
    const current = groups.get(key) ?? { region, template, events: [] };
    current.events.push(event);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map(({ region, template, events: linkedEvents }) => {
      const sorted = [...linkedEvents].sort((a, b) => new Date(b.timestamp ?? 0) - new Date(a.timestamp ?? 0));
      const sourceCount = sorted.reduce((sum, event) => sum + getEventSourceSignals(event).sourceCount, 0);
      const keywords = unique(sorted.flatMap((event) => event.keywords ?? [])).slice(0, 12);
      const sectors = unique(sorted.flatMap(getMarketImpactTags)).slice(0, 8);
      const impactScore = Math.round(sorted.reduce((sum, event) => sum + Number(event.impactScore ?? event.importanceScore ?? 0), 0) / Math.max(1, sorted.length));
      const confidenceScore = Math.round(sorted.reduce((sum, event) => sum + Number(event.confidenceScore ?? 0), 0) / Math.max(1, sorted.length));
      const firstSeenAt = sorted.map((event) => event.timestamp).filter(Boolean).sort()[0] ?? null;
      const lastSeenAt = sorted.map((event) => event.refreshedAt ?? event.updatedAt ?? event.timestamp).filter(Boolean).sort().at(-1) ?? null;
      const confidence = sorted.length >= 3 && sourceCount >= 6 ? "Medium" : sorted.length >= 2 ? "Low-Medium" : "Low";

      return {
        id: `situation-${region.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${template.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        title: `${region}: ${template.title}`,
        region,
        primaryCategory: sorted[0]?.category ?? "Strategic risk",
        linkedEventIds: sorted.map((event) => event.id),
        linkedSignalCount: sorted.length,
        sourceCount,
        firstSeenAt,
        lastSeenAt,
        trend: deriveRecentTrend(sorted[0] ?? {}, sorted),
        impactScore,
        confidenceScore,
        sectors,
        actors: keywords.filter((keyword) => /iran|us|gulf|russia|ukraine|china|taiwan|eu|nato|houthi/i.test(keyword)).slice(0, 8),
        keywords,
        strategicInference: {
          summary: `${region} signals point to ${template.underlyingPattern.toLowerCase()} This is a working interpretation, not confirmation of intent.`,
          underlyingPattern: template.underlyingPattern,
          possibleMotives: template.possibleMotives,
          competingHypotheses: template.competingHypotheses,
          supportingSignals: sorted.slice(0, 4).map((event) => event.title),
          contradictingSignals: ["Open-source reporting may be duplicated, delayed, or incomplete."],
          watchIndicators: template.watchIndicators,
          confidence,
          confidenceRationale: `${sorted.length} linked signal${sorted.length === 1 ? "" : "s"} and ${sourceCount} source signal${sourceCount === 1 ? "" : "s"} support this cautious grouping.`,
          limitations: ["Rule-based inference only.", "Does not confirm motive or intent.", "Requires continued source corroboration."],
        },
      };
    })
    .filter((situation) => situation.linkedSignalCount >= 2 || situation.impactScore >= 65)
    .sort((a, b) => b.linkedSignalCount - a.linkedSignalCount || b.impactScore - a.impactScore)
    .slice(0, limit);
}

export function findSituationForEvent(event, situations = []) {
  return (situations ?? []).find((situation) => (situation.linkedEventIds ?? []).includes(event?.id)) ?? null;
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
  const sanitized = sanitizeEventNarrative(event).cleaned;
  const sourceTrace = getSourceTrace(event);
  const location = inferLocationDetails(sanitized);
  const executiveSummary = getOneLineSummary(sanitized);
  const developments = (sanitized.developments ?? []).slice(0, 5);
  const scenarios = (sanitized.scenarios ?? []).slice(0, 3);
  const marketImpactTags = getMarketImpactTags(sanitized);
  const watchIndicators = sanitizeBulletList(buildWatchIndicators(sanitized), {
    maxItems: 7,
    maxLen: BRIEF_LIMITS.watchIndicator,
    maxSentences: 2,
    fallback: sanitized.watchIndicators ?? [],
  });
  const relatedEvents = getRelatedEvents(sanitized, allEvents);
  const classification = deriveEventClassification(sanitized);

  return {
    executiveSummary,
    whatHappened: sentenceCase(sanitized.summary || executiveSummary),
    whereItHappened: location.label,
    assessment: sanitized.assessment ?? "",
    whyThisMatters: sanitizeBulletList(buildWhyThisMatters(sanitized), {
      maxItems: 5,
      maxLen: BRIEF_LIMITS.whyThisMatters,
      maxSentences: 2,
      fallback: sanitized.whyThisMatters ?? [],
    }),
    keyDevelopments: developments.length > 0 ? developments : ["Monitoring for follow-on developments."],
    scenarios,
    marketImpactTags,
    marketImpact: sanitized.marketImpact ?? {},
    sectorImpact: unique(scenarios.flatMap((scenario) => scenario.impact?.sectors ?? [])).slice(0, 6),
    sourceTrace,
    confidenceDrivers: buildConfidenceDrivers(sanitized),
    confidenceExplanation: explainConfidence(sanitized),
    confidenceRationale: sanitized.confidenceRationale ?? explainConfidence(sanitized),
    locationConfidence: location.confidence,
    locationReason: location.reason,
    watchIndicators,
    recentTrend: deriveRecentTrend(sanitized, allEvents),
    category: classification.category,
    severityScore: classification.severityScore,
    impactScore: classification.impactScore,
    confidenceScore: classification.confidenceScore,
    relatedEvents,
    sourceAssessment: sanitized.sourceAssessment ?? {
      sourceCount: sourceTrace.sourceCount,
      corroborationLevel: sourceTrace.corroborationLabel,
      limitations: "Open-source reporting can remain incomplete or lag operational developments.",
    },
    aiStatusLabel:
      (sanitized.aiStatus ?? sanitized.ai_status) === "enriched"
        ? "AI enriched"
        : (sanitized.aiStatus ?? sanitized.ai_status) === "cached"
          ? "Cached intelligence"
          : (sanitized.aiStatus ?? sanitized.ai_status) === "provider_error"
            ? "Rule-based briefing after provider error"
            : (sanitized.aiStatus ?? sanitized.ai_status) === "budget_exhausted"
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
  const activityTime = (event) => new Date(
    event.refreshedAt ??
    event.refreshed_at ??
    event.lastSeenAt ??
    event.last_seen_at ??
    event.newestSourceAt ??
    event.newest_source_at ??
    event.updatedAt ??
    event.updated_at ??
    event.timestamp ??
    Date.now()
  ).getTime();
  const newest = Math.max(...events.map(activityTime));
  const windowStart = newest - hours * 3600_000;
  const cutoff = windowStart + (Math.max(0, Math.min(100, sliderPercent)) / 100) * (newest - windowStart);

  return events.filter((event) => {
    const eventTime = activityTime(event);
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
