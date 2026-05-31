import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import {
  applyDecisionLens,
  aggregateMarketImpact,
  buildConfidenceDrivers,
  buildEventBrief,
  buildBriefing,
  buildStrategicBrief,
  buildEvidenceSummary,
  buildStrategicSituations,
  computeGeoAccuracy,
  DECISION_LENSES,
  deriveEventClassification,
  deriveImportance,
  deriveRecentTrend,
  deriveRiskLevel,
  eventMatchesWatchlist,
  explainConfidence,
  filterEventsByTimeWindow,
  getEventSourceSignals,
  getMarketImpactTags,
  getOneLineSummary,
  getRelatedSignalEvidence,
  findSituationForEvent,
  inferLocationDetails,
  sanitizeEventNarrative,
} from "./event-insights.js";
import { CONTEXT_LAYER_DEFS, CONTEXT_LAYER_STORAGE_KEY, getContextItemsForLayer } from "./context-layers.js";

// ═══════════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════════

const EVENTS = [
  {
    id: 1, title: "Black Sea Naval Escalation", lat: 46.2, lng: 31.5, intensity: "high",
    summary: "Renewed drone strikes on Odesa naval infrastructure have disrupted the grain corridor. Multiple vessels diverted, NATO surveillance assets repositioned to the Bosphorus approaches.",
    tone: "Escalating", confidence: "High",
    developments: ["3 commercial vessels diverted from Odesa corridor", "NATO P-8 Poseidon flights increased to 6/day", "Grain futures spiked 4.2% on Chicago exchange", "Turkish coast guard on elevated readiness"],
    scenarios: [
      { name: "Corridor Closure", probability: 38, description: "Full suspension of grain shipping for 2–4 weeks, triggering food-price contagion across MENA.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Energy","Shipping","Food"],
          regionalEffects: ["Europe grain prices surge 8–12%", "Egypt and Tunisia face import crisis", "Black Sea insurance premiums spike 200bps", "Turkey mediates emergency access talks"] } },
      { name: "Negotiated Pause", probability: 45, description: "Back-channel ceasefire brokered via Turkey restores limited traffic within 72 hours.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Shipping","Food"],
          regionalEffects: ["Grain prices stabilise after initial spike", "Turkish Bosphorus traffic normalises", "Insurance premiums remain elevated"] } },
      { name: "NATO Escort Protocol", probability: 17, description: "Alliance authorises armed escorts for flagged commercial vessels, risking direct confrontation.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Defense","Energy","Shipping"],
          regionalEffects: ["NATO–Russia escalation ladder activated", "Baltic and Nordic states raise alert levels", "Global tanker rates surge 30%"] } },
    ],
    affectedRegions: [{ lat: 46.2, lng: 31.5 }, { lat: 41.0, lng: 29.0 }, { lat: 50.0, lng: 14.0 }, { lat: 30.0, lng: 31.0 }],
    tradeRoutes: [{ from: [46.2, 31.5], to: [41.0, 29.0], label: "Grain corridor" }, { from: [41.0, 29.0], to: [30.0, 31.0], label: "Suez feeder" }],
  },
  {
    id: 2, title: "Strait of Hormuz Friction", lat: 26.6, lng: 56.3, intensity: "high",
    summary: "IRGCN fast-boat harassment of a UK-flagged tanker has renewed pressure on insurance underwriters. Lloyd's war-risk premiums rose 120bps overnight. US 5th Fleet repositioned two destroyers.",
    tone: "Escalating", confidence: "High",
    developments: ["MV Hartwell Pioneer intercepted and boarded 4 hours", "Lloyd's war-risk premiums +120bps overnight", "USS Bulkeley & USS Cole repositioned", "Iran denied incident, claimed routine inspection"],
    scenarios: [
      { name: "Escalatory Seizure", probability: 22, description: "Iran seizes another vessel, prompting US interdiction and potential closure of the strait.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Energy","Defense","Shipping"],
          regionalEffects: ["Brent crude surges $15–20/barrel", "Asia LNG spot prices double within 48h", "European gas reserves drawn down 15%", "Global shipping insurance market seizes up"] } },
      { name: "Diplomatic De-escalation", probability: 55, description: "Oman-mediated talks produce a cooling period; tanker traffic normalises within days.",
        impact: { oil: "Neutral", markets: "Risk-on", tradeRoutes: "Stable", sectors: ["Energy"],
          regionalEffects: ["Oil retreats to pre-incident levels", "Gulf sovereign wealth funds increase equity buys", "Oman positioned as regional mediator"] } },
      { name: "Proxy Expansion", probability: 23, description: "Houthi drone coordination with IRGCN extends threat corridor into the Red Sea.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Energy","Shipping","Defense"],
          regionalEffects: ["Suez Canal traffic falls 40%", "Cape of Good Hope re-routing adds 14 days", "European automotive supply chains disrupted", "Asian electronics exports delayed 3–6 weeks"] } },
    ],
    affectedRegions: [{ lat: 26.6, lng: 56.3 }, { lat: 24.0, lng: 45.0 }, { lat: 25.2, lng: 55.3 }, { lat: 15.6, lng: 48.5 }],
    tradeRoutes: [{ from: [26.6, 56.3], to: [12.8, 45.0], label: "Hormuz–Red Sea" }, { from: [12.8, 45.0], to: [30.0, 32.5], label: "Red Sea–Suez" }, { from: [26.6, 56.3], to: [1.3, 103.8], label: "Hormuz–Singapore" }],
  },
  {
    id: 3, title: "Taiwan Strait Incursions", lat: 24.5, lng: 122.0, intensity: "high",
    summary: "PLAAF recorded 47 sorties crossing the median line in 48 hours — highest since 2022. Taiwan scrambled F-16Vs and activated ADIZ protocols. US Carrier Strike Group conducting FONOP 120nm east of Taipei.",
    tone: "Escalating", confidence: "Medium",
    developments: ["47 PLAAF sorties crossed median line in 48h (record)", "Taiwan scrambled F-16Vs 14 times", "CSG-11 FONOP 120nm east of Taipei", "TSMC paused one fab shift as precaution"],
    scenarios: [
      { name: "Blockade Simulation", probability: 30, description: "PLA conducts live-fire exercises simulating blockade, stopping short of kinetic action.",
        impact: { oil: "Neutral", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Tech","Shipping","Defense"],
          regionalEffects: ["Global semiconductor supply chain disruption", "TSMC fab utilisation drops 25%", "Apple and Nvidia supply delays 6–12 weeks", "South Korea and Japan activate contingency plans"] } },
      { name: "Status Quo Reassertion", probability: 50, description: "Activity subsides after political signal delivered; no structural change to cross-strait dynamics.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Defense"],
          regionalEffects: ["Regional allies increase defence budgets", "US arms sales to Taiwan accelerate", "TSMC expands Arizona capacity as hedge"] } },
      { name: "Accidental Escalation", probability: 20, description: "Midair incident triggers crisis requiring rapid diplomatic management.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Tech","Defense","Shipping","Energy"],
          regionalEffects: ["Global equity markets -8 to -12%", "USD and JPY surge as safe havens", "Tech sector loses $2T market cap in 72h", "Emergency G7 summit convened"] } },
    ],
    affectedRegions: [{ lat: 24.5, lng: 122.0 }, { lat: 35.6, lng: 139.7 }, { lat: 37.5, lng: 127.0 }, { lat: 22.3, lng: 114.2 }],
    tradeRoutes: [{ from: [24.5, 122.0], to: [35.6, 139.7], label: "Taiwan–Japan" }, { from: [24.5, 122.0], to: [1.3, 103.8], label: "Taiwan–Singapore" }],
  },
  {
    id: 4, title: "Sahel Corridor Collapse", lat: 15.5, lng: 2.1, intensity: "medium",
    summary: "Wagner-successor forces and JNIM militants clashed near Gao, displacing 40,000. French withdrawal vacuum partially filled by Russian instructors. AU peacekeeping mandate expires in 60 days.",
    tone: "Escalating", confidence: "Medium",
    developments: ["40,000 displaced near Gao after three-day battle", "Russian instructors confirmed at two FOBs", "AU MISAHEL mandate expires June 2026", "Uranium supply routes from Arlit disrupted"],
    scenarios: [
      { name: "Regional Spillover", probability: 40, description: "Violence spreads into Burkina Faso and Chad, triggering refugee flows into Libya and Algeria.",
        impact: { oil: "Neutral", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Energy","Defense"],
          regionalEffects: ["Uranium supply to France drops 30%", "European nuclear power capacity at risk", "Mediterranean migration pressure triples", "Algeria closes border, tightens gas exports"] } },
      { name: "Managed Fragmentation", probability: 45, description: "Rival factions establish de facto zones; ICRC negotiates humanitarian corridors.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Food","Defense"],
          regionalEffects: ["Humanitarian aid costs increase €2.4B/year", "UN peacekeeping budget pressured", "Gold and uranium extraction continues in RSF zones"] } },
      { name: "ECOWAS Intervention", probability: 15, description: "ECOWAS authorises military intervention backed by US logistics support.",
        impact: { oil: "Neutral", markets: "Risk-off", tradeRoutes: "Stable", sectors: ["Defense","Energy"],
          regionalEffects: ["Nigeria diverts 15% defence budget to intervention", "France provides intelligence support quietly", "Russia–West proxy confrontation escalates"] } },
    ],
    affectedRegions: [{ lat: 15.5, lng: 2.1 }, { lat: 12.3, lng: -1.5 }, { lat: 15.6, lng: 32.5 }, { lat: 27.0, lng: 2.0 }],
    tradeRoutes: [{ from: [15.5, 2.1], to: [36.8, 3.1], label: "Sahel–Mediterranean" }],
  },
  {
    id: 5, title: "Kashmir LoC Skirmishes", lat: 34.5, lng: 74.3, intensity: "medium",
    summary: "Artillery exchanges along the LoC intensified following a cross-border militant raid. Both India and Pakistan moved additional armoured units to forward positions. SCO mediation declined.",
    tone: "Stable", confidence: "Medium",
    developments: ["Artillery exchanges across 60km LoC stretch", "India moved 2 armoured brigades to forward positions", "Pakistan put air force on 30-min readiness", "SCO mediation offer rejected by New Delhi"],
    scenarios: [
      { name: "Limited Exchange", probability: 25, description: "Localised airstrikes similar to Balakot 2019; both sides manage escalation carefully.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Stable", sectors: ["Defense","Energy"],
          regionalEffects: ["India defence procurement accelerates", "Pakistan IMF programme at risk", "China watches closely, signals neutrality", "Regional airline routes rerouted"] } },
      { name: "Back-Channel De-escalation", probability: 60, description: "UAE-brokered backchannel restores LoC quiet within 10 days.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Defense"],
          regionalEffects: ["India–Pakistan trade talks resume", "Investment confidence returns to region", "Afghan transit routes remain open"] } },
      { name: "Crisis Spiral", probability: 15, description: "Miscalculation leads to broader conventional conflict with nuclear shadow.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Defense","Energy","Finance"],
          regionalEffects: ["Nuclear risk premium enters global markets", "China forces mobilise on Aksai Chin", "US sanctions both parties", "Global risk assets sell off 15–20%"] } },
    ],
    affectedRegions: [{ lat: 34.5, lng: 74.3 }, { lat: 28.6, lng: 77.2 }, { lat: 33.7, lng: 73.1 }, { lat: 25.3, lng: 82.0 }],
    tradeRoutes: [{ from: [34.5, 74.3], to: [28.6, 77.2], label: "LoC–Delhi axis" }],
  },
  {
    id: 6, title: "South China Sea Standoff", lat: 12.5, lng: 114.2, intensity: "medium",
    summary: "PLA Navy conducted live-fire exercises near contested Spratly Islands. Philippines coast guard confronted. US 7th Fleet monitoring closely and increased patrol frequency.",
    tone: "Escalating", confidence: "Medium",
    developments: ["Live-fire drills near Spratlys without notice", "Philippines coast guard vessel water-cannoned", "US 7th Fleet increased patrol tempo 40%", "Vietnam quietly raised alert on Paracel garrison"],
    scenarios: [
      { name: "Attrition Pressure", probability: 45, description: "China sustains harassment operations, testing alliance commitment without triggering MDT.",
        impact: { oil: "Neutral", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Shipping","Energy","Defense"],
          regionalEffects: ["ASEAN unity fractures on China policy", "Vietnam and Philippines accelerate US arms deals", "South China Sea shipping insurance +80bps", "LNG routes from Australia rerouted south"] } },
      { name: "US Intervention Signal", probability: 35, description: "US carrier group transits disputed waters in direct challenge, China backs down temporarily.",
        impact: { oil: "Neutral", markets: "Risk-on", tradeRoutes: "Stable", sectors: ["Defense"],
          regionalEffects: ["China faces domestic pressure to respond", "Taiwan Strait tensions mirror", "ASEAN confidence in US commitment restored"] } },
      { name: "Kinetic Incident", probability: 20, description: "Collision or weapons discharge triggers Article 5 deliberations among US allies.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Defense","Energy","Shipping","Tech"],
          regionalEffects: ["Asian markets open -6%", "China exports face emergency restrictions", "Singapore activates emergency protocols", "APEC summit cancelled"] } },
    ],
    affectedRegions: [{ lat: 12.5, lng: 114.2 }, { lat: 14.6, lng: 121.1 }, { lat: 1.3, lng: 103.8 }, { lat: 21.0, lng: 105.8 }],
    tradeRoutes: [{ from: [12.5, 114.2], to: [1.3, 103.8], label: "SCS–Malacca" }, { from: [12.5, 114.2], to: [35.6, 139.7], label: "SCS–Japan" }],
  },
  {
    id: 7, title: "Sudan Khartoum Offensive", lat: 15.6, lng: 32.5, intensity: "high",
    summary: "RSF advanced on central Khartoum districts amid heavy urban combat. 250,000 newly displaced this week. SAF air strikes hit Omdurman. UN estimates 25 million in acute humanitarian need.",
    tone: "Escalating", confidence: "High",
    developments: ["RSF controls north Khartoum districts", "SAF air strikes on Omdurman", "250k newly displaced this week", "UN: 25M in acute humanitarian need"],
    scenarios: [
      { name: "RSF Victory", probability: 30, description: "RSF captures Khartoum, forcing SAF to Omdurman; protracted guerrilla war follows.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Energy","Food"],
          regionalEffects: ["Egypt faces 500k refugee surge", "Nile water management collapses", "Gold and oil revenue captured by RSF", "Regional humanitarian appeal tops $5B"] } },
      { name: "Frozen Conflict", probability: 50, description: "Front lines stabilise; Sudan partitioned de facto between RSF and SAF zones.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Food","Energy"],
          regionalEffects: ["Chronic humanitarian crisis persists", "African Union paralysed on response", "UAE and Saudi continue parallel funding"] } },
      { name: "Regional Proxy War", probability: 20, description: "External actors escalate material support, internationalising the conflict.",
        impact: { oil: "Neutral", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Defense","Food","Energy"],
          regionalEffects: ["Libya and Chad drawn into conflict", "Red Sea southern approaches destabilised", "UN Security Council emergency session"] } },
    ],
    affectedRegions: [{ lat: 15.6, lng: 32.5 }, { lat: 30.0, lng: 31.2 }, { lat: 11.8, lng: 42.6 }, { lat: 12.1, lng: 15.0 }],
    tradeRoutes: [{ from: [15.6, 32.5], to: [19.6, 37.2], label: "Sudan–Red Sea port" }],
  },
  {
    id: 8, title: "Baltic Sub Activity", lat: 57.0, lng: 24.0, intensity: "low",
    summary: "Russian submarine incursions near Finnish waters prompted NATO response. Finland activated coastal defence units and NATO increased Baltic patrol frequency.",
    tone: "Stable", confidence: "Low",
    developments: ["Sub tracked near Gotland Island", "NATO increased Baltic patrol flights", "Finland activated coastal defence units", "Sweden and Norway on elevated readiness"],
    scenarios: [
      { name: "Probing Continues", probability: 55, description: "Russia tests alliance response times without triggering Article 5 threshold.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Defense","Energy"],
          regionalEffects: ["Nordic defence spending accelerates", "Baltic gas pipeline security scrutinised", "NATO permanent basing in Finland expedited"] } },
      { name: "Incident & Standdown", probability: 35, description: "Sub surfaced or identified, diplomatic protest filed, Russia denies.",
        impact: { oil: "Neutral", markets: "Stable", tradeRoutes: "Stable", sectors: ["Defense"],
          regionalEffects: ["Baltic states request NATO Article 4 consultations", "Increased NATO maritime presence in Baltic"] } },
      { name: "Infrastructure Attack", probability: 10, description: "Undersea cable or pipeline sabotaged, triggering NATO crisis management.",
        impact: { oil: "Up", markets: "Risk-off", tradeRoutes: "Disrupted", sectors: ["Energy","Defense","Finance"],
          regionalEffects: ["European energy prices spike", "Internet resilience protocols activated", "Article 5 deliberations begin"] } },
    ],
    affectedRegions: [{ lat: 57.0, lng: 24.0 }, { lat: 60.2, lng: 25.0 }, { lat: 59.3, lng: 18.1 }, { lat: 54.7, lng: 20.5 }],
    tradeRoutes: [{ from: [57.0, 24.0], to: [53.8, 14.0], label: "Baltic shipping lane" }],
  },
];
const BRAND_WORDMARK = "/assets/brand/grigori-wordmark.svg";
const BRAND_REPORT_LOCKUP = "/assets/brand/grigori-report-lockup.svg";

// ═══════════════════════════════════════════════════════════════════════════════
// WAR ROOM PRIORITY SCORING ENGINE
// Computed once at module load — never recomputed on render.
// Total: 100 points  |  Impact:40  Probability:25  Urgency:20  Confidence:15
// ═══════════════════════════════════════════════════════════════════════════════

// ── Sub-scorers ───────────────────────────────────────────────────────────────

function scoreImpact(ev) {
  // Max 40 pts. Aggregated across all scenarios, weighted by probability.
  let total = 0;
  for (const sc of ev.scenarios) {
    const w   = sc.probability / 100;
    let pts   = 0;
    const imp = sc.impact;

    // Energy disruption (oil)
    if (imp.oil === "Up")      pts += 10;
    else if (imp.oil === "Down") pts += 4; // demand destruction still matters

    // Trade route disruption
    if (imp.tradeRoutes === "Disrupted") pts += 10;

    // Market sentiment (proxy for economic breadth)
    if (imp.markets === "Risk-off") pts += 8;

    // Sector breadth (each additional sector = 1.5 pts, cap at 6)
    pts += Math.min(6, (imp.sectors?.length ?? 0) * 1.5);

    // Military / defense involvement
    if (imp.sectors?.includes("Defense")) pts += 6;

    total += pts * w;
  }
  return Math.min(40, Math.round(total));
}

function scoreProbability(ev) {
  // Max 25 pts. Weighted average probability of disruptive scenarios.
  // "Disruptive" = tradeRoutes:Disrupted OR markets:Risk-off
  let disrupted = 0, total = 0;
  for (const sc of ev.scenarios) {
    total += sc.probability;
    if (sc.impact.tradeRoutes === "Disrupted" || sc.impact.markets === "Risk-off") {
      disrupted += sc.probability;
    }
  }
  // Scale: 100% disruptive probability → 25 pts
  const ratio = total > 0 ? disrupted / total : 0;
  return Math.round(ratio * 25);
}

function scoreUrgency(ev) {
  // Max 20 pts. Based on tone + intensity + regional effect language.
  let pts = 0;
  if (ev.tone === "Escalating") pts += 10;
  else if (ev.tone === "Stable")  pts += 4;
  else pts += 2; // De-escalating

  if (ev.intensity === "high")   pts += 8;
  else if (ev.intensity === "medium") pts += 4;
  else pts += 1;

  // Bonus if any scenario description contains time-sensitive language
  const timeWords = /(hours?|days?|48h|72h|immediate|overnight|week)/i;
  const anyTimeWord = ev.scenarios.some(sc =>
    timeWords.test(sc.description) || (sc.impact.regionalEffects ?? []).some(r => timeWords.test(r))
  );
  if (anyTimeWord) pts += 2;

  return Math.min(20, pts);
}

function scoreConfidence(ev) {
  // Max 15 pts. Based on stated confidence level + development count.
  const base = { High: 12, Medium: 7, Low: 3 }[ev.confidence] ?? 5;
  // More developments = more corroboration
  const devBonus = Math.min(3, Math.floor((ev.developments?.length ?? 0) / 2));
  return Math.min(15, base + devBonus);
}

// ── Priority level thresholds ─────────────────────────────────────────────────
function priorityLevel(score) {
  if (score >= 78) return "CRITICAL";
  if (score >= 58) return "HIGH";
  if (score >= 38) return "WATCH";
  return "LOW";
}

// ── Explainability sentence ───────────────────────────────────────────────────
function whyThisMatters(ev, breakdown) {
  const level = priorityLevel(breakdown.impact + breakdown.probability + breakdown.urgency + breakdown.confidence);

  // Find highest-probability disruptive scenario
  const disruptive = ev.scenarios
    .filter(s => s.impact.tradeRoutes === "Disrupted" || s.impact.markets === "Risk-off")
    .sort((a, b) => b.probability - a.probability)[0];

  const parts = [];

  // Lead with tone + intensity
  if (ev.tone === "Escalating") parts.push(`Actively escalating ${ev.intensity}-intensity conflict`);
  else parts.push(`${ev.tone} ${ev.intensity}-intensity situation`);

  // Oil / energy impact
  const oilUp = ev.scenarios.some(s => s.impact.oil === "Up");
  if (oilUp) parts.push("with direct energy supply risk");

  // Key sectors
  const allSectors = [...new Set(ev.scenarios.flatMap(s => s.impact.sectors ?? []))];
  if (allSectors.length >= 3) {
    parts.push(`affecting ${allSectors.slice(0, 3).join(", ")} sectors`);
  }

  // Probability of worst case
  if (disruptive) {
    parts.push(`— ${disruptive.probability}% probability of trade route disruption`);
  }

  // Confidence qualifier
  if (ev.confidence === "Low") parts.push("(signals unconfirmed)");
  else if (ev.confidence === "High") parts.push("(multi-source confirmed)");

  return parts.join(" ") + ".";
}

// ── Main enrichment function ──────────────────────────────────────────────────
function enrichEvents(events) {
  return events.map(ev => {
    const impact      = scoreImpact(ev);
    const probability = scoreProbability(ev);
    const urgency     = scoreUrgency(ev);
    const confidence  = scoreConfidence(ev);
    const total       = impact + probability + urgency + confidence;
    const breakdown   = { impact, probability, urgency, confidence };

    return {
      ...ev,
      priorityScore:  total,
      priorityLevel:  priorityLevel(total),
      scoreBreakdown: breakdown,
      whyThisMatters: whyThisMatters(ev, breakdown),
    };
  });
}

// ── Enriched event list — computed once at module load ────────────────────────
const SCORED_EVENTS = enrichEvents(EVENTS).map(decorateEventForUi);

// Top-5 sorted by priority score (desc), for the War Room panel
const TOP_EVENTS = [...SCORED_EVENTS].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);

// Priority level style config
const PRIORITY_CONFIG = {
  CRITICAL: { color: "#ff2233", bg: "rgba(255,34,51,0.12)",  border: "rgba(255,34,51,0.4)",  glyph: "⬛" },
  HIGH:     { color: "#ff8800", bg: "rgba(255,136,0,0.12)",  border: "rgba(255,136,0,0.4)",  glyph: "▲" },
  WATCH:    { color: "#ffcc00", bg: "rgba(255,204,0,0.10)",  border: "rgba(255,204,0,0.35)", glyph: "◆" },
  LOW:      { color: "#6688aa", bg: "rgba(102,136,170,0.08)", border: "rgba(102,136,170,0.25)", glyph: "◯" },
};


// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const R = 1.0; // globe radius

const INTENSITY = {
  high:   { color: "#ff2233", colorHex: 0xff2233, glowAlpha: 0.6, pulseSpeed: 1.8, arcColor: "#ff4455" },
  medium: { color: "#ff8800", colorHex: 0xff8800, glowAlpha: 0.5, pulseSpeed: 2.2, arcColor: "#ffaa33" },
  low:    { color: "#ffcc00", colorHex: 0xffcc00, glowAlpha: 0.4, pulseSpeed: 2.8, arcColor: "#ffdd44" },
};
const MAX_CONFLICT_ZONES = 20;
const HOTSPOT_ZONE_RULES = [
  { id: "taiwan-strait", label: "Taiwan Strait", lat: 24.5, lng: 122.0, pattern: /\b(taiwan|taipei|median line|tsmc|cross-strait)\b/i },
  { id: "black-sea", label: "Black Sea", lat: 44.8, lng: 33.5, pattern: /\b(black sea|odesa|odessa|crimea|grain corridor)\b/i },
  { id: "red-sea", label: "Red Sea", lat: 15.6, lng: 44.8, pattern: /\b(red sea|houthi|bab el-mandeb|suez|yemen)\b/i },
  { id: "hormuz", label: "Strait of Hormuz", lat: 26.6, lng: 56.3, pattern: /\b(hormuz|iran|gulf tanker|persian gulf)\b/i },
  { id: "gaza-israel-lebanon", label: "Gaza / Israel / Lebanon", lat: 31.5, lng: 35.1, pattern: /\b(gaza|israel|lebanon|hezbollah|west bank|idf)\b/i },
  { id: "ukraine", label: "Ukraine", lat: 49.0, lng: 32.0, pattern: /\b(ukraine|kyiv|kharkiv|donbas|kherson|odesa)\b/i },
  { id: "south-china-sea", label: "South China Sea", lat: 12.5, lng: 114.2, pattern: /\b(south china sea|spratly|paracel|manila)\b/i },
  { id: "balkans", label: "Balkans", lat: 43.7, lng: 22.4, pattern: /\b(balkans|serbia|kosovo|bosnia|bulgaria|romania|moldova)\b/i },
];

const TONE_COLOR   = { Escalating: "#ff3344", Stable: "#44aaff", "De-escalating": "#44ff88" };
const CONF_COLOR   = { High: "#22ff88", Medium: "#ffcc00", Low: "#6688aa" };
const OIL_COLOR    = { Up: "#ff4444", Neutral: "#4488ff", Down: "#44ff88" };
const OIL_ICON     = { Up: "▲", Neutral: "─", Down: "▼" };
const MARKET_COLOR = { "Risk-off": "#ff5533", "Risk-on": "#44ff88", Stable: "#4488ff" };
const SECTOR_COLOR = { Energy: "#ff8844", Defense: "#4488ff", Shipping: "#44ccff", Tech: "#aa44ff", Food: "#88ff44", Finance: "#ffcc44" };

// ═══════════════════════════════════════════════════════════════════════════════
// MATH & PROJECTION
// ═══════════════════════════════════════════════════════════════════════════════

// ── Canonical spherical → Cartesian (Three.js Y-up) ────────────────────────
// This is the EXACT formula required. Verified reference points:
//   lat=0, lng=0   → (-R, 0,  0)   prime meridian/equator
//   lat=0, lng=90  → ( 0, 0,  R)   east
//   lat=90, lng=0  → ( 0, R,  0)   north pole
function geoToVec3(lat, lng, radius) {
  if (radius === undefined) radius = R;
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  );
}
const latLngToVector3 = geoToVec3;

function makeTextSprite(text, { fontSize = 32, color = "#a6def5", border = "rgba(88, 188, 230, 0.42)", background = "rgba(4,12,24,0.72)" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = background;
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  const x = 18;
  const y = 28;
  const w = canvas.width - 36;
  const h = canvas.height - 56;
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = `700 ${fontSize}px "IBM Plex Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.44, 0.138, 1);
  return sprite;
}

// Great-circle arc between two lat/lng points, lifted above surface
function buildArc(lat0, lng0, lat1, lng1, lift = 0.06, segments = 60) {
  const v0  = geoToVec3(lat0, lng0);
  const v1  = geoToVec3(lat1, lng1);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(v0, v1, t).normalize();
    // Raise arc above surface using sine curve peak at midpoint
    const h = R + lift * Math.sin(Math.PI * t);
    pts.push(p.multiplyScalar(h));
  }
  return new THREE.CatmullRomCurve3(pts).getPoints(segments);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBE TEXTURE
// ═══════════════════════════════════════════════════════════════════════════════

function makeGlobeTex() {
  const W = 2048, H = 1024;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const project = (lon, lat) => [((lon + 180) / 360) * W, ((90 - lat) / 180) * H];
  const tracePolygon = (points) => {
    points.forEach(([lon, lat], index) => {
      const [x, y] = project(lon, lat);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };
  const continents = [
    [[-168, 72], [-140, 70], [-126, 61], [-118, 52], [-104, 44], [-95, 31], [-86, 20], [-80, 9], [-92, 8], [-103, 16], [-114, 22], [-126, 31], [-133, 43], [-151, 56], [-168, 62]],
    [[-81, 11], [-74, 5], [-67, -8], [-63, -19], [-58, -31], [-54, -41], [-47, -53], [-38, -54], [-34, -38], [-39, -20], [-48, -2], [-58, 8], [-69, 12]],
    [[-17, 36], [-5, 44], [15, 53], [40, 60], [70, 60], [98, 57], [123, 50], [147, 45], [165, 52], [180, 62], [180, 10], [154, 4], [130, 15], [113, 21], [96, 11], [82, 21], [67, 26], [60, 31], [46, 31], [33, 31], [24, 36], [15, 41], [3, 42], [-8, 40]],
    [[-17, 34], [4, 36], [18, 32], [30, 24], [35, 12], [42, 3], [47, -10], [43, -21], [33, -31], [20, -34], [10, -35], [2, -30], [-7, -16], [-13, 0], [-15, 16]],
    [[40, 31], [49, 30], [56, 27], [54, 17], [48, 12], [44, 15], [42, 22]],
    [[67, 26], [79, 31], [89, 24], [87, 15], [78, 9], [72, 18]],
    [[111, -10], [116, -21], [128, -23], [139, -30], [151, -33], [155, -24], [150, -12], [140, -11], [129, -15], [118, -12]],
    [[-54, 59], [-42, 76], [-25, 80], [-18, 70], [-31, 60]],
  ];

  // Dark ocean base with clear land/sea separation
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,   "#0a1320");
  g.addColorStop(0.38,"#08101a");
  g.addColorStop(0.72,"#040a12");
  g.addColorStop(1,   "#02060d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Continental shelf suggestion
  ctx.fillStyle = "rgba(22,38,58,0.16)";
  [[0.12, 0.30], [0.35, 0.55], [0.60, 0.78]].forEach(([y0, y1]) => {
    ctx.fillRect(0, y0 * H, W, (y1 - y0) * H);
  });

  // Ocean depth bands for a matte satellite feel
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const y = (i / 8) * H;
    for (let x = 0; x <= W; x += 12) {
      const wave = Math.sin((x / W) * Math.PI * (2.2 + i * 0.15)) * (8 + i * 1.4);
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = `rgba(24,48,74,${0.028 + i * 0.003})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Terrain-style grain for restrained topography
  for (let i = 0; i < 9500; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${12 + Math.floor(Math.random() * 18)},${24 + Math.floor(Math.random() * 22)},${38 + Math.floor(Math.random() * 30)},${0.02 + Math.random() * 0.05})`;
    ctx.fill();
  }

  // Terrain contour fields
  const drawContourField = (centerX, centerY, radiusX, radiusY, lines, stroke, weight = 0.8) => {
    for (let i = 0; i < lines; i++) {
      const t = i / Math.max(lines - 1, 1);
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 38) {
        const mod = 1 + Math.sin(a * 3 + t * 8) * 0.05 + Math.cos(a * 5 + t * 11) * 0.04;
        const x = centerX + Math.cos(a) * radiusX * (0.35 + t * 0.72) * mod;
        const y = centerY + Math.sin(a) * radiusY * (0.32 + t * 0.76) * mod;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = weight;
      ctx.stroke();
    }
  };

  drawContourField(W * 0.66, H * 0.32, 130, 58, 11, "rgba(188,194,160,0.1)", 1.0);
  drawContourField(W * 0.56, H * 0.44, 120, 52, 10, "rgba(170,182,148,0.085)", 0.95);
  drawContourField(W * 0.28, H * 0.42, 100, 44, 8, "rgba(166,176,146,0.075)", 0.9);
  drawContourField(W * 0.79, H * 0.47, 92, 42, 8, "rgba(160,178,146,0.074)", 0.9);
  drawContourField(W * 0.22, H * 0.64, 72, 38, 6, "rgba(160,172,146,0.065)", 0.8);

  // Subtle mountain-range streaks
  ctx.lineWidth = 1;
  for (let i = 0; i < 58; i++) {
    const y = Math.random() * H;
    const amp = 6 + Math.random() * 14;
    const phase = Math.random() * Math.PI * 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 18) {
      const offset = Math.sin((x / W) * Math.PI * (2 + Math.random() * 3) + phase) * amp;
      if (x === 0) ctx.moveTo(x, y + offset);
      else ctx.lineTo(x, y + offset);
    }
    ctx.strokeStyle = `rgba(140,164,146,${0.022 + Math.random() * 0.03})`;
    ctx.stroke();
  }

  // Latitude grid
  ctx.lineWidth = 0.6;
  for (let lat = -90; lat <= 90; lat += 15) {
    const y = ((90 - lat) / 180) * H;
    ctx.strokeStyle = lat === 0 ? "rgba(76,166,214,0.08)" : "rgba(62,98,132,0.02)";
    ctx.lineWidth   = lat === 0 ? 0.8 : 0.45;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Longitude grid
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = "rgba(52,80,108,0.02)";
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = ((lng + 180) / 360) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  // Prime meridian
  ctx.strokeStyle = "rgba(74,152,198,0.05)";
  ctx.lineWidth = 1;
  const pmX = (180 / 360) * W;
  ctx.beginPath(); ctx.moveTo(pmX, 0); ctx.lineTo(pmX, H); ctx.stroke();

  // Polar vignettes to reduce flatness
  const northGlow = ctx.createRadialGradient(W * 0.52, H * 0.08, 0, W * 0.52, H * 0.08, H * 0.36);
  northGlow.addColorStop(0, "rgba(118,142,160,0.08)");
  northGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = northGlow;
  ctx.fillRect(0, 0, W, H);

  const southGlow = ctx.createRadialGradient(W * 0.42, H * 0.92, 0, W * 0.42, H * 0.92, H * 0.32);
  southGlow.addColorStop(0, "rgba(86,108,126,0.08)");
  southGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = southGlow;
  ctx.fillRect(0, 0, W, H);

  // Landmasses with muted relief
  continents.forEach((polygon, index) => {
    ctx.save();
    ctx.beginPath();
    tracePolygon(polygon);
    const landGradient = ctx.createLinearGradient(0, project(0, 70)[1], 0, project(0, -55)[1]);
    landGradient.addColorStop(0, "rgba(88,96,88,0.95)");
    landGradient.addColorStop(0.42, "rgba(60,72,68,0.98)");
    landGradient.addColorStop(1, "rgba(34,42,44,0.98)");
    ctx.fillStyle = landGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(196,212,204,0.15)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.clip();

    for (let i = 0; i < 18; i++) {
      const y = Math.random() * H;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 18) {
        const offset = Math.sin((x / W) * Math.PI * (2.4 + index * 0.2) + i * 0.4) * (5 + i * 0.15);
        if (x === 0) ctx.moveTo(x, y + offset);
        else ctx.lineTo(x, y + offset);
      }
      ctx.strokeStyle = `rgba(208,214,196,${0.032 + (i % 5) * 0.008})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
    for (let i = 0; i < 650; i++) {
      const px = Math.random() * W;
      const py = Math.random() * H;
      ctx.fillStyle = `rgba(${96 + Math.floor(Math.random() * 26)},${104 + Math.floor(Math.random() * 28)},${88 + Math.floor(Math.random() * 18)},${0.025 + Math.random() * 0.05})`;
      ctx.fillRect(px, py, 1.2, 1.2);
    }
    ctx.restore();
  });

  // Obvious ridge belts to hint at global mountain systems
  const ridgeBelts = [
    [[73, 34], [78, 33], [84, 31], [91, 30], [98, 29], [104, 27]],
    [[5, 45], [11, 46], [17, 46], [23, 45]],
    [[41, 43], [48, 43], [54, 42]],
    [[45, 33], [50, 31], [55, 29], [60, 27]],
    [[-76, -6], [-73, -16], [-70, -26], [-68, -36], [-70, -45]],
    [[-124, 49], [-118, 45], [-112, 40], [-108, 36], [-104, 31]],
    [[36, 12], [39, 9], [41, 6], [39, 2]],
  ];
  ridgeBelts.forEach((belt) => {
    ctx.beginPath();
    belt.forEach(([lon, lat], idx) => {
      const [x, y] = project(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "rgba(228,234,220,0.11)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.strokeStyle = "rgba(248,250,244,0.045)";
    ctx.lineWidth = 2.6;
    ctx.stroke();
  });

  // Coastline highlight
  continents.forEach((polygon) => {
    ctx.beginPath();
    tracePolygon(polygon);
    ctx.strokeStyle = "rgba(198,220,228,0.2)";
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // restrained warm night-light clusters
  [[10, 50], [77, 23], [116, 39], [139, 35], [31, 30], [-74, 41], [-118, 34], [28, -26], [72, 19]].forEach(([lon, lat]) => {
    const [x, y] = project(lon, lat);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 26);
    glow.addColorStop(0, "rgba(255,184,112,0.06)");
    glow.addColorStop(0.55, "rgba(255,170,96,0.025)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 28, y - 28, 56, 56);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeReliefTex() {
  const W = 1024, H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#171717";
  ctx.fillRect(0, 0, W, H);

  for (let y = 0; y < H; y += 3) {
    ctx.strokeStyle = `rgba(168,168,168,${0.03 + (y / H) * 0.02})`;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.03) * 2);
    ctx.lineTo(W, y + Math.sin(y * 0.04) * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 5200; i++) {
    const shade = 88 + Math.floor(Math.random() * 110);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},0.11)`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function makeCloudTex() {
  const W = 1024, H = 512;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const bands = [
    { y: 0.24, amp: 16, alpha: 0.08 },
    { y: 0.49, amp: 20, alpha: 0.095 },
    { y: 0.72, amp: 14, alpha: 0.07 },
  ];
  bands.forEach((band, index) => {
    ctx.beginPath();
    const y = band.y * H;
    for (let x = 0; x <= W; x += 10) {
      const offset = Math.sin((x / W) * Math.PI * (3.4 + index * 0.5)) * band.amp
        + Math.cos((x / W) * Math.PI * (6.6 + index * 0.35)) * (band.amp * 0.22);
      if (x === 0) ctx.moveTo(x, y + offset);
      else ctx.lineTo(x, y + offset);
    }
    ctx.strokeStyle = `rgba(214,224,235,${band.alpha})`;
    ctx.lineWidth = 10;
    ctx.stroke();
  });
  for (let i = 0; i < 3200; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 0.7 + Math.random() * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(224,232,240,${0.01 + Math.random() * 0.03})`;
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

function loadTextureIntoMaterial(loader, url, material, key, fallbackTexture, options = {}) {
  loader.load(
    url,
    (texture) => {
      if (options.colorSpace) texture.colorSpace = options.colorSpace;
      if (options.anisotropy) texture.anisotropy = options.anisotropy;
      texture.needsUpdate = true;
      material[key] = texture;
      material.needsUpdate = true;
    },
    undefined,
    () => {
      material[key] = fallbackTexture;
      material.needsUpdate = true;
    }
  );
}

function makeSolidEarthFallbackTexture() {
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 4;
  const ctx = cv.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, cv.height);
  gradient.addColorStop(0, "#122030");
  gradient.addColorStop(1, "#08111a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cv.width, cv.height);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFlatScalarTexture(value) {
  const data = new Uint8Array([value, value, value, value, value, value]);
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBFormat);
  tex.needsUpdate = true;
  return tex;
}

function makeTransparentTexture() {
  const data = new Uint8Array([255, 255, 255, 0]);
  const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

function loadTextureAsync(loader, url, options = {}) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        if (options.colorSpace) texture.colorSpace = options.colorSpace;
        if (options.anisotropy) texture.anisotropy = options.anisotropy;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

function buildDarkEarthCompositeTexture(albedoImage, maskImage, anisotropy = 4) {
  const W = albedoImage.width;
  const H = albedoImage.height;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(albedoImage, 0, 0, W, H);
  const albedo = ctx.getImageData(0, 0, W, H);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = W;
  maskCanvas.height = H;
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
  maskCtx.drawImage(maskImage, 0, 0, W, H);
  const mask = maskCtx.getImageData(0, 0, W, H);

  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (edge0, edge1, x) => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };

  const pixels = albedo.data;
  const maskPixels = mask.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
    const grayscale = (r + g + b) / 3;
    const landMask = smoothstep(0.35, 0.62, maskPixels[i] / 255);
    const oceanMask = 1 - landMask;

    const oceanLift = Math.pow(Math.min(1, luminance * 1.16), 0.84);
    const landLift = Math.pow(Math.min(1, luminance * 1.08), 0.88);

    const ocean = [
      mix(0.022, 0.082, oceanLift),
      mix(0.034, 0.122, oceanLift),
      mix(0.058, 0.19, oceanLift),
    ];
    const land = [
      mix(0.138, 0.355, landLift),
      mix(0.144, 0.368, landLift),
      mix(0.138, 0.332, landLift),
    ];
    const cooledGray = [
      grayscale * 0.5,
      grayscale * 0.52,
      grayscale * 0.54,
    ];

    const landRgb = [
      mix(land[0], cooledGray[0], 0.24),
      mix(land[1], cooledGray[1], 0.24),
      mix(land[2], cooledGray[2], 0.24),
    ];

    const outR = mix(ocean[0], landRgb[0], landMask);
    const outG = mix(ocean[1], landRgb[1], landMask);
    const outB = mix(ocean[2], landRgb[2], landMask);

    pixels[i] = Math.max(0, Math.min(255, Math.round((outR + (oceanMask * 0.012) + (landMask * 0.01)) * 255)));
    pixels[i + 1] = Math.max(0, Math.min(255, Math.round((outG + (oceanMask * 0.012) + (landMask * 0.012)) * 255)));
    pixels[i + 2] = Math.max(0, Math.min(255, Math.round((outB + (oceanMask * 0.018) + (landMask * 0.01)) * 255)));
    pixels[i + 3] = 255;
  }

  ctx.putImageData(albedo, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATMOSPHERE GLOW SHADER
// ═══════════════════════════════════════════════════════════════════════════════

function makeAtmosphere() {
  const atmSegs = IS_MOBILE ? 32 : 64;
  const geo = new THREE.SphereGeometry(R * 1.045, atmSegs, atmSegs);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0.0 } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      uniform float time;
      void main() {
        float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        float intensity = pow(rim, 4.6);
        vec3 col = mix(vec3(0.06, 0.16, 0.28), vec3(0.18, 0.38, 0.54), intensity);
        float pulse = 0.97 + 0.03 * sin(time * 0.28);
        gl_FragColor = vec4(col * pulse, intensity * 0.22);
      }`,
    side:        THREE.BackSide,
    blending:    THREE.AdditiveBlending,
    transparent: true,
    depthWrite:  false,
  });
  return new THREE.Mesh(geo, mat);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEOJSON BORDER BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

// ── GeoJSON → LineSegments geometry ────────────────────────────────────────
// BORDER_LIFT: place lines 0.008 above surface — large enough to avoid
// z-fighting with the globe sphere in all projection angles.
const BORDER_LIFT = R + 0.008;

// Device detection (read at mount time, stable)
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth < 768;

function buildBorderLines(geojson) {
  const verts = [];

  function processRing(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      // GeoJSON: [longitude, latitude]
      const lng0 = p0[0], lat0 = p0[1];
      const lng1 = p1[0], lat1 = p1[1];
      // Skip invalid coordinates
      if (Math.abs(lat0) > 90 || Math.abs(lat1) > 90) continue;
      if (Math.abs(lng0) > 180 || Math.abs(lng1) > 180) continue;
      const v0 = geoToVec3(lat0, lng0, BORDER_LIFT);
      const v1 = geoToVec3(lat1, lng1, BORDER_LIFT);
      verts.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
    }
  }

  function processGeom(geom) {
    if (!geom || !geom.type) return;
    if (geom.type === 'Polygon') {
      // coordinates: array of rings, each ring: array of [lng,lat] pairs
      geom.coordinates.forEach(ring => processRing(ring));
    } else if (geom.type === 'MultiPolygon') {
      // coordinates: array of polygons, each polygon: array of rings
      geom.coordinates.forEach(polygon => {
        polygon.forEach(ring => processRing(ring));
      });
    }
  }

  if (geojson.type === 'FeatureCollection') {
    geojson.features.forEach(feature => processGeom(feature.geometry));
  } else if (geojson.type === 'Feature') {
    processGeom(geojson.geometry);
  } else {
    // bare geometry
    processGeom(geojson);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(verts), 3));
  return geo;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STARS
// ═══════════════════════════════════════════════════════════════════════════════

function makeStars(count) {
  if (count === undefined) count = IS_MOBILE ? 1200 : 2800;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const r  = 18 + Math.random() * 22;
    pos[i*3]   = r * Math.sin(ph) * Math.cos(th);
    pos[i*3+1] = r * Math.cos(ph);
    pos[i*3+2] = r * Math.sin(ph) * Math.sin(th);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xaaccff, size: 0.045, transparent: true,
    opacity: 0.65, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOTSPOT FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

function makeHotspot(ev) {
  const cfg   = INTENSITY[ev.intensity];
  const color = new THREE.Color(cfg.color);

  const scored     = SCORED_EVENTS.find(s => s.id === ev.id) || ev;
  const pLevel     = scored.priorityLevel || "LOW";
  const geoAccuracyValue = ev.geoAccuracy?.value ?? ev.geoAccuracy ?? "approximate";
  const geoSoftness = ["country", "approximate", "unresolved"].includes(geoAccuracyValue) ? 0.78 : geoAccuracyValue === "region" ? 0.9 : 1;
  const sizeScale  = ({ CRITICAL: 1.26, HIGH: 1.12, WATCH: 0.92, LOW: 0.82 }[pLevel] ?? 0.9) * (ev.lensMatched ? 1.04 : 1) * geoSoftness;
  const markerLat = Number.isFinite(ev.displayLat) ? ev.displayLat : ev.lat;
  const markerLng = Number.isFinite(ev.displayLng) ? ev.displayLng : ev.lng;
  const surfacePos = geoToVec3(markerLat, markerLng, R + 0.014);
  const outward = geoToVec3(markerLat, markerLng, 1.0).normalize();

  const group = new THREE.Group();
  group.userData = { eventId: ev.id, surfaceNormal: outward.clone(), markerType: "event" };

  const mobileScale = (IS_MOBILE ? 1.28 : 1.0) * sizeScale;
  const makeHex = (radius, opacity, fill = false, extra = {}) => {
    const geo = fill
      ? new THREE.CircleGeometry(radius * mobileScale, 6)
      : new THREE.RingGeometry(radius * mobileScale * 0.72, radius * mobileScale, 6);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide, depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      ...extra,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseOpacity = opacity;
    return mesh;
  };
  const makeDisc = (radius, col, opacity, extra = {}) => {
    const geo = new THREE.CircleGeometry(radius * mobileScale, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      ...extra,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseOpacity = opacity;
    return mesh;
  };

  const hitRadius = ((IS_MOBILE ? 0.04 : 0.028) + Math.min(0.009, (Number(ev.impactScore ?? ev.importanceScore ?? 40) / 100) * 0.012)) * Math.max(1, sizeScale * 0.95);
  const hitArea = makeDisc(hitRadius, 0xffffff, 0.01, { depthTest: false });
  hitArea.userData = { clickable: true, eventId: ev.id, objectType: "event", objectData: ev };
  hitArea.userData.markerGroup = group;

  const highVisibility = ev.intensity === "high" || pLevel === "CRITICAL" || pLevel === "HIGH";
  const groundGlow = makeDisc(highVisibility ? 0.016 : 0.013, color, highVisibility ? 0.16 : 0.1, { depthTest: true });
  groundGlow.position.z = -0.002;
  groundGlow.userData.baseOpacity = highVisibility ? 0.16 : 0.1;

  const hexFill = makeHex(0.0085, 0.12, true, { depthTest: true });
  const accuracyOpacity = geoSoftness < 0.8 ? 0.72 : geoSoftness < 1 ? 0.84 : 1;
  const hexOutline = makeHex(highVisibility ? 0.0118 : 0.0105, (highVisibility ? 0.94 : 0.82) * accuracyOpacity, false);
  const core = makeDisc(0.0028, 0xffffff, 0.92);
  core.userData = { clickable: true, eventId: ev.id, objectType: "event", objectData: ev };
  core.userData.markerGroup = group;

  const pulse1 = makeHex(highVisibility ? 0.0155 : 0.0136, highVisibility ? 0.28 : 0.14, false);
  pulse1.userData = { pulse: true, speed: cfg.pulseSpeed * 0.82, base: highVisibility ? 0.28 : 0.14, phase: 0 };

  group.add(hitArea, groundGlow, hexFill, hexOutline, core, pulse1);

  // Position on sphere and orient outward
  group.position.copy(surfacePos);
  // Use quaternion to align group's +Z to outward normal
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);

  return group;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function distributeContactPositions(events) {
  const grouped = new Map();
  events.forEach((event) => {
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return;
    const label = String(event.location?.label ?? "region").toLowerCase();
    const key = `${label}|${Number(event.lat).toFixed(1)}|${Number(event.lng).toFixed(1)}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  });

  return events.map((event) => {
    if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return event;
    const label = String(event.location?.label ?? "region").toLowerCase();
    const key = `${label}|${Number(event.lat).toFixed(1)}|${Number(event.lng).toFixed(1)}`;
    const group = grouped.get(key) ?? [event];
    if (group.length <= 1) {
      return { ...event, displayLat: event.lat, displayLng: event.lng };
    }
    const ordered = [...group].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const index = ordered.findIndex((item) => item.id === event.id);
    const angle = ((hashString(String(event.id)) % 360) * Math.PI) / 180 + index * 2.399963229728653;
    const ring = Math.floor(index / 6);
    const radiusDeg = 0.42 + ring * 0.34;
    const latOffset = Math.sin(angle) * radiusDeg;
    const lngOffset = (Math.cos(angle) * radiusDeg) / Math.max(0.35, Math.cos((event.lat * Math.PI) / 180));
    return {
      ...event,
      displayLat: Math.max(-82, Math.min(82, event.lat + latOffset)),
      displayLng: ((((event.lng + lngOffset) + 540) % 360) - 180),
    };
  });
}

function deriveConflictZones(events) {
  const zones = [];
  const assigned = new Set();

  HOTSPOT_ZONE_RULES.forEach((rule) => {
    const matches = events.filter((event) => {
      const corpus = `${event.title ?? ""} ${event.summary ?? ""} ${event.location?.label ?? ""} ${(event.keywords ?? []).join(" ")}`.toLowerCase();
      return event.hasRenderableLocation !== false && rule.pattern.test(corpus);
    });
    if (matches.length >= 2 || matches.some((event) => Number(event.impactScore ?? event.importanceScore ?? 0) >= 75)) {
      matches.forEach((event) => assigned.add(event.id));
      zones.push({
        id: rule.id,
        label: rule.label,
        lat: rule.lat,
        lng: rule.lng,
        events: matches,
      });
    }
  });

  const regionGroups = new Map();
  events.forEach((event) => {
    if (!event.hasRenderableLocation) return;
    if (assigned.has(event.id)) return;
    const label = String(event.location?.label ?? "").trim();
    if (!label || /region under review/i.test(label)) return;
    if (!regionGroups.has(label)) regionGroups.set(label, []);
    regionGroups.get(label).push(event);
  });

  regionGroups.forEach((groupEvents, label) => {
    if (groupEvents.length < 2) return;
    const avgLat = groupEvents.reduce((sum, item) => sum + Number(item.lat ?? 0), 0) / groupEvents.length;
    const avgLng = groupEvents.reduce((sum, item) => sum + Number(item.lng ?? 0), 0) / groupEvents.length;
    zones.push({
      id: `zone-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      label,
      lat: avgLat,
      lng: avgLng,
      events: groupEvents,
    });
  });

  return zones
    .map((zone) => {
      const sortedEvents = [...zone.events].sort((a, b) => Number(b.impactScore ?? b.importanceScore ?? 0) - Number(a.impactScore ?? a.importanceScore ?? 0));
      const topEvent = sortedEvents[0];
      const severity = sortedEvents.some((event) => event.intensity === "high") ? "high" : sortedEvents.some((event) => event.intensity === "medium") ? "medium" : "low";
      const sourcesCount = sortedEvents.reduce((sum, event) => sum + Number(event.sourceSignals?.sourceCount ?? event.sources?.length ?? 1), 0);
      return {
        ...zone,
        topEvent,
        eventCount: sortedEvents.length,
        sourcesCount,
        severity,
        summary: topEvent?.summary ?? "Monitoring a dense geopolitical hotspot.",
      };
    })
    .sort((a, b) => Number(b.topEvent?.impactScore ?? b.topEvent?.importanceScore ?? 0) - Number(a.topEvent?.impactScore ?? a.topEvent?.importanceScore ?? 0))
    .slice(0, MAX_CONFLICT_ZONES);
}

function makeConflictZoneMarker(zone) {
  const group = new THREE.Group();
  const pos = geoToVec3(zone.lat, zone.lng, R + 0.01);
  const outward = geoToVec3(zone.lat, zone.lng, 1.0).normalize();
  const cfg = INTENSITY[zone.severity] ?? INTENSITY.medium;
  const color = new THREE.Color(cfg.color);
  const width = zone.eventCount >= 4 ? 0.16 : 0.12;
  const height = 0.048;

  group.position.copy(pos);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
  group.userData = {
    zoneId: zone.id,
    surfaceNormal: outward.clone(),
    markerType: "zone",
  };

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  fill.userData.baseOpacity = 0.05;

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, height)),
    new THREE.LineBasicMaterial({
      color: color.clone().lerp(new THREE.Color(0x8fdfff), 0.25),
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      depthTest: false,
    })
  );
  outline.userData.baseOpacity = 0.26;

  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.18, height * 1.6),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
  );
  hit.userData = { clickable: true, objectType: "zone", objectData: zone };
  hit.userData.markerGroup = group;

  const labelSprite = makeTextSprite(`${zone.label} ${zone.eventCount}`, {
    fontSize: 26,
    color: "#b9e7f8",
    border: "rgba(88, 188, 230, 0.18)",
    background: "rgba(4,12,24,0.48)",
  });
  labelSprite.position.set(0, height * 0.9, 0.002);
  labelSprite.userData.baseOpacity = 0.74;
  labelSprite.scale.set(0.34, 0.108, 1);

  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(width * 0.42, width * 0.48, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  pulse.userData = { pulse: true, speed: cfg.pulseSpeed * 0.5, base: 0.12, phase: 0 };

  group.add(fill, outline, hit, pulse, labelSprite);
  return group;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPACT LAYER: arcs + region glows
// ═══════════════════════════════════════════════════════════════════════════════

function buildImpactLayer(event, scenarioIndex) {
  const group = new THREE.Group();
  if (!event) return group;

  const scenario = event.scenarios?.[scenarioIndex];
  const cfg      = INTENSITY[event.intensity];
  const arcColor = new THREE.Color(cfg.arcColor);

  // Trade route arcs
  const routes = event.tradeRoutes || [];
  routes.forEach(route => {
    const pts = buildArc(route.from[0], route.from[1], route.to[0], route.to[1], 0.07);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const disrupted = scenario?.impact?.tradeRoutes === "Disrupted";
    const mat = new THREE.LineBasicMaterial({
      color: disrupted ? 0xff3322 : 0x00aaff,
      transparent: true, opacity: disrupted ? 0.75 : 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    });
    group.add(new THREE.Line(geo, mat));

    // Animated pulse dot along arc
    const dotGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: disrupted ? 0xff4433 : 0x44ddff,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, depthTest: true,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.userData = { arcPts: pts, arcT: Math.random(), arcSpeed: 0.15 + Math.random() * 0.1 };
    group.add(dot);
  });

  // Affected region glow halos
  const regions = event.affectedRegions || [];
  regions.forEach((reg, i) => {
    const pos    = geoToVec3(reg.lat, reg.lng, R + 0.008);
    const outward = pos.clone().normalize();
    const intensity  = i === 0 ? 1.0 : 0.5;
    const haloGeo = new THREE.RingGeometry(0.04, 0.08, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: arcColor, transparent: true, opacity: 0.22 * intensity,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending, depthTest: true,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.userData = { regionHalo: true, baseOpacity: 0.22 * intensity };
    halo.position.copy(pos);
    halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
    group.add(halo);

    // Connect affected region back to event origin with a dim arc
    if (i > 0) {
      const pts = buildArc(event.lat, event.lng, reg.lat, reg.lng, 0.04, 40);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: arcColor, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
      });
      group.add(new THREE.Line(lineGeo, lineMat));
    }
  });

  return group;
}

function makeObjectMarker(item, type) {
  const colorMap = {
    flight: "#7ad0ff",
    vessel: "#8cf0c9",
    satellite: "#c68dff",
  };
  const liftMap = {
    flight: 0.1,
    vessel: 0.02,
    satellite: 0.18,
  };
  const pos = geoToVec3(item.lat, item.lng, R + (liftMap[type] ?? 0.05));
  const outward = geoToVec3(item.lat, item.lng, 1.0).normalize();
  const color = new THREE.Color(colorMap[type] ?? "#ffffff");
  const group = new THREE.Group();
  group.userData = { objectType: type, objectData: item, surfaceNormal: outward.clone(), markerType: type };

  const shape = type === "flight"
    ? new THREE.ConeGeometry(0.01, 0.035, 4)
    : type === "vessel"
      ? new THREE.BoxGeometry(0.022, 0.01, 0.04)
      : new THREE.OctahedronGeometry(0.015, 0);
  const mesh = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  }));
  mesh.userData = { clickable: true, objectType: type, objectData: item, baseOpacity: 0.95 };
  mesh.userData.markerGroup = group;
  mesh.rotation.x = Math.PI / 2;

  if (type !== "satellite" && Number.isFinite(item.heading)) {
    mesh.rotation.z = -(item.heading * Math.PI / 180);
  }

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.018, 0.024, 18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  halo.userData = { pulse: true, speed: 1.4, base: 0.22, phase: Math.random() * Math.PI, baseOpacity: 0.24 };

  group.add(mesh, halo);
  group.position.copy(pos);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
  return group;
}

function makeContextMarker(item) {
  const colorMap = {
    chokepoint: "#f7b84b",
    port: "#69e7ff",
    airport: "#9bd6ff",
    energy: "#6ee7b7",
  };
  const color = new THREE.Color(colorMap[item.type] ?? "#69e7ff");
  const pos = geoToVec3(item.lat, item.lng, R + 0.018);
  const outward = geoToVec3(item.lat, item.lng, 1.0).normalize();
  const group = new THREE.Group();
  group.userData = { objectType: "context", objectData: item, surfaceNormal: outward.clone(), markerType: "context" };

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.009, 0.013, 18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.54,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  );
  const hit = new THREE.Mesh(
    new THREE.CircleGeometry(IS_MOBILE ? 0.034 : 0.022, 18),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.01, depthWrite: false, depthTest: false })
  );
  ring.userData = { baseOpacity: 0.54 };
  hit.userData = { clickable: true, objectType: "context", objectData: item, baseOpacity: 0.01 };
  hit.userData.markerGroup = group;
  group.add(hit, ring);
  group.position.copy(pos);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);
  return group;
}

// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// DATA INGESTION LAYER  (PARTS 2–3)
// Fetches real-world data from public APIs, normalises into GrigorI event format.
// All fetches are cached in module-scope Maps — never re-fetched within TTL.
// ═══════════════════════════════════════════════════════════════════════════════

// ── In-memory cache ───────────────────────────────────────────────────────────
const _dataCache = new Map();  // key → { data, expiresAt }

function cacheGet(key) {
  const e = _dataCache.get(key);
  if (!e || Date.now() > e.expiresAt) return null;
  return e.data;
}
function cacheSet(key, data, ttlMs = 15 * 60 * 1000) {
  _dataCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── GDELT news fetcher ─────────────────────────────────────────────────────────
// GDELT GeoNews API: free, no key, CORS-enabled subset
async function fetchGDELTEvents(maxItems = 12) {
  const cached = cacheGet("gdelt_events");
  if (cached) return cached;

  // GDELT provides a news-as-events feed via a documented public endpoint
  const url = "https://api.gdeltproject.org/api/v2/geo/geo?query=conflict%20OR%20military%20OR%20tension&mode=pointdata&maxrows=250&format=json";

  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`GDELT ${res.status}`);
    const data = await res.json();
    const features = data.features || [];

    // Normalise GDELT point features into Grigori event format
    const events = features
      .filter(f => f.geometry?.coordinates?.length === 2)
      .slice(0, maxItems)
      .map((f, i) => {
        const [lng, lat] = f.geometry.coordinates;
        const props = f.properties || {};
        const title = props.name || props.htmltitle || "Global Event";
        const toneval = parseFloat(props.tone || 0);
        const tone = toneval < -3 ? "Escalating" : toneval > 2 ? "De-escalating" : "Stable";
        const avgTone = Math.abs(toneval);
        const intensity = avgTone > 6 ? "high" : avgTone > 3 ? "medium" : "low";

        return {
          id:         `gdelt_${i}_${Date.now()}`,
          title:      title.slice(0, 80),
          lat:        parseFloat(lat.toFixed(4)),
          lng:        parseFloat(lng.toFixed(4)),
          intensity,
          tone,
          confidence: "Low",   // GDELT signals are noisy
          summary:    `GDELT news cluster: ${title}. Tone score: ${toneval.toFixed(1)}.`,
          developments: props.htmltitle ? [props.htmltitle.slice(0, 100)] : [],
          scenarios:  [],       // populated by AI if key available
          source:     "GDELT",
          category:   "news",
          timestamp:  new Date().toISOString(),
          affectedRegions: [{ lat, lng }],
          tradeRoutes: [],
        };
      });

    cacheSet("gdelt_events", events, 15 * 60 * 1000);
    return events;
  } catch (err) {
    console.warn("[Grigori] GDELT fetch failed:", err.message);
    return [];
  }
}

function resolveBackendUrl(path) {
  if (typeof window === "undefined") return path;
  if (window.__GRIGORI_API_BASE) {
    return `${window.__GRIGORI_API_BASE}${path}`;
  }
  return path;
}

function mapToneToGlobeIntensity(tone, confidence) {
  if (tone === "Escalating" && confidence === "High") return "high";
  if (tone === "Escalating") return "medium";
  if (confidence === "High") return "medium";
  return "low";
}

function normalizeBackendScenario(scenario) {
  const impact = scenario?.impact ?? {};

  return {
    name: scenario?.name ?? "Base Case",
    probability: scenario?.probability ?? 100,
    description: scenario?.description ?? "Monitoring for follow-on developments.",
    triggers: scenario?.triggers ?? [],
    impact: {
      oil: impact.oil ?? "Neutral",
      markets: impact.markets ?? "Neutral",
      tradeRoutes: impact.tradeRoutes ?? (impact.markets === "Risk-off" ? "Disrupted" : "Neutral"),
      sectors: impact.sectors ?? [],
      regionalEffects: impact.regionalEffects ?? [],
      regionalStability: impact.regionalStability ?? "Fragile",
    },
  };
}

function normalizeBackendEvent(event) {
  const sanitized = sanitizeEventNarrative(event).cleaned;
  const location = inferLocationDetails({
    ...event,
    ...sanitized,
    location: sanitized.location ?? event.location ?? { label: "Region under review", lat: null, lng: null },
  });
  const scenarios = (sanitized.scenarios ?? event.scenarios ?? []).map(normalizeBackendScenario);
  const classification = deriveEventClassification({
    ...event,
    ...sanitized,
    location,
    scenarios,
  });
  const impactDrivenIntensity = classification.impactScore >= 82
    ? "high"
    : classification.impactScore >= 56
      ? "medium"
      : "low";

  return {
    id: event.id,
    title: sanitized.title ?? event.title ?? "Untitled Event",
    lat: Number.isFinite(location.lat) ? location.lat : null,
    lng: Number.isFinite(location.lng) ? location.lng : null,
    location,
    intensity: impactDrivenIntensity || mapToneToGlobeIntensity(event.tone, event.confidence),
    summary: sanitized.summary ?? event.summary ?? "",
    assessment: sanitized.assessment ?? event.assessment ?? "",
    tone: sanitized.tone ?? event.tone ?? "Stable",
    confidence: sanitized.confidence ?? event.confidence ?? "Low",
    developments: sanitized.developments ?? event.developments ?? [],
    scenarios: scenarios.length > 0 ? scenarios : [{
      name: "Monitoring",
      probability: 100,
      description: "Rule-based watch scenario assembled from source signals.",
      impact: {
        oil: "Neutral",
        markets: "Stable",
        tradeRoutes: "Stable",
        sectors: [],
        regionalEffects: [],
      },
    }],
    affectedRegions: Number.isFinite(location.lat) && Number.isFinite(location.lng) ? [{ lat: location.lat, lng: location.lng }] : [],
    tradeRoutes: [],
    timestamp: event.timestamp ?? new Date().toISOString(),
    importanceScore: Number(event.importanceScore ?? event.importance_score ?? 0),
    sources: event.sources ?? [],
    articleIds: event.articleIds ?? event.article_ids ?? [],
    keywords: event.keywords ?? [],
    aiStatus: event.aiStatus ?? event.ai_status ?? "fallback",
    aiUpdatedAt: event.aiUpdatedAt ?? event.ai_updated_at ?? null,
    created_at: event.created_at ?? event.createdAt ?? null,
    updated_at: event.updated_at ?? event.updatedAt ?? null,
    whyThisMatters: sanitized.whyThisMatters ?? event.whyThisMatters ?? event.why_this_matters ?? [],
    watchIndicators: sanitized.watchIndicators ?? event.watchIndicators ?? event.watch_indicators ?? [],
    confidenceRationale: sanitized.confidenceRationale ?? event.confidenceRationale ?? event.confidence_rationale ?? "",
    marketImpact: sanitized.marketImpact ?? event.marketImpact ?? event.market_impact ?? {},
    sourceAssessment: sanitized.sourceAssessment ?? event.sourceAssessment ?? event.source_assessment ?? {},
    category: event.category ?? classification.category,
    severityScore: Number(event.severityScore ?? event.severity_score ?? classification.severityScore),
    impactScore: Number(event.impactScore ?? event.impact_score ?? classification.impactScore),
    confidenceScore: Number(event.confidenceScore ?? event.confidence_score ?? classification.confidenceScore),
    isHistorical: Boolean(event.isHistorical ?? event.is_historical ?? false),
  };
}

function decorateEventForUi(event) {
  const sourceSignals = getEventSourceSignals(event);
  const importanceScore = Number(event.importanceScore ?? event.priorityScore ?? deriveImportance(event));
  const location = inferLocationDetails(event);
  const geoAccuracy = computeGeoAccuracy({ ...event, location });
  const classification = deriveEventClassification({ ...event, location });

  return {
    ...event,
    lat: Number.isFinite(location.lat) ? location.lat : (Number.isFinite(event.lat) ? event.lat : null),
    lng: Number.isFinite(location.lng) ? location.lng : (Number.isFinite(event.lng) ? event.lng : null),
    location,
    geoAccuracy,
    hasRenderableLocation: Number.isFinite(location.lat) && Number.isFinite(location.lng),
    importanceScore,
    category: event.category ?? classification.category,
    severityScore: Number(event.severityScore ?? classification.severityScore),
    impactScore: Number(event.impactScore ?? classification.impactScore),
    confidenceScore: Number(event.confidenceScore ?? classification.confidenceScore),
    sourceSignals,
    riskLevel: deriveRiskLevel({ ...event, importanceScore }),
    marketImpactTags: getMarketImpactTags(event),
    confidenceExplanation: explainConfidence(event),
    briefSummary: getOneLineSummary(event),
    confidenceDrivers: buildConfidenceDrivers({ ...event, location }),
    recentTrend: event.recentTrend ?? "Insufficient data",
  };
}

function isPublicSignalDisplayable(event) {
  const title = String(event.title ?? "");
  const summary = String(event.summary ?? event.briefSummary ?? "");
  const corpus = `${title} ${summary} ${(event.keywords ?? []).join(" ")}`;
  const locationLabel = String(event.location?.label ?? "").trim().toLowerCase();
  const unresolvedRegion = !locationLabel || locationLabel === "region under review" || locationLabel === "unknown region";
  const sourceSignals = getEventSourceSignals(event);
  const sourceQuality = String(event.sourceAssessment?.sourceQuality ?? "").toLowerCase();
  const contentTypes = event.sourceAssessment?.contentTypes ?? event.contentTypes ?? [];
  const looksOpinion = /\b(opinion|op-ed|editorial|letter to the editor|commentary|thoughts on|i think|i was shocked|i wondered|our young men)\b/i.test(corpus) ||
    contentTypes.some((type) => /opinion|editorial|letter/i.test(String(type)));
  const ambiguousDraft = /\bdraft\b/i.test(corpus) &&
    !/\b(conscription|mobilization|mobilisation|military draft|selective service|call-up)\b/i.test(corpus) &&
    /\b(nfl|nba|sports|mock draft|draft pick|thoughts on|pittsburgh|triblive)\b/i.test(corpus);
  const weakSingleSource = sourceSignals.sourceCount <= 1 && (event.confidence === "Low" || sourceQuality === "low");

  if (looksOpinion || ambiguousDraft) return false;
  if (unresolvedRegion && weakSingleSource) return false;
  if (unresolvedRegion && Number(event.impactScore ?? 0) < 70 && event.confidence !== "High") return false;
  return true;
}

function normalizePublicSignalLabels(event) {
  const locationLabel = String(event.location?.label ?? "").trim().toLowerCase();
  if (locationLabel !== "region under review") return event;
  return {
    ...event,
    location: {
      ...event.location,
      label: "Location under review",
    },
  };
}

function withNoStoreUrl(path, forceFresh = false) {
  if (!forceFresh) return resolveBackendUrl(path);
  const separator = path.includes("?") ? "&" : "?";
  return resolveBackendUrl(`${path}${separator}t=${Date.now()}`);
}

async function fetchBackendEvents(forceFresh = false, { scope = "active", limit = 120 } = {}) {
  const url = withNoStoreUrl(`/api/v1/events?limit=${limit}&scope=${scope}`, forceFresh);
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`backend ${res.status}`);

  const data = await res.json();
  const rawNormalized = Array.isArray(data.events)
    ? data.events.map((event) => decorateEventForUi(normalizeBackendEvent(event)))
    : [];
  const publicEvents = rawNormalized.filter(isPublicSignalDisplayable);

  const withTrends = publicEvents.map((event) => normalizePublicSignalLabels({
    ...event,
    recentTrend: deriveRecentTrend(event, publicEvents),
  }));

  return {
    events: withTrends.length > 0 ? enrichEvents(withTrends) : [],
    meta: {
      scope: data.scope ?? scope,
      count: data.count ?? rawNormalized.length,
      total: data.total ?? publicEvents.length,
      fallbackUsed: Boolean(data.fallbackUsed),
      fallbackReason: data.fallbackReason ?? "unknown",
      freshnessMode: data.freshnessMode ?? "best_available",
      dataSource: data.dataSource ?? data.mode ?? "backend",
      groupedDuplicates: Number(data.groupedDuplicates ?? 0),
      groupedDuplicateCount: Number(data.groupedDuplicateCount ?? data.groupedDuplicates ?? 0),
      storedContextIncluded: Number(data.storedContextIncluded ?? 0),
      stateCounts: data.stateCounts ?? null,
      visibleWithFallbackCount: Number(data.visibleWithFallbackCount ?? data.total ?? publicEvents.length),
      visibleActiveCount: Number(data.visibleActiveCount ?? data.total ?? publicEvents.length),
      freshEligibleCount: Number(data.freshEligibleCount ?? data.stateCounts?.fresh_active ?? 0),
      recentContextCount: Number(data.recentContextCount ?? data.stateCounts?.recent_context ?? 0),
      storedRelevantCount: Number(data.storedRelevantCount ?? data.stateCounts?.stored_relevant ?? 0),
      archivedCount: Number(data.archivedCount ?? data.stateCounts?.archived ?? 0),
    },
  };
}

// ── Merge live data with static events ────────────────────────────────────────
// Returns the combined scored event list, preferring static data for enriched events
async function fetchLiveEvents(forceFresh = false) {
  try {
    const backendResult = await fetchBackendEvents(forceFresh, { scope: "active", limit: 120 });
    if (backendResult.events.length > 0) {
      return backendResult;
    }

    const fallbackResult = await fetchBackendEvents(forceFresh, { scope: "all", limit: 120 });
    if (fallbackResult.events.length > 0) {
      return {
        events: fallbackResult.events,
        meta: {
          ...fallbackResult.meta,
          fallbackUsed: true,
          fallbackReason: "stored_signals",
          freshnessMode: "best_available",
        },
      };
    }
  } catch (err) {
    console.warn("[Grigori] Backend events fetch failed:", err.message);
  }

  if (DEMO_MODE) {
    return {
      events: [...SCORED_EVENTS].map(decorateEventForUi),
      meta: {
        scope: "demo",
        count: SCORED_EVENTS.length,
        total: SCORED_EVENTS.length,
        fallbackUsed: true,
        fallbackReason: "demo_seed",
        freshnessMode: "best_available",
        dataSource: "demo",
      },
    };
  }

  const [gdelt] = await Promise.allSettled([fetchGDELTEvents()]);
  const liveEvents = gdelt.status === "fulfilled" ? gdelt.value : [];

  // Merge: static SCORED_EVENTS take priority; live events fill remaining slots
  const staticIds = new Set(SCORED_EVENTS.map(e => e.id));
  const newLive   = liveEvents.filter(e => !staticIds.has(e.id));

  // Enrich live events with scoring (they lack full scenario data, so scores are rough)
  const enriched = newLive.map(ev => {
    const impact      = ev.intensity === "high" ? 20 : ev.intensity === "medium" ? 10 : 4;
    const probability = 12;   // low confidence default
    const urgency     = ev.tone === "Escalating" ? 14 : 6;
    const confidence  = 3;    // GDELT = Low
    const total       = impact + probability + urgency + confidence;
    return {
      ...ev,
      priorityScore:  total,
      priorityLevel:  priorityLevel(total),
      scoreBreakdown: { impact, probability, urgency, confidence },
      whyThisMatters: `Live signal from GDELT news cluster. Confidence is low — treat as early indicator.`,
    };
  });

  const fallbackEvents = [...SCORED_EVENTS, ...enriched].map(decorateEventForUi);
  return {
    events: fallbackEvents,
    meta: {
      scope: "fallback",
      count: fallbackEvents.length,
      total: fallbackEvents.length,
      fallbackUsed: true,
      fallbackReason: fallbackEvents.length > 0 ? "stored_signals" : "no_events_available",
      freshnessMode: "best_available",
      dataSource: "fallback",
    },
  };
}

const MAX_FLIGHTS_RENDERED = 100;
const MAX_VESSELS_RENDERED = 100;
const MAX_SATELLITES_RENDERED = 150;
const MAX_SOCIAL_SIGNALS_RENDERED = 30;

function normalizeFlightObject(item) {
  return {
    id: item.id ?? item.flightNumber,
    type: "flight",
    title: item.flightNumber ?? "Flight",
    lat: Number(item.lat ?? 0),
    lng: Number(item.lng ?? 0),
    flightNumber: item.flightNumber ?? "Unknown",
    airline: item.airline ?? "Unknown Airline",
    departureAirport: item.departureAirport ?? "Unknown",
    arrivalAirport: item.arrivalAirport ?? "Unknown",
    departureCity: item.departureCity ?? "Unknown",
    arrivalCity: item.arrivalCity ?? "Unknown",
    altitude: item.altitude ?? null,
    speed: item.speed ?? null,
    heading: item.heading ?? null,
    status: item.status ?? "unknown",
    updatedAt: item.updatedAt ?? null,
  };
}

function normalizeVesselObject(item) {
  return {
    id: item.id ?? item.mmsi,
    type: "vessel",
    title: item.name ?? "Vessel",
    lat: Number(item.lat ?? 0),
    lng: Number(item.lng ?? 0),
    mmsi: item.mmsi ?? "Unknown",
    name: item.name ?? "Unknown Vessel",
    vesselType: item.vesselType ?? "Unknown",
    speed: item.speed ?? null,
    heading: item.heading ?? null,
    destination: item.destination ?? "Unknown",
    eta: item.eta ?? null,
    flag: item.flag ?? null,
    updatedAt: item.updatedAt ?? null,
  };
}

function normalizeSatelliteObject(item) {
  return {
    id: item.id ?? item.noradId,
    type: "satellite",
    title: item.name ?? "Satellite",
    lat: Number(item.lat ?? 0),
    lng: Number(item.lng ?? 0),
    name: item.name ?? "Unknown Satellite",
    noradId: item.noradId ?? "Unknown",
    satelliteType: item.type ?? "Satellite",
    altitudeKm: item.altitudeKm ?? null,
    inclination: item.inclination ?? null,
    updatedAt: item.updatedAt ?? null,
  };
}

function normalizeSocialSignalObject(item) {
  return {
    id: item.id ?? item.url,
    type: "social",
    title: item.title ?? "Social signal",
    source: item.source ?? "X",
    summary: item.summary ?? "",
    content: item.content ?? "",
    url: item.url ?? "",
    region: item.region ?? "Region under review",
    keywords: item.keywords ?? [],
    publishedAt: item.publishedAt ?? new Date().toISOString(),
    verificationStatus: item.verificationStatus ?? "unverified",
    signalType: item.signalType ?? "social",
    sourceQuality: item.sourceQuality ?? 0.32,
    account: item.account ?? null,
  };
}

function deriveSocialCorroboration(signal, events = []) {
  const haystack = `${signal.title} ${signal.summary} ${signal.content} ${signal.region} ${(signal.keywords ?? []).join(" ")}`.toLowerCase();
  const matches = events.filter((event) => {
    const eventText = `${event.title} ${event.summary ?? ""} ${event.location?.label ?? ""} ${(event.keywords ?? []).join(" ")}`.toLowerCase();
    return String(event.location?.label ?? "").toLowerCase() === String(signal.region ?? "").toLowerCase() ||
      (signal.keywords ?? []).some((keyword) => eventText.includes(String(keyword).toLowerCase())) ||
      haystack.includes(String(event.location?.label ?? "").toLowerCase());
  });
  const reputable = matches.filter((event) => (event.sourceSignals?.trustLabel ?? "Low") !== "Low");

  if (reputable.length >= 2) {
    return { label: "Corroborated", confidence: "High", relatedEvents: reputable.slice(0, 3) };
  }
  if (matches.length >= 1) {
    return { label: "Partially corroborated", confidence: "Medium", relatedEvents: matches.slice(0, 3) };
  }
  return { label: "Unverified", confidence: "Low", relatedEvents: [] };
}

async function fetchOperationalStatus(forceFresh = false) {
  const res = await fetch(withNoStoreUrl("/api/v1/health", forceFresh), {
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return await res.json();
}

async function fetchMarketContext() {
  const res = await fetch(resolveBackendUrl("/api/v1/market/context"), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`market ${res.status}`);
  return await res.json();
}

async function fetchFlightsLive() {
  const res = await fetch(resolveBackendUrl("/api/v1/flights/live"), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`flights ${res.status}`);
  const data = await res.json();
  return {
    ...data,
    data: Array.isArray(data.data) ? data.data.slice(0, MAX_FLIGHTS_RENDERED).map(normalizeFlightObject) : [],
  };
}

async function fetchSatellitesLive() {
  const res = await fetch(resolveBackendUrl("/api/v1/satellites/live"), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`satellites ${res.status}`);
  const data = await res.json();
  return {
    ...data,
    data: Array.isArray(data.data) ? data.data.slice(0, MAX_SATELLITES_RENDERED).map(normalizeSatelliteObject) : [],
  };
}

async function fetchSocialSignalsLive() {
  const res = await fetch(resolveBackendUrl("/api/v1/social/live"), { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`social ${res.status}`);
  const data = await res.json();
  return {
    ...data,
    data: Array.isArray(data.data) ? data.data.slice(0, MAX_SOCIAL_SIGNALS_RENDERED).map(normalizeSocialSignalObject) : [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSONALIZATION SYSTEM  (PART 6)
// User preferences for region / sector / risk filtering
// ═══════════════════════════════════════════════════════════════════════════════

const REGION_OPTIONS = [
  { id: "all",      label: "All Regions" },
  { id: "europe",   label: "Europe",     keywords: ["black sea","ukraine","russia","baltic","balkans","nato"] },
  { id: "mideast",  label: "Middle East", keywords: ["hormuz","iran","israel","gaza","yemen","red sea","suez"] },
  { id: "asia",     label: "Asia-Pacific", keywords: ["taiwan","china","korea","kashmir","myanmar","south china"] },
  { id: "africa",   label: "Africa",     keywords: ["sahel","sudan","mali","niger","somalia","ethiopia"] },
  { id: "americas", label: "Americas",   keywords: ["venezuela","guyana","colombia"] },
];

const SECTOR_OPTIONS = ["Energy", "Defense", "Tech", "Shipping", "Food", "Finance"];
const WATCHLIST_STORAGE_KEY = "grigori-watchlist";

const RISK_OPTIONS = [
  { id: "all",      label: "All Levels" },
  { id: "critical", label: "Critical only", minScore: 78 },
  { id: "high",     label: "High+",         minScore: 58 },
  { id: "watch",    label: "Watch+",        minScore: 38 },
];

function filterEvents(events, prefs) {
  let filtered = [...events];

  // Region filter
  if (prefs.region && prefs.region !== "all") {
    const reg = REGION_OPTIONS.find(r => r.id === prefs.region);
    if (reg?.keywords) {
      filtered = filtered.filter(ev => {
        const text = (ev.title + " " + ev.location?.label + " " + (ev.summary || "")).toLowerCase();
        return reg.keywords.some(k => text.includes(k));
      });
    }
  }

  // Sector filter
  if (prefs.sectors && prefs.sectors.length > 0) {
    filtered = filtered.filter(ev => {
      const evSectors = ev.scenarios?.flatMap(s => s.impact?.sectors || []) || [];
      return prefs.sectors.some(s => evSectors.includes(s));
    });
  }

  // Risk filter
  if (prefs.riskLevel && prefs.riskLevel !== "all") {
    const riskConf = RISK_OPTIONS.find(r => r.id === prefs.riskLevel);
    if (riskConf) filtered = filtered.filter(ev => (ev.priorityScore || 0) >= riskConf.minScore);
  }

  return filtered;
}

// ── Personalization filter panel UI ───────────────────────────────────────────
function PersonalizationPanel({ prefs, onChange, onClose, watchlist, selectedEvent, onToggleRegion, onToggleTopic }) {
  return (
    <div style={{
      position: "absolute", top: FLOATING_TOP, left: 280, width: 300, zIndex: 45,
      background: "linear-gradient(180deg, rgba(5,12,24,0.96) 0%, rgba(7,15,29,0.98) 100%)",
      border: "1px solid rgba(94, 164, 195, 0.16)", borderRadius: 18,
      boxShadow: "0 24px 55px rgba(0,0,0,0.46)",
      animation: "panelIn 0.28s cubic-bezier(0.23,1,0.32,1)",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "11px 14px 9px", borderBottom: "1px solid rgba(0,180,255,0.12)" }}>
        <div style={{ color: "#c8e8ff", fontFamily: display, fontSize: 13,
          fontWeight: 700, letterSpacing: "0.06em" }}>PERSONALIZE INTEL</div>
        <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(0,180,255,0.22)",
          color: "rgba(0,180,255,0.55)", cursor: "pointer", width: 26, height: 26,
          borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✕</button>
      </div>

      <div style={sharedPanelBodyStyle({ padding: "12px 14px", maxHeight: "60vh" })}>
        {/* Region */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "rgba(0,200,255,0.4)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>REGION FOCUS</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {REGION_OPTIONS.map(r => (
              <button key={r.id} onClick={() => onChange({ ...prefs, region: r.id })} style={{
                padding: "4px 9px", borderRadius: 4, cursor: "pointer",
                background: prefs.region === r.id ? "rgba(0,180,255,0.18)" : "rgba(0,20,50,0.5)",
                border: `1px solid ${prefs.region === r.id ? "rgba(0,180,255,0.5)" : "rgba(0,100,180,0.2)"}`,
                color: prefs.region === r.id ? "#88ddff" : "rgba(150,200,240,0.55)",
                fontSize: 10, fontFamily: mono, letterSpacing: "0.06em", minHeight: 30,
              }}>{r.label}</button>
            ))}
          </div>
        </div>

        {/* Sectors */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "rgba(0,200,255,0.4)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>SECTOR EXPOSURE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SECTOR_OPTIONS.map(s => {
              const c    = SECTOR_COLOR[s] || "#8899aa";
              const active = (prefs.sectors || []).includes(s);
              return (
                <button key={s} onClick={() => {
                  const cur = prefs.sectors || [];
                  const next = active ? cur.filter(x => x !== s) : [...cur, s];
                  onChange({ ...prefs, sectors: next });
                }} style={{
                  padding: "4px 9px", borderRadius: 4, cursor: "pointer",
                  background: active ? `${c}22` : "rgba(0,20,50,0.5)",
                  border: `1px solid ${active ? c + "66" : "rgba(0,100,180,0.2)"}`,
                  color: active ? c : "rgba(150,200,240,0.55)",
                  fontSize: 10, fontFamily: mono, letterSpacing: "0.06em", minHeight: 30,
                }}>{s}</button>
              );
            })}
          </div>
        </div>

        {/* Risk level */}
        <div>
          <div style={{ color: "rgba(0,200,255,0.4)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>MIN RISK LEVEL</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {RISK_OPTIONS.map(r => (
              <button key={r.id} onClick={() => onChange({ ...prefs, riskLevel: r.id })} style={{
                padding: "4px 9px", borderRadius: 4, cursor: "pointer",
                background: prefs.riskLevel === r.id ? "rgba(255,136,0,0.15)" : "rgba(0,20,50,0.5)",
                border: `1px solid ${prefs.riskLevel === r.id ? "rgba(255,136,0,0.45)" : "rgba(0,100,180,0.2)"}`,
                color: prefs.riskLevel === r.id ? "#ffaa44" : "rgba(150,200,240,0.55)",
                fontSize: 10, fontFamily: mono, letterSpacing: "0.06em", minHeight: 30,
              }}>{r.label}</button>
            ))}
          </div>
        </div>

        <WatchlistPanel
          watchlist={watchlist}
          selectedEvent={selectedEvent}
          onToggleRegion={onToggleRegion}
          onToggleTopic={onToggleTopic}
        />
      </div>
    </div>
  );
}

function WatchlistPanel({ watchlist, selectedEvent, onToggleRegion, onToggleTopic }) {
  const regionLabel = selectedEvent?.location?.label ?? "No region selected";
  const topicOptions = (selectedEvent?.keywords ?? []).slice(0, 5);

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(0,180,255,0.1)" }}>
      <div style={{ color: "rgba(0,200,255,0.4)", fontSize: 9, fontFamily: mono,
        letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>WATCHLIST</div>
      <div style={{ color: "rgba(160,210,255,0.75)", fontSize: 11, fontFamily: display, marginBottom: 8 }}>
        Star regions or topics to highlight matching events.
      </div>
      <button onClick={() => selectedEvent && onToggleRegion(regionLabel)} disabled={!selectedEvent} style={{
        padding: "6px 10px", borderRadius: 4, cursor: selectedEvent ? "pointer" : "not-allowed",
        background: watchlist.regions.includes(regionLabel) ? "rgba(255,204,0,0.14)" : "rgba(0,20,50,0.5)",
        border: `1px solid ${watchlist.regions.includes(regionLabel) ? "rgba(255,204,0,0.45)" : "rgba(0,100,180,0.2)"}`,
        color: watchlist.regions.includes(regionLabel) ? "#ffcc44" : "rgba(150,200,240,0.55)",
        fontSize: 10, fontFamily: mono, letterSpacing: "0.06em", minHeight: 30, width: "100%", textAlign: "left",
      }}>
        ★ Region: {regionLabel}
      </button>
      {topicOptions.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {topicOptions.map((topic) => {
            const active = watchlist.topics.includes(topic);
            return (
              <button key={topic} onClick={() => onToggleTopic(topic)} style={{
                padding: "4px 9px", borderRadius: 4, cursor: "pointer",
                background: active ? "rgba(255,204,0,0.14)" : "rgba(0,20,50,0.5)",
                border: `1px solid ${active ? "rgba(255,204,0,0.45)" : "rgba(0,100,180,0.2)"}`,
                color: active ? "#ffcc44" : "rgba(150,200,240,0.55)",
                fontSize: 10, fontFamily: mono, letterSpacing: "0.06em", minHeight: 30,
              }}>
                ★ {topic}
              </button>
            );
          })}
        </div>
      ) : null}
      {(watchlist.regions.length > 0 || watchlist.topics.length > 0) ? (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {watchlist.regions.map((region) => (
            <TrafficPill key={region} level="amber">{region}</TrafficPill>
          ))}
          {watchlist.topics.map((topic) => (
            <TrafficPill key={topic} level="neutral">{topic}</TrafficPill>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BriefingPanel({ briefing, strategicBrief, selectedLens, onLensChange, onSelect, onClose, systemStatus, feedState }) {
  const lens = strategicBrief?.lens ?? DECISION_LENSES[0];
  const newsFreshness = getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt);
  const aiFreshness = getDataFreshness(systemStatus?.automation?.lastAiRefreshAt);
  return (
    <FloatingPanel title="Today's Strategic Brief" subtitle={lens.description} top={FLOATING_TOP + 8} right={16} width={344} onClose={onClose}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {DECISION_LENSES.map((item) => (
          <button
            key={item.id}
            onClick={() => onLensChange?.(item.id)}
            style={{
              minHeight: 30,
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${selectedLens === item.id ? "rgba(87,216,255,0.42)" : "rgba(94,164,195,0.12)"}`,
              background: selectedLens === item.id ? "rgba(56,189,248,0.16)" : "rgba(8,20,36,0.7)",
              color: selectedLens === item.id ? "#8ae8ff" : "rgba(190,218,236,0.74)",
              fontSize: 10,
              fontFamily: mono,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        <div style={{ background: "rgba(8,20,36,0.76)", border: "1px solid rgba(94, 164, 195, 0.12)", borderRadius: 16, padding: "12px 13px" }}>
          <div style={{ color: "rgba(0,200,255,0.38)", fontSize: 9, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            Daily Snapshot
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700, marginBottom: 4 }}>Top escalating regions</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(strategicBrief?.topEscalatingRegions?.length ? strategicBrief.topEscalatingRegions : ["Awaiting next intelligence refresh."]).map((region) => (
                  <TrafficPill key={region} level="amber">{region}</TrafficPill>
                ))}
              </div>
            </div>
            <div>
              <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700, marginBottom: 4 }}>Chokepoint to watch</div>
              <div style={{ color: "rgba(150,205,245,0.72)", fontSize: 11, lineHeight: 1.6 }}>{strategicBrief?.chokepointToWatch ?? "Awaiting next intelligence refresh."}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <TrafficPill level={newsFreshness.tone}>{newsFreshness.label}</TrafficPill>
              <TrafficPill level={aiFreshness.tone}>{formatAiFreshnessLabel(aiFreshness)}</TrafficPill>
              <TrafficPill level="neutral">AI remaining {strategicBrief?.aiRemainingToday ?? 0}</TrafficPill>
            </div>
            {feedState?.message ? (
              <div style={{ color: "#cbd5e1", fontSize: 11, lineHeight: 1.6 }}>{feedState.message}</div>
            ) : null}
          </div>
        </div>
      </div>
      {briefing.items.length === 0 ? (
        <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>Awaiting next intelligence refresh.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {strategicBrief?.topMarketSensitiveEvents?.length ? (
            <div style={{ background: "rgba(8,20,36,0.76)", border: "1px solid rgba(94, 164, 195, 0.12)", borderRadius: 16, padding: "12px 13px" }}>
              <div style={{ color: "rgba(0,200,255,0.38)", fontSize: 9, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                Market-sensitive events
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {strategicBrief.topMarketSensitiveEvents.map((item) => (
                  <button key={item.id} onClick={() => onSelect(item.id)} style={{ background: "rgba(5,14,28,0.88)", border: "1px solid rgba(94, 164, 195, 0.12)", borderRadius: 12, padding: "10px 11px", textAlign: "left", cursor: "pointer" }}>
                    <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
                    <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 11, lineHeight: 1.55 }}>{item.summary}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {briefing.items.map((item, index) => (
            <button key={item.id} onClick={() => onSelect(item.id)} style={{
              background: "rgba(8,20,36,0.76)",
              border: "1px solid rgba(94, 164, 195, 0.12)",
              borderRadius: 16,
              padding: "12px 13px",
              textAlign: "left",
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "rgba(0,200,255,0.38)", fontSize: 9, fontFamily: mono }}>#{index + 1}</span>
                <TrafficPill level={item.riskLevel === "Critical" ? "red" : item.riskLevel === "High" ? "amber" : "neutral"}>
                  {item.riskLevel}
                </TrafficPill>
              </div>
              <div style={{ color: "#d6ebff", fontSize: 14, fontFamily: display, fontWeight: 700, lineHeight: 1.25, marginBottom: 6, letterSpacing: "0.03em" }}>
                {item.title}
              </div>
              <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 12, lineHeight: 1.6, marginBottom: 8, fontFamily: bodyFont }}>
                {item.summary}
              </div>
              {item.aiStatusLabel ? (
                <div style={{ marginBottom: 8 }}>
                  <TrafficPill level={item.aiStatus === "enriched" ? "green" : item.aiStatus === "cached" ? "neutral" : item.aiStatus === "budget_exhausted" ? "amber" : "neutral"}>
                    {item.aiStatusLabel}
                  </TrafficPill>
                </div>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {item.marketImpactTags.map((tag) => (
                  <TrafficPill key={tag} level={/Oil Up|Shipping Risk|Equities Risk-off/i.test(tag) ? "red" : /Defense|Tech/i.test(tag) ? "amber" : "neutral"}>
                    {tag}
                  </TrafficPill>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </FloatingPanel>
  );
}

function BriefingCompactCard({ briefing, strategicBrief, systemStatus, feedState, situations = [], onOpen, onDismiss, leftOffset = 304 }) {
  const firstItem = briefing?.items?.[0] ?? null;
  const newsFreshness = getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt);
  const aiFreshness = getDataFreshness(systemStatus?.automation?.lastAiRefreshAt);
  const topRegion = strategicBrief?.topEscalatingRegions?.[0] ?? firstItem?.region ?? "Global risk";
  const summary = firstItem?.summary ?? strategicBrief?.chokepointToWatch ?? feedState?.message ?? "Live signals are being ranked for the current lens.";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      style={{
        position: "absolute",
        left: leftOffset,
        bottom: 116,
        width: 318,
        maxWidth: "calc(100vw - 360px)",
        zIndex: 36,
        display: "grid",
        gap: 7,
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(94,164,195,0.16)",
        background: "linear-gradient(180deg, rgba(6,15,28,0.68), rgba(5,11,22,0.78))",
        boxShadow: "0 14px 34px rgba(0,0,0,0.3)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ color: "rgba(103,220,255,0.58)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          Today&apos;s Brief
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#d6ebff", fontSize: 10, fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Open
          </span>
          <button
            type="button"
            aria-label="Dismiss today's brief"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss?.();
            }}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              display: "grid",
              placeItems: "center",
              borderRadius: 999,
              border: "1px solid rgba(94,164,195,0.16)",
              color: "rgba(189,226,248,0.7)",
              background: "rgba(6,15,30,0.62)",
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div style={{ color: "rgba(214,235,255,0.9)", fontFamily: display, fontSize: 14, fontWeight: 700, lineHeight: 1.25 }}>
        {topRegion}
      </div>
      <div style={{
        color: "rgba(160,198,225,0.72)",
        fontSize: 11,
        lineHeight: 1.42,
        fontFamily: bodyFont,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {String(summary)}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <TrafficPill level={newsFreshness.tone}>News {newsFreshness.label}</TrafficPill>
        <TrafficPill level={aiFreshness.tone}>{formatAiFreshnessLabel(aiFreshness)}</TrafficPill>
        {situations.length > 0 ? <TrafficPill level="amber">{situations.length} situations forming</TrafficPill> : null}
      </div>
    </div>
  );
}

function BriefingMiniChip({ onOpen, leftOffset = 304 }) {
  return (
    <button
      onClick={onOpen}
      style={{
        position: "absolute",
        left: leftOffset,
        bottom: 116,
        zIndex: 36,
        minHeight: 34,
        padding: "8px 12px",
        borderRadius: 999,
        border: "1px solid rgba(94,164,195,0.16)",
        background: "rgba(6,15,30,0.72)",
        color: "rgba(214,235,255,0.82)",
        fontFamily: mono,
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        boxShadow: "0 12px 30px rgba(0,0,0,0.26)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        cursor: "pointer",
      }}
    >
      Brief
    </button>
  );
}

function MarketImpactDashboard({ aggregate, onClose, onSelectCategory, emphasis = [] }) {
  const baseItems = [aggregate.oil, aggregate.shipping, aggregate.defense, aggregate.tech, aggregate.equities];
  const rank = new Map(emphasis.map((key, index) => [key, index]));
  const items = [...baseItems].sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
  return (
    <FloatingPanel title="Market Impact" subtitle="Scenario-weighted dashboard" top={FLOATING_TOP} right={16} width={320} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <button key={item.label} onClick={() => onSelectCategory?.(item.key)} style={{ background: "rgba(8,20,36,0.76)", border: "1px solid rgba(94, 164, 195, 0.12)", borderRadius: 16, padding: "13px 14px", textAlign: "left", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <span style={{ color: "#d6ebff", fontSize: 14, fontFamily: display, fontWeight: 700, letterSpacing: "0.03em" }}>{item.label}</span>
              <TrafficPill level={item.level}>{item.trend}</TrafficPill>
            </div>
            <div style={{ color: "rgba(150,205,245,0.62)", fontSize: 10, fontFamily: mono }}>
              score {item.score.toFixed(2)}
            </div>
          </button>
        ))}
      </div>
    </FloatingPanel>
  );
}

function MarketImpactCompactCard({ aggregate, onExpand, onSelectCategory }) {
  const items = [aggregate.shipping, aggregate.oil, aggregate.equities].filter(Boolean);
  return (
    <div style={{
      position: "absolute",
      top: FLOATING_TOP + 8,
      right: 16,
      width: 260,
      zIndex: 34,
      padding: "12px 13px",
      borderRadius: 16,
      border: "1px solid rgba(94,164,195,0.14)",
      background: "linear-gradient(180deg, rgba(5,12,24,0.76), rgba(5,11,22,0.84))",
      boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ color: "rgba(103,220,255,0.46)", fontSize: 9, fontFamily: mono, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Market Impact
          </div>
          <div style={{ color: "rgba(214,235,255,0.86)", fontFamily: display, fontSize: 13, fontWeight: 700, marginTop: 3 }}>
            Compact watch
          </div>
        </div>
        <button
          onClick={onExpand}
          style={{
            minHeight: 30,
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(87,216,255,0.18)",
            background: "rgba(6,15,30,0.72)",
            color: "#d6ebff",
            fontFamily: mono,
            fontSize: 9,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Details
        </button>
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelectCategory?.(item.key)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 8,
              padding: "9px 10px",
              borderRadius: 12,
              border: "1px solid rgba(94,164,195,0.1)",
              background: "rgba(8,20,36,0.58)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span style={{ color: "rgba(214,235,255,0.84)", fontFamily: display, fontSize: 13, fontWeight: 700 }}>
              {item.label}
            </span>
            <TrafficPill level={item.level}>{item.trend}</TrafficPill>
          </button>
        ))}
      </div>
    </div>
  );
}

function IntroTrustCard({ onDismiss, onMethodology, leftOffset = 304, topOffset = 76 }) {
  return (
    <div style={{
      position: "absolute",
      left: leftOffset,
      top: topOffset,
      width: 372,
      maxWidth: "calc(100vw - 620px)",
      zIndex: 35,
      padding: "13px 14px",
      borderRadius: 16,
      border: "1px solid rgba(94,164,195,0.14)",
      background: "linear-gradient(180deg, rgba(5,12,24,0.72), rgba(5,11,22,0.82))",
      boxShadow: "0 16px 36px rgba(0,0,0,0.28)",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ color: "rgba(103,220,255,0.56)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          What is Grigori?
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss Grigori intro"
          style={{ width: 24, height: 24, padding: 0, borderRadius: 999, border: "1px solid rgba(94,164,195,0.16)", background: "rgba(6,15,30,0.62)", color: "rgba(189,226,248,0.7)", cursor: "pointer" }}
        >
          ×
        </button>
      </div>
      <div style={{ color: "rgba(214,235,255,0.86)", fontSize: 12, lineHeight: 1.55, fontFamily: bodyFont }}>
        Grigori turns open-source geopolitical signals into a live operating picture: active risk signals, source confidence, AI-assisted briefings, and market-sensitive context.
      </div>
      <div style={{ color: "rgba(148,175,198,0.7)", fontSize: 11, lineHeight: 1.5, fontFamily: bodyFont, marginTop: 7 }}>
        Built for strategic monitoring, not prediction or financial advice.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={onDismiss} style={{ minHeight: 32, padding: "7px 11px", borderRadius: 999, border: "1px solid rgba(87,216,255,0.18)", background: "rgba(10,31,52,0.76)", color: "#d6ebff", fontFamily: mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
          Got it
        </button>
        <button onClick={onMethodology} style={{ minHeight: 32, padding: "7px 11px", borderRadius: 999, border: "1px solid rgba(94,164,195,0.14)", background: "rgba(6,15,30,0.66)", color: "rgba(214,235,255,0.82)", fontFamily: mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
          How it works
        </button>
      </div>
    </div>
  );
}

function MethodologyPanel({ onClose }) {
  const sections = [
    ["What Grigori is", "Grigori is an experimental OSINT-driven strategic intelligence dashboard. It helps turn open-source geopolitical reporting into structured situational awareness."],
    ["Source collection", "Grigori uses configured public news and open-source data providers. Provider availability, quota limits, and latency may affect coverage."],
    ["Signal clustering", "Articles are grouped into signals based on topic, region, timing, source quality, and keyword similarity. Opinion, letter, and low-signal local commentary are filtered before public publication."],
    ["Freshness", "Freshness reflects when a signal was created, updated, or reconfirmed by the news pipeline."],
    ["AI enrichment", "AI enrichment structures summaries, scenarios, watch indicators, and context. It does not replace human judgment."],
    ["Confidence scoring", "Confidence reflects source count, independent domains, corroboration, freshness, source tier, location match, and category match. It is not a guarantee of truth."],
    ["Market-impact context", "Market-impact labels are directional context only and are not financial advice."],
    ["Limitations", "Open-source intelligence can be incomplete, delayed, duplicated, or wrong. Grigori should be used as an aid for monitoring, not as a sole source of truth."],
    ["Disclaimer", "Grigori does not provide financial, legal, security, or investment advice."],
  ];
  return (
    <FloatingPanel title="How Grigori Works" subtitle="Methodology and limitations" top={FLOATING_TOP + 8} right={16} width={390} onClose={onClose}>
      <div style={{ display: "grid", gap: 12 }}>
        {sections.map(([title, body]) => (
          <div key={title} style={{ padding: "11px 12px", borderRadius: 14, border: "1px solid rgba(94,164,195,0.12)", background: "rgba(8,20,36,0.68)" }}>
            <div style={{ color: "#d6ebff", fontFamily: display, fontSize: 13, fontWeight: 700, marginBottom: 5 }}>{title}</div>
            <div style={{ color: "rgba(160,198,225,0.74)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>{body}</div>
          </div>
        ))}
      </div>
    </FloatingPanel>
  );
}

function HowToReadChip({ onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        position: "absolute",
        right: 18,
        bottom: 52,
        zIndex: 30,
        minHeight: 32,
        padding: "7px 11px",
        borderRadius: 999,
        border: "1px solid rgba(94,164,195,0.12)",
        background: "rgba(6,15,30,0.48)",
        color: "rgba(214,235,255,0.68)",
        fontFamily: mono,
        fontSize: 9,
        letterSpacing: "0.11em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      How to read this
    </button>
  );
}

function MiniTrendChart({ series }) {
  const maxValue = Math.max(1, ...series.map((point) => Math.abs(point.value)));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`, gap: 6, alignItems: "end", height: 84 }}>
      {series.map((point, index) => {
        const height = Math.max(8, Math.round((Math.abs(point.value) / maxValue) * 72));
        const color = point.value >= 0 ? "#68dff6" : "#ff8f78";
        return (
          <div key={`${point.label}-${index}`} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 24, height, borderRadius: 999, background: color, boxShadow: `0 0 16px ${color}55` }} />
            <div style={{ color: "rgba(148,175,198,0.62)", fontSize: 9, fontFamily: mono }}>{point.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function MarketImpactDetailPanel({ item, onClose, isMobile = false }) {
  if (!item) return null;
  const chartWindows = item.series ?? [];
  const [windowLabel, setWindowLabel] = useState(chartWindows[0]?.window ?? "24h");
  const activeSeries = chartWindows.find((entry) => entry.window === windowLabel)?.series ?? [];

  return (
    <FloatingPanel
      title={`${item.label} Signal`}
      subtitle="Directional risk signal detail"
      top={isMobile ? 98 : FLOATING_TOP}
      right={16}
      left={isMobile ? 16 : undefined}
      width={isMobile ? undefined : 360}
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <TrafficPill level={item.level}>{item.trend}</TrafficPill>
          <span style={{ color: "#d6ebff", fontSize: 12, fontFamily: mono }}>score {item.score.toFixed(2)}</span>
        </div>
        {item.priceContext ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "rgba(8,20,36,0.72)", border: "1px solid rgba(94,164,195,0.12)" }}>
            <div>
              <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700 }}>{item.priceContext.symbol}</div>
              <div style={{ color: "rgba(150,205,245,0.62)", fontSize: 10, fontFamily: mono }}>Updated {formatLayerTime(item.priceContext.lastUpdated)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "#d6ebff", fontSize: 13, fontFamily: mono }}>{typeof item.priceContext.currentPrice === "number" ? item.priceContext.currentPrice.toFixed(2) : "—"}</div>
              <div style={{ color: item.priceContext.changePercent >= 0 ? "#6ee7b7" : "#ff8f78", fontSize: 10, fontFamily: mono }}>
                {typeof item.priceContext.changePercent === "number" ? `${item.priceContext.changePercent >= 0 ? "+" : ""}${item.priceContext.changePercent.toFixed(2)}%` : "No change"}
              </div>
            </div>
          </div>
        ) : null}
        <div style={{ color: "rgba(180,220,255,0.78)", fontSize: 12, lineHeight: 1.7 }}>
          Why this score? {item.drivers.length > 0 ? item.drivers.join(", ") : "Signals remain light and directional."}
        </div>
        <div>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Main contributing events
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {item.contributingEvents.length > 0 ? item.contributingEvents.map((event) => (
              <div key={event.id} style={{ background: "rgba(8,20,36,0.68)", border: "1px solid rgba(94,164,195,0.12)", borderRadius: 12, padding: "10px 11px" }}>
                <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700, marginBottom: 4 }}>{event.title}</div>
                <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 11, lineHeight: 1.55 }}>{getOneLineSummary(event)}</div>
              </div>
            )) : <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>No strong contributing events in the current window.</div>}
          </div>
        </div>
        <div>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Keywords & confidence
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {item.drivers.map((driver) => <TrafficPill key={driver} level="neutral">{driver}</TrafficPill>)}
          </div>
          <div style={{ color: "rgba(180,220,255,0.76)", fontSize: 11, lineHeight: 1.6 }}>
            Confidence: {item.confidence} · Related sectors: {item.relatedSectors.join(", ") || "General market sensitivity"}
          </div>
        </div>
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {chartWindows.map((entry) => (
              <button key={entry.window} onClick={() => setWindowLabel(entry.window)} style={{
                minHeight: 30, padding: "6px 10px", borderRadius: 10,
                border: `1px solid ${windowLabel === entry.window ? "rgba(87,216,255,0.36)" : "rgba(83,148,182,0.16)"}`,
                background: windowLabel === entry.window ? "rgba(56,189,248,0.14)" : "rgba(8,20,36,0.66)",
                color: windowLabel === entry.window ? "#88ddff" : "rgba(150,200,240,0.62)", fontSize: 10, fontFamily: mono,
              }}>
                {entry.window}
              </button>
            ))}
          </div>
          {activeSeries.length > 0 ? <MiniTrendChart series={activeSeries} /> : null}
          {item.priceFeedStatus ? (
            <div style={{ marginTop: 10, color: "rgba(130,185,230,0.62)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
              {item.priceFeedStatus}
            </div>
          ) : null}
        </div>
        <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
          Market data and geopolitical scores are contextual intelligence signals, not financial advice.
        </div>
        <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
          Last updated: {formatLayerTime(item.lastUpdated)} · {item.methodology}
        </div>
      </div>
    </FloatingPanel>
  );
}

function DataConfidencePanel({ stats, onClose }) {
  const [showDetails, setShowDetails] = useState(false);
  return (
    <FloatingPanel title="Signal Confidence" subtitle="Source quality and corroboration" top={430} right={16} width={300} onClose={onClose}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{
            width: 78,
            height: 78,
            borderRadius: "50%",
            border: "3px solid rgba(78,214,159,0.2)",
            boxShadow: "inset 0 0 0 1px rgba(94,164,195,0.16)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(circle at 35% 30%, rgba(87,216,255,0.08), rgba(6,14,26,0.9))",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ color: "#eef7ff", fontFamily: display, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{stats.overall}%</div>
              <div style={{ color: "#4ed69f", fontFamily: mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 4 }}>Good</div>
            </div>
          </div>
          <div style={{ flex: 1, display: "grid", gap: 12 }}>
            {stats.bands.map((band) => (
              <div key={band.label}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ color: "rgba(209,227,241,0.86)", fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>{band.label}</span>
                  <span style={{ color: "#8ea8bf", fontFamily: mono, fontSize: 10 }}>{band.value}%</span>
                </div>
                <div style={{ height: 3, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${band.value}%`, height: "100%", background: band.color, boxShadow: `0 0 16px ${band.color}` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ color: "rgba(148,175,198,0.72)", fontSize: 10, fontFamily: mono, letterSpacing: "0.08em" }}>
            Updated {stats.updatedAt}
          </div>
          <button onClick={() => setShowDetails((value) => !value)} style={{
            background: "transparent",
            border: "none",
            color: "rgba(159, 209, 235, 0.82)",
            fontFamily: mono,
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            padding: 0,
          }}>
            {showDetails ? "Hide details" : "Details"}
          </button>
        </div>
        {showDetails ? (
          <div style={{ display: "grid", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(94,164,195,0.12)" }}>
            {stats.bands.map((band) => (
              <div key={`${band.label}-detail`} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "rgba(214,235,255,0.84)", fontSize: 12, fontFamily: bodyFont }}>{band.label}</span>
                <span style={{ color: "rgba(148,175,198,0.82)", fontSize: 11, fontFamily: mono }}>{band.value}%</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </FloatingPanel>
  );
}

function TimelinePanel({ modeHours, onModeChange, sliderPercent, onSliderChange, cursorLabel, visibleCount, onClose }) {
  const options = [
    { label: "24h", value: 24 },
    { label: "7d", value: 24 * 7 },
    { label: "30d", value: 24 * 30 },
  ];

  return (
    <FloatingPanel title="Timeline" subtitle={`${visibleCount} events visible`} top={FLOATING_TOP} left={280} width={288} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {options.map((option) => (
          <button key={option.value} onClick={() => onModeChange(option.value)} style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 12,
            cursor: "pointer",
            background: modeHours === option.value ? "rgba(56, 189, 248, 0.14)" : "rgba(8,20,36,0.66)",
            border: `1px solid ${modeHours === option.value ? "rgba(87,216,255,0.36)" : "rgba(83, 148, 182, 0.16)"}`,
            color: modeHours === option.value ? "#88ddff" : "rgba(150,200,240,0.62)",
            fontSize: 10,
            fontFamily: mono,
            letterSpacing: "0.12em",
          }}>
            {option.label}
          </button>
        ))}
      </div>
      <input type="range" min="0" max="100" value={sliderPercent} onChange={(e) => onSliderChange(Number(e.target.value))} style={{ width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ color: "rgba(150,205,245,0.5)", fontSize: 10, fontFamily: mono }}>Range start</span>
        <span style={{ color: "rgba(200,230,255,0.78)", fontSize: 10, fontFamily: mono }}>{cursorLabel}</span>
      </div>
    </FloatingPanel>
  );
}

function formatLayerTime(value) {
  if (!value) return "n/a";
  try {
    return new Date(value).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "n/a";
  }
}

function LayerStatusMeta({ status, remainingLabel = "remaining" }) {
  if (!status) return null;
  const lastRefresh = status.lastRefresh ?? status.lastRefreshAt ?? null;
  const nextRefresh = status.nextRefresh ?? status.nextRefreshAt ?? null;
  const remaining = status.remaining ?? status.remainingMonthlyCalls ?? status.remainingDailyCalls;
  return (
    <div style={{ marginTop: 10, display: "grid", gap: 4, color: "rgba(150,205,245,0.6)", fontSize: 10, fontFamily: mono }}>
      <div>Last refresh: {formatLayerTime(lastRefresh)}</div>
      <div>Next refresh: {formatLayerTime(nextRefresh)}</div>
      {remaining !== undefined ? <div>{remainingLabel}: {remaining}</div> : null}
    </div>
  );
}

function ObjectRowButton({ item, subtitle, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: "rgba(8,20,36,0.76)",
      border: "1px solid rgba(94, 164, 195, 0.12)",
      borderRadius: 14,
      padding: "12px 13px",
      textAlign: "left",
      cursor: "pointer",
      width: "100%",
    }}>
      <div style={{ color: "#d6ebff", fontSize: 13, fontFamily: display, fontWeight: 700, lineHeight: 1.3 }}>
        {item.title}
      </div>
      <div style={{ color: "rgba(150,205,245,0.62)", fontSize: 10, lineHeight: 1.55, marginTop: 6, fontFamily: bodyFont }}>
        {subtitle}
      </div>
    </button>
  );
}

function FlightsPanel({ flights, status, onSelect, onClose }) {
  return (
    <FloatingPanel title="Flights" subtitle={`${flights.length} tracked aircraft`} top={FLOATING_TOP} right={348} width={300} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {flights.length === 0 ? (
          <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>No cached flights available yet.</div>
        ) : flights.map((flight) => (
          <ObjectRowButton
            key={flight.id}
            item={flight}
            subtitle={`${flight.airline} · ${flight.departureAirport} → ${flight.arrivalAirport}`}
            onClick={() => onSelect({ type: "flight", data: flight })}
          />
        ))}
      </div>
      <LayerStatusMeta status={status} remainingLabel="Monthly calls left" />
    </FloatingPanel>
  );
}

function VesselsPanel({ vessels, status, search, onSearchChange, onSelect, onClose }) {
  const filtered = vessels.filter((vessel) => {
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return String(vessel.name ?? "").toLowerCase().includes(needle) || String(vessel.mmsi ?? "").includes(needle);
  });

  return (
    <FloatingPanel title="Vessels" subtitle={`${filtered.length} tracked vessels`} top={FLOATING_TOP} right={348} width={300} onClose={onClose}>
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search vessel or MMSI"
        style={{
          width: "100%",
          background: "rgba(0,16,40,0.8)",
          color: "#d6ebff",
          border: "1px solid rgba(0,180,255,0.14)",
          borderRadius: 6,
          padding: "8px 10px",
          marginBottom: 10,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>No vessels match the current search.</div>
        ) : filtered.map((vessel) => (
          <ObjectRowButton
            key={vessel.id}
            item={{ ...vessel, title: vessel.name }}
            subtitle={`${vessel.vesselType} · ${vessel.destination ?? "Destination unavailable"}`}
            onClick={() => onSelect({ type: "vessel", data: vessel })}
          />
        ))}
      </div>
      <LayerStatusMeta status={status} remainingLabel="Monthly calls left" />
    </FloatingPanel>
  );
}

function SatellitesPanel({ satellites, status, onSelect, onClose }) {
  return (
    <FloatingPanel title="Satellites" subtitle={`${satellites.length} orbital objects`} top={FLOATING_TOP} right={348} width={300} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {satellites.length === 0 ? (
          <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>No satellite cache available yet.</div>
        ) : satellites.map((satellite) => (
          <ObjectRowButton
            key={satellite.id}
            item={{ ...satellite, title: satellite.name }}
            subtitle={`${satellite.satelliteType} · NORAD ${satellite.noradId}`}
            onClick={() => onSelect({ type: "satellite", data: satellite })}
          />
        ))}
      </div>
      <LayerStatusMeta status={status} remainingLabel="Refresh window" />
    </FloatingPanel>
  );
}

function SocialSignalsPanel({ signals, status, events, onClose }) {
  return (
    <FloatingPanel title="Social Signals" subtitle={`${signals.length} early-warning inputs`} top={FLOATING_TOP} right={348} width={316} onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        {signals.length === 0 ? (
          <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>
            Social signals are not configured or no recent monitored posts are cached yet.
          </div>
        ) : signals.map((signal) => {
          const corroboration = deriveSocialCorroboration(signal, events);
          return (
            <div key={signal.id} style={{ background: "rgba(8,20,36,0.76)", border: "1px solid rgba(94, 164, 195, 0.12)", borderRadius: 14, padding: "12px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6, alignItems: "center" }}>
                <div style={{ color: "#d6ebff", fontSize: 13, fontFamily: display, fontWeight: 700 }}>{signal.title}</div>
                <TrafficPill level={corroboration.label === "Corroborated" ? "green" : corroboration.label === "Partially corroborated" ? "amber" : "neutral"}>
                  {corroboration.label}
                </TrafficPill>
              </div>
              <div style={{ color: "rgba(150,205,245,0.66)", fontSize: 11, lineHeight: 1.6, marginBottom: 8 }}>{signal.summary}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                <TrafficPill level="neutral">{signal.source}</TrafficPill>
                <TrafficPill level="neutral">{signal.region}</TrafficPill>
                <TrafficPill level="amber">Unverified social signal</TrafficPill>
              </div>
              <a href={signal.url} target="_blank" rel="noreferrer" style={{ color: "#89ddff", fontSize: 11, lineHeight: 1.5, textDecoration: "none", wordBreak: "break-word" }}>
                View original post
              </a>
            </div>
          );
        })}
      </div>
      <LayerStatusMeta status={status} remainingLabel="Daily reads left" />
    </FloatingPanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET TICKER  (PART 7)
// Displays live Brent crude + market sentiment in TopBar
// ═══════════════════════════════════════════════════════════════════════════════

function MarketTicker({ marketData }) {
  if (!marketData) return null;

  const instruments = Array.isArray(marketData.instruments) ? marketData.instruments : [];
  const oil = instruments.find((item) => item.key === "wti" || item.key === "brent") ?? null;
  const vix = instruments.find((item) => item.key === "vix") ?? null;

  if (!oil && !vix) return null;

  const oilChange = oil && typeof oil.changePercent === "number" ? (oil.changePercent >= 0 ? "+" : "") + oil.changePercent.toFixed(1) + "%" : null;
  const oilColor  = oil ? ((oil.changeAbsolute ?? 0) > 0 ? "#ff5533" : (oil.changeAbsolute ?? 0) < 0 ? "#44dd88" : "#88aacc") : "#88aacc";
  const vixLevel  = vix ? (vix.currentPrice > 25 ? "HIGH" : vix.currentPrice > 18 ? "ELEV" : "LOW") : null;
  const vixColor  = vix ? (vix.currentPrice > 25 ? "#ff4444" : vix.currentPrice > 18 ? "#ffaa00" : "#44cc88") : "#88aacc";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      {oil && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "rgba(0,180,255,0.35)", fontSize: 8, fontFamily: mono,
            letterSpacing: "0.1em" }}>{oil.name.includes("Brent") ? "BRENT" : "WTI"}</span>
          <span style={{ color: "#e0eeff", fontSize: 10, fontFamily: mono, fontWeight: 600 }}>
            ${oil.currentPrice.toFixed(1)}
          </span>
          <span style={{ color: oilColor, fontSize: 9, fontFamily: mono }}>{oilChange}</span>
        </div>
      )}
      {oil && vix && (
        <span style={{ color: "rgba(0,180,255,0.2)", fontSize: 10 }}>|</span>
      )}
      {vix && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "rgba(0,180,255,0.35)", fontSize: 8, fontFamily: mono,
            letterSpacing: "0.1em" }}>VIX</span>
          <span style={{ color: vixColor, fontSize: 10, fontFamily: mono, fontWeight: 600 }}>
            {vix.currentPrice.toFixed(1)}
          </span>
          <span style={{ color: vixColor, fontSize: 8, fontFamily: mono,
            background: `${vixColor}15`, border: `1px solid ${vixColor}44`,
            borderRadius: 3, padding: "0 4px" }}>{vixLevel}</span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UI CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const mono = "'Share Tech Mono', 'IBM Plex Mono', monospace";
const display = "'Rajdhani', 'Space Grotesk', sans-serif";
const bodyFont = "'Inter', 'Space Grotesk', sans-serif";
const DEMO_MODE = String(import.meta.env.VITE_DEMO_MODE ?? "false").toLowerCase() === "true";
const TOP_BAR_HEIGHT = 58;
const FLOATING_TOP = 68;
const BRIEFING_PANEL_STORAGE_KEY = "grigori:briefing-panel-open";
const BRIEFING_COMPACT_STORAGE_KEY = "grigori:briefing-compact-dismissed";
const ACTIVE_SIGNALS_STORAGE_KEY = "grigori:active-signals-open";
const MARKET_PANEL_STORAGE_KEY = "grigori:market-impact-expanded";
const INTRO_STORAGE_KEY = "grigori:intro-dismissed";
const APP_VIEWS = [
  { key: "globe", label: "Globe" },
  { key: "classic", label: "Intel Board" },
  { key: "reports", label: "Personalized Reports", badge: "Preview" },
];

const useViewport = () => {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const fn = () => setWidth(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return {
    width,
    isMobile: width <= 768,
    isTablet: width > 768 && width <= 1024,
  };
};

function getHeaderHeight(isMobile, isTablet = false) {
  if (isMobile) return 126;
  if (isTablet) return 92;
  return TOP_BAR_HEIGHT;
}

function getMarkerVisibilityAlpha(surfaceNormal, cameraDirection) {
  const dot = surfaceNormal.dot(cameraDirection);
  if (dot <= 0) return 0;
  if (dot <= 0.18) {
    return Math.max(0, Math.min(1, dot / 0.18));
  }
  return 1;
}

function formatStatusMoment(value) {
  if (!value) return "Awaiting refresh";
  try {
    return new Date(value).toISOString().slice(11, 16) + " UTC";
  } catch {
    return "Awaiting refresh";
  }
}

function sharedPanelBodyStyle(extra = {}) {
  return {
    overflowY: "auto",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
    minHeight: 0,
    ...extra,
  };
}

function getDataFreshness(value) {
  if (!value) return { label: "Awaiting refresh", tone: "neutral", hours: null };
  const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 3600_000);
  if (hours < 2) return { label: `Fresh · ${hours < 1 ? "<1h" : `${Math.round(hours)}h`} ago`, tone: "green", hours };
  if (hours < 6) return { label: `Recent · ${Math.round(hours)}h ago`, tone: "neutral", hours };
  if (hours <= 12) return { label: `Aging · ${Math.round(hours)}h ago`, tone: "amber", hours };
  return { label: `Stale · ${Math.round(hours)}h ago`, tone: "red", hours };
}

function formatAiFreshnessLabel(freshness) {
  if (!freshness || freshness.hours == null) return "AI Pending";
  return `AI Enriched · ${freshness.hours < 1 ? "<1h" : `${Math.round(freshness.hours)}h`} ago`;
}

function getAutomationNotice(systemStatus, adminUnlocked = false) {
  const news = systemStatus?.automation?.news;
  const ai = systemStatus?.automation?.ai;
  if (!adminUnlocked) return null;
  if (news?.status === "overdue" || (typeof news?.ageHours === "number" && news.ageHours > 8)) {
    return "Scheduled news refresh overdue.";
  }
  if (news?.status === "degraded" || news?.providerCoverageStatus === "limited" || news?.providerCoverageStatus === "degraded") {
    return "Limited source coverage. Showing best available signals and stored context.";
  }
  if (news?.status === "delayed") {
    return "Scheduled news refresh delayed.";
  }
  if (ai?.status === "overdue" || (typeof ai?.ageHours === "number" && ai.ageHours > 6)) {
    return "Scheduled AI refresh overdue.";
  }
  if (ai?.status === "delayed") {
    return "Scheduled AI check delayed.";
  }
  return null;
}

function formatAutomationLine(label, state) {
  if (!state) return `${label}: no scheduled heartbeat`;
  const statusLabels = {
    success: "ok",
    delayed: "delayed",
    degraded: "limited",
    overdue: "overdue",
    failure: "failed",
    not_seen: "not seen",
  };
  const status = statusLabels[state.status] ?? state.status ?? "unknown";
  const lastRun = formatShortAge(state.lastScheduledRunAt);
  const lastSuccess = formatShortAge(state.lastScheduledSuccessAt);
  const lastFailure = formatShortAge(state.lastScheduledFailureAt);
  const recovered = state.lastScheduledFailureAt && state.lastScheduledSuccessAt
    && new Date(state.lastScheduledSuccessAt).getTime() > new Date(state.lastScheduledFailureAt).getTime();
  const recoveryText = recovered ? " · recovered on latest success" : "";
  return `${label}: ${status} · run ${lastRun} · success ${lastSuccess} · failure ${lastFailure}${recoveryText}`;
}

function readStoredBoolean(key, fallback) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readStoredContextLayers() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CONTEXT_LAYER_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const ACTIVE_SIGNAL_SORT_OPTIONS = [
  { key: "priority", label: "Priority" },
  { key: "newest", label: "Newest" },
  { key: "updated", label: "Updated" },
  { key: "ai", label: "AI Enriched" },
  { key: "impact", label: "High Impact" },
];

function getBestEventTimestamp(event, mode = "freshness") {
  const aiUpdatedAt = event.aiUpdatedAt ?? event.ai_updated_at ?? null;
  const refreshedAt = event.refreshedAt ?? event.refreshed_at ?? null;
  const lastSeenAt = event.lastSeenAt ?? event.last_seen_at ?? null;
  const updatedAt = event.updated_at ?? event.updatedAt ?? null;
  const createdAt = event.created_at ?? event.createdAt ?? null;
  const publishedAt = event.timestamp ?? null;

  if (mode === "ai" && aiUpdatedAt) return { value: aiUpdatedAt, kind: "AI enriched" };
  if (refreshedAt) return { value: refreshedAt, kind: "Updated" };
  if (lastSeenAt) return { value: lastSeenAt, kind: "Updated" };
  if (updatedAt) return { value: updatedAt, kind: "Updated" };
  if (createdAt) return { value: createdAt, kind: "Created" };
  if (publishedAt) return { value: publishedAt, kind: "Created" };
  return { value: null, kind: "Updated" };
}

function getFreshnessScore(event) {
  const { value } = getBestEventTimestamp(event);
  if (!value) return 20;
  const hours = Math.max(0, (Date.now() - new Date(value).getTime()) / 3600_000);
  if (hours < 2) return 100;
  if (hours < 6) return 78;
  if (hours < 12) return 52;
  return 24;
}

function computeActiveSignalPriority(event) {
  const impactScore = Number(event.impactScore ?? event.importanceScore ?? event.priorityScore ?? 0);
  const severityScore = Number(event.severityScore ?? 0);
  const importanceScore = Number(event.importanceScore ?? event.priorityScore ?? 0);
  const freshnessScore = getFreshnessScore(event);
  const aiBonus = event.aiStatus === "enriched" ? 100 : 0;
  const confidenceScore = Number(event.confidenceScore ?? 0);
  const toneBoost = event.tone === "Escalating" ? 4 : event.tone === "Volatile" ? 2 : 0;

  return (
    impactScore * 0.35 +
    severityScore * 0.25 +
    importanceScore * 0.2 +
    freshnessScore * 0.15 +
    aiBonus * 0.05 +
    confidenceScore * 0.02 +
    toneBoost
  );
}

function getSignalFreshnessMeta(event) {
  const eventState = event.eventState ?? event.event_state ?? null;
  const { value, kind } = getBestEventTimestamp(event, "freshness");
  const age = formatShortAge(value);

  if (eventState === "recent_context") {
    return {
      label: `Recent context · last seen ${age}`,
      tone: "neutral",
      state: "Recent context",
      detail: `Last seen ${age}`,
      relative: age,
    };
  }

  if (eventState === "stored_relevant") {
    return {
      label: `Stored context · last seen ${age}`,
      tone: "amber",
      state: "Stored context",
      detail: `Last seen ${age}`,
      relative: age,
    };
  }

  if (eventState === "archived") {
    const archivedDate = value || event.timestamp
      ? new Date(value ?? event.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "Archived";
    return {
      label: `Archived · ${archivedDate}`,
      tone: "neutral",
      state: "Archived",
      detail: "Archived context",
      relative: archivedDate,
    };
  }

  if (event.isHistorical) {
    const historicalDate = event.timestamp ? new Date(event.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Historical";
    return {
      label: `Historical · ${historicalDate}`,
      tone: "neutral",
      state: "Historical",
      detail: "Historical context",
      relative: historicalDate,
    };
  }

  const freshness = getDataFreshness(value);
  const detail = `${kind} ${age}`;
  if (freshness.tone === "red" && Number(event.impactScore ?? 0) >= 80) {
    return {
      label: `Stale but high-impact · ${age}`,
      tone: "amber",
      state: "Stale",
      detail: `Source signal stale · ${age}`,
      relative: age,
    };
  }
  return {
    label: `${freshness.label.split(" · ")[0]} · ${detail}`,
    tone: freshness.tone,
    state: freshness.label.split(" · ")[0],
    detail,
    relative: age,
  };
}

function sortActiveSignals(events, sortMode = "priority") {
  const ranked = [...events];
  ranked.sort((left, right) => {
    const leftPriority = computeActiveSignalPriority(left);
    const rightPriority = computeActiveSignalPriority(right);
    const leftUpdated = new Date(getBestEventTimestamp(left).value ?? left.timestamp ?? 0).getTime();
    const rightUpdated = new Date(getBestEventTimestamp(right).value ?? right.timestamp ?? 0).getTime();
    const leftNewest = new Date(left.timestamp ?? left.created_at ?? 0).getTime();
    const rightNewest = new Date(right.timestamp ?? right.created_at ?? 0).getTime();
    const leftImpact = Number(left.impactScore ?? left.importanceScore ?? 0);
    const rightImpact = Number(right.impactScore ?? right.importanceScore ?? 0);
    const leftSeverity = Number(left.severityScore ?? 0);
    const rightSeverity = Number(right.severityScore ?? 0);
    const leftConfidence = Number(left.confidenceScore ?? 0);
    const rightConfidence = Number(right.confidenceScore ?? 0);
    const leftAi = left.aiStatus === "enriched" ? 1 : 0;
    const rightAi = right.aiStatus === "enriched" ? 1 : 0;

    if (sortMode === "newest") {
      return rightNewest - leftNewest || rightPriority - leftPriority;
    }
    if (sortMode === "updated") {
      return rightUpdated - leftUpdated || rightPriority - leftPriority;
    }
    if (sortMode === "ai") {
      return rightAi - leftAi || rightPriority - leftPriority;
    }
    if (sortMode === "impact") {
      return rightImpact - leftImpact || rightPriority - leftPriority;
    }

    return (
      rightPriority - leftPriority ||
      rightImpact - leftImpact ||
      rightSeverity - leftSeverity ||
      rightConfidence - leftConfidence ||
      rightUpdated - leftUpdated
    );
  });
  return ranked;
}

function getSignalDiversityRegion(event) {
  return String(event.location?.label ?? event.region?.label ?? "unknown").trim().toLowerCase();
}

function getSignalDiversityCategory(event) {
  return String(event.category ?? event.categories?.[0] ?? event.keywords?.[0] ?? event.tone ?? "general").trim().toLowerCase();
}

function applyVisibleSignalDiversity(events, sortMode = "priority") {
  if (sortMode !== "priority" || events.length <= 3) return events;
  const remaining = [...events];
  const selected = [];
  const takeAt = (index) => {
    if (index < 0) return false;
    selected.push(remaining.splice(index, 1)[0]);
    return true;
  };

  takeAt(0);
  const firstRegion = getSignalDiversityRegion(selected[0]);
  takeAt(remaining.findIndex((event) => getSignalDiversityRegion(event) !== firstRegion));
  const selectedCategories = new Set(selected.map(getSignalDiversityCategory));
  takeAt(remaining.findIndex((event) => !selectedCategories.has(getSignalDiversityCategory(event))));

  const regionCounts = new Map(selected.map((event) => [getSignalDiversityRegion(event), 1]));
  const fill = [];
  for (const event of remaining) {
    const region = getSignalDiversityRegion(event);
    const count = regionCounts.get(region) ?? 0;
    if (count < 3 || selected.length + fill.length < 8) {
      fill.push(event);
      regionCounts.set(region, count + 1);
    } else {
      fill.push(event);
    }
  }

  return [...selected, ...fill];
}

function formatShortAge(value) {
  if (!value) return "Awaiting refresh";
  const deltaMs = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.round(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatRefreshMessage(result) {
  if (!result) return "";
  return result.message ?? "";
}

function formatProviderDiagnostics(result) {
  if (!result) return "";
  const providerChunks = Array.isArray(result.providerDiagnostics)
    ? result.providerDiagnostics
        .filter((item) => item && item.provider)
        .map((item) => {
          const base = `${item.provider} ${item.articlesFetched ?? 0} articles`;
          if (item.status === "rate_limited") return `${item.provider} rate limited`;
          if (item.status !== "ok") return `${item.provider} ${item.status.replace(/_/g, " ")}`;
          return base;
        })
    : [];

  const extras = [];
  if (Number.isFinite(result.duplicatesSkipped)) extras.push(`${result.duplicatesSkipped} duplicates`);
  if (Number.isFinite(result.filteredOutCount)) extras.push(`${result.filteredOutCount} filtered`);

  return [...providerChunks, ...extras].join(" · ");
}

function getEventStateLabels(event) {
  const labels = [];
  const createdAt = event.created_at ?? event.createdAt ?? event.timestamp;
  const updatedAt = (event.refreshedAt ?? event.refreshed_at ?? event.lastSeenAt ?? event.last_seen_at ?? event.updated_at ?? event.updatedAt ?? createdAt);
  const aiUpdatedAt = event.aiUpdatedAt ?? event.ai_updated_at ?? null;
  const createdHours = createdAt ? Math.max(0, (Date.now() - new Date(createdAt).getTime()) / 3600_000) : null;
  const updatedHours = updatedAt ? Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 3600_000) : null;

  if (createdHours !== null && createdHours < 2) {
    labels.push({ text: "New signal", level: "green" });
  } else if (updatedHours !== null && updatedHours > 24) {
    labels.push({ text: "Stored signal", level: "neutral" });
  }

  if (event.aiStatus === "enriched" && aiUpdatedAt) labels.push({ text: `AI Enriched · ${formatShortAge(aiUpdatedAt)}`, level: "green" });
  else if (event.aiStatus === "enriched") labels.push({ text: "AI Enriched", level: "green" });
  else if (event.aiStatus === "rule_based" || event.aiStatus === "fallback") labels.push({ text: "Rule-based", level: "amber" });
  else if (event.aiStatus === "cached") labels.push({ text: "Cached", level: "neutral" });
  else if (event.aiStatus === "provider_error") labels.push({ text: "No material change", level: "neutral" });

  if (aiUpdatedAt && event.aiStatus !== "enriched") {
    if (updatedHours !== null && updatedHours > 24) {
      labels.push({ text: `AI Enriched · source signal stale`, level: "neutral" });
    } else {
      labels.push({ text: `AI Enriched · ${formatShortAge(aiUpdatedAt)}`, level: "neutral" });
    }
  }

  return labels.slice(0, 3);
}

// ── Reusable atoms ────────────────────────────────────────────────────────────

function SectorPill({ name }) {
  const c = SECTOR_COLOR[name] || "#8899aa";
  return (
    <span style={{ background: `${c}12`, color: c, border: `1px solid ${c}33`,
      borderRadius: 999, padding: "4px 9px", fontSize: 9, fontFamily: mono,
      letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {name}
    </span>
  );
}

function ImpactRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 0", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
      <span style={{ color: "rgba(100,160,200,0.5)", fontSize: 9, fontFamily: mono,
        letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ color, fontSize: 11, fontFamily: mono, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{ background: `${color}12`, color, border: `1px solid ${color}38`,
      borderRadius: 999, padding: "4px 9px", fontSize: 9, letterSpacing: "0.13em",
      textTransform: "uppercase", fontFamily: mono, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function TrafficPill({ level, children }) {
  const palette = {
    red: { color: "#ff6677", bg: "rgba(255,80,110,0.14)", border: "rgba(255,80,110,0.38)" },
    amber: { color: "#ffbf47", bg: "rgba(255,191,71,0.12)", border: "rgba(255,191,71,0.34)" },
    green: { color: "#58e38f", bg: "rgba(88,227,143,0.12)", border: "rgba(88,227,143,0.34)" },
    neutral: { color: "#7fb8dd", bg: "rgba(80,140,190,0.12)", border: "rgba(80,140,190,0.28)" },
  };
  const cfg = palette[level] ?? palette.neutral;
  return (
    <span style={{
      background: cfg.bg,
      color: cfg.color,
      border: `1px solid ${cfg.border}`,
      borderRadius: 999,
      padding: "4px 9px",
      fontSize: 9,
      fontFamily: mono,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function SegmentedFilterChip({ active = false, onClick, children, compact = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        minHeight: compact ? 30 : 32,
        padding: compact ? "5px 9px" : "6px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(87,216,255,0.36)" : "rgba(83,148,182,0.16)"}`,
        background: active ? "rgba(56,189,248,0.14)" : "rgba(8,20,36,0.66)",
        color: active ? "#88ddff" : "rgba(150,200,240,0.62)",
        fontSize: compact ? 9 : 10,
        fontFamily: mono,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function TopControlButton({ active = false, subtle = false, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 34,
        padding: "8px 12px",
        borderRadius: 12,
        border: `1px solid ${active ? "rgba(87,216,255,0.26)" : subtle ? "rgba(94,164,195,0.12)" : "rgba(87,216,255,0.14)"}`,
        background: active ? "rgba(56,189,248,0.12)" : "rgba(6,15,30,0.72)",
        color: active ? "#dff7ff" : "rgba(206,226,241,0.8)",
        cursor: "pointer",
        fontFamily: mono,
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </button>
  );
}

function HeaderPopover({ children, right = 0, minWidth = 220 }) {
  return (
    <div style={{
      position: "absolute",
      top: "calc(100% + 10px)",
      right,
      minWidth,
      background: "linear-gradient(180deg, rgba(5,12,24,0.96) 0%, rgba(7,15,29,0.98) 100%)",
      border: "1px solid rgba(94,164,195,0.16)",
      borderRadius: 16,
      boxShadow: "0 24px 55px rgba(0,0,0,0.42)",
      overflow: "hidden",
      zIndex: 65,
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
    }}>
      {children}
    </div>
  );
}

function FloatingPanel({ title, subtitle, children, top, left, right, width = 300, onClose }) {
  return (
    <div style={{
      position: "absolute",
      top,
      left,
      right,
      width,
      zIndex: 44,
      background: "linear-gradient(180deg, rgba(5,12,24,0.96) 0%, rgba(7,15,29,0.98) 100%)",
      border: "1px solid rgba(94, 164, 195, 0.16)",
      borderRadius: 18,
      boxShadow: "0 24px 55px rgba(0,0,0,0.46)",
      overflow: "hidden",
      backdropFilter: "blur(16px)",
      display: "flex",
      flexDirection: "column",
      maxHeight: `calc(100vh - ${(typeof top === "number" ? top : FLOATING_TOP) + 18}px)`,
    }}>
      <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid rgba(94, 164, 195, 0.12)", display: "flex", justifyContent: "space-between", gap: 8, flexShrink: 0 }}>
        <div>
          <div style={{ color: "rgba(103, 220, 255, 0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.18em", textTransform: "uppercase" }}>{title}</div>
          {subtitle ? (
            <div style={{ color: "rgba(233,244,255,0.9)", fontFamily: display, fontSize: 15, fontWeight: 700, marginTop: 4, letterSpacing: "0.03em" }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {onClose ? (
          <button onClick={onClose} style={{
            background: "rgba(10, 21, 37, 0.82)",
            border: "1px solid rgba(94, 164, 195, 0.18)",
            color: "rgba(189,226,248,0.74)",
            borderRadius: 999,
            width: 28,
            height: 28,
            cursor: "pointer",
            flexShrink: 0,
          }}>✕</button>
        ) : null}
      </div>
      <div style={sharedPanelBodyStyle({ padding: "14px 16px" })}>
        {children}
      </div>
    </div>
  );
}

function ConflictZonePanel({ zone, onSelectEvent, onClose, isMobile = false }) {
  if (!zone) return null;
  const severityLevel = zone.severity === "high" ? "red" : zone.severity === "medium" ? "amber" : "neutral";

  return (
    <FloatingPanel
      title="Conflict Zone"
      subtitle={`${zone.label} · ${zone.eventCount} events`}
      onClose={onClose}
      top={isMobile ? 88 : FLOATING_TOP}
      left={isMobile ? 16 : undefined}
      right={16}
      width={isMobile ? undefined : 388}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <TrafficPill level={severityLevel}>{zone.severity.toUpperCase()}</TrafficPill>
          <TrafficPill level="neutral">{zone.sourcesCount} source signals</TrafficPill>
          <TrafficPill level="neutral">{zone.topEvent?.location?.label ?? zone.label}</TrafficPill>
        </div>
        <div>
          <div style={{ color: "rgba(0,200,255,0.34)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Top Risk
          </div>
          <div style={{ color: "rgba(214,235,255,0.9)", fontSize: 13, fontFamily: display, fontWeight: 700, lineHeight: 1.45 }}>
            {zone.topEvent?.title ?? "Monitoring hotspot"}
          </div>
          <div style={{ marginTop: 8, color: "rgba(150,205,245,0.72)", fontSize: 11, lineHeight: 1.65 }}>
            {zone.summary}
          </div>
        </div>
        <div>
          <div style={{ color: "rgba(0,200,255,0.34)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Events In Zone
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {zone.events.slice(0, 8).map((event) => (
              <button key={event.id} onClick={() => onSelectEvent?.(event)} style={{
                textAlign: "left",
                padding: "10px 11px",
                borderRadius: 12,
                border: "1px solid rgba(87,216,255,0.12)",
                background: "rgba(8,20,36,0.64)",
                color: "#d6ebff",
                cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontFamily: display, fontWeight: 700, lineHeight: 1.45 }}>{event.title}</div>
                  <TrafficPill level={event.intensity === "high" ? "red" : event.intensity === "medium" ? "amber" : "neutral"}>
                    {event.category ?? "Political"}
                  </TrafficPill>
                </div>
                <div style={{ color: "rgba(150,205,245,0.72)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
                  {event.location?.label ?? "Location under review"} · impact {event.impactScore ?? event.importanceScore ?? 0} · severity {event.severityScore ?? 0}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}

// ── Tooltip (desktop only) ────────────────────────────────────────────────────
function Tooltip({ text, x, y }) {
  if (!text) return null;
  return (
    <div style={{ position: "fixed", left: x + 16, top: y - 12, pointerEvents: "none",
      zIndex: 200, background: "rgba(3,9,22,0.96)", border: "1px solid rgba(0,200,255,0.4)",
      borderRadius: 4, padding: "5px 11px", color: "#8ecfee", fontFamily: mono,
      fontSize: 11, letterSpacing: "0.07em", whiteSpace: "pre-line",
      boxShadow: "0 0 16px rgba(0,180,255,0.22)" }}>
      {text}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO CARD
// ═══════════════════════════════════════════════════════════════════════════════

function ScenarioCard({ sc, active, onClick }) {
  const barCol = sc.probability >= 45 ? "#22dd88" : sc.probability >= 25 ? "#ffcc00" : "#ff5544";
  return (
    <div onClick={onClick} style={{
      background: active ? "rgba(0,60,120,0.38)" : "rgba(0,20,50,0.28)",
      border: `1px solid ${active ? "rgba(0,200,255,0.45)" : "rgba(0,100,180,0.2)"}`,
      borderRadius: 7, padding: "12px 14px", cursor: "pointer",
      transition: "all 0.18s ease", marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ color: active ? "#c8e8ff" : "rgba(160,210,255,0.75)", fontSize: 12,
          fontFamily: display, fontWeight: 700, letterSpacing: "0.04em" }}>{sc.name}</span>
        <span style={{ color: barCol, fontFamily: mono, fontSize: 11, fontWeight: 700 }}>{sc.probability}%</span>
      </div>
      <div style={{ height: 3, background: "rgba(0,40,80,0.8)", borderRadius: 2, marginBottom: 9 }}>
        <div style={{ width: `${sc.probability}%`, height: "100%", background: barCol,
          borderRadius: 2, transition: "width 0.5s ease", boxShadow: `0 0 6px ${barCol}88` }}/>
      </div>
      <p style={{ color: "rgba(130,185,230,0.65)", fontSize: 11, lineHeight: 1.6,
        margin: 0, marginBottom: active ? 10 : 0 }}>{sc.description}</p>
      {active && (
        <div style={{ borderTop: "1px solid rgba(0,180,255,0.14)", paddingTop: 10, marginTop: 4 }}>
          <ImpactRow label="Oil"          value={`${OIL_ICON[sc.impact.oil]} ${sc.impact.oil}`}   color={OIL_COLOR[sc.impact.oil]} />
          <ImpactRow label="Markets"      value={sc.impact.markets}      color={MARKET_COLOR[sc.impact.markets]} />
          <ImpactRow label="Trade Routes" value={sc.impact.tradeRoutes}  color={sc.impact.tradeRoutes === "Disrupted" ? "#ff5533" : "#44aaff"} />
          {sc.impact.sectors?.length > 0 && (
            <div style={{ paddingTop: 8 }}>
              <div style={{ color: "rgba(100,160,200,0.5)", fontSize: 9, fontFamily: mono,
                letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>SECTORS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {sc.impact.sectors.map(s => <SectorPill key={s} name={s} />)}
              </div>
            </div>
          )}
          {sc.impact.regionalEffects?.length > 0 && (
            <div style={{ paddingTop: 9 }}>
              <div style={{ color: "rgba(100,160,200,0.5)", fontSize: 9, fontFamily: mono,
                letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>KNOCK-ON EFFECTS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {sc.impact.regionalEffects.map((e, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: "rgba(255,150,50,0.7)", fontSize: 10, marginTop: 1, flexShrink: 0 }}>◆</span>
                    <span style={{ color: "rgba(200,230,255,0.65)", fontSize: 11, lineHeight: 1.5 }}>{e}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// SCORE BREAKDOWN PANEL  (used inside event detail)
// ═══════════════════════════════════════════════════════════════════════════════

function ScoreBar({ label, value, max, color }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ color: "rgba(100,160,200,0.6)", fontSize: 9, fontFamily: mono,
          letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
        <span style={{ color, fontSize: 10, fontFamily: mono, fontWeight: 700 }}>
          {value}<span style={{ color: "rgba(100,160,200,0.4)", fontWeight: 400 }}>/{max}</span>
        </span>
      </div>
      <div style={{ height: 4, background: "rgba(0,40,80,0.8)", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color,
          borderRadius: 2, transition: "width 0.6s cubic-bezier(0.23,1,0.32,1)",
          boxShadow: `0 0 8px ${color}88` }}/>
      </div>
    </div>
  );
}

function ScoreBreakdownPanel({ event }) {
  const sb    = event.scoreBreakdown;
  const total = event.priorityScore;
  const lvl   = event.priorityLevel;
  const pcfg  = PRIORITY_CONFIG[lvl] || PRIORITY_CONFIG.LOW;

  if (!sb) return null;

  return (
    <div>
      {/* Big score + level badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{ position: "relative" }}>
          {/* Circular score gauge */}
          <svg width="58" height="58" viewBox="0 0 58 58">
            <circle cx="29" cy="29" r="24" fill="none" stroke="rgba(0,40,80,0.8)" strokeWidth="4"/>
            <circle cx="29" cy="29" r="24" fill="none" stroke={pcfg.color}
              strokeWidth="4" strokeLinecap="round"
              strokeDasharray={`${(total / 100) * 150.8} 150.8`}
              transform="rotate(-90 29 29)"
              style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.23,1,0.32,1)" }}/>
            <text x="29" y="33" textAnchor="middle"
              style={{ fill: pcfg.color, fontSize: 14, fontFamily: mono, fontWeight: 700 }}>
              {total}
            </text>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ display: "inline-block", background: pcfg.bg, color: pcfg.color,
            border: `1px solid ${pcfg.border}`, borderRadius: 4, padding: "3px 10px",
            fontSize: 11, fontFamily: mono, fontWeight: 700, letterSpacing: "0.12em",
            marginBottom: 6 }}>{lvl}</span>
          <p style={{ color: "rgba(150,200,240,0.65)", fontSize: 11, lineHeight: 1.5,
            margin: 0, fontFamily: mono }}>{Array.isArray(event.whyThisMatters) ? event.whyThisMatters[0] : event.whyThisMatters}</p>
        </div>
      </div>

      {/* Score bars */}
      <ScoreBar label="Impact"      value={sb.impact}      max={40} color="#ff6633"/>
      <ScoreBar label="Probability" value={sb.probability} max={25} color="#ffaa00"/>
      <ScoreBar label="Urgency"     value={sb.urgency}     max={20} color="#ff3366"/>
      <ScoreBar label="Confidence"  value={sb.confidence}  max={15} color="#44ddff"/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WAR ROOM PANEL — "What Matters Now"
// ═══════════════════════════════════════════════════════════════════════════════

function WarRoomPanel({ topEvents, onSelect, selectedEventId, onClose, marketImpact, systemStatus, adminUnlocked, onAdminUnlock, onAdminRefresh, onOpenIntelBoard, refreshState, mobile = false, demoMode = false }) {
  const marketRows = marketImpact ? [marketImpact.oil, marketImpact.shipping, marketImpact.defense, marketImpact.equities] : [];
  const newsFreshness = getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt);
  const aiFreshness = getDataFreshness(systemStatus?.automation?.lastAiRefreshAt);
  const latestEventFreshness = getDataFreshness(refreshState?.detail?.newestEventAt ?? null);
  const latestArticleFreshness = getDataFreshness(refreshState?.detail?.newestArticleAt ?? null);
  const providerLine = adminUnlocked ? formatProviderDiagnostics(refreshState?.detail) : "";
  const automationNotice = getAutomationNotice(systemStatus, adminUnlocked);
  return (
    <div style={{
      position: mobile ? "fixed" : "absolute",
      top: mobile ? 96 : FLOATING_TOP,
      right: 16,
      left: mobile ? 16 : "auto",
      bottom: mobile ? 16 : "auto",
      width: mobile ? "auto" : 320,
      zIndex: 65,
      background: "linear-gradient(180deg, rgba(5,12,24,0.96) 0%, rgba(7,15,29,0.98) 100%)",
      border: "1px solid rgba(255,34,51,0.3)",
      borderRadius: 18,
      boxShadow: "0 0 40px rgba(255,34,51,0.08), 0 24px 55px rgba(0,0,0,0.46)",
      animation: "panelIn 0.28s cubic-bezier(0.23,1,0.32,1)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      maxHeight: mobile ? "calc(100vh - 112px)" : "calc(100vh - 86px)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "11px 14px 9px", borderBottom: "1px solid rgba(255,34,51,0.18)" }}>
        <div>
          <div style={{ color: "#ff4455", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 2 }}>
            Priority View
          </div>
          <div style={{ color: "rgba(220,240,255,0.9)", fontFamily: display,
            fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>WHAT MATTERS NOW</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(255,50,70,0.25)",
          color: "rgba(255,100,120,0.6)", cursor: "pointer", width: 26, height: 26,
          borderRadius: 4, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 12 }}>✕</button>
      </div>

      {/* Event list */}
      <div style={sharedPanelBodyStyle({ maxHeight: mobile ? "calc(100vh - 170px)" : "72vh" })}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(0,180,255,0.07)", display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Priority Snapshot
            </div>
            {demoMode ? <TrafficPill level="neutral">Public Preview</TrafficPill> : null}
            <div style={{ color: "#d6ebff", fontFamily: display, fontSize: 17, fontWeight: 700 }}>
              AI remaining today: {systemStatus?.aiRemainingToday ?? 0}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <TrafficPill level={newsFreshness.tone}>{newsFreshness.label}</TrafficPill>
              <TrafficPill level={aiFreshness.tone}>{formatAiFreshnessLabel(aiFreshness)}</TrafficPill>
              {refreshState?.detail?.newestArticleAt ? (
                <TrafficPill level={latestArticleFreshness.tone}>Latest source · {formatShortAge(refreshState.detail.newestArticleAt)}</TrafficPill>
              ) : null}
              {refreshState?.detail?.newestEventAt ? (
                <TrafficPill level={latestEventFreshness.tone}>Latest event · {formatShortAge(refreshState.detail.newestEventAt)}</TrafficPill>
              ) : null}
            </div>
            <div style={{ color: "rgba(150,205,245,0.7)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>
              Last news refresh: {formatShortAge(systemStatus?.automation?.lastNewsRefreshAt)}
            </div>
            <div style={{ color: "rgba(150,205,245,0.7)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>
              Last AI enrichment: {formatShortAge(systemStatus?.automation?.lastAiRefreshAt)}
            </div>
            {refreshState?.message ? (
              <div style={{ color: "rgba(214,235,255,0.82)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>
                {refreshState.message}
              </div>
            ) : null}
            {automationNotice ? (
              <div style={{ color: "rgba(255,191,71,0.9)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>
                {automationNotice}
              </div>
            ) : null}
            {adminUnlocked && providerLine ? (
              <div style={{ color: "rgba(130,185,230,0.72)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
                {providerLine}
              </div>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {marketRows.map((item) => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ color: "rgba(214,235,255,0.88)", fontSize: 12, fontFamily: bodyFont }}>{item.label}</span>
                <TrafficPill level={item.level}>{item.trend}</TrafficPill>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={onOpenIntelBoard} style={{
              minHeight: 38, borderRadius: 12, border: "1px solid rgba(87,216,255,0.18)", background: "rgba(10,31,52,0.76)",
              color: "#d6ebff", fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
            }}>
              Open Intel Board
            </button>
            {!demoMode && adminUnlocked ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button onClick={() => onAdminRefresh("news")} disabled={refreshState?.status === "running"} style={{
                  minHeight: 38, borderRadius: 12, border: "1px solid rgba(87,216,255,0.18)", background: "rgba(10,31,52,0.76)",
                  color: "#d6ebff", fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
                }}>
                  Refresh Newsfeed
                </button>
                <button onClick={() => onAdminRefresh("ai")} disabled={refreshState?.status === "running"} style={{
                  minHeight: 38, borderRadius: 12, border: "1px solid rgba(255,120,88,0.2)", background: "rgba(58,20,22,0.82)",
                  color: "#ffd4cc", fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
                }}>
                  Master Refresh with AI
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {topEvents.map((ev, rank) => {
          const pcfg = PRIORITY_CONFIG[ev.priorityLevel];
          const sel  = selectedEventId === ev.id;
          return (
            <div key={ev.id} onClick={() => onSelect(ev)} style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(0,180,255,0.06)",
              background: sel ? "rgba(0,50,100,0.28)" : "transparent",
              cursor: "pointer", transition: "background 0.15s ease",
              borderLeft: `3px solid ${sel ? pcfg.color : "transparent"}`,
            }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(0,30,60,0.3)"; }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                {/* Rank + score */}
                <div style={{ flexShrink: 0, textAlign: "center", minWidth: 32 }}>
                  <div style={{ color: "rgba(0,180,255,0.35)", fontSize: 9,
                    fontFamily: mono }}># {rank + 1}</div>
                  <div style={{ color: pcfg.color, fontSize: 16, fontFamily: mono,
                    fontWeight: 700, lineHeight: 1 }}>{ev.priorityScore}</div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ background: pcfg.bg, color: pcfg.color,
                      border: `1px solid ${pcfg.border}`, borderRadius: 3,
                      padding: "1px 6px", fontSize: 8, fontFamily: mono,
                      letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {ev.priorityLevel}
                    </span>
                  </div>
                  <div style={{ color: sel ? "#c8e8ff" : "rgba(155,205,250,0.8)",
                    fontSize: 12, fontFamily: display, fontWeight: 700,
                    lineHeight: 1.3, marginBottom: 4, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.title}
                  </div>
                  <p style={{ color: "rgba(120,175,220,0.55)", fontSize: 10,
                    fontFamily: mono, lineHeight: 1.45, margin: 0,
                    display: "-webkit-box", WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {Array.isArray(ev.whyThisMatters) ? ev.whyThisMatters[0] : ev.whyThisMatters}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "7px 14px", borderTop: "1px solid rgba(0,180,255,0.07)" }}>
        <div style={{ color: "rgba(0,180,255,0.25)", fontSize: 8, fontFamily: mono,
          letterSpacing: "0.1em", textAlign: "center" }}>
          SCORED BY IMPACT · PROBABILITY · URGENCY · CONFIDENCE
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT DETAIL CONTENT (shared between desktop panel and mobile sheet)
// ═══════════════════════════════════════════════════════════════════════════════

function EventDetailContent({ event, activeScenario, onScenarioChange, allEvents = [], socialSignals = [] }) {
  const cfg = INTENSITY[event.intensity];
  const brief = buildEventBrief(event, allEvents);
  const evidence = buildEvidenceSummary(event, allEvents);
  const situations = buildStrategicSituations(allEvents);
  const situation = findSituationForEvent(event, situations);
  const relatedSignals = getRelatedSignalEvidence(event, allEvents, 4);
  const sourceLine = brief.sourceTrace.domains.slice(0, 3).join(", ") || "No named sources";
  const eventStateLabels = getEventStateLabels(event);
  const linkedSignals = socialSignals
    .map((signal) => ({ signal, corroboration: deriveSocialCorroboration(signal, [event, ...allEvents]) }))
    .filter(({ signal, corroboration }) =>
      corroboration.relatedEvents.some((related) => related.id === event.id) ||
      String(signal.region ?? "").toLowerCase() === String(event.location?.label ?? "").toLowerCase()
    )
    .slice(0, 3);
  return (
    <>
      {/* Header badges */}
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid rgba(0,180,255,0.09)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color,
            boxShadow: `0 0 10px ${cfg.color}aa`, display: "inline-block", flexShrink: 0 }}/>
          <span style={{ color: cfg.color, fontSize: 9, fontFamily: mono,
            letterSpacing: "0.18em", textTransform: "uppercase" }}>
            {event.intensity.toUpperCase()} SEVERITY
          </span>
        </div>
        <h2 style={{ color: "#d0eaff", fontSize: 15, fontWeight: 700, lineHeight: 1.28,
          fontFamily: display, margin: "0 0 10px", letterSpacing: "0.03em" }}>{event.title}</h2>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <Badge color={TONE_COLOR[event.tone]}>{event.tone}</Badge>
          <Badge color={CONF_COLOR[event.confidence]}>CONF: {event.confidence}</Badge>
          <Badge color="#9bd6ff">{brief.category}</Badge>
          <Badge color="#7dd3fc">RISK: {event.riskLevel}</Badge>
          <Badge color="#f7c96a">IMP: {brief.impactScore}</Badge>
          <Badge color="#f79d6a">SEV: {brief.severityScore}</Badge>
          <Badge color={event.sourceSignals?.trustLabel === "High" ? "#58e38f" : event.sourceSignals?.trustLabel === "Medium" ? "#ffbf47" : "#7fb8dd"}>
            TRUST: {event.sourceSignals?.trustLabel ?? "Low"}
          </Badge>
          <span style={{ color: "rgba(0,180,255,0.38)", fontSize: 9, fontFamily: mono }}>
            {event.location?.lat != null && event.location?.lng != null ? `${event.location.lat.toFixed(2)}°, ${event.location.lng.toFixed(2)}°` : brief.whereItHappened}
          </span>
          <TrafficPill level={event.geoAccuracy?.value === "exact" || event.geoAccuracy?.value === "city" ? "green" : event.geoAccuracy?.value === "unresolved" ? "red" : "neutral"}>
            Geo: {event.geoAccuracy?.label ?? evidence.geoAccuracy.label}
          </TrafficPill>
          {eventStateLabels.map((item) => (
            <TrafficPill key={`${event.id}-${item.text}`} level={item.level}>{item.text}</TrafficPill>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div style={sharedPanelBodyStyle({ flex: 1 })}>
        

        {/* Summary */}
        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>Executive Summary</div>
          <p style={{ color: "rgba(180,220,255,0.72)", fontSize: 12, lineHeight: 1.72, margin: 0 }}>
            {brief.executiveSummary}
          </p>
          <div style={{ marginTop: 10, color: "rgba(130,185,230,0.7)", fontSize: 10, fontFamily: mono, lineHeight: 1.6 }}>
            {event.confidenceExplanation}
          </div>
          <div style={{ marginTop: 8, color: "rgba(130,185,230,0.76)", fontSize: 10, fontFamily: mono, lineHeight: 1.6 }}>
            Recent trend: {brief.recentTrend}
          </div>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <TrafficPill level="neutral">Sources: {sourceLine}</TrafficPill>
            <TrafficPill level={event.sourceSignals?.trustLabel === "High" ? "green" : event.sourceSignals?.trustLabel === "Medium" ? "amber" : "neutral"}>
              {brief.sourceTrace.corroborationLabel}
            </TrafficPill>
          </div>
          {event.marketImpactTags?.length > 0 ? (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {event.marketImpactTags.map((tag) => (
                <TrafficPill key={tag} level={/Oil Up|Shipping Risk|Equities Risk-off/i.test(tag) ? "red" : /Defense|Tech/i.test(tag) ? "amber" : "neutral"}>
                  {tag}
                </TrafficPill>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
            Evidence
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              ["Sources", `${evidence.sourceCount} signals / ${evidence.domainCount} domains`],
              ["Source mix", evidence.sourceMix],
              ["Geo accuracy", `${evidence.geoAccuracy.label} · ${evidence.geoAccuracy.reason}`],
              ["Confidence", evidence.confidence],
              ["Latest source", formatShortAge(evidence.latestSourceTime)],
              ["AI enrichment", evidence.aiLabel],
              ["Related grouped", String(evidence.relatedGrouped)],
              ["Content type", evidence.contentTypeMix],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "rgba(8,20,36,0.58)", border: "1px solid rgba(94,164,195,0.1)", borderRadius: 12, padding: "8px 10px" }}>
                <div style={{ color: "rgba(120,178,214,0.52)", fontSize: 9, fontFamily: mono, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                <div style={{ color: "rgba(214,235,255,0.84)", fontSize: 11, lineHeight: 1.45, fontFamily: bodyFont }}>{value || "limited classification"}</div>
              </div>
            ))}
          </div>
          {evidence.providerCoverageCaveat ? (
            <div style={{ marginTop: 8, color: "rgba(255,191,71,0.78)", fontSize: 10, lineHeight: 1.55, fontFamily: mono }}>
              Provider coverage caveat: {evidence.providerCoverageCaveat}
            </div>
          ) : null}
        </div>

        {situation ? (
          <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
              Strategic Inference
            </div>
            <div style={{ color: "#d6ebff", fontSize: 13, fontFamily: display, fontWeight: 700, marginBottom: 6 }}>{situation.title}</div>
            <div style={{ color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.65, marginBottom: 10 }}>
              {situation.strategicInference.summary}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              <TrafficPill level="neutral">{situation.linkedSignalCount} linked signals</TrafficPill>
              <TrafficPill level={situation.strategicInference.confidence === "Medium" ? "amber" : "neutral"}>{situation.strategicInference.confidence} confidence</TrafficPill>
              <TrafficPill level="neutral">{situation.trend}</TrafficPill>
            </div>
            <div style={{ color: "rgba(130,185,230,0.68)", fontSize: 10, lineHeight: 1.6, fontFamily: mono, marginBottom: 8 }}>
              Working hypotheses: {situation.strategicInference.competingHypotheses.join(" · ")}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {situation.strategicInference.watchIndicators.slice(0, 4).map((indicator) => (
                <div key={indicator} style={{ display: "flex", gap: 8, color: "rgba(155,205,250,0.72)", fontSize: 11, lineHeight: 1.5 }}>
                  <span style={{ color: "rgba(0,200,255,0.55)" }}>•</span>
                  <span>{indicator}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, color: "rgba(130,185,230,0.58)", fontSize: 10, lineHeight: 1.55, fontFamily: mono }}>
              Limitation: {situation.strategicInference.limitations.join(" ")}
            </div>
          </div>
        ) : null}

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)", display: "grid", gap: 12 }}>
          <div>
            {brief.assessment ? (
              <>
                <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
                  Assessment
                </div>
                <div style={{ color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>{brief.assessment}</div>
              </>
            ) : null}
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
              What happened
            </div>
            <div style={{ color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.7 }}>{brief.whatHappened}</div>
          </div>
          <div>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
              Where it happened
            </div>
            <div style={{ color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.7 }}>
              {brief.whereItHappened} · {brief.locationConfidence} confidence
            </div>
            <div style={{ marginTop: 6, color: "rgba(130,185,230,0.68)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
              {brief.locationReason}
            </div>
          </div>
          <div>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
              Why this matters
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {(brief.whyThisMatters ?? []).map((item) => (
                <div key={item} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ color: "rgba(0,200,255,0.55)", fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <span style={{ color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.7 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Developments */}
        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>KEY DEVELOPMENTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {brief.keyDevelopments.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: "rgba(0,200,255,0.55)", fontSize: 10, marginTop: 2, flexShrink: 0 }}>▸</span>
                <span style={{ color: "rgba(155,205,250,0.7)", fontSize: 11, lineHeight: 1.58 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)", display: "grid", gap: 12 }}>
          <div>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
              Confidence Drivers
            </div>
            <div style={{ color: "rgba(180,220,255,0.76)", fontSize: 11, lineHeight: 1.65, marginBottom: 10 }}>
              {brief.confidenceRationale}
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {brief.confidenceDrivers.map((driver) => (
                <div key={driver} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ color: "rgba(0,200,255,0.55)", fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <span style={{ color: "rgba(155,205,250,0.72)", fontSize: 11, lineHeight: 1.58 }}>{driver}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
              Watch Indicators
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {brief.watchIndicators.map((indicator) => (
                <div key={indicator} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                  <span style={{ color: "rgba(0,200,255,0.55)", fontSize: 10, marginTop: 2, flexShrink: 0 }}>•</span>
                  <span style={{ color: "rgba(155,205,250,0.72)", fontSize: 11, lineHeight: 1.58 }}>{indicator}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Priority Score Breakdown ── */}
        {event.priorityScore !== undefined && (
          <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
              letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>Priority View</div>
            <ScoreBreakdownPanel event={event} />
          </div>
        )}

        {/* Scenarios */}
        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>SCENARIO ENGINE</div>
          <div style={{ color: "rgba(0,180,255,0.28)", fontSize: 9, fontFamily: mono,
            marginBottom: 12 }}>Tap a scenario to update globe visualisation</div>
          {brief.scenarios.map((sc, i) => (
            <ScenarioCard key={i} sc={sc} active={activeScenario === i}
              onClick={() => onScenarioChange(i)} />
          ))}
        </div>

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Market & Sector Impact
          </div>
          {brief.marketImpact?.summary ? (
            <div style={{ color: "rgba(180,220,255,0.76)", fontSize: 11, lineHeight: 1.65, marginBottom: 10 }}>
              {brief.marketImpact.summary}
            </div>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {brief.marketImpactTags.map((tag) => (
              <TrafficPill key={tag} level={/Oil Up|Shipping Risk|Equities Risk-off/i.test(tag) ? "red" : /Defense|Tech|Finance/i.test(tag) ? "amber" : "neutral"}>
                {tag}
              </TrafficPill>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {brief.sectorImpact.map((sector) => (
              <TrafficPill key={sector} level="neutral">{sector}</TrafficPill>
            ))}
          </div>
          <div style={{ marginTop: 10, color: "rgba(130,185,230,0.68)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
            Directional intelligence signal only. Not financial advice.
          </div>
        </div>

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Source Assessment
          </div>
          <div style={{ marginBottom: 8, color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.7 }}>
            {brief.sourceAssessment?.corroborationLevel ?? brief.sourceTrace.corroborationLabel} · {brief.sourceAssessment?.sourceCount ?? brief.sourceTrace.sourceCount} source signals
          </div>
          <div style={{ color: "rgba(130,185,230,0.68)", fontSize: 10, lineHeight: 1.6 }}>
            {brief.sourceAssessment?.limitations}
          </div>
        </div>

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Source Trace
          </div>
          <div style={{ marginBottom: 10, color: "rgba(180,220,255,0.74)", fontSize: 12, lineHeight: 1.7 }}>
            {brief.sourceTrace.sourceCount} sources · {brief.sourceTrace.independentDomainCount} independent domains · {brief.sourceTrace.corroborationLabel}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {brief.sourceTrace.domains.map((domain) => (
              <TrafficPill key={domain} level={brief.sourceTrace.trustLabel === "High" ? "green" : brief.sourceTrace.trustLabel === "Medium" ? "amber" : "neutral"}>
                {domain}
              </TrafficPill>
            ))}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {brief.sourceTrace.links.length > 0 ? brief.sourceTrace.links.map((link) => (
              <a key={link} href={link} target="_blank" rel="noreferrer" style={{
                color: "#89ddff",
                fontSize: 11,
                lineHeight: 1.55,
                textDecoration: "none",
                wordBreak: "break-all",
                border: "1px solid rgba(87,216,255,0.12)",
                borderRadius: 12,
                padding: "9px 10px",
                background: "rgba(8,20,36,0.64)",
              }}>
                {link}
              </a>
            )) : (
              <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>
                No article URLs were stored for this event.
              </div>
            )}
          </div>
        </div>

        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Social Signal Trace
          </div>
          {linkedSignals.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {linkedSignals.map(({ signal, corroboration }) => (
                <div key={signal.id} style={{ background: "rgba(8,20,36,0.64)", border: "1px solid rgba(94,164,195,0.12)", borderRadius: 12, padding: "10px 11px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700 }}>{signal.title}</div>
                    <TrafficPill level={corroboration.label === "Corroborated" ? "green" : corroboration.label === "Partially corroborated" ? "amber" : "neutral"}>
                      {corroboration.label}
                    </TrafficPill>
                  </div>
                  <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 11, lineHeight: 1.55, marginBottom: 8 }}>{signal.summary}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    <TrafficPill level="amber">Unverified social signal</TrafficPill>
                    <TrafficPill level="neutral">{signal.source}</TrafficPill>
                  </div>
                  <a href={signal.url} target="_blank" rel="noreferrer" style={{ color: "#89ddff", fontSize: 11, textDecoration: "none" }}>
                    View original post
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>
              No linked social signals are currently loaded for this event.
            </div>
          )}
        </div>

        <div style={{ padding: "13px 18px 20px" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>
            Related Events
          </div>
          {relatedSignals.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {relatedSignals.map(({ event: related, reasons }) => (
                <div key={related.id} style={{ background: "rgba(8,20,36,0.64)", border: "1px solid rgba(94,164,195,0.12)", borderRadius: 12, padding: "10px 11px" }}>
                  <div style={{ color: "#d6ebff", fontSize: 12, fontFamily: display, fontWeight: 700, marginBottom: 4 }}>{related.title}</div>
                  <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 11, lineHeight: 1.55, marginBottom: 7 }}>{getOneLineSummary(related)}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(reasons.length ? reasons : ["related by signal pattern"]).slice(0, 3).map((reason) => (
                      <TrafficPill key={reason} level="neutral">{reason}</TrafficPill>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>
              No closely related events are visible in the current window.
            </div>
          )}
          <div style={{ marginTop: 12, color: "rgba(130,185,230,0.62)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
            {brief.aiStatusLabel} · Scores are directional intelligence signals, not guaranteed forecasts.
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP EVENT PANEL (right sidebar, 420px)
// ═══════════════════════════════════════════════════════════════════════════════

function DesktopEventPanel({ event, activeScenario, onScenarioChange, onClose, allEvents = [], socialSignals = [] }) {
  if (!event) return null;
  return (
    <div style={{
      position: "fixed", right: 0, top: 0, bottom: 0, width: 420, zIndex: 60,
      background: "linear-gradient(180deg, rgba(5,12,24,0.98) 0%, rgba(7,15,29,0.98) 100%)",
      borderLeft: "1px solid rgba(94, 164, 195, 0.16)",
      display: "flex", flexDirection: "column",
      animation: "panelIn 0.32s cubic-bezier(0.23,1,0.32,1)",
    }}>
      {/* Close button row */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px 0",
        flexShrink: 0 }}>
        <button onClick={onClose} aria-label="Close panel" style={{
          background: "rgba(10, 21, 37, 0.82)", border: "1px solid rgba(94, 164, 195, 0.18)",
          color: "rgba(189,226,248,0.74)", cursor: "pointer", width: 32, height: 32,
          borderRadius: 999, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 14, transition: "all 0.15s ease",
        }}>✕</button>
      </div>
      <EventDetailContent event={event} activeScenario={activeScenario} onScenarioChange={onScenarioChange} allEvents={allEvents} socialSignals={socialSignals} />
    </div>
  );
}

function SelectedObjectCard({ selected, onClose, onZoom, onClearSelection, mobile = false }) {
  if (!selected?.data) return null;

  const { type, data } = selected;

  if (type === "event") {
    return mobile ? (
      <div style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 65,
        background: "linear-gradient(180deg, rgba(3,10,24,0.97) 0%, rgba(3,8,20,0.99) 100%)",
        border: "1px solid rgba(0,180,255,0.22)",
        borderRadius: 14,
        padding: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ color: "rgba(0,200,255,0.42)", fontSize: 9, fontFamily: mono, letterSpacing: "0.14em" }}>SELECTED EVENT</div>
            <div style={{ color: "#d6ebff", fontFamily: display, fontWeight: 700 }}>{data.title}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid rgba(0,180,255,0.22)", color: "rgba(0,180,255,0.55)", borderRadius: 5, width: 28, height: 28 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onZoom} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(0,180,255,0.22)", background: "rgba(0,36,82,0.55)", color: "#d6ebff" }}>Zoom to object</button>
          <button onClick={onClearSelection} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(255,90,120,0.22)", background: "rgba(60,16,28,0.55)", color: "#ffd6df" }}>Clear selection</button>
        </div>
      </div>
    ) : null;
  }

  const rows = type === "flight"
    ? [
        ["Flight", data.flightNumber],
        ["Airline", data.airline],
        ["Route", `${data.departureAirport} / ${data.departureCity} → ${data.arrivalAirport} / ${data.arrivalCity}`],
        ["Altitude", data.altitude ?? "n/a"],
        ["Speed", data.speed ?? "n/a"],
        ["Status", data.status],
        ["Updated", formatLayerTime(data.updatedAt)],
      ]
    : type === "context"
      ? [
          ["Name", data.name],
          ["Type", data.type],
          ["Region", data.region],
          ["Geo accuracy", data.geoAccuracy ? String(data.geoAccuracy).replace("_", " ") : "approximate"],
          ["Why it matters", data.whyItMatters],
          ["Tags", (data.tags ?? []).join(", ") || "n/a"],
        ]
    : type === "vessel"
      ? [
          ["Ship", data.name],
          ["MMSI", data.mmsi],
          ["Type", data.vesselType],
          ["Speed", data.speed ?? "n/a"],
          ["Heading", data.heading ?? "n/a"],
          ["Destination", data.destination ?? "n/a"],
          ["ETA", data.eta ?? "n/a"],
          ["Flag", data.flag ?? "n/a"],
        ]
      : [
          ["Satellite", data.name],
          ["NORAD", data.noradId],
          ["Type", data.satelliteType],
          ["Altitude", data.altitudeKm ? `${data.altitudeKm} km` : "n/a"],
          ["Inclination", data.inclination ? `${data.inclination}°` : "n/a"],
          ["Updated", formatLayerTime(data.updatedAt)],
        ];

  const shellStyle = mobile
    ? {
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 65,
        borderRadius: 14,
      }
    : {
        position: "fixed",
        right: 0,
        top: TOP_BAR_HEIGHT,
        bottom: 0,
        width: 340,
        zIndex: 60,
        borderLeft: "1px solid rgba(94, 164, 195, 0.16)",
      };

  return (
    <div style={{
      ...shellStyle,
      background: "linear-gradient(180deg, rgba(5,12,24,0.98) 0%, rgba(7,15,29,0.98) 100%)",
      display: "flex",
      flexDirection: "column",
      padding: 18,
      gap: 12,
      boxShadow: "0 24px 55px rgba(0,0,0,0.46)",
      maxHeight: mobile ? "min(70vh, 560px)" : "calc(100vh - 82px)",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ color: "rgba(103, 220, 255, 0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Selected {type}
          </div>
          <div style={{ color: "#d6ebff", fontFamily: display, fontWeight: 700, fontSize: 20, letterSpacing: "0.03em" }}>
            {data.title ?? data.name}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(10, 21, 37, 0.82)", border: "1px solid rgba(94, 164, 195, 0.18)", color: "rgba(189,226,248,0.74)", borderRadius: 999, width: 30, height: 30, flexShrink: 0 }}>✕</button>
      </div>
      <div style={sharedPanelBodyStyle({ display: "grid", gap: 8 })}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 8 }}>
            <span style={{ color: "rgba(103, 220, 255, 0.42)", fontSize: 10, fontFamily: mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</span>
            <span style={{ color: "rgba(214,235,255,0.88)", fontSize: 12, lineHeight: 1.55, fontFamily: bodyFont }}>{String(value ?? "n/a")}</span>
          </div>
        ))}
      </div>
      {type === "context" ? (
        <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 10, lineHeight: 1.6, fontFamily: mono }}>
          External/context layers are situational aids and may be incomplete.
          {data.externalUrl ? (
            <>
              {" "}
              <a href={data.externalUrl} target="_blank" rel="noreferrer" style={{ color: "#89ddff" }}>
                External public source
              </a>
            </>
          ) : null}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onZoom} style={{ flex: 1, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(87,216,255,0.18)", background: "rgba(10,31,52,0.76)", color: "#d6ebff", fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase" }}>Zoom to object</button>
        <button onClick={onClearSelection} style={{ flex: 1, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(255,90,120,0.18)", background: "rgba(42,15,23,0.72)", color: "#ffd6df", fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase" }}>Clear selection</button>
      </div>
    </div>
  );
}

function MobileSheetTabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? "rgba(87,216,255,0.42)" : "rgba(94,164,195,0.12)"}`,
        background: active ? "rgba(24,58,84,0.78)" : "rgba(8,20,36,0.7)",
        color: active ? "#8ae8ff" : "rgba(190,218,236,0.74)",
        borderRadius: 999,
        minHeight: 34,
        padding: "7px 11px",
        fontSize: 10,
        fontFamily: mono,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MobileMarketImpactContent({ aggregate, onSelectCategory }) {
  const items = [aggregate.oil, aggregate.shipping, aggregate.defense, aggregate.tech, aggregate.equities];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => (
        <button key={item.label} onClick={() => onSelectCategory?.(item.key ?? item.label.toLowerCase())} style={{
          background: "rgba(8,20,36,0.78)",
          border: "1px solid rgba(94,164,195,0.14)",
          borderRadius: 14,
          padding: "12px 13px",
          textAlign: "left",
          cursor: "pointer",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#d6ebff", fontFamily: display, fontSize: 14, fontWeight: 700 }}>{item.label}</span>
            <TrafficPill level={item.level}>{item.trend}</TrafficPill>
          </div>
          <div style={{ color: "rgba(150,205,245,0.62)", fontSize: 10, fontFamily: mono }}>score {item.score.toFixed(2)}</div>
        </button>
      ))}
    </div>
  );
}

function MobileBriefingContent({ briefing, onSelect }) {
  if (!briefing.items.length) {
    return <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono }}>Awaiting next intelligence refresh.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {briefing.items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            width: "100%",
            textAlign: "left",
            background: "rgba(8,20,36,0.78)",
            border: "1px solid rgba(94,164,195,0.14)",
            borderRadius: 14,
            padding: "12px 13px",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ color: "#d6ebff", fontFamily: display, fontWeight: 700, fontSize: 13 }}>{item.title}</span>
            <TrafficPill level={item.riskLevel === "Critical" ? "red" : item.riskLevel === "High" ? "amber" : "neutral"}>
              {item.riskLevel}
            </TrafficPill>
          </div>
          <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>
            {item.summary}
          </div>
          {item.aiStatusLabel ? (
            <div style={{ marginTop: 8 }}>
              <TrafficPill level={item.aiStatus === "enriched" ? "green" : item.aiStatus === "budget_exhausted" ? "amber" : "neutral"}>
                {item.aiStatusLabel}
              </TrafficPill>
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function GlobalViewButton({ onReset, mobile = false, offsetLeft = 18 }) {
  return (
    <button
      onClick={onReset}
      style={{
        position: "absolute",
        left: mobile ? 12 : offsetLeft,
        bottom: mobile ? "calc(env(safe-area-inset-bottom, 0px) + 108px)" : 22,
        zIndex: 38,
        borderRadius: 14,
        minHeight: mobile ? 40 : 36,
        padding: mobile ? "10px 14px" : "8px 12px",
        background: "rgba(6,15,30,0.82)",
        border: "1px solid rgba(87,216,255,0.18)",
        color: "#d6ebff",
        fontFamily: mono,
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
        boxShadow: "0 16px 40px rgba(0,0,0,0.34)",
      }}
    >
      Global View
    </button>
  );
}

function LiveSunButton({ enabled, onToggle, mobile = false, offsetLeft = 18 }) {
  return (
    <button
      onClick={onToggle}
      style={{
        position: "absolute",
        left: mobile ? 12 : offsetLeft,
        bottom: mobile ? "calc(env(safe-area-inset-bottom, 0px) + 58px)" : 70,
        zIndex: 38,
        borderRadius: 14,
        minHeight: mobile ? 36 : 34,
        padding: mobile ? "8px 12px" : "7px 11px",
        background: enabled ? "rgba(18,40,62,0.88)" : "rgba(6,15,30,0.82)",
        border: `1px solid ${enabled ? "rgba(255,205,120,0.24)" : "rgba(87,216,255,0.18)"}`,
        color: enabled ? "#ffe0ad" : "#d6ebff",
        fontFamily: mono,
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
        boxShadow: "0 16px 40px rgba(0,0,0,0.26)",
      }}
    >
      Day/Night {enabled ? "On" : "Off"}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE BOTTOM SHEET  (3 states: peek → half → full)
// ═══════════════════════════════════════════════════════════════════════════════

const SHEET_STATES = {
  peek: { label: "peek",  snapVh: 10  },   // just a handle bar + count
  half: { label: "half",  snapVh: 44  },   // event list
  full: { label: "full",  snapVh: 84  },   // event detail
};

function MobileBottomSheet({ events, selectedEvent, activeScenario, onScenarioChange,
                             onSelectEvent, onClose, activeLayers, onLayerToggle, layerEntries,
                             briefing, marketImpact, flights, satellites, socialSignals, onBriefingSelect,
                             onOpenIntelBoard, refreshState, adminUnlocked, onAdminUnlock,
                             onSelectObject, allEvents = [],
                             onAdminRefresh, systemStatus, selectedLens, onLensChange,
                             strategicBrief, demoMode = false, topEvents = [],
                             sortMode = "priority", onSortChange = () => {},
                             liveSunEnabled = true, onToggleLiveSun = () => {},
                             onSelectMarketCategory = () => {}, marketData = null }) {
  const [sheetState, setSheetState] = useState("peek");
  const [activeTab, setActiveTab] = useState("signals");
  const sheetRef   = useRef(null);
  const dragRef    = useRef({ startY: 0, startH: 0, dragging: false });

  // When an event is selected, snap to full
  useEffect(() => {
    if (selectedEvent) setSheetState("full");
    else if (sheetState === "full") setSheetState("half");
  }, [selectedEvent]);

  useEffect(() => {
    if (selectedEvent) setActiveTab("signals");
  }, [selectedEvent]);

  const snapVh  = SHEET_STATES[sheetState].snapVh;
  const sheetH  = `${snapVh}vh`;

  // ── Swipe gesture handling ─────────────────────────────────────────────────
  const onHandleTouchStart = e => {
    dragRef.current = { startY: e.touches[0].clientY, startH: snapVh, dragging: true };
  };
  const onHandleTouchMove = e => {
    if (!dragRef.current.dragging) return;
    const dy = dragRef.current.startY - e.touches[0].clientY;
    const dhVh = (dy / window.innerHeight) * 100;
    const newH = dragRef.current.startH + dhVh;
    // Live drag feedback via transform (not state, no re-render)
    if (sheetRef.current) {
      const clampedDy = Math.max(-30, Math.min(50, -dy));
      sheetRef.current.style.transform = `translateY(${clampedDy}px)`;
    }
  };
  const onHandleTouchEnd = e => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (sheetRef.current) sheetRef.current.style.transform = "";
    const dy = dragRef.current.startY - e.changedTouches[0].clientY;
    const THRESHOLD = window.innerHeight * 0.06; // 6vh threshold
    if (dy > THRESHOLD) {
      // Swipe up
      if (sheetState === "peek") setSheetState("half");
      else if (sheetState === "half") setSheetState("full");
    } else if (dy < -THRESHOLD) {
      // Swipe down
      if (sheetState === "full") { setSheetState("half"); onClose(); }
      else if (sheetState === "half") setSheetState("peek");
    }
  };

  const cfg = selectedEvent ? INTENSITY[selectedEvent.intensity] : null;

  return (
    <div ref={sheetRef} style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      height: sheetH,
      zIndex: 50,
      background: "linear-gradient(180deg, rgba(3,10,24,0.97) 0%, rgba(3,8,20,0.99) 100%)",
      borderTop: "1px solid rgba(0,180,255,0.22)",
      borderRadius: "16px 16px 0 0",
      display: "flex", flexDirection: "column",
      transition: "height 0.35s cubic-bezier(0.32,0.72,0,1)",
      boxShadow: "0 -8px 40px rgba(0,0,0,0.6)",
      overflow: "hidden",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>

      {/* ── Drag handle ── */}
      <div
        onTouchStart={onHandleTouchStart}
        onTouchMove={onHandleTouchMove}
        onTouchEnd={onHandleTouchEnd}
        onClick={() => {
          if (sheetState === "peek") setSheetState("half");
          else if (sheetState === "half") setSheetState(selectedEvent ? "full" : "peek");
          else setSheetState("half");
        }}
        style={{ flexShrink: 0, padding: "10px 0 6px", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          touchAction: "none" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2,
          background: "rgba(0,180,255,0.35)" }}/>

        {/* Sheet header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", padding: "0 18px", minHeight: 28 }}>
          {selectedEvent && sheetState !== "peek" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color,
                boxShadow: `0 0 8px ${cfg.color}`, flexShrink: 0 }}/>
              <span style={{ color: "#c8e8ff", fontSize: 13, fontFamily: display,
                fontWeight: 700, letterSpacing: "0.04em", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedEvent.title}</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "rgba(0,200,255,0.5)", fontSize: 9, fontFamily: mono,
                letterSpacing: "0.18em", textTransform: "uppercase" }}>
                {events.length} ACTIVE SIGNALS
              </span>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {selectedEvent && sheetState !== "peek" && (
              <button onClick={e => { e.stopPropagation(); onClose(); setSheetState("half"); }}
                style={{ background: "none", border: "1px solid rgba(0,180,255,0.22)",
                  color: "rgba(0,180,255,0.55)", cursor: "pointer", width: 28, height: 28,
                  borderRadius: 5, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 12 }}>✕</button>
            )}
            <span style={{ color: "rgba(0,180,255,0.35)", fontSize: 16 }}>
              {sheetState === "full" ? "↓" : "↑"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {sheetState !== "peek" && (
          <div style={{ padding: "8px 14px 10px", borderBottom: "1px solid rgba(0,180,255,0.08)",
            flexShrink: 0, background: "rgba(4,10,24,0.78)" }}>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <MobileSheetTabButton active={activeTab === "signals"} onClick={() => setActiveTab("signals")}>Signals</MobileSheetTabButton>
              <MobileSheetTabButton active={activeTab === "layers"} onClick={() => setActiveTab("layers")}>Layers</MobileSheetTabButton>
              <MobileSheetTabButton active={activeTab === "market"} onClick={() => setActiveTab("market")}>Market</MobileSheetTabButton>
              <MobileSheetTabButton active={activeTab === "warroom"} onClick={() => setActiveTab("warroom")}>Priority</MobileSheetTabButton>
            </div>
          </div>
        )}

        {/* Event detail (full state) */}
        {sheetState === "full" && selectedEvent ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <EventDetailContent event={selectedEvent} activeScenario={activeScenario}
              onScenarioChange={onScenarioChange} allEvents={allEvents} socialSignals={socialSignals} />
          </div>
        ) : sheetState !== "peek" ? (
          <div style={sharedPanelBodyStyle({ flex: 1, padding: 14 })}>
            {activeTab === "signals" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <TrafficPill level={getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt).tone}>
                      News {getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt).label}
                    </TrafficPill>
                    <TrafficPill level={getDataFreshness(systemStatus?.automation?.lastAiRefreshAt).tone}>
                      {formatAiFreshnessLabel(getDataFreshness(systemStatus?.automation?.lastAiRefreshAt))}
                    </TrafficPill>
                  </div>
                  {refreshState?.message ? (
                    <div style={{ color: "rgba(150,205,245,0.72)", fontSize: 11, lineHeight: 1.55, fontFamily: bodyFont }}>
                      {refreshState.message}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                    {ACTIVE_SIGNAL_SORT_OPTIONS.map((option) => (
                      <SegmentedFilterChip
                        key={option.key}
                        active={sortMode === option.key}
                        onClick={() => onSortChange(option.key)}
                        compact
                      >
                        {option.label}
                      </SegmentedFilterChip>
                    ))}
                  </div>
                </div>
                {events.map(ev => {
                  const c    = INTENSITY[ev.intensity];
                  const pcfg = PRIORITY_CONFIG[ev.priorityLevel] || PRIORITY_CONFIG.LOW;
                  const sel = selectedEvent?.id === ev.id;
                  const eventLabels = getEventStateLabels(ev);
                  const freshnessMeta = getSignalFreshnessMeta(ev);
                  return (
                    <button key={ev.id} onClick={() => { onSelectEvent(ev); setSheetState("full"); }}
                      style={{ padding: "13px 14px", border: "1px solid rgba(94,164,195,0.14)",
                        borderLeft: `3px solid ${sel ? c.color : ev.impactScore >= 85 ? "rgba(255,102,119,0.78)" : ev.impactScore >= 65 ? "rgba(255,191,71,0.64)" : `${c.color}66`}`,
                        borderRadius: 14, background: sel ? "rgba(0,50,100,0.28)" : "rgba(8,20,36,0.74)",
                        display: "grid", gap: 8, textAlign: "left", width: "100%", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <TrafficPill level={ev.intensity === "high" ? "red" : ev.intensity === "medium" ? "amber" : "green"}>{ev.intensity}</TrafficPill>
                        <TrafficPill level={ev.tone === "Escalating" ? "red" : ev.tone === "Stable" ? "neutral" : "green"}>{ev.tone}</TrafficPill>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <TrafficPill level="neutral">{ev.category ?? "Political"}</TrafficPill>
                        <TrafficPill level={freshnessMeta.tone}>{freshnessMeta.label}</TrafficPill>
                        <span style={{ color: "rgba(0,180,255,0.42)", fontSize: 9, fontFamily: mono }}>{Math.round(ev.impactScore ?? ev.importanceScore ?? 0)} impact</span>
                      </div>
                      <div style={{ color: "#d6ebff", fontSize: 14, fontFamily: display, fontWeight: 700, lineHeight: 1.35 }}>{ev.title}</div>
                      <div style={{ color: "rgba(150,205,245,0.72)", fontSize: 11, lineHeight: 1.55, fontFamily: bodyFont }}>
                        {ev.briefSummary}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "rgba(0,180,255,0.38)", fontSize: 9, fontFamily: mono }}>{ev.location?.label ?? "Location under review"}</span>
                        <span style={{ color: pcfg.color, fontSize: 9, fontFamily: mono, fontWeight: 700 }}>{Math.round(ev.priorityQueueScore ?? ev.lensPriorityScore ?? ev.priorityScore ?? 0)} pts</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ color: "rgba(150,200,240,0.58)", fontSize: 9, fontFamily: mono }}>{ev.sourceSignals?.sourceCount ?? 0} sources</span>
                        <span style={{ color: "rgba(150,200,240,0.58)", fontSize: 9, fontFamily: mono }}>{ev.confidence}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {eventLabels.map((item) => (
                            <TrafficPill key={`${ev.id}-${item.text}`} level={item.level}>{item.text}</TrafficPill>
                          ))}
                        </div>
                        <span style={{ color: "rgba(150,200,240,0.5)", fontSize: 9, fontFamily: mono }}>{freshnessMeta.detail}</span>
                      </div>
                    </button>
                  );
                })}
                {events.length === 0 ? (
                  <div style={{ color: "rgba(150,200,240,0.58)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont }}>
                    {feedState?.message || (refreshState?.message ? "Board checked. No newer high-relevance signals found." : "No fresh signals in this filter. Showing stored high-impact signals when available.")}
                  </div>
                ) : null}
              </div>
            ) : activeTab === "layers" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 10, background: "rgba(8,20,36,0.78)", border: "1px solid rgba(94,164,195,0.14)", borderRadius: 14, padding: 12 }}>
                  <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Context & Display Layers
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {layerEntries.map(([key, def]) => (
                      <LayerToggleChip key={key} layerKey={key} def={def} active={activeLayers[key]} onToggle={onLayerToggle} />
                    ))}
                  </div>
                  <div style={{ color: "rgba(150,200,240,0.56)", fontSize: 10, lineHeight: 1.55, fontFamily: bodyFont }}>
                    Context layers are static situational aids and may be incomplete.
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 8, borderTop: "1px solid rgba(94,164,195,0.12)" }}>
                    <span style={{ color: "rgba(214,235,255,0.84)", fontSize: 12, fontFamily: bodyFont }}>Day/Night lighting</span>
                    <TopControlButton active={liveSunEnabled} onClick={onToggleLiveSun}>{liveSunEnabled ? "On" : "Off"}</TopControlButton>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10, background: "rgba(8,20,36,0.78)", border: "1px solid rgba(94,164,195,0.14)", borderRadius: 14, padding: 12 }}>
                  <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    Lens
                  </div>
                  <select
                    value={selectedLens}
                    onChange={(event) => onLensChange?.(event.target.value)}
                    style={{
                      minHeight: 40,
                      borderRadius: 12,
                      background: "rgba(8,20,36,0.78)",
                      border: "1px solid rgba(94,164,195,0.14)",
                      color: "#d6ebff",
                      fontFamily: mono,
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      padding: "0 10px",
                    }}
                  >
                    {DECISION_LENSES.map((lens) => (
                      <option key={lens.id} value={lens.id}>{lens.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ background: "rgba(8,20,36,0.78)", border: "1px solid rgba(94,164,195,0.14)", borderRadius: 14, padding: 12 }}>
                  <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                    System Pulse
                  </div>
                  {demoMode ? <TrafficPill level="neutral">Public Preview</TrafficPill> : null}
                  <div style={{ color: "#d6ebff", fontSize: 12, lineHeight: 1.7, fontFamily: bodyFont }}>
                    AI remaining today: {systemStatus?.aiRemainingToday ?? 0}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    <TrafficPill level={getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt).tone}>
                      {getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt).label}
                    </TrafficPill>
                    <TrafficPill level={getDataFreshness(systemStatus?.automation?.lastAiRefreshAt).tone}>
                      {formatAiFreshnessLabel(getDataFreshness(systemStatus?.automation?.lastAiRefreshAt))}
                    </TrafficPill>
                  </div>
                  {refreshState?.message ? (
                    <div style={{ color: "rgba(214,235,255,0.82)", fontSize: 11, lineHeight: 1.6, fontFamily: bodyFont, marginTop: 8 }}>
                      {refreshState.message}
                    </div>
                  ) : null}
                  {adminUnlocked && formatProviderDiagnostics(refreshState?.detail) ? (
                    <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 10, lineHeight: 1.6, fontFamily: mono, marginTop: 8 }}>
                      {formatProviderDiagnostics(refreshState?.detail)}
                    </div>
                  ) : null}
                  <button onClick={onOpenIntelBoard} style={{
                    marginTop: 10, width: "100%", minHeight: 38, borderRadius: 12,
                    border: "1px solid rgba(87,216,255,0.18)", background: "rgba(10,31,52,0.76)",
                    color: "#d6ebff", fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase",
                  }}>
                    Open Intel Board
                  </button>
                  {!demoMode && adminUnlocked ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                      <button
                        onClick={() => onAdminRefresh("news")}
                        disabled={refreshState?.status === "running"}
                        style={{
                          minHeight: 40,
                          borderRadius: 12,
                          border: "1px solid rgba(87,216,255,0.18)",
                          background: "rgba(10,31,52,0.76)",
                          color: "#d6ebff",
                          fontFamily: mono,
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        Refresh News
                      </button>
                      <button
                        onClick={() => onAdminRefresh("ai")}
                        disabled={refreshState?.status === "running"}
                        style={{
                          minHeight: 40,
                          borderRadius: 12,
                          border: "1px solid rgba(255,144,92,0.18)",
                          background: "rgba(56,24,18,0.76)",
                          color: "#ffd9cc",
                          fontFamily: mono,
                          fontSize: 10,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        Refresh AI
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : activeTab === "market" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ background: "rgba(8,20,36,0.78)", border: "1px solid rgba(94,164,195,0.14)", borderRadius: 14, padding: 12 }}>
                  <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                    Market Context
                  </div>
                  <MobileMarketImpactContent aggregate={marketImpact} onSelectCategory={onSelectMarketCategory} />
                  <div style={{ color: "rgba(140,190,228,0.62)", fontSize: 10, lineHeight: 1.6, marginTop: 10, fontFamily: bodyFont }}>
                    Market data and geopolitical scores are contextual intelligence signals, not financial advice.
                  </div>
                  {!marketData?.configured ? (
                    <div style={{ color: "rgba(130,185,230,0.62)", fontSize: 11, fontFamily: mono, marginTop: 8 }}>
                      Market price feed not configured yet.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : activeTab === "warroom" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ background: "rgba(8,20,36,0.78)", border: "1px solid rgba(94,164,195,0.14)", borderRadius: 14, padding: 12 }}>
                  <div style={{ color: "rgba(103,220,255,0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
                    Today’s Strategic Brief
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {(strategicBrief?.topEscalatingRegions?.length ? strategicBrief.topEscalatingRegions : ["Awaiting next intelligence refresh."]).map((region) => (
                      <TrafficPill key={region} level="amber">{region}</TrafficPill>
                    ))}
                  </div>
                  <div style={{ color: "#d6ebff", fontSize: 12, lineHeight: 1.7, fontFamily: bodyFont }}>
                    Chokepoint to watch: {strategicBrief?.chokepointToWatch ?? "Awaiting next intelligence refresh."}
                  </div>
                </div>
                <MobileBriefingContent briefing={briefing} onSelect={(eventId) => { onBriefingSelect(eventId); setSheetState("full"); }} />
                <div style={{ display: "grid", gap: 10 }}>
                  {topEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => { onSelectEvent(event); setSheetState("full"); }}
                      style={{
                        padding: "13px 14px",
                        border: "1px solid rgba(94,164,195,0.14)",
                        borderRadius: 14,
                        background: "rgba(8,20,36,0.74)",
                        display: "grid",
                        gap: 7,
                        textAlign: "left",
                        width: "100%",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <TrafficPill level={event.tone === "Escalating" ? "red" : event.tone === "Stable" ? "neutral" : "amber"}>{event.tone}</TrafficPill>
                        <span style={{ color: "rgba(0,180,255,0.42)", fontSize: 9, fontFamily: mono }}>{Math.round(event.lensPriorityScore ?? event.priorityScore ?? 0)} pts</span>
                      </div>
                      <div style={{ color: "#d6ebff", fontSize: 13, fontFamily: display, fontWeight: 700, lineHeight: 1.35 }}>
                        {event.title}
                      </div>
                      <div style={{ color: "rgba(150,205,245,0.68)", fontSize: 11, lineHeight: 1.55, fontFamily: bodyFont }}>
                        {event.briefSummary}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER SYSTEM DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const LAYER_DEFS = {
  events: { label: "EVENTS", icon: "✦", color: "#ff6b7d", desc: "Event hotspots" },
  conflictZones: { label: "ZONES", icon: "⬡", color: "#8fdfff", desc: "Conflict-zone overlay" },
  flights: { label: "FLIGHTS", icon: "✈", color: "#7ad0ff", desc: "Live aviation layer" },
  vessels: { label: "VESSELS", icon: "◫", color: "#8cf0c9", desc: "Live vessel layer" },
  satellites: { label: "SATELLITES", icon: "◉", color: "#c68dff", desc: "Orbital layer" },
  social: { label: "SOCIAL", icon: "⌁", color: "#88b9ff", desc: "Early-warning social signals" },
  ...CONTEXT_LAYER_DEFS,
  intelBoard: { label: "INTEL BOARD", icon: "▣", color: "#ffd166", desc: "Intel panels" },
};

function LayerToggleChip({ layerKey, def, active, onToggle }) {
  return (
    <button onClick={() => onToggle(layerKey)} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "8px 12px",
      background: active ? `${def.color}14` : "rgba(10,20,36,0.74)",
      border: `1px solid ${active ? def.color + "55" : "rgba(94, 164, 195, 0.12)"}`,
      borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
      transition: "all 0.18s ease", minHeight: 34,
    }}>
      <span style={{ fontSize: 11, color: active ? def.color : "rgba(160,190,214,0.7)" }}>{def.icon}</span>
      <span style={{ color: active ? def.color : "rgba(150,200,240,0.55)",
        fontSize: 9, fontFamily: mono, letterSpacing: "0.08em" }}>{def.label}</span>
    </button>
  );
}

// Desktop layer toggle bar
function DesktopLayerBar({ activeLayers, onToggle, bordersLoaded, layerEntries }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {layerEntries.map(([key, def]) => (
        <LayerToggleChip key={key} layerKey={key} def={def}
          active={activeLayers[key]} onToggle={onToggle} />
      ))}
      {bordersLoaded && (
        <span style={{ color: "rgba(0,255,120,0.55)", fontSize: 9, fontFamily: mono,
          letterSpacing: "0.1em", marginLeft: 4 }}>◈ BORDERS</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// THREE.JS LIVE INTELLIGENCE LAYERS
// ═══════════════════════════════════════════════════════════════════════════════

// Satellite orbital data: [inclinationDeg, longitudeOfAscendingNodeDeg, altitudeR]
const SATELLITE_ORBITS = [
  [28,   0,  0.28], [51.6,  45, 0.22], [98,  90, 0.32], [63,  135, 0.19],
  [45,  180, 0.26], [70,  225, 0.35], [35,  270, 0.21], [82,  315, 0.30],
  [55,   60, 0.24], [20,  150, 0.38],
];

function buildSatelliteLayer() {
  const group = new THREE.Group();
  group.userData = { layerType: "satellites" };

  SATELLITE_ORBITS.forEach(([ incDeg, lanDeg, alt ], idx) => {
    const incRad = incDeg * Math.PI / 180;
    const lanRad = lanDeg * Math.PI / 180;

    // Orbit path (faint ellipse)
    const orbitPts = [];
    for (let a = 0; a <= 360; a += 3) {
      const ar = a * Math.PI / 180;
      // Orbital plane: rotate by inclination then by LAN
      const x = Math.cos(ar);
      const y = Math.sin(ar) * Math.cos(incRad);
      const z = Math.sin(ar) * Math.sin(incRad);
      // Rotate by LAN around Y-axis
      const xr = x * Math.cos(lanRad) - z * Math.sin(lanRad);
      const zr = x * Math.sin(lanRad) + z * Math.cos(lanRad);
      orbitPts.push(new THREE.Vector3(xr * (R + alt), y * (R + alt), zr * (R + alt)));
    }
    const orbitGeo = new THREE.BufferGeometry().setFromPoints(orbitPts);
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0x0066aa, transparent: true, opacity: 0.18,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Line(orbitGeo, orbitMat));

    // Satellite dot
    const satGeo = new THREE.SphereGeometry(0.005, 6, 6);
    const satMat = new THREE.MeshBasicMaterial({
      color: 0x44ddff, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sat = new THREE.Mesh(satGeo, satMat);
    sat.userData = {
      isSatellite: true,
      incRad, lanRad, alt,
      phase: (idx / SATELLITE_ORBITS.length) * Math.PI * 2,
      speed: 0.18 + idx * 0.022,
    };
    group.add(sat);
  });

  return group;
}

// Major shipping routes: [fromLat, fromLng, toLat, toLng, label]
const SHIPPING_ROUTES = [
  [1.3, 103.8,  25.2,  55.3, "Singapore–Hormuz"],
  [25.2, 55.3,  30.0,  32.5, "Hormuz–Suez"],
  [30.0, 32.5,  51.5,  -0.1, "Suez–London"],
  [30.0, 32.5,  48.8,   2.3, "Suez–Paris"],
  [1.3, 103.8,  35.6, 139.7, "Singapore–Tokyo"],
  [1.3, 103.8,  31.2, 121.5, "Singapore–Shanghai"],
  [31.2,121.5,  37.7,-122.4, "Shanghai–SanFrancisco"],
  [35.6,139.7,  34.0,-118.2, "Tokyo–LosAngeles"],
  [51.5, -0.1,  40.7, -74.0, "London–NewYork"],
  [48.8,  2.3,  40.7, -74.0, "Paris–NewYork"],
  [-33.9,151.2, 1.3,  103.8, "Sydney–Singapore"],
  [22.3, 114.2, 35.6, 139.7, "HongKong–Tokyo"],
];

// Chokepoint highlights
const CHOKEPOINTS = [
  { lat: 25.2, lng: 55.3, label: "Hormuz" },
  { lat: 30.0, lng: 32.5, label: "Suez" },
  { lat: 5.5,  lng: 100.3, label: "Malacca" },
  { lat: 51.5, lng:  1.2,  label: "English Channel" },
  { lat: 36.0, lng: -5.4,  label: "Gibraltar" },
];

function buildMaritimeLayer() {
  const group = new THREE.Group();
  group.userData = { layerType: "maritime" };

  // Shipping route arcs
  SHIPPING_ROUTES.forEach(([lat0, lng0, lat1, lng1, label], i) => {
    const pts = buildArc(lat0, lng0, lat1, lng1, 0.05, 50);
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const mat  = new THREE.LineBasicMaterial({
      color: 0x1166cc, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Line(geo, mat));

    // Animated ship dot
    const dotGeo = new THREE.SphereGeometry(0.005, 6, 6);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x44aaff, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.userData = { arcPts: pts, arcT: Math.random(), arcSpeed: 0.08 + Math.random() * 0.06 };
    group.add(dot);
  });

  // Chokepoint markers
  CHOKEPOINTS.forEach(cp => {
    const pos = geoToVec3(cp.lat, cp.lng, R + 0.015);
    const out  = pos.clone().normalize();
    const geo  = new THREE.RingGeometry(0.02, 0.025, 24);
    const mat  = new THREE.MeshBasicMaterial({
      color: 0xffaa00, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), out);
    m.userData = { chokepoint: true, baseOpacity: 0.7 };
    group.add(m);
  });

  return group;
}

// Conflict zone pulsing overlays based on event data
function buildConflictLayer(events) {
  const group = new THREE.Group();
  group.userData = { layerType: "conflict" };

  events.forEach(ev => {
    if (ev.intensity === "low") return; // only med/high conflicts

    const pos = geoToVec3(ev.lat, ev.lng, R + 0.005);
    const out  = pos.clone().normalize();
    const cfg  = INTENSITY[ev.intensity];
    const col  = new THREE.Color(cfg.color);

    // Heat glow circle
    const heatGeo = new THREE.CircleGeometry(0.09, 32);
    const heatMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.08,
      side: THREE.DoubleSide, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const heat = new THREE.Mesh(heatGeo, heatMat);
    heat.position.copy(geoToVec3(ev.lat, ev.lng, R + 0.003));
    heat.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), out);
    heat.userData = { conflictPulse: true, baseOpacity: 0.08,
      speed: 0.8 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2 };
    group.add(heat);

    // Outer ring
    for (let r = 0; r < 2; r++) {
      const rGeo = new THREE.RingGeometry(0.065 + r*0.04, 0.075 + r*0.04, 32);
      const rMat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.15 - r*0.05,
        side: THREE.DoubleSide, depthWrite: false, depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Mesh(rGeo, rMat);
      ring.position.copy(pos);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), out);
      ring.userData = { conflictPulse: true, baseOpacity: 0.15 - r*0.05,
        speed: 1.1 + r*0.3 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2 };
      group.add(ring);
    }
  });

  return group;
}

// Influence / connection arcs between related events and major powers
const INFLUENCE_CONNECTIONS = [
  // [lat0, lng0, lat1, lng1, color_hex]
  [55.7, 37.6,  46.2, 31.5, 0xff3333], // Moscow → Black Sea
  [55.7, 37.6,  51.5,  -0.1, 0x4444ff], // Moscow → London (NATO)
  [39.9, 116.4, 24.5, 122.0, 0xff8800], // Beijing → Taiwan
  [39.9, 116.4, 12.5, 114.2, 0xff8800], // Beijing → SCS
  [35.7, 139.7, 24.5, 122.0, 0x4488ff], // Tokyo → Taiwan
  [38.9, -77.0, 24.5, 122.0, 0x2266ff], // Washington → Taiwan
  [38.9, -77.0, 26.6,  56.3, 0x2266ff], // Washington → Hormuz
  [24.0,  45.0, 26.6,  56.3, 0xffcc00], // Riyadh → Hormuz
  [39.9, 116.4, 26.6,  56.3, 0xff8800], // Beijing → Hormuz (energy)
  [35.7, 139.7,  1.3, 103.8, 0x4488ff], // Tokyo → Singapore
  [38.9, -77.0, 15.6,  32.5, 0x2266ff], // Washington → Sudan
];

function buildConnectionLayer() {
  const group = new THREE.Group();
  group.userData = { layerType: "connections" };

  INFLUENCE_CONNECTIONS.forEach(([lat0, lng0, lat1, lng1, colHex], i) => {
    const pts = buildArc(lat0, lng0, lat1, lng1, 0.09, 60);
    const geo  = new THREE.BufferGeometry().setFromPoints(pts);
    const col  = new THREE.Color(colHex);
    const mat  = new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: 0.22,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Line(geo, mat));

    // Animated pulse bead along arc
    const beadGeo = new THREE.SphereGeometry(0.004, 6, 6);
    const beadMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const bead = new THREE.Mesh(beadGeo, beadMat);
    bead.userData = { arcPts: pts, arcT: (i / INFLUENCE_CONNECTIONS.length),
      arcSpeed: 0.06 + Math.random() * 0.05 };
    group.add(bead);
  });

  return group;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

function TopBar({ counts, bordersLoaded, activeLayers, onLayerToggle, isMobile, isTablet, onWarRoom, showWarRoom, marketData, onPersonalize, showPersonalize, onAdminRefresh, refreshState, layerEntries, activeView = "globe", onNavigate, systemStatus, adminUnlocked, onAdminUnlock, selectedLens, onLensChange, demoMode = false, feedState, layersStatus, liveSunEnabled = true, onToggleLiveSun = () => {} }) {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11,19));
  const [showLayersMenu, setShowLayersMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toISOString().slice(11,19)), 1000);
    return () => clearInterval(t);
  }, []);

  const compact = isMobile || isTablet;
  const headerHeight = getHeaderHeight(isMobile, isTablet);
  const publicLayerEntries = layerEntries.filter(([key]) => key !== "intelBoard");
  const aiRemaining = systemStatus?.aiRemainingToday ?? systemStatus?.automation?.aiRemainingToday ?? 0;
  const newsFreshness = getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt);
  const aiFreshness = getDataFreshness(systemStatus?.automation?.lastAiRefreshAt);
  const providerLine = adminUnlocked ? formatProviderDiagnostics(refreshState?.detail) : "";
  const automationNotice = getAutomationNotice(systemStatus, adminUnlocked);
  const navButtons = APP_VIEWS.map((item) => {
    const active = activeView === item.key;
    return (
      <button
        key={item.key}
        onClick={() => onNavigate?.(item.key)}
        style={{
          border: "none",
          borderBottom: `2px solid ${active ? "rgba(87,216,255,0.95)" : "transparent"}`,
          background: "transparent",
          color: active ? "#73ebff" : "rgba(214, 230, 244, 0.72)",
          padding: compact ? "8px 4px 7px" : "16px 4px 12px",
          minWidth: compact ? "auto" : item.key === "reports" ? 152 : 84,
          cursor: "pointer",
          fontFamily: mono,
          fontSize: compact ? 10 : 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {item.label}
        {item.badge ? (
          <span style={{
            marginLeft: 8,
            borderRadius: 999,
            border: "1px solid rgba(144, 164, 181, 0.18)",
            padding: "1px 6px",
            color: "rgba(189,216,232,0.75)",
            fontSize: 9,
          }}>
            {item.badge}
          </span>
        ) : null}
      </button>
    );
  });

  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
    }}>
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: headerHeight,
      background: "linear-gradient(180deg, rgba(4,9,18,0.96) 0%, rgba(4,10,22,0.88) 100%)", backdropFilter: "blur(18px)",
      borderBottom: "1px solid rgba(87,216,255,0.12)",
      display: "flex", alignItems: compact ? "stretch" : "center", justifyContent: "space-between",
      flexDirection: compact ? "column" : "row",
      padding: compact ? "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px" : "0 18px", zIndex: 40, flexShrink: 0, gap: compact ? 8 : 16,
      WebkitBackdropFilter: "blur(18px)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            <img src={BRAND_WORDMARK} alt="Grigori by oryth.io" style={{ height: isMobile ? 24 : 28, width: "auto", maxWidth: isMobile ? 188 : 236 }} />
          </div>
          {!isMobile ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3 }}>
              <span style={{ color: "#74d9f3", fontFamily: mono, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                Strategic Intelligence Dashboard
              </span>
              {demoMode ? <TrafficPill level="neutral">Public Preview</TrafficPill> : null}
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ed69f", boxShadow: "0 0 10px rgba(78,214,159,0.8)" }} />
              <span style={{ color: "rgba(140,165,186,0.82)", fontFamily: bodyFont, fontSize: 12 }}>
                Operational
              </span>
            </div>
          ) : null}
        </div>

        {compact ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            padding: "8px 11px",
            borderRadius: 999,
            background: "rgba(6, 15, 30, 0.76)",
            border: "1px solid rgba(87,216,255,0.14)",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ed69f", boxShadow: "0 0 10px rgba(78,214,159,0.8)", flexShrink: 0 }} />
            <div style={{ color: "#d6ebff", fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
              Operational
            </div>
            {demoMode ? (
              <div style={{ color: "rgba(148,175,198,0.78)", fontFamily: mono, fontSize: 9, whiteSpace: "nowrap" }}>
                Public Preview
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {compact ? (
        <>
        <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", flex: 1, paddingBottom: 2 }}>
            {navButtons}
          </div>
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "center", flex: 1, minWidth: 0, flexWrap: "wrap" }}>
          {navButtons}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
        {!compact && (
          <select
            value={selectedLens}
            onChange={(event) => onLensChange?.(event.target.value)}
            style={{
              minHeight: 34,
              borderRadius: 12,
              background: "rgba(6,15,30,0.76)",
              border: "1px solid rgba(87,216,255,0.14)",
              color: "#d6ebff",
              fontFamily: mono,
              fontSize: 10,
              letterSpacing: "0.08em",
              padding: "0 10px",
              minWidth: 158,
            }}
          >
            {DECISION_LENSES.map((lens) => (
              <option key={lens.id} value={lens.id}>{lens.label}</option>
            ))}
          </select>
        )}

        {!compact ? <TopControlButton onClick={() => { setShowLayersMenu((value) => !value); setShowStatusMenu(false); setShowAdminMenu(false); }} active={showLayersMenu}>Layers</TopControlButton> : null}
        {!compact ? <TopControlButton onClick={onWarRoom} active={showWarRoom}>Priority View</TopControlButton> : null}
        {!compact ? (
          <TopControlButton onClick={() => { setShowStatusMenu((value) => !value); setShowLayersMenu(false); setShowAdminMenu(false); }} subtle>
            Operational · {aiRemaining}
          </TopControlButton>
        ) : null}
        {!compact && !demoMode ? (
          <TopControlButton onClick={() => { setShowAdminMenu((value) => !value); setShowLayersMenu(false); setShowStatusMenu(false); }} subtle>
            {adminUnlocked ? "Operator" : "Unlock"}
          </TopControlButton>
        ) : null}

        {showLayersMenu && !compact ? (
          <HeaderPopover right={demoMode ? 0 : 88} minWidth={252}>
            <div style={{ padding: "12px", display: "grid", gap: 10 }}>
              <div style={{ color: "rgba(103, 220, 255, 0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>Context & Display Layers</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {publicLayerEntries.map(([key, def]) => (
                  <LayerToggleChip key={key} layerKey={key} def={def} active={activeLayers[key]} onToggle={onLayerToggle} />
                ))}
              </div>
              <div style={{ color: "rgba(150,200,240,0.56)", fontSize: 10, lineHeight: 1.55, fontFamily: bodyFont }}>
                Context layers are static situational aids and may be incomplete.
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 8, borderTop: "1px solid rgba(94,164,195,0.12)" }}>
                <span style={{ color: "rgba(214,235,255,0.84)", fontSize: 12, fontFamily: bodyFont }}>Day/Night lighting</span>
                <TopControlButton active={liveSunEnabled} onClick={onToggleLiveSun}>{liveSunEnabled ? "On" : "Off"}</TopControlButton>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ color: "rgba(214,235,255,0.84)", fontSize: 12, fontFamily: bodyFont }}>Borders</span>
                <TrafficPill level={bordersLoaded ? "green" : "neutral"}>{bordersLoaded ? "On" : "Loading"}</TrafficPill>
              </div>
              <button onClick={onPersonalize} style={{
                textAlign: "left",
                background: "rgba(8,20,36,0.66)",
                border: `1px solid ${showPersonalize ? "rgba(0,180,255,0.32)" : "rgba(94,164,195,0.12)"}`,
                color: showPersonalize ? "#8fe7ff" : "rgba(214,235,255,0.84)",
                borderRadius: 12,
                padding: "10px 12px",
                cursor: "pointer",
                fontFamily: bodyFont,
                fontSize: 12,
              }}>
                Focus & watchlist
              </button>
            </div>
          </HeaderPopover>
        ) : null}

        {showStatusMenu && !compact ? (
          <HeaderPopover right={demoMode ? 0 : 88} minWidth={232}>
            <div style={{ padding: "12px", display: "grid", gap: 8 }}>
              <div style={{ color: "rgba(103, 220, 255, 0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>Operational status</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ color: "#4ed69f", fontFamily: mono, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>Operational</span>
                <span style={{ color: "rgba(148,175,198,0.78)", fontFamily: mono, fontSize: 10 }}>{time} UTC</span>
              </div>
              <div style={{ color: "rgba(214,235,255,0.84)", fontSize: 12, fontFamily: bodyFont }}>AI remaining today {aiRemaining}</div>
              <div style={{ color: "rgba(148,175,198,0.78)", fontFamily: mono, fontSize: 10 }}>
                Data as of: {formatLayerTime(systemStatus?.automation?.lastNewsRefreshAt ?? systemStatus?.automation?.newestEventAt)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <TrafficPill level={newsFreshness.tone}>{newsFreshness.label}</TrafficPill>
                <TrafficPill level={aiFreshness.tone}>{formatAiFreshnessLabel(aiFreshness)}</TrafficPill>
              </div>
              {refreshState?.message ? (
                <div style={{ color: "rgba(214,235,255,0.84)", fontSize: 12, fontFamily: bodyFont, lineHeight: 1.55 }}>
                  {refreshState.message}
                </div>
              ) : null}
              {demoMode ? <TrafficPill level="neutral">Public Preview</TrafficPill> : null}
              {adminUnlocked && systemStatus?.automation ? (
                <div style={{ display: "grid", gap: 4, paddingTop: 6, borderTop: "1px solid rgba(94,164,195,0.12)", color: "rgba(148,175,198,0.78)", fontFamily: mono, fontSize: 10 }}>
                  <div>News {formatLayerTime(systemStatus.automation.lastNewsRefreshAt)}</div>
                  <div>AI {formatLayerTime(systemStatus.automation.lastAiRefreshAt)}</div>
                  <div>{formatAutomationLine("Scheduled news", systemStatus.automation.news)}</div>
                  <div>{formatAutomationLine("Scheduled AI", systemStatus.automation.ai)}</div>
                  {automationNotice ? <div style={{ color: "rgba(255,191,71,0.9)" }}>{automationNotice}</div> : null}
                  {providerLine ? <div>{providerLine}</div> : null}
                </div>
              ) : null}
            </div>
          </HeaderPopover>
        ) : null}

        {showAdminMenu && !compact && !demoMode ? (
          <HeaderPopover right={0} minWidth={228}>
            <div style={{ padding: "12px", display: "grid", gap: 10 }}>
              <div style={{ color: "rgba(103, 220, 255, 0.48)", fontSize: 10, fontFamily: mono, letterSpacing: "0.12em", textTransform: "uppercase" }}>Operator Mode</div>
              {adminUnlocked ? (
                <>
                  <TopControlButton onClick={() => onAdminRefresh("news")}>Refresh Newsfeed</TopControlButton>
                  <TopControlButton onClick={() => onAdminRefresh("ai")}>Master Refresh with AI</TopControlButton>
                  {refreshState?.message ? <div style={{ color: "rgba(214,235,255,0.82)", fontFamily: bodyFont, fontSize: 12, lineHeight: 1.55 }}>{refreshState.message}</div> : null}
                  {automationNotice ? <div style={{ color: "rgba(255,191,71,0.9)", fontFamily: bodyFont, fontSize: 12, lineHeight: 1.55 }}>{automationNotice}</div> : null}
                  {systemStatus?.automation ? (
                    <div style={{ color: "rgba(148,175,198,0.76)", fontFamily: mono, fontSize: 10, lineHeight: 1.5 }}>
                      <div>{formatAutomationLine("Scheduled news", systemStatus.automation.news)}</div>
                      <div>{formatAutomationLine("Scheduled AI", systemStatus.automation.ai)}</div>
                    </div>
                  ) : null}
                  {providerLine ? <div style={{ color: "rgba(148,175,198,0.76)", fontFamily: mono, fontSize: 10, lineHeight: 1.5 }}>{providerLine}</div> : null}
                  {feedState?.message ? <div style={{ color: "rgba(148,175,198,0.76)", fontFamily: mono, fontSize: 10 }}>{feedState.message}</div> : null}
                </>
              ) : (
                <TopControlButton onClick={onAdminUnlock}>Unlock Operator Mode</TopControlButton>
              )}
            </div>
          </HeaderPopover>
        ) : null}
      </div>
    </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP LEFT SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

function DesktopSidebar({ events, selectedEvent, onSelect, modeHours, onModeChange, topOffset = TOP_BAR_HEIGHT, sortMode = "priority", onSortChange, systemStatus, refreshState, adminUnlocked = false, feedState, onCollapse }) {
  const options = [
    { label: "24h", value: 24 },
    { label: "7d", value: 24 * 7 },
    { label: "30d", value: 24 * 30 },
  ];
  const newsFreshness = getDataFreshness(systemStatus?.automation?.lastNewsRefreshAt);
  const aiFreshness = getDataFreshness(systemStatus?.automation?.lastAiRefreshAt);
  const refreshMessage = refreshState?.message ?? "";
  const sortOptions = ACTIVE_SIGNAL_SORT_OPTIONS;
  return (
    <div style={{
      position: "absolute", left: 0, top: topOffset, bottom: 0, width: 284,
      background: "rgba(4,10,21,0.78)", backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(14px)",
      borderRight: "1px solid rgba(87,216,255,0.12)",
      display: "flex", flexDirection: "column", zIndex: 30,
    }}>
      <div style={{ padding: "18px 18px 16px", borderBottom: "1px solid rgba(87,216,255,0.08)",
        flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ color: "rgba(0,200,255,0.38)", fontSize: 10, fontFamily: mono,
            letterSpacing: "0.14em", textTransform: "uppercase" }}>Active Signals</div>
          {onCollapse ? (
            <button
              onClick={onCollapse}
              aria-label="Collapse Active Signals"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "1px solid rgba(94,164,195,0.16)",
                background: "rgba(8,20,36,0.7)",
                color: "rgba(189,226,248,0.74)",
                cursor: "pointer",
              }}
            >
              ‹
            </button>
          ) : null}
        </div>
        <div style={{ color: "rgba(214,235,255,0.92)", fontSize: 22, fontFamily: display, fontWeight: 700, marginTop: 6 }}>
          {events.length}
        </div>
        {Number(feedState?.contextCount ?? 0) > 0 || Number(feedState?.freshCount ?? 0) > 0 ? (
          <div style={{ color: "rgba(105,231,255,0.7)", fontSize: 10, marginTop: 4, fontFamily: mono, letterSpacing: 1.2, textTransform: "uppercase" }}>
            {modeHours >= 168 ? `${Math.round(modeHours / 24)}d lens · ` : ""}
            {events.length} active · {Number(feedState?.freshCount ?? 0)} fresh
            {Number(feedState?.groupedDuplicates ?? 0) > 0 ? ` · ${Number(feedState.groupedDuplicates)} grouped` : ""}
            {` · ${Number(feedState?.recentContextCount ?? 0)} recent · ${Number(feedState?.storedRelevantCount ?? 0)} stored`}
          </div>
        ) : null}
        <div style={{ color: "rgba(148,175,198,0.72)", fontSize: 12, lineHeight: 1.5, marginTop: 4, fontFamily: bodyFont }}>
          {feedState?.status === "fallback"
            ? "Best available intelligence signals while live refresh is pending."
            : "Live geopolitical signals prioritized for the current lens."}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          <TrafficPill level={newsFreshness.tone}>News {newsFreshness.label}</TrafficPill>
          <TrafficPill level={aiFreshness.tone}>{formatAiFreshnessLabel(aiFreshness)}</TrafficPill>
        </div>
        {feedState?.message ? (
          <div style={{ marginTop: 8, color: "rgba(150,205,245,0.78)", fontSize: 11, lineHeight: 1.55, fontFamily: bodyFont }}>
            {feedState.message}
          </div>
        ) : null}
        {refreshMessage ? (
          <div style={{ marginTop: 8, color: "rgba(150,205,245,0.72)", fontSize: 11, lineHeight: 1.55, fontFamily: bodyFont }}>
            {refreshMessage}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <TrafficPill level="red">{events.filter((ev) => ev.intensity === "high").length} H</TrafficPill>
          <TrafficPill level="amber">{events.filter((ev) => ev.intensity === "medium").length} M</TrafficPill>
          <TrafficPill level="neutral">{events.filter((ev) => ev.intensity === "low").length} L</TrafficPill>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {options.map((option) => (
            <button key={option.value} onClick={() => onModeChange?.(option.value)} style={{
              flex: 1,
              minHeight: 34,
              borderRadius: 12,
              cursor: "pointer",
              background: modeHours === option.value ? "rgba(56, 189, 248, 0.14)" : "rgba(8,20,36,0.66)",
              border: `1px solid ${modeHours === option.value ? "rgba(87,216,255,0.36)" : "rgba(83, 148, 182, 0.16)"}`,
              color: modeHours === option.value ? "#88ddff" : "rgba(150,200,240,0.62)",
              fontSize: 10,
              fontFamily: mono,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {sortOptions.map((option) => (
            <SegmentedFilterChip
              key={option.key}
              active={sortMode === option.key}
              onClick={() => onSortChange?.(option.key)}
            >
              {option.label}
            </SegmentedFilterChip>
          ))}
        </div>
      </div>
      <div style={sharedPanelBodyStyle({ flex: 1 })}>
        {events.length === 0 ? (
          <div style={{ padding: "18px 18px", color: "rgba(150,200,240,0.55)", fontSize: 10, fontFamily: mono, lineHeight: 1.6 }}>
            {feedState?.message || (refreshMessage ? "Board checked. No newer high-relevance signals found." : "No fresh signals in this filter. Showing stored high-impact signals when available.")}
          </div>
        ) : null}
        {events.map(ev => {
          const cfg  = INTENSITY[ev.intensity];
          const pcfg = PRIORITY_CONFIG[ev.priorityLevel] || PRIORITY_CONFIG.LOW;
          const sel  = selectedEvent?.id === ev.id;
          const eventLabels = getEventStateLabels(ev);
          const freshnessMeta = getSignalFreshnessMeta(ev);
          return (
            <div key={ev.id} onClick={() => onSelect(ev)} style={{
              padding: "16px 18px",
              borderBottom: "1px solid rgba(87,216,255,0.06)",
              borderLeft: `3px solid ${sel ? cfg.color : ev.impactScore >= 85 ? "rgba(255,102,119,0.78)" : ev.impactScore >= 65 ? "rgba(255,191,71,0.64)" : "transparent"}`,
              background: sel ? "rgba(8,34,56,0.34)" : "transparent",
              cursor: "pointer", transition: "all 0.15s ease",
            }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(8,28,48,0.3)"; }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <TrafficPill level={ev.intensity === "high" ? "red" : ev.intensity === "medium" ? "amber" : "green"}>
                  {ev.intensity}
                </TrafficPill>
                <TrafficPill level="neutral">{ev.category ?? "Political"}</TrafficPill>
                <TrafficPill level={freshnessMeta.tone}>{freshnessMeta.label}</TrafficPill>
                {ev.watchlistMatch?.matched ? <TrafficPill level="amber">Watchlist</TrafficPill> : null}
              </div>
              <div style={{ color: sel ? "#c8e8ff" : "rgba(235,244,255,0.9)", fontSize: 17,
                fontFamily: display, fontWeight: 700, lineHeight: 1.22, marginBottom: 8, letterSpacing: "0.01em" }}>
                {ev.title}
              </div>
              <div style={{ color: "rgba(178,205,228,0.72)", fontSize: 13, lineHeight: 1.6, marginBottom: 12, fontFamily: bodyFont }}>
                {ev.briefSummary}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ color: "rgba(120,178,214,0.58)", fontSize: 10, fontFamily: mono, letterSpacing: "0.04em" }}>
                  {ev.location?.label ?? "Location under review"}
                </div>
                <span style={{ color: pcfg.color, fontSize: 9, fontFamily: mono,
                  fontWeight: 700, background: pcfg.bg,
                  border: `1px solid ${pcfg.border}`, borderRadius: 999,
                  padding: "4px 8px" }}>{Math.round(ev.priorityQueueScore ?? ev.lensPriorityScore ?? ev.priorityScore ?? 0)}</span>
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div
                  title="Impact is a 0-100 Grigori score estimating potential operational, market, or strategic relevance based on severity, region, affected sectors, and source signals."
                  style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(8,20,36,0.58)", border: "1px solid rgba(94,164,195,0.1)" }}
                >
                  <div style={{ color: "rgba(120,178,214,0.52)", fontSize: 9, fontFamily: mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>Impact</div>
                  <div style={{ color: "#eaf7ff", fontSize: 14, fontFamily: display, fontWeight: 700, marginTop: 4 }}>{ev.impactScore ?? 0}</div>
                </div>
                <div
                  title="Confidence reflects source count, domain diversity, corroboration, freshness, source tier, and location/category match. It is not a guarantee of accuracy."
                  style={{ padding: "8px 10px", borderRadius: 12, background: "rgba(8,20,36,0.58)", border: "1px solid rgba(94,164,195,0.1)" }}
                >
                  <div style={{ color: "rgba(120,178,214,0.52)", fontSize: 9, fontFamily: mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>Confidence</div>
                  <div style={{ color: "#eaf7ff", fontSize: 14, fontFamily: display, fontWeight: 700, marginTop: 4 }}>{ev.confidence}</div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 8, color: "rgba(150,200,240,0.54)", fontSize: 10, fontFamily: mono, flexWrap: "wrap" }}>
                <span title="Number of source signals clustered into this event.">
                  {ev.sourceSignals?.sourceCount ?? 0} sources
                  {ev.sourceAssessment?.sourceQuality ? ` · ${String(ev.sourceAssessment.sourceQuality).replace("_", " ")} quality` : ""}
                </span>
                <span>{ev.recentTrend ?? "Stable"}</span>
                <span>{freshnessMeta.detail}</span>
              </div>
              {eventLabels.length > 0 ? (
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {eventLabels.map((item) => (
                    <TrafficPill key={`${ev.id}-${item.text}`} level={item.level}>{item.text}</TrafficPill>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActiveSignalsRail({ count, topOffset = TOP_BAR_HEIGHT, onExpand }) {
  return (
    <button
      onClick={onExpand}
      aria-label="Open Active Signals"
      style={{
        position: "absolute",
        left: 12,
        top: topOffset + 18,
        zIndex: 31,
        width: 46,
        minHeight: 156,
        borderRadius: 14,
        border: "1px solid rgba(87,216,255,0.16)",
        background: "rgba(5,12,24,0.74)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        color: "#d6ebff",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        gap: 8,
        boxShadow: "0 18px 42px rgba(0,0,0,0.34)",
      }}
    >
      <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(103,220,255,0.64)" }}>
        Signals
      </span>
      <span style={{ fontFamily: display, fontSize: 17, fontWeight: 700 }}>{count}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function GlobeApp({ activeView = "globe", onNavigate }) {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  const [selectedEvent,  setSelectedEvent]  = useState(null);
  const [selectedZone,   setSelectedZone]   = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [activeScenario, setActiveScenario] = useState(0);
  const [tooltip,        setTooltip]        = useState({ text: null, x: 0, y: 0 });
  const [bordersLoaded,  setBordersLoaded]  = useState(false);
  const [ready,          setReady]          = useState(false);
  const [liveSunEnabled, setLiveSunEnabled] = useState(true);
  const [activeLayers,   setActiveLayers]   = useState(() => ({
    events: true,
    conflictZones: false,
    flights: false,
    vessels: false,
    satellites: false,
    social: false,
    contextChokepoints: true,
    contextPorts: false,
    contextAirports: false,
    contextEnergy: false,
    intelBoard: true,
    ...readStoredContextLayers(),
  }));
  const [panelVisibility, setPanelVisibility] = useState(() => ({
    events: readStoredBoolean(ACTIVE_SIGNALS_STORAGE_KEY, true),
    briefing: readStoredBoolean(BRIEFING_PANEL_STORAGE_KEY, false),
    marketImpact: readStoredBoolean(MARKET_PANEL_STORAGE_KEY, false),
    dataConfidence: false,
    flights: false,
    vessels: false,
    satellites: false,
    social: false,
    selectedObjectDetail: true,
    timeline: false,
  }));
  const [showWarRoom,     setShowWarRoom]     = useState(false);
  const [liveEvents,      setLiveEvents]      = useState(SCORED_EVENTS);
  const [marketData,      setMarketData]      = useState(null);
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [prefs,           setPrefs]           = useState({ region: "all", sectors: [], riskLevel: "all" });
  const [selectedLens,    setSelectedLens]    = useState("global_risk");
  const [activeSignalSort, setActiveSignalSort] = useState("priority");
  const [refreshState,    setRefreshState]    = useState({ status: "idle", message: "", detail: null });
  const [briefing,        setBriefing]        = useState(buildBriefing(SCORED_EVENTS));
  const [briefingCompactDismissed, setBriefingCompactDismissed] = useState(() => readStoredBoolean(BRIEFING_COMPACT_STORAGE_KEY, false));
  const [introDismissed, setIntroDismissed] = useState(() => readStoredBoolean(INTRO_STORAGE_KEY, false));
  const [showMethodology, setShowMethodology] = useState(false);
  const [selectedMarketKey, setSelectedMarketKey] = useState(null);
  const [timelineHours,   setTimelineHours]   = useState(24 * 7);
  const [timelineSlider,  setTimelineSlider]  = useState(100);
  const [flights,         setFlights]         = useState([]);
  const [vessels,         setVessels]         = useState([]);
  const [satellites,      setSatellites]      = useState([]);
  const [socialSignals,   setSocialSignals]   = useState([]);
  const [layersStatus,    setLayersStatus]    = useState({ flights: null, vessels: null, satellites: null, social: null });
  const [systemStatus,    setSystemStatus]    = useState({
    automation: null,
    aiCallsToday: 0,
    aiRemainingToday: 0,
  });
  const [feedState,       setFeedState]       = useState({ status: "ok", message: "", fallbackReason: "fresh_active" });
  const [adminSession,    setAdminSession]    = useState({ unlocked: false, secret: "" });
  const [vesselSearch,    setVesselSearch]    = useState("");
  const [watchlist,       setWatchlist]       = useState(() => {
    if (typeof window === "undefined") return { regions: [], topics: [] };
    try {
      const parsed = JSON.parse(window.localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? "{}");
      return {
        regions: Array.isArray(parsed.regions) ? parsed.regions : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      };
    } catch {
      return { regions: [], topics: [] };
    }
  });

  const { isMobile, isTablet } = useViewport();
  const headerHeight = getHeaderHeight(isMobile, isTablet);

  const refreshData = useCallback(async (forceFresh = false) => {
    if (!DEMO_MODE) {
      try {
        const md = await fetchMarketContext();
        setMarketData(md);
      } catch {}
    } else {
      setMarketData(null);
    }

    try {
      const { events: evs, meta } = await fetchLiveEvents(forceFresh);
      setLiveEvents(evs);
      try {
        const briefingRes = await fetch(withNoStoreUrl("/api/v1/briefing", forceFresh), {
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        if (briefingRes.ok) {
          const briefingData = await briefingRes.json();
          setBriefing(briefingData.briefing ?? buildBriefing(evs, selectedLens));
        } else {
          setBriefing(buildBriefing(evs, selectedLens));
        }
      } catch {
        setBriefing(buildBriefing(evs, selectedLens));
      }
      const stateCounts = meta?.stateCounts ?? {};
      const freshCount = Number(meta?.freshEligibleCount ?? stateCounts.fresh_active ?? 0);
      const recentContextCount = Number(meta?.recentContextCount ?? stateCounts.recent_context ?? 0);
      const storedRelevantCount = Number(meta?.storedRelevantCount ?? stateCounts.stored_relevant ?? 0);
      const contextCount = recentContextCount + storedRelevantCount;
      const groupedDuplicateCount = Number(meta?.groupedDuplicateCount ?? meta?.groupedDuplicates ?? 0);
      const duplicateText = groupedDuplicateCount > 0
        ? ` ${groupedDuplicateCount} related signal${groupedDuplicateCount === 1 ? "" : "s"} grouped.`
        : "";
      const feedMessage = meta?.fallbackUsed
        ? meta.fallbackReason === "historical_context"
          ? "Using historical context signals while live refresh is pending."
          : `Limited fresh signals under current provider coverage. Showing best available signals and recent stored context.${duplicateText}`
        : groupedDuplicateCount > 0
          ? `${groupedDuplicateCount} related signal${groupedDuplicateCount === 1 ? "" : "s"} grouped for a cleaner active feed.`
          : "";
      setFeedState({
        status: meta?.fallbackUsed ? "fallback" : "ok",
        message: feedMessage,
        fallbackReason: meta?.fallbackReason ?? "fresh_active",
        freshCount,
        recentContextCount,
        storedRelevantCount,
        contextCount,
        groupedDuplicates: groupedDuplicateCount,
        storedContextIncluded: Number(meta?.storedContextIncluded ?? 0),
      });
    } catch {
      setFeedState({
        status: "warning",
        message: "Data feed temporarily unavailable. Last cached intelligence shown.",
        fallbackReason: "fetch_failed",
      });
    }

    try {
      const status = await fetchOperationalStatus(forceFresh);
      setLayersStatus({
        flights: status.layers?.flights ?? null,
        vessels: status.layers?.vessels ?? null,
        satellites: status.layers?.satellites ?? null,
        social: status.layers?.social ?? null,
      });
      setSystemStatus({
        automation: status.automation ?? null,
        aiCallsToday: status.automation?.aiCallsToday ?? 0,
        aiRemainingToday: status.automation?.aiRemainingToday ?? 0,
      });
    } catch {
      setFeedState({
        status: "warning",
        message: "Data feed temporarily unavailable. Last cached intelligence shown.",
      });
    }
  }, [selectedLens]);

  // ── Live data fetching — runs once on mount, then every 15 min ───────────────
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 15 * 60 * 1000);
    return () => { clearInterval(interval); };
  }, [refreshData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BRIEFING_PANEL_STORAGE_KEY, String(Boolean(panelVisibility.briefing)));
    window.localStorage.setItem(ACTIVE_SIGNALS_STORAGE_KEY, String(Boolean(panelVisibility.events)));
    window.localStorage.setItem(MARKET_PANEL_STORAGE_KEY, String(Boolean(panelVisibility.marketImpact)));
  }, [panelVisibility.briefing, panelVisibility.events, panelVisibility.marketImpact]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BRIEFING_COMPACT_STORAGE_KEY, String(Boolean(briefingCompactDismissed)));
  }, [briefingCompactDismissed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(INTRO_STORAGE_KEY, String(Boolean(introDismissed)));
  }, [introDismissed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const contextState = Object.fromEntries(
      Object.keys(CONTEXT_LAYER_DEFS).map((key) => [key, Boolean(activeLayers[key])])
    );
    window.localStorage.setItem(CONTEXT_LAYER_STORAGE_KEY, JSON.stringify(contextState));
  }, [activeLayers.contextChokepoints, activeLayers.contextPorts, activeLayers.contextAirports, activeLayers.contextEnergy]);

  useEffect(() => {
    let cancelled = false;
    if (!activeLayers.flights) return undefined;

    fetchFlightsLive()
      .then((result) => {
        if (cancelled) return;
        setFlights(result.data ?? []);
        setLayersStatus((current) => ({ ...current, flights: result.quota ?? current.flights }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeLayers.flights]);

  useEffect(() => {
    if (!layersStatus.vessels?.enabled || !layersStatus.vessels?.configured) {
      setActiveLayers((current) => ({ ...current, vessels: false }));
      setPanelVisibility((current) => ({ ...current, vessels: false }));
    }
  }, [layersStatus.vessels]);

  useEffect(() => {
    if (!layersStatus.social?.enabled || !layersStatus.social?.configured) {
      setActiveLayers((current) => ({ ...current, social: false }));
      setPanelVisibility((current) => ({ ...current, social: false }));
    }
  }, [layersStatus.social]);

  useEffect(() => {
    let cancelled = false;
    if (!activeLayers.satellites) return undefined;

    fetchSatellitesLive()
      .then((result) => {
        if (cancelled) return;
        setSatellites(result.data ?? []);
        setLayersStatus((current) => ({ ...current, satellites: result.quota ?? current.satellites }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeLayers.satellites]);

  useEffect(() => {
    let cancelled = false;
    if (!activeLayers.social) return undefined;

    fetchSocialSignalsLive()
      .then((result) => {
        if (cancelled) return;
        setSocialSignals(result.data ?? []);
        setLayersStatus((current) => ({ ...current, social: result.quota ?? current.social }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeLayers.social]);

  const handleAdminUnlock = useCallback(() => {
    const secret = window.prompt("Enter operator secret to unlock controls for this session.");
    if (!secret) return;
    setAdminSession({ unlocked: true, secret });
  }, []);

  const handleAdminRefresh = useCallback(async (mode = "full") => {
    const secret = adminSession.secret || window.prompt("Enter operator secret to refresh the pipeline.");
    if (!secret) return;
    if (!adminSession.secret) {
      setAdminSession({ unlocked: true, secret });
    }

    setRefreshState({ status: "running", message: mode === "ai" ? "Checking AI enrichment status..." : "Checking live feeds...", detail: null });
    try {
      const query = mode && mode !== "full" ? `?mode=${encodeURIComponent(mode)}` : "";
      const res = await fetch(resolveBackendUrl(`/api/v1/admin/refresh${query}`), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed with ${res.status}`);
      }

      await refreshData(true);
      const result = data.result ?? {};
      setRefreshState({ status: "success", message: formatRefreshMessage(result) || "Refresh complete.", detail: result });
      window.setTimeout(() => setRefreshState({ status: "idle", message: "", detail: result }), 6000);
    } catch (err) {
      setRefreshState({ status: "error", message: err.message, detail: null });
    }
  }, [adminSession.secret, refreshData]);

  const timelineEvents = useMemo(
    () => filterEventsByTimeWindow(liveEvents, timelineHours, timelineSlider),
    [liveEvents, timelineHours, timelineSlider]
  );

  // ── Filtered event list — recalculated when prefs or live data changes ────────
  const filteredEvents = useMemo(() => {
    const filtered = filterEvents(timelineEvents, prefs).map((event) => ({
      ...event,
      watchlistMatch: eventMatchesWatchlist(event, watchlist),
      priorityQueueScore: computeActiveSignalPriority(event),
    }));
    const lensApplied = distributeContactPositions(applyDecisionLens(filtered, selectedLens));
    return applyVisibleSignalDiversity(sortActiveSignals(lensApplied, activeSignalSort), activeSignalSort).map((event) => ({
      ...event,
      priorityQueueScore: computeActiveSignalPriority(event),
    }));
  }, [timelineEvents, prefs, watchlist, selectedLens, activeSignalSort]);

  const conflictZones = useMemo(
    () => deriveConflictZones(filteredEvents),
    [filteredEvents]
  );

  const liveTopEvents = useMemo(
    () => [...filteredEvents].sort((a, b) => (b.lensPriorityScore ?? b.priorityScore ?? 0) - (a.lensPriorityScore ?? a.priorityScore ?? 0)).slice(0, 5),
    [filteredEvents]
  );

  const marketImpact = useMemo(
    () => aggregateMarketImpact(filteredEvents, marketData),
    [filteredEvents, marketData]
  );
  const strategicBrief = useMemo(
    () => buildStrategicBrief(filteredEvents, { ...systemStatus, marketSummary: marketData?.summary ?? null }, selectedLens),
    [filteredEvents, systemStatus, selectedLens, marketData]
  );
  const strategicSituations = useMemo(
    () => buildStrategicSituations(filteredEvents),
    [filteredEvents]
  );
  const selectedMarketImpact = selectedMarketKey ? marketImpact[selectedMarketKey] ?? null : null;

  const confidenceStats = useMemo(() => {
    const total = Math.max(filteredEvents.length, 1);
    const high = filteredEvents.filter((event) => event.confidence === "High").length;
    const medium = filteredEvents.filter((event) => event.confidence === "Medium").length;
    const low = filteredEvents.filter((event) => event.confidence === "Low").length;
    const overall = Math.max(18, Math.min(94, Math.round(((high * 0.92) + (medium * 0.66) + (low * 0.34)) / total * 100)));
    return {
      overall,
      bands: [
        { label: "High", value: Math.round((high / total) * 100), color: "#ff5f6f" },
        { label: "Medium", value: Math.round((medium / total) * 100), color: "#ffb648" },
        { label: "Low", value: Math.round((low / total) * 100), color: "#6ea7d2" },
      ],
      updatedAt: new Date().toISOString().slice(11, 19) + " UTC",
    };
  }, [filteredEvents]);

  const visibleLayerEntries = useMemo(() => {
    return Object.entries(LAYER_DEFS).filter(([key]) => {
      if (key === "events" || key === "intelBoard") return true;
      if (key === "conflictZones") return true;
      if (key.startsWith("context")) return true;
      if (key === "flights") return Boolean(layersStatus.flights?.enabled && layersStatus.flights?.configured);
      if (key === "satellites") return Boolean(layersStatus.satellites?.enabled && layersStatus.satellites?.configured);
      if (key === "vessels") return Boolean(layersStatus.vessels?.enabled && layersStatus.vessels?.configured);
      if (key === "social") return Boolean(layersStatus.social?.enabled && layersStatus.social?.configured);
      return false;
    });
  }, [layersStatus]);

  const lensConfig = useMemo(() => DECISION_LENSES.find((lens) => lens.id === selectedLens) ?? DECISION_LENSES[0], [selectedLens]);

  const timelineCursorLabel = useMemo(() => {
    if (liveEvents.length === 0) return "No live events";
    const newest = Math.max(...liveEvents.map((event) => new Date(event.timestamp ?? Date.now()).getTime()));
    const windowStart = newest - timelineHours * 3600_000;
    const cutoff = windowStart + (timelineSlider / 100) * (newest - windowStart);
    return new Date(cutoff).toISOString().slice(0, 16).replace("T", " ");
  }, [liveEvents, timelineHours, timelineSlider]);

  const toggleWatchlistValue = useCallback((type, value) => {
    setWatchlist((current) => {
      const bucket = current[type];
      const nextBucket = bucket.includes(value)
        ? bucket.filter((item) => item !== value)
        : [...bucket, value];
      return { ...current, [type]: nextBucket };
    });
  }, []);

  const handleBriefingSelect = useCallback((eventId) => {
    const event = liveEvents.find((item) => item.id === eventId);
    if (!event) return;
    setTimelineSlider(100);
    sceneRef.current.focusCameraOnEvent?.(event);
    setSelectedZone(null);
    setSelectedObject(null);
    setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
    setSelectedEvent(event);
    setActiveScenario(0);
  }, [liveEvents]);

  const handleOpenBriefing = useCallback(() => {
    setBriefingCompactDismissed(false);
    setPanelVisibility((current) => ({
      ...current,
      briefing: true,
      marketImpact: false,
      dataConfidence: false,
    }));
  }, []);

  const handleCloseBriefing = useCallback(() => {
    setPanelVisibility((current) => ({ ...current, briefing: false }));
  }, []);

  const handleDismissBriefingCompact = useCallback(() => {
    setBriefingCompactDismissed(true);
  }, []);

  const handleRestoreBriefingCompact = useCallback(() => {
    setBriefingCompactDismissed(false);
  }, []);

  const handleOpenMethodology = useCallback(() => {
    setIntroDismissed(true);
    setShowMethodology(true);
    setPanelVisibility((current) => ({ ...current, briefing: false, marketImpact: false, dataConfidence: false }));
  }, []);

  const handleExpandMarketImpact = useCallback(() => {
    setPanelVisibility((current) => ({
      ...current,
      marketImpact: true,
      briefing: false,
      dataConfidence: false,
    }));
  }, []);

  const handleReturnToGlobalView = useCallback(() => {
    sceneRef.current.resetGlobalView?.();
    setSelectedEvent(null);
    setSelectedZone(null);
    setSelectedObject(null);
    setActiveScenario(0);
    setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
  }, []);

  useEffect(() => {
    if (selectedEvent && !filteredEvents.some((event) => event.id === selectedEvent.id)) {
      setSelectedEvent(null);
      setActiveScenario(0);
    }
  }, [filteredEvents, selectedEvent]);

  useEffect(() => {
    if (selectedZone && !conflictZones.some((zone) => zone.id === selectedZone.id)) {
      setSelectedZone(null);
    }
  }, [conflictZones, selectedZone]);

  useEffect(() => {
    if (!selectedObject) return;
    if (selectedObject.type === "flight" && !activeLayers.flights) setSelectedObject(null);
    if (selectedObject.type === "vessel" && !activeLayers.vessels) setSelectedObject(null);
    if (selectedObject.type === "satellite" && !activeLayers.satellites) setSelectedObject(null);
    if (selectedObject.type === "context" && !Object.keys(CONTEXT_LAYER_DEFS).some((key) => activeLayers[key])) setSelectedObject(null);
  }, [activeLayers.flights, activeLayers.satellites, activeLayers.vessels, activeLayers.contextChokepoints, activeLayers.contextPorts, activeLayers.contextAirports, activeLayers.contextEnergy, selectedObject]);

  // ── Toggle a live layer ──────────────────────────────────────────────────────
  const handleLayerToggle = useCallback(key => {
    setActiveLayers(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (key === "intelBoard") {
        setPanelVisibility((current) => ({
          ...current,
          events: next[key],
          briefing: next[key],
          marketImpact: next[key],
          dataConfidence: next[key],
          timeline: next[key],
        }));
        return next;
      }

      if (key === "events") {
        setPanelVisibility((current) => ({ ...current, events: next[key] }));
      }

      if (key === "flights" || key === "vessels" || key === "satellites") {
        setPanelVisibility((current) => ({ ...current, [key]: next[key] }));
      }
      if (key === "social") {
        setPanelVisibility((current) => ({ ...current, social: next[key] }));
      }

      const layers = sceneRef.current.liveLayers;
      if (layers && layers[key]) layers[key].visible = next[key];
      return next;
    });
  }, []);

  // ── Three.js scene init ──────────────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const W = container.clientWidth  || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;
    const mob     = W < 768;
    const isLowEnd = mob && window.devicePixelRatio > 2;

    const renderer = new THREE.WebGLRenderer({ antialias: !isLowEnd, alpha: false });
    renderer.setPixelRatio(mob ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x020810, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mob ? 0.92 : 0.97;
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(mob ? 50 : 42, W / H, 0.01, 120);
    const initRadius = mob ? 2.4 : 2.75;
    camera.position.set(0, 0, initRadius);

    // Lights
    scene.add(new THREE.HemisphereLight(0x21354a, 0x06090f, 1.5));
    scene.add(new THREE.AmbientLight(0x0b1220, 0.75));
    const sun = new THREE.DirectionalLight(0xe6edf6, 1.95);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x39536f, 0.65);
    scene.add(fill);
    let sunLive = true;
    let lastSunMinute = -1;
    const fixedSunDirection = new THREE.Vector3(5.8, 2.6, 4.4).normalize();
    const computeSunDirection = () => {
      if (!sunLive) return fixedSunDirection.clone();
      const now = new Date();
      const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const dayOfYear = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
      const subsolarLng = 180 - (minutes / 1440) * 360;
      const declination = 23.44 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
      return geoToVec3(declination, subsolarLng, 1).normalize();
    };
    const updateSunLighting = (force = false) => {
      const now = new Date();
      const minuteKey = now.getUTCFullYear() * 600000 + now.getUTCMonth() * 40000 + now.getUTCDate() * 1500 + now.getUTCHours() * 60 + now.getUTCMinutes();
      if (!force && minuteKey === lastSunMinute) return;
      lastSunMinute = minuteKey;
      const sunDir = computeSunDirection();
      sun.position.copy(sunDir.clone().multiplyScalar(6.2));
      fill.position.copy(sunDir.clone().multiplyScalar(-4.5));
    };
    updateSunLighting(true);

    // Globe
    const segs = mob ? 48 : 96;
    const globeMap = makeSolidEarthFallbackTexture();
    const globeRelief = makeFlatScalarTexture(118);
    const globeRoughness = makeFlatScalarTexture(214);
    const cloudMap = makeTransparentTexture();
    const globeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, segs, segs),
      new THREE.MeshStandardMaterial({
        map: globeMap,
        bumpMap: globeRelief,
        roughnessMap: globeRoughness,
        bumpScale: mob ? 0.03 : 0.048,
        roughness: 0.94,
        metalness: 0.0,
        color: new THREE.Color(0xffffff),
        emissive: new THREE.Color(0x010203),
        emissiveIntensity: 0.012,
        transparent: false,
        opacity: 1.0,
      })
    );
    globeMesh.material.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), mob ? 4 : 8);
    globeMesh.material.bumpMap.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    globeMesh.material.roughnessMap.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    globeMesh.renderOrder = 0;
    scene.add(globeMesh);

    const cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.012, mob ? 36 : 72, mob ? 36 : 72),
      new THREE.MeshStandardMaterial({
        map: cloudMap,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
        color: new THREE.Color(0xd6e2ef),
      })
    );
    cloudLayer.material.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 2);
    cloudLayer.renderOrder = 0.5;
    scene.add(cloudLayer);

    const textureLoader = new THREE.TextureLoader();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    let cancelled = false;
    Promise.allSettled([
      loadTextureAsync(textureLoader, "/assets/globe/earth-albedo.jpg", {
        colorSpace: THREE.SRGBColorSpace,
        anisotropy: Math.min(maxAnisotropy, mob ? 4 : 8),
      }),
      loadTextureAsync(textureLoader, "/assets/globe/earth-land-ocean-mask.jpg", {
        anisotropy: Math.min(maxAnisotropy, 4),
      }),
      loadTextureAsync(textureLoader, "/assets/globe/earth-bump.jpg", {
        anisotropy: Math.min(maxAnisotropy, 4),
      }),
      loadTextureAsync(textureLoader, "/assets/globe/earth-clouds.jpg", {
        colorSpace: THREE.SRGBColorSpace,
        anisotropy: Math.min(maxAnisotropy, 2),
      }),
    ]).then((results) => {
      if (cancelled) return;

      const [albedoResult, maskResult, bumpResult, cloudResult] = results;
      const albedoTexture = albedoResult.status === "fulfilled" ? albedoResult.value : null;
      const maskTexture = maskResult.status === "fulfilled" ? maskResult.value : null;
      const bumpTexture = bumpResult.status === "fulfilled" ? bumpResult.value : null;
      const cloudTexture = cloudResult.status === "fulfilled" ? cloudResult.value : null;

      if (albedoTexture?.image && maskTexture?.image) {
        const compositeTexture = buildDarkEarthCompositeTexture(
          albedoTexture.image,
          maskTexture.image,
          Math.min(maxAnisotropy, mob ? 4 : 8)
        );
        globeMesh.material.map = compositeTexture;
      }

      if (bumpTexture) {
        globeMesh.material.bumpMap = bumpTexture;
      }

      if (maskTexture) {
        globeMesh.material.roughnessMap = maskTexture;
      }

      if (cloudTexture) {
        cloudLayer.material.map = cloudTexture;
        cloudLayer.material.opacity = 0.0;
      }

      globeMesh.material.needsUpdate = true;
      cloudLayer.material.needsUpdate = true;
    });

    // Atmosphere
    const atm = makeAtmosphere();
    scene.add(atm);

    // Stars
    scene.add(makeStars());

    // Hotspots
    const hotspotLayer = new THREE.Group();
    scene.add(hotspotLayer);
    const zoneLayer = new THREE.Group();
    scene.add(zoneLayer);
    let clickableObjects = [];
    let interactiveEvents = [];
    let interactiveZones = [];

    // Impact layer (rebuilt on selection)
    let impactLayer = new THREE.Group();
    scene.add(impactLayer);

    // Country borders
    const borderLayer = new THREE.Group();
    scene.add(borderLayer);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x69b8d6, transparent: true, opacity: 0.28,
      depthTest: false, depthWrite: false,
    });
    const GEOJSON_URLS = [
      "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json",
      "https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson",
      "https://unpkg.com/world-atlas@2/countries-110m.json",
    ];
    function topoToGeo(topo) {
      const arcs = topo.arcs;
      function decodeArc(arcIdx) {
        const reverse = arcIdx < 0;
        const arc = arcs[reverse ? ~arcIdx : arcIdx];
        let x = 0, y = 0;
        const pts = arc.map(([dx, dy]) => { x += dx; y += dy; return [x, y]; });
        if (reverse) pts.reverse();
        return pts;
      }
      function arcsToPoly(rings) {
        return rings.map(ring => {
          const coords = [];
          ring.forEach(ai => coords.push(...decodeArc(ai)));
          const [sx, sy] = topo.transform.scale;
          const [tx, ty] = topo.transform.translate;
          return coords.map(([cx, cy]) => [cx * sx + tx, cy * sy + ty]);
        });
      }
      const objKey = Object.keys(topo.objects)[0];
      const geoms  = topo.objects[objKey].geometries;
      return {
        type: "FeatureCollection",
        features: geoms.map((g, i) => ({
          type: "Feature", id: i, properties: g.properties || {},
          geometry: g.type === "Polygon"
            ? { type: "Polygon",      coordinates: arcsToPoly(g.arcs) }
            : { type: "MultiPolygon", coordinates: g.arcs.map(p => arcsToPoly(p)) },
        })),
      };
    }
    (async () => {
      for (const url of GEOJSON_URLS) {
        try {
          const resp = await fetch(url, { cache: "force-cache" });
          if (!resp.ok) continue;
          let data = await resp.json();
          if (data.type !== "FeatureCollection" && data.objects) data = topoToGeo(data);
          const lineGeo = buildBorderLines(data);
          if (lineGeo.attributes.position.count < 100) continue;
          const lines = new THREE.LineSegments(lineGeo, borderMat);
          lines.renderOrder = 1;
          borderLayer.add(lines);
          setBordersLoaded(true);
          break;
        } catch { /* try next */ }
      }
    })();

    const flightLayer = new THREE.Group();
    const vesselLayer = new THREE.Group();
    const satelliteLayer = new THREE.Group();
    const contextLayer = new THREE.Group();
    flightLayer.visible = false;
    vesselLayer.visible = false;
    satelliteLayer.visible = false;
    contextLayer.visible = true;
    scene.add(flightLayer, vesselLayer, satelliteLayer, contextLayer);

    function rebuildSimpleLayer(layer, items, type) {
      while (layer.children.length > 0) {
        const child = layer.children[0];
        layer.remove(child);
        child.traverse((obj) => {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
        });
      }

      items.forEach((item) => {
        layer.add(makeObjectMarker(item, type));
      });
    }

    function rebuildContextLayer(layerState = {}) {
      while (contextLayer.children.length > 0) {
        const child = contextLayer.children[0];
        contextLayer.remove(child);
        child.traverse((obj) => {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
        });
      }

      for (const key of Object.keys(CONTEXT_LAYER_DEFS)) {
        if (!layerState[key]) continue;
        getContextItemsForLayer(key).forEach((item) => {
          contextLayer.add(makeContextMarker(item));
        });
      }
    }

    function collectClickableObjects() {
      clickableObjects = [];
      [hotspotLayer, zoneLayer, flightLayer, vesselLayer, satelliteLayer, contextLayer].forEach((layer) => {
        layer.traverse((obj) => {
          if (obj.userData.clickable) clickableObjects.push(obj);
        });
      });
    }

    function syncVisibleEvents(events, zones = []) {
      interactiveEvents = events;
      interactiveZones = zones;

      while (hotspotLayer.children.length > 0) {
        const child = hotspotLayer.children[0];
        hotspotLayer.remove(child);
        child.traverse((obj) => {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
        });
      }
      while (zoneLayer.children.length > 0) {
        const child = zoneLayer.children[0];
        zoneLayer.remove(child);
        child.traverse((obj) => {
          obj.geometry?.dispose?.();
          obj.material?.dispose?.();
          obj.material?.map?.dispose?.();
        });
      }

      interactiveEvents.filter((ev) => ev.hasRenderableLocation !== false).forEach((ev) => {
        const hs = makeHotspot(ev);
        hotspotLayer.add(hs);
      });
      interactiveZones.forEach((zone) => {
        zoneLayer.add(makeConflictZoneMarker(zone));
      });
      collectClickableObjects();
    }

    // ── Camera state ─────────────────────────────────────────────────────────
    const cam = {
      theta: 0.3, phi: 1.25, radius: initRadius,
      targetTheta: 0.3, targetPhi: 1.25, targetRadius: initRadius,
      dragging: false, lastX: 0, lastY: 0, autoSpin: true, spinTimer: null,
      thetaVelocity: 0, phiVelocity: 0,
    };
    const DRAG_SENS = mob ? 0.007 : 0.006;
    const ZOOM_MIN  = mob ? 1.5 : 1.35;
    const ZOOM_MAX  = mob ? 4.5 : 5.5;
    const LERP_SPD  = mob ? 0.10 : 0.072;

    const resumeSpin = () => {
      clearTimeout(cam.spinTimer);
      cam.spinTimer = setTimeout(() => { cam.autoSpin = true; }, 2800);
    };

    const applyCam = () => {
      const s = Math.sin(cam.phi);
      camera.position.set(cam.radius*s*Math.sin(cam.theta), cam.radius*Math.cos(cam.phi), cam.radius*s*Math.cos(cam.theta));
      camera.lookAt(0, 0, 0);
    };

    function resetGlobalView() {
      cam.targetTheta = 0.3;
      cam.targetPhi = 1.25;
      cam.targetRadius = initRadius;
      cam.thetaVelocity = 0;
      cam.phiVelocity = 0;
      cam.autoSpin = true;
    }

    function focusCameraOnEvent(ev) {
      if (!Number.isFinite(ev.lat) || !Number.isFinite(ev.lng)) return;
      const normal = geoToVec3(ev.lat, ev.lng, 1).normalize();
      cam.targetTheta  = Math.atan2(normal.x, normal.z);
      cam.targetPhi    = Math.max(0.25, Math.min(Math.PI - 0.25, Math.acos(normal.y)));
      cam.targetRadius = mob ? 1.9 : 2.05;
      cam.autoSpin     = false;
      cam.thetaVelocity = 0;
      cam.phiVelocity = 0;
      resumeSpin();
    }

    // Interaction
    const raycaster = new THREE.Raycaster();
    const resolveVisibleHit = (hits) => hits.find((entry) => {
      const group = entry.object.userData.markerGroup ?? entry.object.parent;
      return group?.userData?.clickableActive !== false && (group?.userData?.visibilityAlpha ?? 1) > 0.16;
    });
    const getNDC = (cx, cy) => {
      const r = container.getBoundingClientRect();
      return new THREE.Vector2(((cx-r.left)/r.width)*2-1, -((cy-r.top)/r.height)*2+1);
    };

    let mouseDownX = 0, mouseDownY = 0;

    const onMouseDown = e => {
      cam.dragging = true; cam.autoSpin = false;
      cam.lastX = mouseDownX = e.clientX;
      cam.lastY = mouseDownY = e.clientY;
      container.style.cursor = "grabbing";
    };
    const onMouseMove = e => {
      if (cam.dragging) {
        const dx = e.clientX - cam.lastX, dy = e.clientY - cam.lastY;
        cam.lastX = e.clientX; cam.lastY = e.clientY;
        cam.targetTheta -= dx * DRAG_SENS;
        cam.targetPhi    = Math.max(0.15, Math.min(Math.PI-0.15, cam.targetPhi - dy*DRAG_SENS));
        cam.thetaVelocity = -dx * DRAG_SENS * 0.28;
        cam.phiVelocity = -dy * DRAG_SENS * 0.18;
        return;
      }
      // Hover tooltip (desktop)
      raycaster.setFromCamera(getNDC(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(clickableObjects, false);
      const visibleHit = resolveVisibleHit(hits);
      if (visibleHit) {
        const hit = visibleHit.object.userData;
        let tooltipText = null;
        if (hit.objectType === "event") {
          const ev2 = interactiveEvents.find(ev => ev.id === hit.eventId);
          tooltipText = ev2 ? `${ev2.title}\n${ev2.location?.label ?? "Location under review"} · Geo accuracy: ${ev2.geoAccuracy?.label ?? "Approximate"}\n${ev2.category ?? "Political"} · ${ev2.tone} · Impact ${ev2.impactScore ?? ev2.importanceScore ?? 0}` : null;
        } else if (hit.objectType === "zone") {
          const zone = hit.objectData;
          tooltipText = zone ? `${zone.label}\n${zone.eventCount} events · ${zone.sourcesCount} sources` : null;
        } else {
          const obj = hit.objectData;
          tooltipText = hit.objectType === "context" && obj
            ? `${obj.name}\n${obj.type} · ${obj.region}\nContext layer · ${String(obj.geoAccuracy ?? "approximate").replace("_", " ")}`
            : obj?.title ?? obj?.name ?? obj?.flightNumber ?? null;
        }
        setTooltip({ text: tooltipText, x: e.clientX, y: e.clientY });
        container.style.cursor = "pointer";
      } else {
        setTooltip({ text: null, x: 0, y: 0 });
        container.style.cursor = "grab";
      }
    };
    const onMouseUp = e => {
      const wasDrag = Math.abs(e.clientX-mouseDownX) > 5 || Math.abs(e.clientY-mouseDownY) > 5;
      cam.dragging = false;
      container.style.cursor = "grab";
      resumeSpin();
      if (wasDrag) return;
      raycaster.setFromCamera(getNDC(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(clickableObjects, false);
      const visibleHit = resolveVisibleHit(hits);
      if (visibleHit) {
        const hit = visibleHit.object.userData;
        if (hit.objectType === "event") {
          const ev2 = interactiveEvents.find(ev => ev.id === hit.eventId);
          if (ev2) {
            setSelectedZone(null);
            setSelectedObject(null);
            setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
            setSelectedEvent(ev2);
            setActiveScenario(0);
            focusCameraOnEvent(ev2);
          }
        } else if (hit.objectType === "zone") {
          setSelectedEvent(null);
          setSelectedObject(null);
          setSelectedZone(hit.objectData ?? null);
          setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
          if (hit.objectData) focusCameraOnEvent(hit.objectData);
        } else if (hit.objectData) {
          setSelectedZone(null);
          setSelectedEvent(null);
          setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
          setSelectedObject({ type: hit.objectType, data: hit.objectData });
          focusCameraOnEvent(hit.objectData);
        }
      }
    };
    const onWheel = e => {
      const d = e.deltaMode === 1 ? e.deltaY*30 : e.deltaY;
      cam.targetRadius = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.targetRadius + d*0.003));
      cam.autoSpin = false; resumeSpin();
    };

    let touchStartX = 0, touchStartY = 0, lastPinchDist = 0;
    const onTouchStart = e => {
      e.preventDefault(); cam.autoSpin = false;
      if (e.touches.length === 1) {
        cam.dragging = true;
        cam.lastX = touchStartX = e.touches[0].clientX;
        cam.lastY = touchStartY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        cam.dragging = false;
        lastPinchDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      }
    };
    const onTouchMove = e => {
      e.preventDefault();
      if (e.touches.length === 1 && cam.dragging) {
        const dx = e.touches[0].clientX-cam.lastX, dy = e.touches[0].clientY-cam.lastY;
        cam.lastX = e.touches[0].clientX; cam.lastY = e.touches[0].clientY;
        cam.targetTheta -= dx*DRAG_SENS;
        cam.targetPhi = Math.max(0.15, Math.min(Math.PI-0.15, cam.targetPhi - dy*DRAG_SENS));
        cam.thetaVelocity = -dx * DRAG_SENS * 0.3;
        cam.phiVelocity = -dy * DRAG_SENS * 0.2;
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
        cam.targetRadius = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.targetRadius*(lastPinchDist/d)));
        lastPinchDist = d;
      }
    };
    const onTouchEnd = e => {
      cam.dragging = false; resumeSpin();
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        if (Math.abs(t.clientX-touchStartX) < 10 && Math.abs(t.clientY-touchStartY) < 10) {
          raycaster.setFromCamera(getNDC(t.clientX, t.clientY), camera);
          const hits = raycaster.intersectObjects(clickableObjects, false);
          const visibleHit = resolveVisibleHit(hits);
          if (visibleHit) {
            const hit = visibleHit.object.userData;
            if (hit.objectType === "event") {
              const ev2 = interactiveEvents.find(ev => ev.id === hit.eventId);
              if (ev2) {
                setSelectedZone(null);
                setSelectedObject(null);
                setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
                setSelectedEvent(ev2);
                setActiveScenario(0);
                focusCameraOnEvent(ev2);
              }
            } else if (hit.objectType === "zone") {
              setSelectedEvent(null);
              setSelectedObject(null);
              setSelectedZone(hit.objectData ?? null);
              setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
              if (hit.objectData) focusCameraOnEvent(hit.objectData);
            } else if (hit.objectData) {
              setSelectedZone(null);
              setSelectedEvent(null);
              setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
              setSelectedObject({ type: hit.objectType, data: hit.objectData });
              focusCameraOnEvent(hit.objectData);
            }
          }
        }
      }
    };

    const onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      camera.aspect = w/h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    renderer.domElement.addEventListener("mousedown",  onMouseDown);
    window.addEventListener             ("mousemove",  onMouseMove);
    window.addEventListener             ("mouseup",    onMouseUp);
    renderer.domElement.addEventListener("wheel",      onWheel, { passive: true });
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: false });
    renderer.domElement.addEventListener("touchmove",  onTouchMove,  { passive: false });
    renderer.domElement.addEventListener("touchend",   onTouchEnd);
    window.addEventListener("resize", onResize);

    // Store refs
    sceneRef.current = {
      cam, scene, focusCameraOnEvent, hotspotLayer, zoneLayer, resetGlobalView,
      setLiveSunEnabled: (enabled) => {
        sunLive = enabled !== false;
        updateSunLighting(true);
      },
      liveLayers: { flights: flightLayer, vessels: vesselLayer, satellites: satelliteLayer, context: contextLayer },
      setSelectedEventHighlight: (selectedId) => {
        hotspotLayer.children.forEach((group) => {
          const isSelected = group.userData.eventId === selectedId;
          group.userData.isSelected = isSelected;
          group.userData.dimmed = Boolean(selectedId) && !isSelected;
        });
      },
      syncVisibleEvents,
      syncObjectLayer: (type, items) => {
        if (type === "flights") rebuildSimpleLayer(flightLayer, items, "flight");
        if (type === "vessels") rebuildSimpleLayer(vesselLayer, items, "vessel");
        if (type === "satellites") rebuildSimpleLayer(satelliteLayer, items, "satellite");
        collectClickableObjects();
      },
      syncContextLayers: (layerState) => {
        rebuildContextLayer(layerState);
        collectClickableObjects();
      },
      rebuildImpact: (event, scenarioIdx) => {
        scene.remove(impactLayer);
        impactLayer.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
        impactLayer = buildImpactLayer(event, scenarioIdx);
        scene.add(impactLayer);
        sceneRef.current.impactLayer = impactLayer;
      },
    };

    rebuildContextLayer(activeLayers);
    syncVisibleEvents(filteredEvents, activeLayers.conflictZones ? conflictZones : []);

    // ── Animation loop ────────────────────────────────────────────────────────
    let rafId;
    const clock = new THREE.Clock();

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();

      atm.material.uniforms.time.value = t;
      cloudLayer.rotation.y += mob ? 0.00008 : 0.00011;
      updateSunLighting(false);
      if (cam.autoSpin) cam.targetTheta += mob ? 0.0005 : 0.0007;
      if (!cam.dragging && Math.abs(cam.thetaVelocity) > 0.00005) {
        cam.targetTheta += cam.thetaVelocity;
        cam.thetaVelocity *= 0.92;
      }
      if (!cam.dragging && Math.abs(cam.phiVelocity) > 0.00005) {
        cam.targetPhi = Math.max(0.15, Math.min(Math.PI - 0.15, cam.targetPhi + cam.phiVelocity));
        cam.phiVelocity *= 0.9;
      }

      cam.theta  += (cam.targetTheta  - cam.theta)  * LERP_SPD;
      cam.phi    += (cam.targetPhi    - cam.phi)    * LERP_SPD;
      cam.radius += (cam.targetRadius - cam.radius) * LERP_SPD;
      applyCam();

      const cameraDirection = camera.position.clone().normalize();
      [hotspotLayer, zoneLayer, flightLayer, vesselLayer, satelliteLayer].forEach((layer) => {
        layer.children.forEach((group) => {
          const surfaceNormal = group.userData.surfaceNormal;
          if (!surfaceNormal) return;
          const alpha = getMarkerVisibilityAlpha(surfaceNormal, cameraDirection);
          group.userData.visibilityAlpha = alpha;
          group.userData.clickableActive = alpha > 0.16;
          group.traverse((obj) => {
            if (!obj.material) return;
            const baseOpacity = obj.userData.baseOpacity ?? obj.material.opacity ?? 1;
            if (!obj.userData.pulse) {
              obj.material.opacity = baseOpacity * alpha;
            }
            obj.visible = alpha > 0.03;
          });
        });
      });

      // Hotspot pulse
      hotspotLayer.children.forEach(group => {
        const groupAlpha = group.userData.visibilityAlpha ?? 1;
        const emphasis = group.userData.isSelected ? 1.18 : 1;
        const dimAlpha = group.userData.dimmed ? 0.22 : 1;
        group.traverse(obj => {
          if (!obj.userData.pulse) return;
          const s = obj.userData;
          const beat = Math.sin(t * s.speed + (s.phase ?? 0));
          const sc   = emphasis * (1 + 0.55 * Math.max(0, beat));
          obj.scale.set(sc, sc, 1);
          obj.material.opacity = s.base * (0.2 + 0.8 * Math.max(0, beat)) * groupAlpha * dimAlpha;
        });
        group.traverse((obj) => {
          if (obj.userData.pulse || !obj.material) return;
          const baseOpacity = obj.userData.baseOpacity ?? obj.material.opacity ?? 1;
          obj.material.opacity = baseOpacity * groupAlpha * dimAlpha;
        });
      });

      zoneLayer.children.forEach((group) => {
        const groupAlpha = group.userData.visibilityAlpha ?? 1;
        group.traverse((obj) => {
          if (obj.userData.pulse) {
            const beat = Math.sin(t * obj.userData.speed + (obj.userData.phase ?? 0));
            obj.scale.setScalar(1 + 0.06 * Math.max(0, beat));
            obj.material.opacity = obj.userData.base * (0.35 + 0.65 * Math.max(0, beat)) * groupAlpha;
            return;
          }
          if (!obj.material) return;
          const baseOpacity = obj.userData.baseOpacity ?? obj.material.opacity ?? 1;
          obj.material.opacity = baseOpacity * groupAlpha;
        });
      });

      [flightLayer, vesselLayer, satelliteLayer].forEach((layer) => {
        layer.children.forEach((group) => {
          const groupAlpha = group.userData.visibilityAlpha ?? 1;
          group.traverse((obj) => {
            if (!obj.userData.pulse) return;
            const s = obj.userData;
            const beat = Math.sin(t * s.speed + (s.phase ?? 0));
            obj.scale.setScalar(1 + 0.18 * Math.max(0, beat));
            obj.material.opacity = s.base * (0.24 + 0.76 * Math.max(0, beat)) * groupAlpha;
          });
        });
      });

      // Impact layer animation
      impactLayer.traverse(obj => {
        if (obj.userData.arcPts) {
          obj.userData.arcT = (obj.userData.arcT + obj.userData.arcSpeed * 0.005) % 1;
          const pts = obj.userData.arcPts;
          const idx = Math.min(Math.floor(obj.userData.arcT * pts.length), pts.length - 1);
          obj.position.copy(pts[idx]);
        }
        if (obj.userData.regionHalo) {
          obj.material.opacity = obj.userData.baseOpacity * (0.55 + 0.45 * Math.sin(t * 1.2));
        }
      });

      renderer.render(scene, camera);
    };
    tick();
    setReady(true);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(cam.spinTimer);
      renderer.domElement.removeEventListener("mousedown",  onMouseDown);
      window.removeEventListener             ("mousemove",  onMouseMove);
      window.removeEventListener             ("mouseup",    onMouseUp);
      renderer.domElement.removeEventListener("wheel",      onWheel);
      renderer.domElement.removeEventListener("touchstart", onTouchStart);
      renderer.domElement.removeEventListener("touchmove",  onTouchMove);
      renderer.domElement.removeEventListener("touchend",   onTouchEnd);
      window.removeEventListener("resize", onResize);
      cancelled = true;
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // Rebuild impact layer on event/scenario change
  useEffect(() => {
    sceneRef.current.rebuildImpact?.(selectedEvent, activeScenario);
  }, [selectedEvent, activeScenario]);

  useEffect(() => {
    sceneRef.current.setSelectedEventHighlight?.(selectedEvent?.id ?? null);
  }, [selectedEvent]);

  useEffect(() => {
    sceneRef.current.syncVisibleEvents?.(filteredEvents, activeLayers.conflictZones ? conflictZones : []);
  }, [filteredEvents, conflictZones, activeLayers.conflictZones]);

  useEffect(() => {
    sceneRef.current.setLiveSunEnabled?.(liveSunEnabled);
  }, [liveSunEnabled]);

  useEffect(() => {
    if (sceneRef.current.hotspotLayer) {
      sceneRef.current.hotspotLayer.visible = activeLayers.events;
    }
    if (sceneRef.current.zoneLayer) {
      sceneRef.current.zoneLayer.visible = activeLayers.events && activeLayers.conflictZones;
    }
  }, [activeLayers.events, activeLayers.conflictZones]);

  useEffect(() => {
    sceneRef.current.syncObjectLayer?.("flights", activeLayers.flights ? flights : []);
  }, [flights, activeLayers.flights]);

  useEffect(() => {
    sceneRef.current.syncObjectLayer?.("vessels", activeLayers.vessels ? vessels : []);
  }, [vessels, activeLayers.vessels]);

  useEffect(() => {
    sceneRef.current.syncObjectLayer?.("satellites", activeLayers.satellites ? satellites : []);
  }, [satellites, activeLayers.satellites]);

  useEffect(() => {
    sceneRef.current.syncContextLayers?.(activeLayers);
  }, [activeLayers.contextChokepoints, activeLayers.contextPorts, activeLayers.contextAirports, activeLayers.contextEnergy]);

  // Focus camera from sidebar click
  const focusEvent = useCallback(ev => {
    sceneRef.current.focusCameraOnEvent?.(ev);
    setSelectedZone(null);
    setSelectedObject(null);
    setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true, briefing: false }));
    setSelectedEvent(ev);
    setActiveScenario(0);
  }, []);

  const selectedDetail = selectedZone
    ? { type: "zone", data: selectedZone }
    : selectedObject ?? (selectedEvent ? { type: "event", data: selectedEvent } : null);

  const focusExternalObject = useCallback((selection) => {
    if (!selection?.data) return;
    setSelectedZone(null);
    setSelectedEvent(null);
    setPanelVisibility((current) => ({ ...current, selectedObjectDetail: true }));
    setSelectedObject(selection);
    sceneRef.current.focusCameraOnEvent?.(selection.data);
  }, []);

  const counts = useMemo(() => ({
    high:   filteredEvents.filter(e => e.intensity === "high").length,
    medium: filteredEvents.filter(e => e.intensity === "medium").length,
    low:    filteredEvents.filter(e => e.intensity === "low").length,
  }), [filteredEvents]);

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0 }
        html, body { width: 100%; height: 100%; background: #020810; overflow: hidden }
        ::-webkit-scrollbar { width: 3px }
        ::-webkit-scrollbar-thumb { background: #1a3a5a; border-radius: 2px }
        @keyframes panelIn { from { transform: translateX(28px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes dotPulse { from { opacity: 0.2; transform: scale(0.8) } to { opacity: 1; transform: scale(1.2) } }
      `}</style>

      {/* Root shell: full viewport, flex column so globe fills middle */}
      <div style={{ width: "100vw", height: "100vh", display: "flex",
        flexDirection: "column", position: "relative", overflow: "hidden" }}>

        {/* TOP BAR — fixed height, no flex shrink */}
        <TopBar counts={counts} bordersLoaded={bordersLoaded}
          activeLayers={activeLayers} onLayerToggle={handleLayerToggle}
          isMobile={isMobile}
          isTablet={isTablet}
          onWarRoom={() => setShowWarRoom(v => !v)}
          showWarRoom={showWarRoom}
          marketData={marketData}
          onPersonalize={() => setShowPersonalize(v => !v)}
          showPersonalize={showPersonalize}
          onAdminRefresh={handleAdminRefresh}
          refreshState={refreshState}
          layerEntries={visibleLayerEntries}
          activeView={activeView}
          onNavigate={onNavigate}
          systemStatus={systemStatus}
          adminUnlocked={adminSession.unlocked}
          onAdminUnlock={handleAdminUnlock}
          selectedLens={selectedLens}
          onLensChange={setSelectedLens}
          demoMode={DEMO_MODE}
          feedState={feedState}
          layersStatus={layersStatus}
          liveSunEnabled={liveSunEnabled}
          onToggleLiveSun={() => setLiveSunEnabled((current) => !current)} />

        {!isMobile && (
          <>
            {panelVisibility.timeline && activeLayers.intelBoard ? (
              <TimelinePanel
                modeHours={timelineHours}
                onModeChange={setTimelineHours}
                sliderPercent={timelineSlider}
                onSliderChange={setTimelineSlider}
                cursorLabel={timelineCursorLabel}
                visibleCount={filteredEvents.length}
                onClose={() => setPanelVisibility((current) => ({ ...current, timeline: false }))}
              />
            ) : null}
            {panelVisibility.briefing && activeLayers.intelBoard && !selectedDetail ? (
              <BriefingPanel
                briefing={briefing}
                strategicBrief={strategicBrief}
                selectedLens={selectedLens}
                onLensChange={setSelectedLens}
                onSelect={handleBriefingSelect}
                systemStatus={systemStatus}
                feedState={feedState}
                onClose={handleCloseBriefing}
              />
            ) : null}
            {showMethodology ? (
              <MethodologyPanel onClose={() => setShowMethodology(false)} />
            ) : null}
            {panelVisibility.marketImpact && activeLayers.intelBoard && !panelVisibility.briefing && !selectedMarketImpact && !showMethodology ? (
              <MarketImpactDashboard
                aggregate={marketImpact}
                emphasis={lensConfig.emphasis}
                onSelectCategory={setSelectedMarketKey}
                onClose={() => setPanelVisibility((current) => ({ ...current, marketImpact: false }))}
              />
            ) : null}
            {!panelVisibility.marketImpact && activeLayers.intelBoard && !panelVisibility.briefing && !selectedDetail && !selectedMarketImpact && !showMethodology ? (
              <MarketImpactCompactCard
                aggregate={marketImpact}
                onExpand={handleExpandMarketImpact}
                onSelectCategory={setSelectedMarketKey}
              />
            ) : null}
            {panelVisibility.dataConfidence && activeLayers.intelBoard && !panelVisibility.briefing && !showMethodology ? (
              <DataConfidencePanel
                stats={confidenceStats}
                onClose={() => setPanelVisibility((current) => ({ ...current, dataConfidence: false }))}
              />
            ) : null}
            {panelVisibility.flights && activeLayers.flights ? (
              <FlightsPanel
                flights={flights}
                status={layersStatus.flights}
                onSelect={focusExternalObject}
                onClose={() => setPanelVisibility((current) => ({ ...current, flights: false }))}
              />
            ) : null}
            {panelVisibility.vessels && activeLayers.vessels ? (
              <VesselsPanel
                vessels={vessels}
                status={layersStatus.vessels}
                search={vesselSearch}
                onSearchChange={setVesselSearch}
                onSelect={focusExternalObject}
                onClose={() => setPanelVisibility((current) => ({ ...current, vessels: false }))}
              />
            ) : null}
            {panelVisibility.satellites && activeLayers.satellites ? (
              <SatellitesPanel
                satellites={satellites}
                status={layersStatus.satellites}
                onSelect={focusExternalObject}
                onClose={() => setPanelVisibility((current) => ({ ...current, satellites: false }))}
              />
            ) : null}
            {panelVisibility.social && activeLayers.social ? (
              <SocialSignalsPanel
                signals={socialSignals}
                status={layersStatus.social}
                events={filteredEvents}
                onClose={() => setPanelVisibility((current) => ({ ...current, social: false }))}
              />
            ) : null}
            {selectedMarketImpact ? (
              <MarketImpactDetailPanel item={selectedMarketImpact} onClose={() => setSelectedMarketKey(null)} />
            ) : null}
          </>
        )}

        {/* GLOBE ROW — fills all remaining space between topbar and (on mobile) bottom sheet */}
        <div style={{
          position: "absolute",
      top: headerHeight,
          left: (!isMobile && panelVisibility.events && activeLayers.intelBoard) ? 284 : 0,
          right: (!isMobile && selectedDetail && panelVisibility.selectedObjectDetail) ? (selectedDetail.type === "event" ? 420 : 340) : 0,
          bottom: 0,
          transition: "left 0.3s ease, right 0.3s ease",
        }}>
          {/* Canvas mount */}
          <div ref={mountRef} style={{
            position: "absolute", inset: 0,
            touchAction: "none", userSelect: "none", WebkitUserSelect: "none",
          }}/>

          {/* Bottom hint */}
          {ready && !selectedEvent && (
            <div style={{ position: "absolute", bottom: isMobile ? "15vh" : 18,
              left: "50%", transform: "translateX(-50%)",
              color: "rgba(0,180,255,0.25)", fontSize: 10, fontFamily: mono,
              letterSpacing: "0.12em", textAlign: "center", pointerEvents: "none",
              whiteSpace: "nowrap", animation: "fadeUp 1.2s ease 0.8s both" }}>
              {isMobile ? "TAP A SIGNAL OR ZONE TO OPEN THE BRIEF" : "DRAG · SCROLL TO ZOOM · CLICK SIGNAL"}
            </div>
          )}
        </div>

        {selectedEvent || selectedZone || selectedObject ? (
          <GlobalViewButton onReset={handleReturnToGlobalView} mobile={isMobile} offsetLeft={panelVisibility.events && activeLayers.intelBoard ? 302 : 18} />
        ) : null}
        {!isMobile && activeLayers.intelBoard && !introDismissed && !selectedDetail && !panelVisibility.briefing ? (
          <IntroTrustCard
            leftOffset={panelVisibility.events && activeLayers.intelBoard ? 302 : 18}
            topOffset={headerHeight + 16}
            onDismiss={() => setIntroDismissed(true)}
            onMethodology={handleOpenMethodology}
          />
        ) : null}
        {!isMobile && activeLayers.intelBoard && introDismissed && !showMethodology ? (
          <HowToReadChip onOpen={handleOpenMethodology} />
        ) : null}
        {!isMobile && activeLayers.intelBoard && introDismissed && !panelVisibility.briefing && !selectedDetail && !briefingCompactDismissed ? (
          <BriefingCompactCard
            briefing={briefing}
            strategicBrief={strategicBrief}
            systemStatus={systemStatus}
            feedState={feedState}
            situations={strategicSituations}
            onOpen={handleOpenBriefing}
            onDismiss={handleDismissBriefingCompact}
            leftOffset={panelVisibility.events && activeLayers.intelBoard ? 302 : 18}
          />
        ) : null}
        {!isMobile && activeLayers.intelBoard && introDismissed && !panelVisibility.briefing && !selectedDetail && briefingCompactDismissed ? (
          <BriefingMiniChip
            onOpen={handleRestoreBriefingCompact}
            leftOffset={panelVisibility.events && activeLayers.intelBoard ? 302 : 18}
          />
        ) : null}
        {!isMobile ? (
          <LiveSunButton enabled={liveSunEnabled} onToggle={() => setLiveSunEnabled((current) => !current)} mobile={isMobile} offsetLeft={panelVisibility.events && activeLayers.intelBoard ? 302 : 18} />
        ) : null}

        {/* DESKTOP: Left sidebar */}
        {!isMobile && panelVisibility.events && activeLayers.intelBoard && (
          <DesktopSidebar
            events={filteredEvents}
            selectedEvent={selectedEvent}
            onSelect={focusEvent}
            modeHours={timelineHours}
            onModeChange={setTimelineHours}
            topOffset={headerHeight}
            sortMode={activeSignalSort}
            onSortChange={setActiveSignalSort}
            systemStatus={systemStatus}
            refreshState={refreshState}
            adminUnlocked={adminSession.unlocked}
            feedState={feedState}
            onCollapse={() => setPanelVisibility((current) => ({ ...current, events: false }))}
          />
        )}
        {!isMobile && !panelVisibility.events && activeLayers.intelBoard ? (
          <ActiveSignalsRail
            count={filteredEvents.length}
            topOffset={headerHeight}
            onExpand={() => setPanelVisibility((current) => ({ ...current, events: true }))}
          />
        ) : null}

        {/* WAR ROOM PANEL */}
        {showWarRoom && !isMobile && (
          <WarRoomPanel
            topEvents={liveTopEvents}
            onSelect={ev => { focusEvent(ev); }}
            selectedEventId={selectedEvent?.id}
            onClose={() => setShowWarRoom(false)}
            marketImpact={marketImpact}
            systemStatus={systemStatus}
            adminUnlocked={adminSession.unlocked}
            onAdminUnlock={handleAdminUnlock}
            onAdminRefresh={handleAdminRefresh}
            onOpenIntelBoard={() => onNavigate?.("classic")}
            refreshState={refreshState}
            demoMode={DEMO_MODE}
          />
        )}

        {showWarRoom && isMobile && (
          <WarRoomPanel
            topEvents={liveTopEvents}
            onSelect={(ev) => { focusEvent(ev); setShowWarRoom(false); }}
            selectedEventId={selectedEvent?.id}
            onClose={() => setShowWarRoom(false)}
            marketImpact={marketImpact}
            systemStatus={systemStatus}
            adminUnlocked={adminSession.unlocked}
            onAdminUnlock={handleAdminUnlock}
            onAdminRefresh={handleAdminRefresh}
            onOpenIntelBoard={() => { setShowWarRoom(false); onNavigate?.("classic"); }}
            refreshState={refreshState}
            mobile
            demoMode={DEMO_MODE}
          />
        )}

        {selectedMarketImpact && isMobile ? (
          <MarketImpactDetailPanel item={selectedMarketImpact} onClose={() => setSelectedMarketKey(null)} isMobile />
        ) : null}

        {/* PERSONALIZATION PANEL */}
        {showPersonalize && !isMobile && (
          <PersonalizationPanel
            prefs={prefs}
            onChange={setPrefs}
            onClose={() => setShowPersonalize(false)}
            watchlist={watchlist}
            selectedEvent={selectedEvent}
            onToggleRegion={(value) => toggleWatchlistValue("regions", value)}
            onToggleTopic={(value) => toggleWatchlistValue("topics", value)}
          />
        )}

        {/* DESKTOP: Right detail panel */}
        {!isMobile && selectedDetail && panelVisibility.selectedObjectDetail && (
          selectedDetail.type === "event" ? (
            <DesktopEventPanel
              event={selectedEvent}
              activeScenario={activeScenario}
              onScenarioChange={setActiveScenario}
              allEvents={filteredEvents}
              socialSignals={socialSignals}
              onClose={() => {
                setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
                setSelectedEvent(null);
                setActiveScenario(0);
              }}
            />
          ) : selectedDetail.type === "zone" ? (
            <ConflictZonePanel
              zone={selectedDetail.data}
              onSelectEvent={(event) => {
                setSelectedZone(null);
                focusEvent(event);
              }}
              onClose={() => {
                setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
                setSelectedZone(null);
              }}
            />
          ) : (
            <SelectedObjectCard
              selected={selectedDetail}
              onClose={() => {
                setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
                setSelectedObject(null);
              }}
              onZoom={() => sceneRef.current.focusCameraOnEvent?.(selectedDetail.data)}
              onClearSelection={() => {
                setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
                setSelectedObject(null);
              }}
            />
          )
        )}

        {/* MOBILE: Bottom sheet */}
        {isMobile && (
          <MobileBottomSheet
            events={filteredEvents}
            selectedEvent={selectedEvent}
            activeScenario={activeScenario}
            onScenarioChange={setActiveScenario}
            onSelectEvent={focusEvent}
            onClose={() => { setSelectedEvent(null); setActiveScenario(0); }}
            activeLayers={activeLayers}
            onLayerToggle={handleLayerToggle}
            layerEntries={visibleLayerEntries}
            briefing={briefing}
            marketImpact={marketImpact}
            flights={flights}
            satellites={satellites}
            socialSignals={socialSignals}
            onBriefingSelect={handleBriefingSelect}
            onOpenIntelBoard={() => onNavigate?.("classic")}
            refreshState={refreshState}
            adminUnlocked={adminSession.unlocked}
            onAdminUnlock={handleAdminUnlock}
            onSelectObject={focusExternalObject}
            allEvents={filteredEvents}
            onAdminRefresh={handleAdminRefresh}
            systemStatus={systemStatus}
            selectedLens={selectedLens}
            onLensChange={setSelectedLens}
            strategicBrief={strategicBrief}
            demoMode={DEMO_MODE}
            topEvents={liveTopEvents}
            sortMode={activeSignalSort}
            onSortChange={setActiveSignalSort}
            liveSunEnabled={liveSunEnabled}
            onToggleLiveSun={() => setLiveSunEnabled((current) => !current)}
            onSelectMarketCategory={setSelectedMarketKey}
            marketData={marketData}
          />
        )}

        {isMobile && selectedObject && panelVisibility.selectedObjectDetail ? (
          <SelectedObjectCard
            selected={selectedObject}
            mobile
            onClose={() => {
              setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
              setSelectedObject(null);
            }}
            onZoom={() => sceneRef.current.focusCameraOnEvent?.(selectedObject.data)}
            onClearSelection={() => {
              setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
              setSelectedObject(null);
            }}
          />
        ) : null}

        {isMobile && selectedZone && panelVisibility.selectedObjectDetail ? (
          <ConflictZonePanel
            zone={selectedZone}
            isMobile
            onSelectEvent={(event) => {
              setSelectedZone(null);
              focusEvent(event);
            }}
            onClose={() => {
              setPanelVisibility((current) => ({ ...current, selectedObjectDetail: false }));
              setSelectedZone(null);
            }}
          />
        ) : null}

        {/* Tooltip (desktop only) */}
        {!isMobile && <Tooltip text={tooltip.text} x={tooltip.x} y={tooltip.y} />}

        {/* Loading overlay */}
        {!ready && (
          <div style={{ position: "absolute", inset: 0, background: "#020810", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 18 }}>
            <img src={BRAND_REPORT_LOCKUP} alt="Grigori by oryth.io" style={{ width: "min(440px, 72vw)", height: "auto", opacity: 0.96 }} />
            <div style={{ color: "rgba(148,163,184,0.78)", fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Loading Grigori Intelligence Systems...
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%",
                  background: "rgba(0,180,255,0.75)",
                  animation: `dotPulse 1.2s ease-in-out ${i*0.2}s infinite alternate` }}/>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
