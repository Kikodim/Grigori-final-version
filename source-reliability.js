const TIER_ORDER = {
  T1_VERIFIED_PRIMARY: 1,
  T2_RELIABLE_SECONDARY: 2,
  T3_MIXED_OR_BIASED: 3,
  T4_LOW_RELIABILITY: 4,
  T5_RAW_UNVERIFIED: 5,
  UNKNOWN: 6,
};

export const SOURCE_FLAGS = {
  KNOWN_BIAS: "Known bias",
  STATE_MEDIA: "State media",
  LOW_RELIABILITY: "Low reliability",
  UNVERIFIED: "Unverified",
  AGGREGATOR: "Aggregator",
  CONFLICT_ESCALATION_BIAS: "Escalation-framing risk",
  CONSPIRACY_ADJACENT: "Conspiracy-adjacent",
  REQUIRES_CORROBORATION: "Requires corroboration",
};

const SOURCE_REGISTRY = {
  "reuters.com": { tier: "T1_VERIFIED_PRIMARY", label: "Verified Primary", sourceType: "Wire service", confidenceCap: "High", scenarioEligible: true },
  "apnews.com": { tier: "T1_VERIFIED_PRIMARY", label: "Verified Primary", sourceType: "Wire service", confidenceCap: "High", scenarioEligible: true },
  "ap.org": { tier: "T1_VERIFIED_PRIMARY", label: "Verified Primary", sourceType: "Wire service", confidenceCap: "High", scenarioEligible: true },
  "afp.com": { tier: "T1_VERIFIED_PRIMARY", label: "Verified Primary", sourceType: "Wire service", confidenceCap: "High", scenarioEligible: true },
  "bbc.com": { tier: "T1_VERIFIED_PRIMARY", label: "Verified Primary", sourceType: "Established news", confidenceCap: "High", scenarioEligible: true },
  "bbc.co.uk": { tier: "T1_VERIFIED_PRIMARY", label: "Verified Primary", sourceType: "Established news", confidenceCap: "High", scenarioEligible: true },
  "ft.com": { tier: "T2_RELIABLE_SECONDARY", label: "Reliable Secondary", sourceType: "Financial press", confidenceCap: "High", scenarioEligible: true },
  "bloomberg.com": { tier: "T2_RELIABLE_SECONDARY", label: "Reliable Secondary", sourceType: "Financial press", confidenceCap: "High", scenarioEligible: true },
  "wsj.com": { tier: "T2_RELIABLE_SECONDARY", label: "Reliable Secondary", sourceType: "Financial press", confidenceCap: "High", scenarioEligible: true },
  "aljazeera.com": { tier: "T2_RELIABLE_SECONDARY", label: "Reliable Secondary", sourceType: "Established news", confidenceCap: "Medium", scenarioEligible: true },
  "theguardian.com": { tier: "T2_RELIABLE_SECONDARY", label: "Reliable Secondary", sourceType: "Established news", confidenceCap: "Medium", scenarioEligible: true },
  "kyivindependent.com": { tier: "T2_RELIABLE_SECONDARY", label: "Reliable Secondary", sourceType: "Regional specialist", confidenceCap: "Medium", scenarioEligible: true },
  "zerohedge.com": {
    tier: "T3_MIXED_OR_BIASED",
    label: "Mixed reliability",
    sourceType: "Ideological/aggregator",
    biasFlags: ["KNOWN_BIAS", "CONFLICT_ESCALATION_BIAS", "REQUIRES_CORROBORATION"],
    notes: "Useful for early monitoring only when corroborated by higher-tier reporting.",
    confidenceCap: "Low",
    scenarioEligible: "corroborated_only",
    countsAsIndependentSource: true,
  },
  "rt.com": {
    tier: "T3_MIXED_OR_BIASED",
    label: "Mixed reliability",
    sourceType: "State media",
    biasFlags: ["STATE_MEDIA", "KNOWN_BIAS", "REQUIRES_CORROBORATION"],
    confidenceCap: "Low",
    scenarioEligible: "corroborated_only",
  },
  "tass.com": {
    tier: "T3_MIXED_OR_BIASED",
    label: "Mixed reliability",
    sourceType: "State media",
    biasFlags: ["STATE_MEDIA", "KNOWN_BIAS", "REQUIRES_CORROBORATION"],
    confidenceCap: "Low",
    scenarioEligible: "corroborated_only",
  },
  "sputnikglobe.com": {
    tier: "T3_MIXED_OR_BIASED",
    label: "Mixed reliability",
    sourceType: "State media",
    biasFlags: ["STATE_MEDIA", "KNOWN_BIAS", "REQUIRES_CORROBORATION"],
    confidenceCap: "Low",
    scenarioEligible: "corroborated_only",
  },
  "sott.net": {
    tier: "T4_LOW_RELIABILITY",
    label: "Low reliability",
    sourceType: "Low-reliability site",
    biasFlags: ["LOW_RELIABILITY", "CONSPIRACY_ADJACENT", "REQUIRES_CORROBORATION"],
    notes: "Restricted to monitoring unless strongly corroborated by verified sources.",
    confidenceCap: "Very Low",
    scenarioEligible: false,
    countsAsIndependentSource: false,
  },
};

const UNKNOWN_SOURCE = {
  tier: "UNKNOWN",
  label: "Unknown reliability",
  sourceType: "Unclassified source",
  biasFlags: ["REQUIRES_CORROBORATION"],
  notes: "Domain has not been classified yet; Grigori applies conservative handling.",
  confidenceCap: "Low",
  scenarioEligible: "corroborated_only",
  countsAsIndependentSource: true,
};

function safeString(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeDomain(value) {
  const raw = safeString(value).trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split("?")[0]
      .trim();
  }
}

function isOfficialDomain(domain) {
  return /\.(gov|mil)$/.test(domain) ||
    domain.endsWith(".gov.uk") ||
    domain.endsWith(".europa.eu") ||
    domain.endsWith(".int") ||
    ["nato.int", "un.org", "europa.eu", "ecb.europa.eu", "worldbank.org", "imf.org"].some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
}

export function getSourceReliability(value) {
  const domain = normalizeDomain(value);
  if (!domain) return { domain: "unknown", ...UNKNOWN_SOURCE };
  if (isOfficialDomain(domain)) {
    return {
      domain,
      tier: "T1_VERIFIED_PRIMARY",
      label: "Verified Primary",
      sourceType: "Official source",
      biasFlags: [],
      notes: "Official or institutional domain.",
      confidenceCap: "High",
      scenarioEligible: true,
      countsAsIndependentSource: true,
    };
  }
  const exact = SOURCE_REGISTRY[domain];
  const suffix = Object.keys(SOURCE_REGISTRY).find((registered) => domain.endsWith(`.${registered}`));
  const entry = exact ?? (suffix ? SOURCE_REGISTRY[suffix] : null) ?? UNKNOWN_SOURCE;
  return {
    domain,
    biasFlags: [],
    countsAsIndependentSource: true,
    ...entry,
  };
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}

export function summarizeSourceReliability(domains = []) {
  const sources = unique(domains.map(normalizeDomain)).map(getSourceReliability);
  const safeSources = sources.length ? sources : [getSourceReliability("")];
  const tierCounts = safeSources.reduce((acc, source) => {
    acc[source.tier] = (acc[source.tier] ?? 0) + 1;
    return acc;
  }, {});
  const flags = unique(safeSources.flatMap((source) => source.biasFlags ?? []));
  const independentSources = safeSources.filter((source) => source.countsAsIndependentSource !== false);
  const t1t2Count = safeSources.filter((source) => ["T1_VERIFIED_PRIMARY", "T2_RELIABLE_SECONDARY"].includes(source.tier)).length;
  const t3Count = tierCounts.T3_MIXED_OR_BIASED ?? 0;
  const t4Count = tierCounts.T4_LOW_RELIABILITY ?? 0;
  const t5Count = tierCounts.T5_RAW_UNVERIFIED ?? 0;
  const unknownCount = tierCounts.UNKNOWN ?? 0;
  const worstTier = safeSources.reduce((worst, source) => (
    (TIER_ORDER[source.tier] ?? 99) > (TIER_ORDER[worst] ?? 0) ? source.tier : worst
  ), "T1_VERIFIED_PRIMARY");
  const bestTier = safeSources.reduce((best, source) => (
    (TIER_ORDER[source.tier] ?? 99) < (TIER_ORDER[best] ?? 99) ? source.tier : best
  ), "UNKNOWN");

  let sourceQuality = "Unknown";
  if (t4Count || t5Count) sourceQuality = "Restricted";
  else if (t3Count && t1t2Count) sourceQuality = "Mixed";
  else if (t3Count || unknownCount) sourceQuality = "Mixed";
  else if (t1t2Count >= 2) sourceQuality = "High";
  else if (t1t2Count === 1) sourceQuality = "Medium";

  const confidenceCap = t4Count || t5Count
    ? "Very Low"
    : t3Count && t1t2Count === 0
      ? "Low"
      : unknownCount && independentSources.length <= 1
        ? "Low"
        : "High";

  return {
    domains: safeSources.map((source) => source.domain),
    sources: safeSources,
    tierCounts,
    flags,
    bestTier,
    worstTier,
    sourceQuality,
    sourceQualityLabel: sourceQuality,
    independentSourceCount: independentSources.length,
    t1t2Count,
    lowReliabilityCount: t4Count + t5Count,
    mixedReliabilityCount: t3Count,
    unknownCount,
    confidenceCap,
    requiresCorroboration: flags.includes("REQUIRES_CORROBORATION") || t3Count > 0 || t4Count > 0 || unknownCount > 0,
    scenarioRestricted: safeSources.some((source) => source.scenarioEligible === false),
  };
}

const CONFIDENCE_ORDER = ["Very Low", "Low", "Medium", "High"];

export function capConfidenceLevel(confidence, cap = "High") {
  const normalized = CONFIDENCE_ORDER.includes(confidence) ? confidence : "Low";
  const normalizedCap = CONFIDENCE_ORDER.includes(cap) ? cap : "High";
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(normalized), CONFIDENCE_ORDER.indexOf(normalizedCap))];
}

function eventFreshnessHours(event = {}) {
  const value = event.refreshedAt ?? event.refreshed_at ?? event.lastSeenAt ?? event.last_seen_at ??
    event.newestSourceAt ?? event.newest_source_at ?? event.updatedAt ?? event.updated_at ??
    event.createdAt ?? event.created_at ?? event.timestamp;
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3600_000) : null;
}

function contentTypeBlocked(event = {}) {
  const contentTypes = [
    ...(Array.isArray(event.contentTypes) ? event.contentTypes : []),
    ...(Array.isArray(event.sourceAssessment?.contentTypes) ? event.sourceAssessment.contentTypes : []),
  ].map((item) => safeString(item).toLowerCase());
  const corpus = `${event.title ?? ""} ${event.summary ?? ""} ${event.briefSummary ?? ""}`;
  return contentTypes.some((type) => /opinion|editorial|letter/i.test(type)) ||
    /\b(opinion|op-ed|editorial|letter to the editor|commentary|thoughts on)\b/i.test(corpus);
}

export function evaluateScenarioEligibility(event = {}) {
  const domains = Array.isArray(event.sourceSignals?.uniqueSources)
    ? event.sourceSignals.uniqueSources
    : Array.isArray(event.sourceDomains)
      ? event.sourceDomains
      : Array.isArray(event.sources)
        ? event.sources
        : [];
  const sourceSummary = summarizeSourceReliability(domains);
  const sourceCount = Number(event.sourceSignals?.sourceCount ?? sourceSummary.independentSourceCount ?? 0);
  const independentSources = Number(event.sourceSignals?.independentDomainCount ?? sourceSummary.independentSourceCount ?? 0);
  const baseConfidence = event.confidence === "High" || event.confidence === "Medium" || event.confidence === "Low" ? event.confidence : "Low";
  const displayConfidence = capConfidenceLevel(baseConfidence, sourceSummary.confidenceCap);
  const impactScore = Number(event.impactScore ?? event.importanceScore ?? event.priorityScore ?? 0);
  const freshnessHours = eventFreshnessHours(event);
  const isFreshEnough = freshnessHours === null || freshnessHours <= 72 || Boolean(event.isOngoing ?? event.ongoing ?? event.isHistorical === false);
  const unresolvedRegion = /region under review|location under review|unknown/i.test(safeString(event.location?.label ?? event.region));
  const reasons = [];

  if (contentTypeBlocked(event)) reasons.push("Opinion/editorial/letter content");
  if (sourceSummary.lowReliabilityCount && sourceSummary.t1t2Count === 0) reasons.push("Low-reliability source requires corroboration");
  if (sourceSummary.mixedReliabilityCount && sourceSummary.t1t2Count === 0) reasons.push("Mixed-reliability source requires corroboration");
  if (independentSources <= 1) reasons.push("Single independent source");
  if (sourceSummary.unknownCount && independentSources <= 1) reasons.push("Unknown single-source signal");
  if (displayConfidence === "Very Low") reasons.push("Very low confidence");
  if (unresolvedRegion && sourceSummary.requiresCorroboration) reasons.push("Location unresolved with weak source support");
  if (!isFreshEnough) reasons.push("Signal is older than the scenario modeling window");

  const strongSingleSourceException = independentSources === 1 &&
    sourceSummary.t1t2Count >= 1 &&
    impactScore >= 80 &&
    !contentTypeBlocked(event) &&
    isFreshEnough;

  const fullEligible = independentSources >= 3 &&
    sourceSummary.t1t2Count >= 2 &&
    !sourceSummary.scenarioRestricted &&
    displayConfidence !== "Very Low" &&
    !contentTypeBlocked(event) &&
    isFreshEnough &&
    !(unresolvedRegion && sourceSummary.requiresCorroboration);

  const eligible = fullEligible || strongSingleSourceException;
  const mode = fullEligible ? "full" : strongSingleSourceException ? "limited" : "watch";
  const fallbackReason = reasons[0] ?? "Insufficient independent corroboration";

  return {
    eligible,
    mode,
    reasons: eligible && mode === "limited" ? ["Limited scenario model, single high-trust source."] : unique(reasons),
    sourceSummary,
    confidenceCap: sourceSummary.confidenceCap,
    displayConfidence,
    explanation: eligible
      ? mode === "limited"
        ? "Limited scenario model, single high-trust source."
        : "Full scenario model allowed by source reliability and corroboration thresholds."
      : fallbackReason,
    signalWatch: {
      reason: fallbackReason,
      sourceCount,
      independentSources,
      sourceQuality: sourceSummary.sourceQualityLabel,
      whatWeKnow: event.summary ?? event.briefSummary ?? event.title ?? "Grigori is monitoring this signal for corroboration.",
      improveConfidence: ["additional independent sources", "official confirmation", "higher-tier reporting", "clearer location", "corroborating regional reporting"],
    },
  };
}

export function formatSourceReliability(source) {
  const item = source?.tier ? source : getSourceReliability(source);
  const flags = (item.biasFlags ?? []).map((flag) => SOURCE_FLAGS[flag] ?? flag);
  return {
    domain: item.domain,
    label: item.label,
    sourceType: item.sourceType,
    flags,
    tier: item.tier,
    compact: `${item.domain} · ${item.label}`,
  };
}
