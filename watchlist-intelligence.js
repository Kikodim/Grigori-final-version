import { evaluateScenarioEligibility } from "./source-reliability.js";

export const SELECTED_WATCHLIST_STORAGE_KEY = "grigori:selected-watchlist";

export const WATCHLIST_PRESETS = [
  {
    id: "global_high_impact",
    name: "Global High Impact",
    description: "Highest-impact credible signals across regions and categories.",
    regions: [],
    keywords: ["escalation", "sanctions", "shipping", "energy", "military", "cyber", "election", "protest"],
    sectors: ["energy", "shipping", "defense", "finance", "technology", "trade"],
    categories: ["military", "political", "energy", "cyber", "sanctions", "infrastructure"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextChokepoints"],
    rankingBoosts: { highImpact: 28, escalating: 22, fresh: 16, reliableSources: 18 },
    alertRules: ["impact_over_80", "confidence_upgrade", "new_t1_t2_confirmation", "scenario_graduation"],
  },
  {
    id: "energy_shipping",
    name: "Energy & Shipping Risk",
    description: "Chokepoints, oil/gas, ports, shipping disruption, freight, and commodities.",
    regions: ["Strait of Hormuz", "Red Sea", "Bab el-Mandeb", "Suez", "Black Sea", "Malacca"],
    keywords: ["hormuz", "red sea", "bab el-mandeb", "suez", "malacca", "oil", "gas", "lng", "tanker", "shipping", "port", "freight", "insurance", "rerouting"],
    sectors: ["oil", "gas", "shipping", "logistics", "commodities", "energy", "ports"],
    categories: ["energy", "shipping", "military", "infrastructure", "trade"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextChokepoints", "contextPorts", "contextEnergy", "vessels"],
    rankingBoosts: { chokepoint: 34, shipping: 30, oil: 28, port: 20, fresh: 14 },
    alertRules: ["chokepoint_signal", "impact_over_80", "source_volume_doubles", "scenario_graduation"],
  },
  {
    id: "middle_east",
    name: "Middle East Escalation",
    description: "Gulf, Iran, Israel/Gaza, Red Sea, regional military posture, and diplomatic spillover.",
    regions: ["Middle East", "Strait of Hormuz", "Red Sea", "Gulf", "Israel", "Iran", "Yemen"],
    keywords: ["iran", "israel", "gaza", "houthi", "yemen", "gulf", "hormuz", "missile", "drone", "naval", "proxy"],
    sectors: ["energy", "shipping", "defense", "finance"],
    categories: ["military", "political", "energy", "sanctions"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextChokepoints", "contextPorts", "contextEnergy", "contextMilitaryBases"],
    rankingBoosts: { military: 28, chokepoint: 24, escalating: 22, sanctions: 14 },
    alertRules: ["impact_over_80", "new_t1_t2_confirmation", "chokepoint_signal"],
  },
  {
    id: "black_sea_ukraine",
    name: "Black Sea / Ukraine",
    description: "Black Sea maritime risk, Ukraine/Russia military pressure, ports, grain, and energy corridors.",
    regions: ["Black Sea", "Ukraine", "Russia / Ukraine", "Odesa", "Crimea", "Bosporus"],
    keywords: ["ukraine", "russia", "black sea", "odesa", "crimea", "grain", "port", "bosporus", "drone", "missile"],
    sectors: ["shipping", "food", "energy", "defense", "trade"],
    categories: ["military", "shipping", "infrastructure", "sanctions", "energy"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextChokepoints", "contextPorts", "contextEnergy", "contextMilitaryBases"],
    rankingBoosts: { military: 26, port: 20, shipping: 22, infrastructure: 18 },
    alertRules: ["impact_over_80", "source_volume_doubles", "confidence_upgrade"],
  },
  {
    id: "europe_balkans",
    name: "Europe / Balkans Stability",
    description: "European security, Balkans instability, elections, EU pressure, energy security, and infrastructure.",
    regions: ["Europe", "Balkans", "Black Sea", "EU", "Eastern Europe", "Baltic"],
    keywords: ["balkans", "serbia", "kosovo", "bosnia", "eu", "nato", "election", "protest", "coalition", "grid", "energy security"],
    sectors: ["energy", "finance", "defense", "infrastructure"],
    categories: ["political", "military", "sanctions", "infrastructure", "election"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextCities", "contextAirports", "contextEnergy", "contextMilitaryBases"],
    rankingBoosts: { political: 24, infrastructure: 18, energy: 16, military: 16 },
    alertRules: ["signal_volume_doubles", "confidence_upgrade", "new_t1_t2_confirmation"],
  },
  {
    id: "asia_pacific_taiwan",
    name: "Asia-Pacific / Taiwan",
    description: "Taiwan Strait, South China Sea, semiconductor exposure, military activity, and trade lanes.",
    regions: ["Taiwan Strait", "Taiwan", "South China Sea", "Asia-Pacific", "China", "Korea"],
    keywords: ["taiwan", "china", "pla", "south china sea", "semiconductor", "tsmc", "chip", "malacca", "naval", "airspace"],
    sectors: ["technology", "semiconductors", "shipping", "defense", "trade"],
    categories: ["military", "technology", "shipping", "trade", "sanctions"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextChokepoints", "contextPorts", "contextAirports", "contextMilitaryBases"],
    rankingBoosts: { military: 26, technology: 24, shipping: 18, chokepoint: 16 },
    alertRules: ["impact_over_80", "chokepoint_signal", "new_t1_t2_confirmation"],
  },
  {
    id: "cyber_infrastructure",
    name: "Cyber & Infrastructure",
    description: "Cyber incidents, outages, telecom, energy infrastructure, operational disruption, and sanctions spillover.",
    regions: [],
    keywords: ["cyber", "outage", "infrastructure", "telecom", "pipeline", "grid", "sabotage", "malware", "ransomware", "sanctions"],
    sectors: ["cyber", "technology", "energy", "telecom", "infrastructure", "finance"],
    categories: ["cyber", "infrastructure", "outage", "sanctions", "energy"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextCities", "contextEnergy", "contextAirports"],
    rankingBoosts: { cyber: 34, infrastructure: 30, outage: 24, energy: 16 },
    alertRules: ["confidence_upgrade", "source_volume_doubles", "new_t1_t2_confirmation", "scenario_graduation"],
  },
  {
    id: "political_stability",
    name: "Political Stability",
    description: "Elections, protests, coalition pressure, courts, regulatory stress, and legitimacy shocks.",
    regions: [],
    keywords: ["election", "protest", "coalition", "parliament", "court", "government", "instability", "regulation", "strike"],
    sectors: ["finance", "public sector", "infrastructure", "trade"],
    categories: ["political", "election", "protest", "sanctions"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextCities", "contextAirports"],
    rankingBoosts: { political: 30, protest: 22, election: 22, finance: 12 },
    alertRules: ["signal_volume_doubles", "confidence_upgrade", "new_t1_t2_confirmation"],
  },
  {
    id: "military_security",
    name: "Military / Security",
    description: "Military posture, naval/air activity, missile/drone signals, alliance posture, and security spillover.",
    regions: [],
    keywords: ["military", "missile", "drone", "naval", "airspace", "nato", "troop", "warship", "base", "strike", "defense"],
    sectors: ["defense", "shipping", "aviation", "energy"],
    categories: ["military", "security", "defense", "infrastructure"],
    minimumConfidence: "Low",
    minimumSourceQuality: "Mixed",
    preferredLayers: ["contextMilitaryBases", "contextAirports", "contextChokepoints", "satellites"],
    rankingBoosts: { military: 34, defense: 28, airspace: 18, naval: 22 },
    alertRules: ["impact_over_80", "new_t1_t2_confirmation", "chokepoint_signal"],
  },
];

const CONFIDENCE_SCORE = { "Very Low": 0, Low: 1, Medium: 2, High: 3 };
const SOURCE_QUALITY_SCORE = { Restricted: 0, Low: 1, Unknown: 1, Mixed: 2, Medium: 3, High: 4 };

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function lower(value) {
  return safeString(value).toLowerCase();
}

function unique(values) {
  return [...new Set(list(values).map((item) => safeString(item).trim()).filter(Boolean))];
}

export function getWatchlistById(id) {
  return WATCHLIST_PRESETS.find((item) => item.id === id) ?? WATCHLIST_PRESETS[0];
}

function eventText(event = {}) {
  return [
    event.title,
    event.summary,
    event.briefSummary,
    event.category,
    event.region,
    event.location?.label,
    event.tone,
    ...list(event.keywords),
    ...list(event.marketImpactTags),
  ].map((item) => safeString(item)).join(" ").toLowerCase();
}

function eventSectors(event = {}) {
  return unique([
    ...list(event.marketImpactTags),
    ...list(event.sectorImpact),
    ...list(event.scenarios).flatMap((scenario) => list(scenario.impact?.sectors)),
  ]).map(lower);
}

function eventAgeHours(event = {}) {
  const value = event.refreshedAt ?? event.refreshed_at ?? event.lastSeenAt ?? event.last_seen_at ??
    event.updatedAt ?? event.updated_at ?? event.newestSourceAt ?? event.newest_source_at ??
    event.createdAt ?? event.created_at ?? event.timestamp;
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? Math.max(0, (Date.now() - time) / 3600_000) : 999;
}

function qualityScore(event = {}) {
  const eligibility = event.scenarioEligibility ?? evaluateScenarioEligibility(event);
  const quality = eligibility.sourceSummary?.sourceQualityLabel ?? event.sourceReliability?.sourceQualityLabel ?? event.sourceSignals?.trustLabel ?? "Unknown";
  return SOURCE_QUALITY_SCORE[quality] ?? 1;
}

export function matchEventToWatchlist(event = {}, watchlist = WATCHLIST_PRESETS[0]) {
  const text = eventText(event);
  const sectors = eventSectors(event);
  const regionMatches = list(watchlist.regions).filter((region) => text.includes(lower(region)));
  const keywordMatches = list(watchlist.keywords).filter((keyword) => text.includes(lower(keyword)));
  const sectorMatches = list(watchlist.sectors).filter((sector) => sectors.includes(lower(sector)) || text.includes(lower(sector)));
  const categoryMatches = list(watchlist.categories).filter((category) => lower(event.category).includes(lower(category)) || text.includes(lower(category)));
  const reasons = [
    ...regionMatches.slice(0, 2).map((item) => `region: ${item}`),
    ...keywordMatches.slice(0, 3).map((item) => `keyword: ${item}`),
    ...sectorMatches.slice(0, 2).map((item) => `sector: ${item}`),
    ...categoryMatches.slice(0, 2).map((item) => `category: ${item}`),
  ];
  const score = regionMatches.length * 24 + keywordMatches.length * 9 + sectorMatches.length * 16 + categoryMatches.length * 14;
  return {
    matched: score > 0 || watchlist.id === "global_high_impact",
    score: watchlist.id === "global_high_impact" ? Math.max(score, 8) : score,
    reasons: unique(reasons).slice(0, 6),
    regionMatches,
    keywordMatches,
    sectorMatches,
    categoryMatches,
  };
}

export function rankSignalsForWatchlist(events = [], watchlist = WATCHLIST_PRESETS[0]) {
  const ranked = list(events).map((event) => {
    const match = matchEventToWatchlist(event, watchlist);
    const eligibility = event.scenarioEligibility ?? evaluateScenarioEligibility(event);
    const sourceQuality = qualityScore(event);
    const confidence = CONFIDENCE_SCORE[eligibility.displayConfidence ?? event.confidence ?? "Low"] ?? 1;
    const ageHours = eventAgeHours(event);
    const freshness = ageHours <= 6 ? 100 : ageHours <= 24 ? 72 : ageHours <= 72 ? 45 : 18;
    const sourceCount = Number(event.sourceSignals?.sourceCount ?? 0);
    const impact = Number(event.impactScore ?? event.importanceScore ?? event.priorityScore ?? 0);
    const base = impact * 0.34 + confidence * 9 + sourceQuality * 9 + freshness * 0.16 + Math.min(70, sourceCount * 6);
    const boost = match.score + (eligibility.eligible ? 12 : -16) + (eligibility.displayConfidence === "Very Low" ? -55 : 0) + (sourceQuality <= 0 ? -45 : 0);
    return {
      ...event,
      analystLensMatch: {
        watchlistId: watchlist.id,
        watchlistName: watchlist.name,
        ...match,
      },
      watchlistPriorityScore: Math.round(base + boost),
    };
  });

  const hasMatches = ranked.some((event) => event.analystLensMatch?.matched && event.analystLensMatch?.score > 0);
  return ranked.sort((a, b) => {
    const aMatch = hasMatches ? Number(a.analystLensMatch?.score ?? 0) : 0;
    const bMatch = hasMatches ? Number(b.analystLensMatch?.score ?? 0) : 0;
    return bMatch - aMatch ||
      Number(b.watchlistPriorityScore ?? 0) - Number(a.watchlistPriorityScore ?? 0) ||
      Number(b.impactScore ?? 0) - Number(a.impactScore ?? 0);
  });
}

export function buildAlertPreview(events = [], watchlist = WATCHLIST_PRESETS[0]) {
  const ranked = rankSignalsForWatchlist(events, watchlist);
  const alerts = [];
  const addAlert = (event, reason, severity = "watch") => {
    if (!event || alerts.some((item) => item.eventId === event.id && item.reason === reason)) return;
    alerts.push({
      eventId: event.id,
      event,
      title: event.title ?? "Untitled signal",
      reason,
      severity,
      sourceQuality: event.scenarioEligibility?.sourceSummary?.sourceQualityLabel ?? event.sourceReliability?.sourceQualityLabel ?? event.sourceSignals?.trustLabel ?? "Unknown",
    });
  };

  ranked.slice(0, 12).forEach((event) => {
    const eligibility = event.scenarioEligibility ?? evaluateScenarioEligibility(event);
    const match = event.analystLensMatch ?? matchEventToWatchlist(event, watchlist);
    if (!match.matched && watchlist.id !== "global_high_impact") return;
    if (Number(event.impactScore ?? 0) >= 80) addAlert(event, "impact crosses 80", "high");
    if (eligibility.eligible && eligibility.mode === "full") addAlert(event, "scenario eligibility active", "medium");
    if (eligibility.sourceSummary?.t1t2Count >= 1 && eligibility.sourceSummary?.requiresCorroboration) addAlert(event, "credible source corroborating weaker signal", "medium");
    if (match.keywordMatches?.some((keyword) => /hormuz|suez|red sea|bab el-mandeb|malacca|chokepoint/i.test(keyword))) addAlert(event, "chokepoint signal appears", "medium");
    if (Number(event.sourceSignals?.sourceCount ?? 0) >= 6) addAlert(event, "source volume is elevated", "watch");
  });

  return {
    alerts: alerts.slice(0, 5),
    message: alerts.length ? `${alerts.length} alert trigger${alerts.length === 1 ? "" : "s"} would fire for this lens.` : "No alert triggers currently.",
  };
}

export function buildMorningBrief(events = [], watchlist = WATCHLIST_PRESETS[0], options = {}) {
  const ranked = rankSignalsForWatchlist(events, watchlist);
  const matching = ranked.filter((event) => event.analystLensMatch?.matched);
  const material = matching.length ? matching : ranked;
  const topAttention = material
    .filter((event) => (event.scenarioEligibility?.displayConfidence ?? event.confidence) !== "Very Low")
    .slice(0, 3);
  const signalWatchCount = material.filter((event) => event.scenarioEligibility && !event.scenarioEligibility.eligible).length;
  const escalations = material.filter((event) => /escalating|high/i.test(`${event.tone} ${event.intensity}`)).slice(0, 4);
  const strongest = topAttention[0] ?? material[0] ?? null;
  const watchNext = unique([
    ...list(watchlist.keywords).filter((keyword) => /hormuz|shipping|oil|cyber|election|protest|naval|port|sanctions|infrastructure|taiwan|ukraine/i.test(keyword)).slice(0, 4),
    "official confirmation",
    "source quality changes",
    "new corroborating reports",
  ]).slice(0, 6);
  const providerCoverage = options.feedState?.providerCoverageStatus ?? options.refreshState?.detail?.providerCoverageStatus ?? "checked";
  const bottomLine = strongest
    ? `${watchlist.name} is led by ${strongest.title}, with ${strongest.scenarioEligibility?.displayConfidence ?? strongest.confidence ?? "Low"} confidence and ${strongest.sourceSignals?.sourceCount ?? 0} source signal${Number(strongest.sourceSignals?.sourceCount ?? 0) === 1 ? "" : "s"}.`
    : `No strong matches for ${watchlist.name} right now. Showing global high-impact context.`;

  return {
    watchlistName: watchlist.name,
    generatedAt: new Date().toISOString(),
    bottomLine,
    topAttention,
    whatChanged: [
      `${material.length} signal${material.length === 1 ? "" : "s"} match or support this analyst lens.`,
      `${escalations.length} escalation-style signal${escalations.length === 1 ? "" : "s"} currently visible.`,
      `${signalWatchCount} signal${signalWatchCount === 1 ? "" : "s"} are in Signal Watch or limited-model handling.`,
      options.whatChangedSummary?.summaryBullets?.[0] ?? "Few material changes since the last refresh.",
    ].filter(Boolean),
    newEscalations: escalations,
    signalWatchCount,
    strongestSituation: options.situations?.[0]?.title ?? strongest?.title ?? "No strong situation forming yet",
    watchNext,
    confidenceCaveat: "Morning Brief is deterministic and source-aware. It summarizes Grigori's stored/open-source signals and should not be treated as a forecast.",
    providerCoverage,
  };
}
