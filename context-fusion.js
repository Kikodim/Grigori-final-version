import {
  buildStrategicSituations,
  computeGeoAccuracy,
  findSituationForEvent,
  getEventSourceSignals,
  getMarketImpactTags,
  inferLocationDetails,
} from "./event-insights.js";
import { CONTEXT_LAYER_DEFS, getContextItemsForLayer } from "./context-layers.js";

const EARTH_RADIUS_KM = 6371;
const CONFIDENCE_SCORE = { Low: 1, Medium: 2, High: 3 };

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function lower(value) {
  return safeString(value).toLowerCase();
}

function unique(items) {
  return [...new Set(list(items).map((item) => safeString(item).trim()).filter(Boolean))];
}

function eventTime(event = {}) {
  return event.refreshedAt ?? event.refreshed_at ?? event.lastSeenAt ?? event.last_seen_at ??
    event.newestSourceAt ?? event.newest_source_at ?? event.updatedAt ?? event.updated_at ??
    event.createdAt ?? event.created_at ?? event.timestamp ?? null;
}

function toTime(value) {
  const time = Date.parse(value ?? "");
  return Number.isFinite(time) ? time : null;
}

function buildCorpus(event = {}) {
  return [
    event.title,
    event.summary,
    event.briefSummary,
    event.category,
    event.region,
    event.location?.label,
    ...list(event.keywords),
    ...list(event.marketImpactTags),
    ...getMarketImpactTags(event),
  ].map((item) => safeString(item)).join(" ").toLowerCase();
}

function getEventLocation(event = {}) {
  const location = inferLocationDetails(event);
  const lat = Number(location.lat ?? event.lat);
  const lng = Number(location.lng ?? event.lng);
  return {
    ...location,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function haversineKm(a, b) {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lng) || !Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) return null;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return Math.round(2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function distanceBand(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "unknown";
  if (distanceKm <= 100) return "0-100 km";
  if (distanceKm <= 250) return "100-250 km";
  if (distanceKm <= 500) return "250-500 km";
  if (distanceKm <= 1000) return "500-1000 km";
  return "1000+ km";
}

function allContextItems() {
  return Object.keys(CONTEXT_LAYER_DEFS)
    .flatMap((key) => getContextItemsForLayer(key))
    .filter(Boolean);
}

function relevanceForItem(item, event) {
  const corpus = buildCorpus(event);
  const tags = new Set([...list(event.keywords), ...getMarketImpactTags(event), ...list(event.marketImpactTags)].map(lower));
  const type = item.type;
  let score = Number(item.importance ?? 50) / 10;
  const reasons = [];

  if (type === "chokepoint" && /\b(shipping|tanker|oil|lng|maritime|naval|chokepoint|strait)\b/i.test(corpus)) {
    score += 45;
    reasons.push("chokepoint exposure");
  }
  if (type === "port" && /\b(shipping|port|container|trade|supply|grain|tanker|oil)\b/i.test(corpus)) {
    score += 36;
    reasons.push("shipping or logistics exposure");
  }
  if (type === "energy" && /\b(oil|gas|lng|pipeline|energy|refinery|tanker)\b/i.test(corpus)) {
    score += 38;
    reasons.push("energy infrastructure exposure");
  }
  if (type === "military_base" && /\b(military|naval|air base|airspace|defense|missile|drone|warship|fleet)\b/i.test(corpus)) {
    score += 34;
    reasons.push("public military context");
  }
  if (type === "airport" && /\b(airspace|aviation|airport|evacuation|travel|flight|drone|missile)\b/i.test(corpus)) {
    score += 28;
    reasons.push("aviation or airspace exposure");
  }
  if (type === "city" && /\b(election|protest|parliament|government|court|coalition|civil|sanctions)\b/i.test(corpus)) {
    score += 30;
    reasons.push("political or civil exposure");
  }
  if (list(item.tags).some((tag) => tags.has(lower(tag)) || corpus.includes(lower(tag)))) {
    score += 18;
    reasons.push("shared context tags");
  }

  return {
    score,
    relevance: score >= 65 ? "high" : score >= 42 ? "medium" : "low",
    reasons: unique(reasons),
  };
}

function mapNearbyItems(event) {
  const location = getEventLocation(event);
  const geoAccuracy = computeGeoAccuracy({ ...event, location });
  const maxDistance = ["country", "approximate", "unresolved"].includes(geoAccuracy.value) ? 1000 : 500;
  const items = allContextItems()
    .map((item) => {
      const distanceKm = haversineKm(location, item);
      const relevance = relevanceForItem(item, event);
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        category: item.category ?? item.type,
        country: item.country ?? item.region,
        distanceKm,
        distanceBand: distanceBand(distanceKm),
        relevance: relevance.relevance,
        relevanceReasons: relevance.reasons,
        relevanceScore: relevance.score - Math.max(0, Number(distanceKm ?? 0) / 35),
        whyItMatters: item.whyItMatters,
        geoAccuracy: item.geoAccuracy ?? "approximate",
      };
    })
    .filter((item) => Number.isFinite(item.distanceKm) && item.distanceKm <= maxDistance)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || a.distanceKm - b.distanceKm);

  const byType = (type, cap = 4) => items.filter((item) => item.type === type).slice(0, cap);
  const summaryParts = [
    ["chokepoint", "chokepoint", "chokepoints"],
    ["port", "port", "ports"],
    ["airport", "airport", "airports"],
    ["military_base", "public military facility", "public military facilities"],
    ["energy", "energy node", "energy nodes"],
    ["city", "major city", "major cities"],
  ].map(([type, singular, plural]) => {
    const count = items.filter((item) => item.type === type && item.distanceKm <= 500).length;
    return count > 0 ? `${count} ${count === 1 ? singular : plural}` : null;
  }).filter(Boolean);

  return {
    nearestChokepoints: byType("chokepoint"),
    nearestPorts: byType("port"),
    nearestAirports: byType("airport"),
    nearestMilitaryBases: byType("military_base"),
    nearestEnergyNodes: byType("energy"),
    nearestCities: byType("city"),
    summary: summaryParts.length
      ? `Nearby strategic context: ${summaryParts.join(", ")} within the relevant distance band.`
      : "No strong nearby operational context found in the curated layer set.",
  };
}

function whyLocationMatters(event, location, geoAccuracy) {
  const label = safeString(location.label || event.region);
  const corpus = buildCorpus(event);
  if (/hormuz|persian gulf|gulf of oman/i.test(`${label} ${corpus}`)) {
    return "The Strait of Hormuz is a critical maritime chokepoint linking Gulf energy exports to global shipping routes. Disruption can affect tanker traffic, naval posture, insurance costs, and oil volatility.";
  }
  if (/black sea|odesa|odessa|bosporus/i.test(`${label} ${corpus}`)) {
    return "The Black Sea is a strategic maritime theater linking Ukraine, Russia, Turkey, NATO interests, energy routes, grain exports, and regional military posture.";
  }
  if (/taiwan strait|taiwan|south china sea/i.test(`${label} ${corpus}`)) {
    return "The Taiwan Strait and nearby maritime corridors connect regional security, semiconductor exposure, trade routes, and US-China escalation risk.";
  }
  if (/red sea|bab el-mandeb|suez|yemen/i.test(`${label} ${corpus}`)) {
    return "The Red Sea and Suez-linked corridor is a high-sensitivity trade route where disruption can reroute shipping, raise insurance costs, and affect supply chains.";
  }
  if (geoAccuracy.value === "country") {
    return "Location is country-level. Grigori should treat this as strategic context rather than pinpoint geolocation.";
  }
  if (geoAccuracy.value === "approximate" || geoAccuracy.value === "unresolved") {
    return "Location is approximate or unresolved. Grigori should avoid treating the marker as a precise point.";
  }
  return `${label || "This location"} matters because nearby political, infrastructure, logistics, or security context may shape the event's operational relevance.`;
}

function buildGeoContext(event) {
  const location = getEventLocation(event);
  const geoAccuracy = computeGeoAccuracy({ ...event, location });
  const corpus = buildCorpus(event);
  const chokepointRelevance = /\b(hormuz|suez|bab el-mandeb|bosporus|malacca|taiwan strait|panama canal|gibraltar)\b/i.test(corpus)
    ? "Relevant chokepoint or maritime corridor is present in the signal context."
    : "No explicit chokepoint match detected.";
  return {
    eventLocation: location.label ?? "Location under review",
    situationContext: event.situationContext ?? event.situation_context ?? location.contextLabel ?? location.label ?? "Regional situation under review",
    relatedChokepoint: extractRelatedChokepoint(corpus),
    locationLabel: location.label ?? "Location under review",
    geoAccuracy,
    inferredFrom: geoAccuracy.reason ?? location.reason ?? "Available event metadata and source context.",
    whyLocationMatters: whyLocationMatters(event, location, geoAccuracy),
    chokepointRelevance,
    regionRole: location.reason ?? "Regional role inferred from available context.",
    distanceSummary: ["country", "approximate", "unresolved"].includes(geoAccuracy.value)
      ? "Distance-based context is approximate because the event location is broad."
      : "Distance-based context uses the current event coordinates.",
  };
}

function extractRelatedChokepoint(corpus) {
  const checkpoints = [
    ["Strait of Hormuz", /\b(hormuz|persian gulf|gulf of oman)\b/i],
    ["Bab el-Mandeb / Red Sea", /\b(bab el-mandeb|red sea|houthi|yemen)\b/i],
    ["Suez Canal", /\b(suez)\b/i],
    ["Bosporus / Black Sea", /\b(bosporus|black sea|odesa|odessa)\b/i],
    ["Taiwan Strait", /\b(taiwan strait|taiwan)\b/i],
    ["Strait of Malacca", /\b(malacca)\b/i],
  ];
  return checkpoints.find(([, pattern]) => pattern.test(corpus))?.[0] ?? null;
}

function makeSignalSpecificLocationText(event, geoContext, nearbyContext, related, historicalEcho) {
  const sourceSignals = getEventSourceSignals(event);
  const sectors = unique([...getMarketImpactTags(event), ...list(event.marketImpactTags)]).slice(0, 3);
  const category = event.category ? `${event.category} signal` : "selected signal";
  const location = geoContext.locationLabel ?? "this location";
  const relatedCount = related.relatedSignals?.length ?? 0;
  const historicalCount = historicalEcho.similarSignalsLast30d ?? 0;
  const nearbyAssets = [
    ...(nearbyContext.nearestChokepoints ?? []),
    ...(nearbyContext.nearestPorts ?? []),
    ...(nearbyContext.nearestEnergyNodes ?? []),
    ...(nearbyContext.nearestMilitaryBases ?? []),
  ].slice(0, 3);
  const assetText = nearbyAssets.length
    ? `Nearby context includes ${nearbyAssets.map((item) => item.name).join(", ")}, which makes the location operationally relevant.`
    : "Grigori has limited nearby infrastructure context for this location.";
  const sectorText = sectors.length ? ` with ${sectors.join(", ")} exposure` : "";
  const relatedText = relatedCount
    ? ` ${relatedCount} related signal${relatedCount === 1 ? "" : "s"} are linked by geography, sectors, or keywords.`
    : " No strong related signals are visible under the current lens.";
  const historyText = historicalCount
    ? ` Stored memory shows ${historicalCount} similar signal${historicalCount === 1 ? "" : "s"} in the last 30 days.`
    : " Stored-memory comparison is limited.";

  if (["country", "approximate", "unresolved"].includes(geoContext.geoAccuracy?.value)) {
    return `For this ${category}, ${location} should be treated as ${geoContext.geoAccuracy.label.toLowerCase()} context rather than a pinpoint incident. The cluster has ${sourceSignals.sourceCount} source signal${sourceSignals.sourceCount === 1 ? "" : "s"}${sectorText}.${relatedText}${historyText} ${assetText}`;
  }

  return `For this ${category}, ${location} matters because the active cluster links ${sourceSignals.sourceCount} source signal${sourceSignals.sourceCount === 1 ? "" : "s"}${sectorText} to the mapped location.${relatedText}${historyText} ${assetText}`;
}

function relationScore(event, candidate, situation) {
  if (!candidate || candidate.id === event?.id) return null;
  const reasons = [];
  let score = 0;
  const eventLocation = getEventLocation(event);
  const candidateLocation = getEventLocation(candidate);
  const eventRegion = lower(eventLocation.label);
  const candidateRegion = lower(candidateLocation.label);
  const eventKeywords = new Set(list(event.keywords).map(lower));
  const candidateKeywords = list(candidate.keywords).map(lower);
  const sharedKeywords = candidateKeywords.filter((keyword) => keyword && eventKeywords.has(keyword)).slice(0, 5);
  const eventSectors = new Set([...getMarketImpactTags(event), ...list(event.marketImpactTags)].map(lower));
  const candidateSectors = [...getMarketImpactTags(candidate), ...list(candidate.marketImpactTags)].map(lower);
  const sharedSectors = unique(candidateSectors.filter((sector) => eventSectors.has(sector))).slice(0, 4);
  const distanceKm = haversineKm(eventLocation, candidateLocation);

  if (eventRegion && eventRegion === candidateRegion) {
    score += 28;
    reasons.push("same region");
  }
  if (Number.isFinite(distanceKm) && distanceKm <= 250) {
    score += 20;
    reasons.push("nearby geography");
  }
  if (sharedKeywords.length) {
    score += Math.min(25, sharedKeywords.length * 7);
    reasons.push(`similar keywords: ${sharedKeywords.slice(0, 3).join(", ")}`);
  }
  if (sharedSectors.length) {
    score += Math.min(22, sharedSectors.length * 9);
    reasons.push(`shared sector: ${sharedSectors.slice(0, 2).join(", ")}`);
  }
  if (lower(event.category) && lower(event.category) === lower(candidate.category)) {
    score += 12;
    reasons.push("same category");
  }
  if ((event.clusterSignature ?? event.cluster_signature) && (event.clusterSignature ?? event.cluster_signature) === (candidate.clusterSignature ?? candidate.cluster_signature)) {
    score += 30;
    reasons.push("grouped duplicate/source cluster");
  }
  if ((situation?.linkedEventIds ?? []).includes(candidate.id)) {
    score += 28;
    reasons.push("same situation cluster");
  }
  const eventMs = toTime(eventTime(event));
  const candidateMs = toTime(eventTime(candidate));
  if (eventMs && candidateMs) {
    const hours = Math.abs(eventMs - candidateMs) / 3600_000;
    if (hours <= 72) {
      score += 10;
      reasons.push("recent time proximity");
    }
  }

  if (score <= 0) return null;
  return {
    eventId: candidate.id,
    title: candidate.title ?? "Untitled signal",
    relationshipScore: Math.round(score),
    relationshipReasons: unique(reasons).slice(0, 5),
    freshness: eventTime(candidate),
    confidence: candidate.confidence ?? "Low",
    impactScore: Number(candidate.impactScore ?? candidate.importanceScore ?? 0),
  };
}

function buildRelatedSignals(event, events, situation) {
  const relatedSignals = list(events)
    .map((candidate) => relationScore(event, candidate, situation))
    .filter(Boolean)
    .sort((a, b) => b.relationshipScore - a.relationshipScore || b.impactScore - a.impactScore)
    .slice(0, 8);
  return {
    relatedSignals,
    relationSummary: relatedSignals.length
      ? `${relatedSignals.length} connected signal${relatedSignals.length === 1 ? "" : "s"} found by geography, sectors, keywords, timing, or situation grouping.`
      : "No strong related signals found under the current lens.",
  };
}

function buildHistoricalEcho(event, events) {
  const now = Date.now();
  const related = list(events)
    .map((candidate) => relationScore(event, candidate, null))
    .filter(Boolean)
    .filter((item) => item.relationshipScore >= 25);
  const byId = new Map(list(events).map((item) => [item.id, item]));
  const relatedEvents = related.map((item) => byId.get(item.eventId)).filter(Boolean);
  const last7d = relatedEvents.filter((item) => {
    const time = toTime(eventTime(item));
    return time && now - time <= 7 * 24 * 3600_000;
  });
  const last30d = relatedEvents.filter((item) => {
    const time = toTime(eventTime(item));
    return time && now - time <= 30 * 24 * 3600_000;
  });
  const allTimes = [event, ...relatedEvents].map((item) => toTime(eventTime(item))).filter(Number.isFinite).sort((a, b) => a - b);
  const previousPeakImpact = Math.max(0, ...relatedEvents.map((item) => Number(item.impactScore ?? item.importanceScore ?? 0)));
  const currentSources = getEventSourceSignals(event).sourceCount;
  const previousSources = Math.max(0, ...relatedEvents.map((item) => getEventSourceSignals(item).sourceCount));
  const currentConfidence = CONFIDENCE_SCORE[event.confidence] ?? Number(event.confidenceScore ?? 0) / 33;
  const previousConfidence = Math.max(0, ...relatedEvents.map((item) => CONFIDENCE_SCORE[item.confidence] ?? Number(item.confidenceScore ?? 0) / 33));
  const recurringKeywords = unique(relatedEvents.flatMap((item) => list(item.keywords))).slice(0, 8);

  let historicalSummary = "Limited historical echo. No strong similar signal found in Grigori's stored memory.";
  if (last30d.length) {
    const sourcePhrase = currentSources > previousSources ? "source count is higher" : currentSources === previousSources ? "source count is similar" : "source count is lower";
    const confidencePhrase = currentConfidence > previousConfidence ? "confidence appears stronger" : currentConfidence === previousConfidence ? "confidence is broadly similar" : "confidence is weaker";
    historicalSummary = `Within Grigori's stored memory, ${last7d.length} similar signal${last7d.length === 1 ? "" : "s"} appeared in the last 7 days and ${last30d.length} in the last 30 days. Current ${sourcePhrase} and ${confidencePhrase} than prior related signals.`;
  }

  return {
    similarSignalsLast7d: last7d.length,
    similarSignalsLast30d: last30d.length,
    firstSeen: allTimes.length ? new Date(allTimes[0]).toISOString() : eventTime(event),
    previousPeakImpact,
    confidenceTrend: currentConfidence > previousConfidence ? "up" : currentConfidence < previousConfidence ? "down" : "flat/limited",
    sourceTrend: currentSources > previousSources ? "up" : currentSources < previousSources ? "down" : "flat/limited",
    sectorTrend: getMarketImpactTags(event).join(", ") || "limited sector signal",
    recurringKeywords,
    historicalSummary,
  };
}

function getEffectTemplate(event) {
  const corpus = buildCorpus(event);
  if (/\b(hormuz|suez|bab el-mandeb|malacca|shipping|tanker|oil|lng|chokepoint)\b/i.test(corpus)) {
    return {
      primaryEffects: ["shipping risk", "energy transit sensitivity"],
      secondOrderEffects: ["tanker rerouting", "insurance premium pressure", "oil price volatility", "naval escort activity", "port congestion", "Gulf diplomatic pressure", "risk-off market sentiment"],
      affectedSectors: ["shipping", "energy", "insurance", "defense", "ports"],
      watchIndicators: ["AIS anomalies or tanker rerouting", "war-risk insurance changes", "naval escort announcements", "port congestion at nearby hubs", "official Gulf, Iranian, US, or shipping statements"],
      confidence: "medium",
    };
  }
  if (/\b(military|missile|drone|strike|fleet|troop|naval|airspace|warship)\b/i.test(corpus)) {
    return {
      primaryEffects: ["security risk", "force posture pressure"],
      secondOrderEffects: ["retaliation risk", "airspace restrictions", "evacuation or travel warnings", "sanctions pressure", "defense-sector support", "regional alliance signalling"],
      affectedSectors: ["defense", "aviation", "shipping", "energy", "travel"],
      watchIndicators: ["official military statements", "airspace or maritime warnings", "force posture announcements", "travel advisories", "sanctions language"],
      confidence: "medium",
    };
  }
  if (/\b(election|protest|coalition|parliament|court|political|government)\b/i.test(corpus)) {
    return {
      primaryEffects: ["governance uncertainty", "political legitimacy pressure"],
      secondOrderEffects: ["protest risk", "coalition instability", "currency pressure", "investor caution", "external diplomatic pressure", "regulatory delay"],
      affectedSectors: ["public sector", "financial markets", "infrastructure", "trade"],
      watchIndicators: ["court or election decisions", "protest size and spread", "coalition statements", "EU/US/NATO reactions", "currency or bond stress"],
      confidence: "medium",
    };
  }
  if (/\b(cyber|outage|infrastructure|pipeline|grid|telecom|sabotage)\b/i.test(corpus)) {
    return {
      primaryEffects: ["operational disruption", "infrastructure reliability pressure"],
      secondOrderEffects: ["outage contagion", "regulatory notification", "sectoral risk repricing", "vendor or third-party exposure", "public confidence damage"],
      affectedSectors: ["infrastructure", "technology", "energy", "finance", "public services"],
      watchIndicators: ["cyber advisories", "outage reports", "attribution claims", "sectoral spread", "regulatory notices"],
      confidence: "medium",
    };
  }
  if (/\b(sanction|tariff|trade|export control|supply chain|customs)\b/i.test(corpus)) {
    return {
      primaryEffects: ["trade friction", "compliance pressure"],
      secondOrderEffects: ["supply-chain rerouting", "payment or insurance friction", "commodity price pressure", "counter-sanctions risk", "inventory buffers"],
      affectedSectors: ["trade", "finance", "commodities", "manufacturing", "logistics"],
      watchIndicators: ["sanctions announcements", "customs guidance", "payment restrictions", "countermeasures", "commodity price moves"],
      confidence: "medium",
    };
  }
  return {
    primaryEffects: ["strategic monitoring requirement"],
    secondOrderEffects: ["source corroboration changes", "policy response", "market sensitivity", "regional spillover"],
    affectedSectors: unique(getMarketImpactTags(event)).slice(0, 5),
    watchIndicators: ["additional source corroboration", "official statements", "market or infrastructure effects", "regional follow-on events"],
    confidence: "low-medium",
  };
}

function buildPressureMap(event, effects) {
  const corpus = buildCorpus(event);
  if (/\b(hormuz|gulf|oil|shipping|tanker)\b/i.test(corpus)) {
    return {
      pressuredActors: ["Gulf energy exporters: export route exposure", "shipping operators: route and insurance risk", "US and regional naval actors: deterrence and cost burden", "oil-sensitive economies: price volatility"],
      potentialBeneficiaries: ["alternative routes or suppliers may gain relative attention", "defense and maritime security providers may see increased demand"],
      constrainedActors: ["regional governments managing escalation risk", "ports and insurers exposed to congestion or risk repricing"],
      exposedSectors: effects.affectedSectors,
      pressureSummary: "Pressure is concentrated around energy transit, shipping operations, insurance, and deterrence posture. This does not confirm intent.",
    };
  }
  if (/\b(election|protest|coalition|government)\b/i.test(corpus)) {
    return {
      pressuredActors: ["incumbent political actors: legitimacy and coalition pressure", "investors and corporates: policy uncertainty", "external partners: diplomatic positioning"],
      potentialBeneficiaries: ["opposition or bargaining actors may gain leverage", "safe-haven assets may attract attention if stress rises"],
      constrainedActors: ["regulators and public institutions managing stability", "businesses exposed to delayed policy decisions"],
      exposedSectors: effects.affectedSectors,
      pressureSummary: "Pressure is primarily political and institutional, with possible market and regulatory spillovers.",
    };
  }
  return {
    pressuredActors: ["operators directly exposed to the affected region", "policy actors managing public response", "market participants sensitive to uncertainty"],
    potentialBeneficiaries: ["alternative suppliers, routes, or security providers may benefit if disruption persists"],
    constrainedActors: ["local authorities and exposed infrastructure operators"],
    exposedSectors: effects.affectedSectors,
    pressureSummary: "Pressure mapping is cautious and based on event category, sectors, and nearby context rather than confirmed intent.",
  };
}

function buildWatchIndicators(event, effects, nearby, situation) {
  const contextIndicators = [
    ...nearby.nearestPorts.slice(0, 2).map((item) => `congestion or operational notices at ${item.name}`),
    ...nearby.nearestChokepoints.slice(0, 1).map((item) => `traffic anomalies around ${item.name}`),
    ...nearby.nearestMilitaryBases.slice(0, 1).map((item) => `public posture statements related to ${item.name}`),
    ...nearby.nearestEnergyNodes.slice(0, 1).map((item) => `operational notices around ${item.name}`),
  ];
  return unique([
    ...effects.watchIndicators,
    ...(situation?.strategicInference?.watchIndicators ?? []),
    ...contextIndicators,
  ]).slice(0, 8).map((indicator) => ({
    indicator,
    whyItMatters: "This is observable and could confirm, weaken, or redirect the working assessment.",
    confidence: effects.confidence,
    linkedContext: indicator.includes(" at ") || indicator.includes(" around ") ? "nearby context" : "signal pattern",
  }));
}

function buildBottomLine(event, situation, effects) {
  if (situation?.strategicInference?.summary) return situation.strategicInference.summary;
  const location = getEventLocation(event).label ?? "the affected area";
  const primary = effects.primaryEffects[0] ?? "strategic monitoring requirement";
  return `${event.title ?? "This signal"} points to ${primary} around ${location}. This is a working interpretation, not a prediction.`;
}

export function buildContextFusion(event = {}, allEvents = [], options = {}) {
  try {
    const events = list(allEvents);
    const situations = list(options.situations).length ? options.situations : buildStrategicSituations(events);
    const situation = findSituationForEvent(event, situations);
    const geoContext = buildGeoContext(event);
    const nearbyContext = mapNearbyItems(event);
    const related = buildRelatedSignals(event, events, situation);
    const historicalEcho = buildHistoricalEcho(event, events);
    geoContext.whyLocationMatters = makeSignalSpecificLocationText(event, geoContext, nearbyContext, related, historicalEcho);
    const secondOrder = getEffectTemplate(event);
    const pressureMap = buildPressureMap(event, secondOrder);
    const watchIndicators = buildWatchIndicators(event, secondOrder, nearbyContext, situation);
    const sourceSignals = getEventSourceSignals(event);
    const confidenceNotes = {
      confidence: event.confidence ?? "Low",
      rationale: `${sourceSignals.sourceCount} source signal${sourceSignals.sourceCount === 1 ? "" : "s"}, ${sourceSignals.independentDomainCount} domain${sourceSignals.independentDomainCount === 1 ? "" : "s"}, ${geoContext.geoAccuracy.label.toLowerCase()} geolocation.`,
      couldBeWrongIf: ["source reporting is duplicated or delayed", "location inference is too broad", "official statements contradict current reporting", "provider coverage is limited"],
    };
    const bottomLine = buildBottomLine(event, situation, secondOrder);
    const whatChanged = historicalEcho.similarSignalsLast30d
      ? `${historicalEcho.historicalSummary}`
      : "Limited stored-memory comparison is available for this signal.";

    return {
      eventId: event.id ?? null,
      generatedAt: new Date().toISOString(),
      bottomLine,
      whyItMatters: geoContext.whyLocationMatters,
      geoContext,
      nearbyContext,
      relatedSignals: related,
      historicalEcho,
      whatChanged,
      secondOrderEffects: secondOrder,
      pressureMap,
      watchIndicators,
      confidenceNotes,
      analystBrief: {
        bottomLine,
        whyItMatters: geoContext.whyLocationMatters,
        whatChanged,
        workingInterpretation: situation?.strategicInference?.underlyingPattern ?? "Grigori is treating this as a monitored strategic signal. Intent is not confirmed.",
        nearbyExposure: nearbyContext.summary,
        secondOrderEffects: secondOrder.secondOrderEffects.slice(0, 5).join(", "),
        watchNext: watchIndicators.slice(0, 5).map((item) => item.indicator).join(", "),
        confidence: confidenceNotes.rationale,
        limitations: confidenceNotes.couldBeWrongIf.join("; "),
      },
      limitations: ["Context Fusion is deterministic and uses Grigori's stored/open-source memory only.", "It does not confirm motive or predict outcomes.", "Nearby context is approximate when event geolocation is broad."],
    };
  } catch {
    return {
      eventId: event?.id ?? null,
      generatedAt: new Date().toISOString(),
      bottomLine: "Context Fusion is temporarily limited for this signal.",
      whyItMatters: "Available context could not be fused safely.",
      geoContext: buildGeoContext(event ?? {}),
      nearbyContext: { summary: "Nearby context unavailable.", nearestChokepoints: [], nearestPorts: [], nearestAirports: [], nearestMilitaryBases: [], nearestEnergyNodes: [], nearestCities: [] },
      relatedSignals: { relatedSignals: [], relationSummary: "Related signals unavailable." },
      historicalEcho: { historicalSummary: "Historical echo unavailable." },
      whatChanged: "Change comparison unavailable.",
      secondOrderEffects: getEffectTemplate(event ?? {}),
      pressureMap: { pressuredActors: [], potentialBeneficiaries: [], constrainedActors: [], exposedSectors: [], pressureSummary: "Pressure map unavailable." },
      watchIndicators: [],
      confidenceNotes: { confidence: "Low", rationale: "Context Fusion fallback.", couldBeWrongIf: ["insufficient data"] },
      analystBrief: { bottomLine: "Context Fusion is temporarily limited.", whyItMatters: "Insufficient data.", whatChanged: "Unavailable.", workingInterpretation: "Unavailable.", nearbyExposure: "Unavailable.", secondOrderEffects: "Unavailable.", watchNext: "Unavailable.", confidence: "Low.", limitations: "Insufficient data." },
      limitations: ["Context Fusion fallback."],
    };
  }
}

export function buildDashboardChangeSummary(events = [], options = {}) {
  const items = list(events);
  const newest = items.map((event) => toTime(eventTime(event))).filter(Number.isFinite).sort((a, b) => b - a)[0] ?? null;
  const lastRefresh = toTime(options.lastRefreshAt) ?? newest ?? Date.now();
  const windowStart = lastRefresh - 6 * 3600_000;
  const recent = items.filter((event) => {
    const time = toTime(eventTime(event));
    return time && time >= windowStart;
  });
  const newSignals = recent.filter((event) => {
    const created = toTime(event.createdAt ?? event.created_at ?? event.timestamp);
    return created && created >= windowStart;
  }).length;
  const escalatedSignals = recent.filter((event) => /escalating|high|critical/i.test(`${event.tone ?? ""} ${event.intensity ?? ""} ${event.riskLevel ?? ""}`)).length;
  const highImpact = recent.filter((event) => Number(event.impactScore ?? event.importanceScore ?? 0) >= 70).length;
  const grouped = Number(options.feedState?.groupedDuplicates ?? options.feedState?.groupedDuplicateCount ?? 0);
  const topSituation = list(options.situations)[0]?.region ?? list(options.situations)[0]?.title ?? null;
  const sectorCounts = new Map();
  for (const event of recent) {
    for (const tag of getMarketImpactTags(event)) {
      sectorCounts.set(tag, (sectorCounts.get(tag) ?? 0) + 1);
    }
  }
  const topSector = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const providerCoverageStatus = options.providerCoverageStatus ?? options.refreshState?.detail?.providerCoverageStatus ?? options.feedState?.status ?? "ok";
  const summaryBullets = [];
  if (newSignals > 0) summaryBullets.push(`${newSignals} new signal${newSignals === 1 ? "" : "s"} entered the current lens.`);
  if (escalatedSignals > 0) summaryBullets.push(`${escalatedSignals} cluster${escalatedSignals === 1 ? "" : "s"} remain escalatory or high-severity.`);
  if (highImpact > 0) summaryBullets.push(`${highImpact} high-impact signal${highImpact === 1 ? " needs" : "s need"} analyst attention.`);
  if (topSituation) summaryBullets.push(`${topSituation} remains the strongest forming situation.`);
  if (topSector) summaryBullets.push(`${topSector} exposure is prominent in recent signals.`);
  if (grouped > 0) summaryBullets.push(`${grouped} related signal${grouped === 1 ? "" : "s"} grouped to reduce duplicate noise.`);
  if (/limited|degraded|fallback|warning/i.test(providerCoverageStatus)) summaryBullets.push("Provider coverage is limited; stored context may be filling the view.");
  if (summaryBullets.length === 0) summaryBullets.push("Few material changes since the last refresh.");

  return {
    newSignals,
    escalatedSignals,
    confidenceUpgrades: 0,
    confidenceDowngrades: 0,
    newHighImpactSignals: highImpact,
    newlyGroupedSignals: grouped,
    topNewRegion: topSituation,
    topNewSector: topSector,
    providerCoverageStatus,
    summaryBullets: summaryBullets.slice(0, 5),
  };
}
