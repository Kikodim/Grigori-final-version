import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";

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
const SCORED_EVENTS = enrichEvents(EVENTS);

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

  // ── Brighter ocean base — PART 1 FIX: opacity 1.0, clearly visible ──────
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0,   "#0d1e3f");   // brighter deep blue
  g.addColorStop(0.5, "#0a1832");
  g.addColorStop(1,   "#071022");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Continental shelf suggestion — more visible tint
  ctx.fillStyle = "rgba(18,45,85,0.28)";
  [[0.12, 0.30], [0.35, 0.55], [0.60, 0.78]].forEach(([y0, y1]) => {
    ctx.fillRect(0, y0 * H, W, (y1 - y0) * H);
  });

  // Ocean shimmer — brighter sparkles
  for (let i = 0; i < 7000; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(30,100,220,${Math.random() * 0.09})`;
    ctx.fill();
  }

  // Latitude grid
  ctx.lineWidth = 0.6;
  for (let lat = -90; lat <= 90; lat += 15) {
    const y = ((90 - lat) / 180) * H;
    ctx.strokeStyle = lat === 0 ? "rgba(0,200,255,0.14)" : "rgba(0,140,220,0.05)";
    ctx.lineWidth   = lat === 0 ? 1.2 : 0.6;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Longitude grid
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = "rgba(0,140,220,0.04)";
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = ((lng + 180) / 360) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  // Prime meridian
  ctx.strokeStyle = "rgba(0,180,255,0.09)";
  ctx.lineWidth = 1;
  const pmX = (180 / 360) * W;
  ctx.beginPath(); ctx.moveTo(pmX, 0); ctx.lineTo(pmX, H); ctx.stroke();

  return new THREE.CanvasTexture(cv);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATMOSPHERE GLOW SHADER
// ═══════════════════════════════════════════════════════════════════════════════

function makeAtmosphere() {
  const atmSegs = IS_MOBILE ? 32 : 64;
  const geo = new THREE.SphereGeometry(R * 1.09, atmSegs, atmSegs);
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
        // Fresnel rim — bright at grazing angle
        float rim = 1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
        float intensity = pow(rim, 3.2);
        vec3 col = mix(vec3(0.0, 0.25, 0.72), vec3(0.0, 0.65, 1.0), intensity);
        float pulse = 0.93 + 0.07 * sin(time * 0.35);
        gl_FragColor = vec4(col * pulse, intensity * 0.62);
      }`,
    side:        THREE.FrontSide,
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

  // Surface position at lift = R + 0.015
  // Priority-aware sizing: CRITICAL events are larger & brighter
  const scored     = SCORED_EVENTS.find(s => s.id === ev.id) || ev;
  const pLevel     = scored.priorityLevel || "LOW";
  const sizeScale  = { CRITICAL: 1.5, HIGH: 1.25, WATCH: 1.0, LOW: 0.75 }[pLevel] ?? 1.0;
  const surfacePos = geoToVec3(ev.lat, ev.lng, R + 0.015);

  // Normal vector pointing outward (used for lookAt)
  const outward = geoToVec3(ev.lat, ev.lng, 1.0).normalize();

  const group = new THREE.Group();
  group.userData = { eventId: ev.id };

  // Scale: mobile enlarges tap targets; priority score enlarges visual size
  const mobileScale = (IS_MOBILE ? 1.6 : 1.0) * sizeScale;
  const addDisc = (rInner, rOuter, col, opacity, extra = {}) => {
    const geo = rInner === 0
      ? new THREE.CircleGeometry(rOuter * mobileScale, 28)
      : new THREE.RingGeometry(rInner * mobileScale, rOuter * mobileScale, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity,
      side: THREE.DoubleSide, depthWrite: false,
      depthTest: false,                      // always visible regardless of depth
      blending: THREE.AdditiveBlending,
      ...extra,
    });
    return new THREE.Mesh(geo, mat);
  };

  // White core dot
  const core = addDisc(0, 0.007, 0xffffff, 1.0);
  core.userData = { clickable: true, eventId: ev.id };

  // Coloured inner ring
  const ring1 = addDisc(0.009, 0.017, color, 0.85);

  // Animated pulse rings
  const pulse1 = addDisc(0.020, 0.026, color, 0.5);
  pulse1.userData = { pulse: true, speed: cfg.pulseSpeed, base: 0.5, phase: 0 };

  const pulse2 = addDisc(0.030, 0.034, color, 0.25);
  pulse2.userData = { pulse: true, speed: cfg.pulseSpeed, base: 0.25, phase: 1.1 };

  group.add(core, ring1, pulse1, pulse2);

  // Position on sphere and orient outward
  group.position.copy(surfacePos);
  // Use quaternion to align group's +Z to outward normal
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward);

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
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    group.add(new THREE.Line(geo, mat));

    // Animated pulse dot along arc
    const dotGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: disrupted ? 0xff4433 : 0x44ddff,
      transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
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
      blending: THREE.AdditiveBlending, depthTest: false,
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
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      group.add(new THREE.Line(lineGeo, lineMat));
    }
  });

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

// ── Gemini AI request queue + SHA-256 cache ───────────────────────────────────
const _aiCache     = new Map();  // sha256(prompt) → result
const _aiQueue     = [];
let   _aiRunning   = false;
const AI_RPM_LIMIT = 14;          // stay under Gemini 15 RPM free tier
let   _aiCallsThisMinute = 0;
let   _aiWindowStart     = Date.now();

async function _sha256(str) {
  const buf  = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,"0")).join("");
}

async function callGemini(prompt, systemPrompt) {
  const cacheKey = await _sha256(systemPrompt + prompt);
  if (_aiCache.has(cacheKey)) return _aiCache.get(cacheKey);

  return new Promise((resolve, reject) => {
    _aiQueue.push({ prompt, systemPrompt, cacheKey, resolve, reject });
    _drainAIQueue();
  });
}

async function _drainAIQueue() {
  if (_aiRunning || _aiQueue.length === 0) return;
  _aiRunning = true;

  while (_aiQueue.length > 0) {
    // Reset RPM window every 60 seconds
    if (Date.now() - _aiWindowStart > 60_000) {
      _aiCallsThisMinute = 0;
      _aiWindowStart     = Date.now();
    }

    if (_aiCallsThisMinute >= AI_RPM_LIMIT) {
      // Wait until window resets
      await new Promise(r => setTimeout(r, 61_000 - (Date.now() - _aiWindowStart)));
      _aiCallsThisMinute = 0;
      _aiWindowStart     = Date.now();
    }

    const job = _aiQueue.shift();
    try {
      const result = await _geminiCall(job.prompt, job.systemPrompt);
      _aiCache.set(job.cacheKey, result);
      _aiCallsThisMinute++;
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    }

    // Enforce minimum spacing: 60s / 14 = ~4.3s between calls
    if (_aiQueue.length > 0) await new Promise(r => setTimeout(r, 4400));
  }

  _aiRunning = false;
}

async function _geminiCall(userPrompt, systemPrompt) {
  // Uses the Gemini REST API directly (no SDK)
  // API key must be set via window.GEMINI_API_KEY or env injection
  const apiKey = window.__GRIGORI_GEMINI_KEY || "";
  if (!apiKey) throw new Error("No Gemini API key configured");

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      maxOutputTokens: 1200,
      temperature:     0.2,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") ?? "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ── AI Scenario generation prompt ──────────────────────────────────────────────
const SCENARIO_SYSTEM_PROMPT = `You are Grigori, a senior geopolitical intelligence analyst.
Given a news cluster, generate 2-3 scenarios as a JSON array.
Respond ONLY with a JSON array, no markdown, no preamble.
Schema: [{ "name": string, "probability": number, "description": string,
  "impact": { "oil": "Up"|"Neutral"|"Down", "markets": "Risk-on"|"Risk-off"|"Stable",
    "tradeRoutes": "Disrupted"|"Stable", "sectors": string[], "regionalEffects": string[] }}]
Probabilities must sum to 100. sectors from: Energy,Defense,Tech,Shipping,Food,Finance.`;

async function generateScenarios(eventData) {
  const prompt = `Event: ${eventData.title}
Region: ${eventData.region || "Unknown"}
Summary: ${eventData.summary}
Tone: ${eventData.tone || "Unknown"}
Developments: ${(eventData.developments || []).join("; ")}

Generate 2-3 geopolitical scenarios for this event.`;

  try {
    const scenarios = await callGemini(prompt, SCENARIO_SYSTEM_PROMPT);
    if (Array.isArray(scenarios)) return scenarios;
    return null;
  } catch (err) {
    console.warn("[Grigori] Gemini scenario gen failed:", err.message);
    return null;
  }
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

// ── Market data fetcher ────────────────────────────────────────────────────────
// Uses the free Yahoo Finance unofficial endpoint (no key required)
async function fetchMarketData() {
  const cached = cacheGet("market_data");
  if (cached) return cached;

  // Fetch Brent crude, S&P 500, VIX via Yahoo Finance v8 chart API
  const symbols = ["BZ=F", "^GSPC", "^VIX"];
  const results = {};

  await Promise.allSettled(symbols.map(async sym => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return;
      const data = await res.json();
      const meta  = data.chart?.result?.[0]?.meta;
      if (!meta) return;
      results[sym] = {
        price:         meta.regularMarketPrice,
        prevClose:     meta.previousClose || meta.chartPreviousClose,
        change:        meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose),
        changePct:     ((meta.regularMarketPrice - (meta.previousClose || meta.chartPreviousClose)) /
                        (meta.previousClose || meta.chartPreviousClose) * 100),
        currency:      meta.currency,
        symbol:        sym,
      };
    } catch { /* skip failed symbol */ }
  }));

  const data = {
    oil:     results["BZ=F"]    || null,
    sp500:   results["^GSPC"]   || null,
    vix:     results["^VIX"]    || null,
    fetchedAt: Date.now(),
  };

  cacheSet("market_data", data, 5 * 60 * 1000);   // 5-min TTL for market data
  return data;
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
    impact: {
      oil: impact.oil ?? "Neutral",
      markets: impact.markets ?? "Stable",
      tradeRoutes: impact.tradeRoutes ?? (impact.markets === "Risk-off" ? "Disrupted" : "Stable"),
      sectors: impact.sectors ?? [],
      regionalEffects: impact.regionalEffects ?? [],
    },
  };
}

function normalizeBackendEvent(event) {
  const location = event.location ?? { label: "Unknown Region", lat: 0, lng: 0 };
  const scenarios = (event.scenarios ?? []).map(normalizeBackendScenario);

  return {
    id: event.id,
    title: event.title ?? "Untitled Event",
    lat: location.lat ?? 0,
    lng: location.lng ?? 0,
    location: {
      label: location.label ?? "Unknown Region",
      lat: location.lat ?? 0,
      lng: location.lng ?? 0,
    },
    intensity: mapToneToGlobeIntensity(event.tone, event.confidence),
    summary: event.summary ?? "",
    tone: event.tone ?? "Stable",
    confidence: event.confidence ?? "Low",
    developments: event.developments ?? [],
    scenarios: scenarios.length > 0 ? scenarios : [{
      name: "Monitoring",
      probability: 100,
      description: "Awaiting richer scenario output from the backend pipeline.",
      impact: {
        oil: "Neutral",
        markets: "Stable",
        tradeRoutes: "Stable",
        sectors: [],
        regionalEffects: [],
      },
    }],
    affectedRegions: [{ lat: location.lat ?? 0, lng: location.lng ?? 0 }],
    tradeRoutes: [],
    timestamp: event.timestamp ?? new Date().toISOString(),
  };
}

async function fetchBackendEvents() {
  const url = resolveBackendUrl("/api/v1/events?limit=50");
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`backend ${res.status}`);

  const data = await res.json();
  const normalized = Array.isArray(data.events)
    ? data.events.map(normalizeBackendEvent)
    : [];

  return normalized.length > 0 ? enrichEvents(normalized) : [];
}

// ── Merge live data with static events ────────────────────────────────────────
// Returns the combined scored event list, preferring static data for enriched events
async function fetchLiveEvents() {
  try {
    const backendEvents = await fetchBackendEvents();
    if (backendEvents.length > 0) return backendEvents;
  } catch (err) {
    console.warn("[Grigori] Backend events fetch failed:", err.message);
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

  return [...SCORED_EVENTS, ...enriched];
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

  // If filter is too aggressive, return at least top 3
  if (filtered.length === 0) return events.slice(0, 3);
  return filtered;
}

// ── Personalization filter panel UI ───────────────────────────────────────────
function PersonalizationPanel({ prefs, onChange, onClose }) {
  return (
    <div style={{
      position: "absolute", top: 56, left: 272, width: 280, zIndex: 45,
      background: "linear-gradient(168deg, rgba(3,8,22,0.97) 0%, rgba(4,10,26,0.98) 100%)",
      border: "1px solid rgba(0,180,255,0.25)", borderRadius: 8,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
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

      <div style={{ padding: "12px 14px", maxHeight: "60vh", overflowY: "auto" }}>
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
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET TICKER  (PART 7)
// Displays live Brent crude + market sentiment in TopBar
// ═══════════════════════════════════════════════════════════════════════════════

function MarketTicker({ marketData }) {
  if (!marketData) return null;

  const oil  = marketData.oil;
  const vix  = marketData.vix;

  if (!oil && !vix) return null;

  const oilChange = oil ? (oil.changePct >= 0 ? "+" : "") + oil.changePct.toFixed(1) + "%" : null;
  const oilColor  = oil ? (oil.change > 0 ? "#ff5533" : oil.change < 0 ? "#44dd88" : "#88aacc") : "#88aacc";
  const vixLevel  = vix ? (vix.price > 25 ? "HIGH" : vix.price > 18 ? "ELEV" : "LOW") : null;
  const vixColor  = vix ? (vix.price > 25 ? "#ff4444" : vix.price > 18 ? "#ffaa00" : "#44cc88") : "#88aacc";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      {oil && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "rgba(0,180,255,0.35)", fontSize: 8, fontFamily: mono,
            letterSpacing: "0.1em" }}>BRENT</span>
          <span style={{ color: "#e0eeff", fontSize: 10, fontFamily: mono, fontWeight: 600 }}>
            ${oil.price.toFixed(1)}
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
            {vix.price.toFixed(1)}
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

const mono    = "'IBM Plex Mono', monospace";
const display = "'Rajdhani', sans-serif";

const useIsMobile = () => {
  const [mob, setMob] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
};

// ── Reusable atoms ────────────────────────────────────────────────────────────

function SectorPill({ name }) {
  const c = SECTOR_COLOR[name] || "#8899aa";
  return (
    <span style={{ background: `${c}18`, color: c, border: `1px solid ${c}44`,
      borderRadius: 3, padding: "2px 7px", fontSize: 9, fontFamily: mono,
      letterSpacing: "0.09em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
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
    <span style={{ background: `${color}14`, color, border: `1px solid ${color}44`,
      borderRadius: 3, padding: "2px 8px", fontSize: 9, letterSpacing: "0.11em",
      textTransform: "uppercase", fontFamily: mono, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// ── Tooltip (desktop only) ────────────────────────────────────────────────────
function Tooltip({ text, x, y }) {
  if (!text) return null;
  return (
    <div style={{ position: "fixed", left: x + 16, top: y - 12, pointerEvents: "none",
      zIndex: 200, background: "rgba(3,9,22,0.96)", border: "1px solid rgba(0,200,255,0.4)",
      borderRadius: 4, padding: "5px 11px", color: "#8ecfee", fontFamily: mono,
      fontSize: 11, letterSpacing: "0.07em", whiteSpace: "nowrap",
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
            margin: 0, fontFamily: mono }}>{event.whyThisMatters}</p>
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

function WarRoomPanel({ topEvents, onSelect, selectedEventId, onClose }) {
  return (
    <div style={{
      position: "absolute", top: 56, right: 16, width: 300, zIndex: 45,
      background: "linear-gradient(168deg, rgba(3,8,22,0.97) 0%, rgba(4,10,26,0.98) 100%)",
      border: "1px solid rgba(255,34,51,0.3)",
      borderRadius: 8,
      boxShadow: "0 0 40px rgba(255,34,51,0.08), 0 8px 32px rgba(0,0,0,0.6)",
      animation: "panelIn 0.28s cubic-bezier(0.23,1,0.32,1)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "11px 14px 9px", borderBottom: "1px solid rgba(255,34,51,0.18)" }}>
        <div>
          <div style={{ color: "#ff4455", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 2 }}>
            ⬛ WAR ROOM
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
      <div>
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
                    {ev.whyThisMatters}
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

function EventDetailContent({ event, activeScenario, onScenarioChange }) {
  const cfg = INTENSITY[event.intensity];
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
          <span style={{ color: "rgba(0,180,255,0.38)", fontSize: 9, fontFamily: mono }}>
            {event.lat.toFixed(2)}°, {event.lng.toFixed(2)}°
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>

        {/* Summary */}
        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 7 }}>INTEL SUMMARY</div>
          <p style={{ color: "rgba(180,220,255,0.72)", fontSize: 12, lineHeight: 1.72, margin: 0 }}>
            {event.summary}
          </p>
        </div>

        {/* Developments */}
        <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>KEY DEVELOPMENTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {event.developments.map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ color: "rgba(0,200,255,0.55)", fontSize: 10, marginTop: 2, flexShrink: 0 }}>▸</span>
                <span style={{ color: "rgba(155,205,250,0.7)", fontSize: 11, lineHeight: 1.58 }}>{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Priority Score Breakdown ── */}
        {event.priorityScore !== undefined && (
          <div style={{ padding: "13px 18px", borderBottom: "1px solid rgba(0,180,255,0.07)" }}>
            <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
              letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10 }}>WAR ROOM PRIORITY</div>
            <ScoreBreakdownPanel event={event} />
          </div>
        )}

        {/* Scenarios */}
        <div style={{ padding: "13px 18px 20px" }}>
          <div style={{ color: "rgba(0,200,255,0.3)", fontSize: 9, fontFamily: mono,
            letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>SCENARIO ENGINE</div>
          <div style={{ color: "rgba(0,180,255,0.28)", fontSize: 9, fontFamily: mono,
            marginBottom: 12 }}>Tap a scenario to update globe visualisation</div>
          {event.scenarios.map((sc, i) => (
            <ScenarioCard key={i} sc={sc} active={activeScenario === i}
              onClick={() => onScenarioChange(i)} />
          ))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP EVENT PANEL (right sidebar, 420px)
// ═══════════════════════════════════════════════════════════════════════════════

function DesktopEventPanel({ event, activeScenario, onScenarioChange, onClose }) {
  if (!event) return null;
  return (
    <div style={{
      position: "fixed", right: 0, top: 0, bottom: 0, width: 420, zIndex: 60,
      background: "linear-gradient(168deg, #030b1c 0%, #050f24 100%)",
      borderLeft: "1px solid rgba(0,180,255,0.2)",
      display: "flex", flexDirection: "column",
      animation: "panelIn 0.32s cubic-bezier(0.23,1,0.32,1)",
    }}>
      {/* Close button row */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px 0",
        flexShrink: 0 }}>
        <button onClick={onClose} aria-label="Close panel" style={{
          background: "none", border: "1px solid rgba(0,180,255,0.22)",
          color: "rgba(0,180,255,0.55)", cursor: "pointer", width: 32, height: 32,
          borderRadius: 5, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 14, transition: "all 0.15s ease",
        }}>✕</button>
      </div>
      <EventDetailContent event={event} activeScenario={activeScenario} onScenarioChange={onScenarioChange} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE BOTTOM SHEET  (3 states: peek → half → full)
// ═══════════════════════════════════════════════════════════════════════════════

const SHEET_STATES = {
  peek: { label: "peek",  snapVh: 10  },   // just a handle bar + count
  half: { label: "half",  snapVh: 44  },   // event list
  full: { label: "full",  snapVh: 88  },   // event detail
};

function MobileBottomSheet({ events, selectedEvent, activeScenario, onScenarioChange,
                             onSelectEvent, onClose, activeLayers, onLayerToggle }) {
  const [sheetState, setSheetState] = useState("peek");
  const sheetRef   = useRef(null);
  const dragRef    = useRef({ startY: 0, startH: 0, dragging: false });

  // When an event is selected, snap to full
  useEffect(() => {
    if (selectedEvent) setSheetState("full");
    else if (sheetState === "full") setSheetState("half");
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
                {events.length} ACTIVE EVENTS
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

        {/* Layer toggles — always visible in half/full */}
        {sheetState !== "peek" && (
          <div style={{ padding: "4px 18px 10px", borderBottom: "1px solid rgba(0,180,255,0.08)",
            flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2,
              WebkitOverflowScrolling: "touch" }}>
              {Object.entries(LAYER_DEFS).map(([key, def]) => (
                <LayerToggleChip key={key} layerKey={key} def={def}
                  active={activeLayers[key]} onToggle={onLayerToggle} />
              ))}
            </div>
          </div>
        )}

        {/* Event detail (full state) */}
        {sheetState === "full" && selectedEvent ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <EventDetailContent event={selectedEvent} activeScenario={activeScenario}
              onScenarioChange={onScenarioChange} />
          </div>
        ) : sheetState !== "peek" ? (
          /* Event list (half state) */
          <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {events.map(ev => {
              const c    = INTENSITY[ev.intensity];
              const pcfg = PRIORITY_CONFIG[ev.priorityLevel] || PRIORITY_CONFIG.LOW;
              const sel = selectedEvent?.id === ev.id;
              return (
                <div key={ev.id} onClick={() => { onSelectEvent(ev); setSheetState("full"); }}
                  style={{ padding: "11px 18px", borderBottom: "1px solid rgba(0,180,255,0.06)",
                    borderLeft: `3px solid ${sel ? c.color : "transparent"}`,
                    background: sel ? "rgba(0,50,100,0.3)" : "transparent",
                    display: "flex", alignItems: "center", gap: 12, minHeight: 52 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%",
                    background: c.color, boxShadow: `0 0 7px ${c.color}`, flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: sel ? "#c8e8ff" : "rgba(155,205,250,0.78)",
                      fontSize: 13, fontFamily: display, fontWeight: 700,
                      lineHeight: 1.3, marginBottom: 2, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "rgba(0,160,220,0.42)", fontSize: 9, fontFamily: mono,
                        letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {ev.intensity} · {ev.tone}
                      </span>
                      {ev.priorityScore !== undefined && (
                        <span style={{ color: pcfg.color, fontSize: 9, fontFamily: mono,
                          fontWeight: 700, background: pcfg.bg,
                          border: `1px solid ${pcfg.border}`, borderRadius: 3, padding: "1px 5px" }}>
                          {ev.priorityScore}
                        </span>
                      )}
                    </div>
                  </div>
                  <span style={{ color: "rgba(0,180,255,0.3)", fontSize: 16, flexShrink: 0 }}>›</span>
                </div>
              );
            })}
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
  satellites: { label: "SAT",      icon: "◉", color: "#44ddff", desc: "Satellite orbits" },
  maritime:   { label: "MARITIME", icon: "⛵", color: "#44aaff", desc: "Shipping routes" },
  conflict:   { label: "CONFLICT", icon: "⚡", color: "#ff4444", desc: "Conflict zones" },
  connections:{ label: "INTEL",    icon: "⟳", color: "#aa44ff", desc: "Influence arcs" },
};

function LayerToggleChip({ layerKey, def, active, onToggle }) {
  return (
    <button onClick={() => onToggle(layerKey)} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
      background: active ? `${def.color}20` : "rgba(0,20,50,0.5)",
      border: `1px solid ${active ? def.color + "66" : "rgba(0,120,200,0.2)"}`,
      borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
      transition: "all 0.18s ease", minHeight: 30,
    }}>
      <span style={{ fontSize: 11 }}>{def.icon}</span>
      <span style={{ color: active ? def.color : "rgba(150,200,240,0.55)",
        fontSize: 9, fontFamily: mono, letterSpacing: "0.1em" }}>{def.label}</span>
    </button>
  );
}

// Desktop layer toggle bar
function DesktopLayerBar({ activeLayers, onToggle, bordersLoaded }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {Object.entries(LAYER_DEFS).map(([key, def]) => (
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

function TopBar({ counts, bordersLoaded, activeLayers, onLayerToggle, isMobile, onWarRoom, showWarRoom, marketData, onPersonalize, showPersonalize }) {
  const [time, setTime] = useState(() => new Date().toISOString().slice(11,19));
  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toISOString().slice(11,19)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 48,
      background: "rgba(2,7,18,0.92)", backdropFilter: "blur(16px)",
      borderBottom: "1px solid rgba(0,180,255,0.14)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 16px", zIndex: 40, flexShrink: 0,
      WebkitBackdropFilter: "blur(16px)",
    }}>
      {/* Left: logo + status dots */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Globe icon */}
        <svg width="22" height="22" viewBox="0 0 22 22" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(0,180,255,0.6)" strokeWidth="1.2"/>
          <ellipse cx="11" cy="11" rx="4" ry="9" fill="none" stroke="rgba(0,180,255,0.3)" strokeWidth="0.8"/>
          <line x1="2" y1="11" x2="20" y2="11" stroke="rgba(0,180,255,0.3)" strokeWidth="0.8"/>
          <circle cx="11" cy="11" r="2" fill="rgba(0,210,255,0.9)"/>
        </svg>
        <span style={{ color: "#d0eaff", fontFamily: display, fontSize: isMobile ? 17 : 19,
          fontWeight: 700, letterSpacing: "0.14em" }}>GRIGORI</span>

        {!isMobile && (
          <>
            <div style={{ width: 1, height: 16, background: "rgba(0,180,255,0.18)" }}/>
            <div style={{ display: "flex", gap: 8 }}>
              {[["H", counts.high, "#ff2233"], ["M", counts.medium, "#ff8800"], ["L", counts.low, "#ffcc00"]].map(([l,c,cl]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cl,
                    boxShadow: `0 0 6px ${cl}`, display: "inline-block" }}/>
                  <span style={{ color: "rgba(180,220,255,0.45)", fontSize: 9,
                    fontFamily: mono, letterSpacing: "0.08em" }}>{l}:{c}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Right: layers (desktop) + live + time */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!isMobile && (
          <DesktopLayerBar activeLayers={activeLayers} onToggle={onLayerToggle}
            bordersLoaded={bordersLoaded} />
        )}
        {/* Market ticker (desktop only) */}
        {!isMobile && <MarketTicker marketData={marketData} />}
        {!isMobile && marketData && (
          <span style={{ color: "rgba(0,180,255,0.2)", fontSize: 10 }}>|</span>
        )}

        {/* Personalize button */}
        {!isMobile && (
          <button onClick={onPersonalize} style={{
            display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
            background: showPersonalize ? "rgba(0,180,255,0.15)" : "rgba(0,20,50,0.5)",
            border: `1px solid ${showPersonalize ? "rgba(0,180,255,0.5)" : "rgba(0,100,180,0.3)"}`,
            borderRadius: 4, cursor: "pointer", minHeight: 30, transition: "all 0.18s ease",
          }}>
            <span style={{ color: showPersonalize ? "#44ccff" : "rgba(200,220,255,0.55)",
              fontSize: 9, fontFamily: mono, letterSpacing: "0.1em" }}>⊞ FOCUS</span>
          </button>
        )}

        <button onClick={onWarRoom} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
          background: showWarRoom ? "rgba(255,34,51,0.15)" : "rgba(0,20,50,0.5)",
          border: `1px solid ${showWarRoom ? "rgba(255,34,51,0.5)" : "rgba(0,100,180,0.3)"}`,
          borderRadius: 4, cursor: "pointer", minHeight: 30, transition: "all 0.18s ease",
        }}>
          <span style={{ color: showWarRoom ? "#ff4455" : "rgba(200,220,255,0.55)",
            fontSize: 9, fontFamily: mono, letterSpacing: "0.1em" }}>⬛ WAR ROOM</span>
        </button>
        <span style={{ background: "rgba(0,255,100,0.09)", color: "#00ff88",
          border: "1px solid rgba(0,255,100,0.22)", borderRadius: 3,
          padding: "2px 8px", fontSize: 9, fontFamily: mono, letterSpacing: "0.1em" }}>● LIVE</span>
        {!isMobile && (
          <span style={{ color: "rgba(0,180,255,0.3)", fontSize: 10, fontFamily: mono }}>
            {time} UTC
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP LEFT SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

function DesktopSidebar({ events, selectedEvent, onSelect }) {
  return (
    <div style={{
      position: "absolute", left: 0, top: 48, bottom: 0, width: 264,
      background: "rgba(2,7,18,0.85)", backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      borderRight: "1px solid rgba(0,180,255,0.1)",
      display: "flex", flexDirection: "column", zIndex: 30,
    }}>
      <div style={{ padding: "11px 15px 9px", borderBottom: "1px solid rgba(0,180,255,0.08)",
        flexShrink: 0 }}>
        <div style={{ color: "rgba(0,200,255,0.38)", fontSize: 9, fontFamily: mono,
          letterSpacing: "0.18em", textTransform: "uppercase" }}>ACTIVE EVENTS</div>
        <div style={{ color: "rgba(0,200,255,0.62)", fontSize: 11, fontFamily: mono, marginTop: 2 }}>
          {events.length} TRACKED
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {events.map(ev => {
          const cfg  = INTENSITY[ev.intensity];
          const pcfg = PRIORITY_CONFIG[ev.priorityLevel] || PRIORITY_CONFIG.LOW;
          const sel  = selectedEvent?.id === ev.id;
          return (
            <div key={ev.id} onClick={() => onSelect(ev)} style={{
              padding: "10px 15px",
              borderBottom: "1px solid rgba(0,160,220,0.06)",
              borderLeft: `2px solid ${sel ? cfg.color : "transparent"}`,
              background: sel ? "rgba(0,50,100,0.28)" : "transparent",
              cursor: "pointer", transition: "all 0.15s ease",
            }}
            onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(0,35,70,0.22)"; }}
            onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color,
                  flexShrink: 0, boxShadow: `0 0 6px ${cfg.color}` }}/>
                <span style={{ color: "rgba(0,180,255,0.42)", fontSize: 8, fontFamily: mono,
                  letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {ev.intensity} · {ev.tone}
                </span>
              </div>
              <div style={{ color: sel ? "#c8e8ff" : "rgba(155,205,250,0.72)", fontSize: 12,
                fontFamily: display, fontWeight: 700, lineHeight: 1.35, marginBottom: 2 }}>
                {ev.title}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ color: "rgba(0,160,220,0.38)", fontSize: 9, fontFamily: mono }}>
                  {ev.lat.toFixed(1)}°, {ev.lng.toFixed(1)}°
                </div>
                {ev.priorityScore !== undefined && (
                  <span style={{ color: pcfg.color, fontSize: 9, fontFamily: mono,
                    fontWeight: 700, background: pcfg.bg,
                    border: `1px solid ${pcfg.border}`, borderRadius: 3,
                    padding: "1px 5px" }}>{ev.priorityScore}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function GlobeApp() {
  const mountRef = useRef(null);
  const sceneRef = useRef({});

  const [selectedEvent,  setSelectedEvent]  = useState(null);
  const [activeScenario, setActiveScenario] = useState(0);
  const [tooltip,        setTooltip]        = useState({ text: null, x: 0, y: 0 });
  const [bordersLoaded,  setBordersLoaded]  = useState(false);
  const [ready,          setReady]          = useState(false);
  const [activeLayers,   setActiveLayers]   = useState({
    satellites: true, maritime: true, conflict: true, connections: false,
  });
  const [showWarRoom,     setShowWarRoom]     = useState(false);
  const [liveEvents,      setLiveEvents]      = useState(SCORED_EVENTS);
  const [marketData,      setMarketData]      = useState(null);
  const [showPersonalize, setShowPersonalize] = useState(false);
  const [prefs,           setPrefs]           = useState({ region: "all", sectors: [], riskLevel: "all" });
  const [liveTopEvents,   setLiveTopEvents]   = useState(TOP_EVENTS);

  const isMobile = useIsMobile();

  // ── Live data fetching — runs once on mount, then every 15 min ───────────────
  useEffect(() => {
    let cancelled = false;

    async function refreshData() {
      // Fetch market data (5 min cache inside fetchMarketData)
      try {
        const md = await fetchMarketData();
        if (!cancelled) setMarketData(md);
      } catch { /* market data is nice-to-have, not critical */ }

      // Fetch live events (15 min cache inside fetchLiveEvents)
      try {
        const evs = await fetchLiveEvents();
        if (!cancelled) {
          setLiveEvents(evs);
          const top5 = [...evs].sort((a,b) => (b.priorityScore||0)-(a.priorityScore||0)).slice(0,5);
          setLiveTopEvents(top5);
        }
      } catch { /* fallback to static data — already default state */ }
    }

    refreshData();
    const interval = setInterval(refreshData, 15 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // ── Filtered event list — recalculated when prefs or live data changes ────────
  const filteredEvents = useMemo(() => filterEvents(liveEvents, prefs), [liveEvents, prefs]);

  // ── Toggle a live layer ──────────────────────────────────────────────────────
  const handleLayerToggle = useCallback(key => {
    setActiveLayers(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // Update Three.js layer visibility immediately
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
    container.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(mob ? 50 : 42, W / H, 0.01, 120);
    const initRadius = mob ? 2.4 : 2.75;
    camera.position.set(0, 0, initRadius);

    // Lights
    scene.add(new THREE.AmbientLight(0x112244, 3.2));
    const sun = new THREE.DirectionalLight(0x3377cc, 2.4);
    sun.position.set(5, 3, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x001133, 1.0);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    // Globe
    const segs = mob ? 48 : 96;
    const globeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(R, segs, segs),
      new THREE.MeshPhongMaterial({ map: makeGlobeTex(), specular: new THREE.Color(0x1a3055), shininess: 45, opacity: 1.0 })
    );
    globeMesh.renderOrder = 0;
    scene.add(globeMesh);

    // Atmosphere
    const atm = makeAtmosphere();
    scene.add(atm);

    // Stars
    scene.add(makeStars());

    // Hotspots
    const hotspotLayer = new THREE.Group();
    scene.add(hotspotLayer);
    const clickableObjects = [];
    SCORED_EVENTS.forEach(ev => {
      const hs = makeHotspot(ev);
      hotspotLayer.add(hs);
      hs.traverse(obj => { if (obj.userData.clickable) clickableObjects.push(obj); });
    });

    // Impact layer (rebuilt on selection)
    let impactLayer = new THREE.Group();
    scene.add(impactLayer);

    // Country borders
    const borderLayer = new THREE.Group();
    scene.add(borderLayer);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff, transparent: true, opacity: 0.7,
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

    // ── Live Intelligence Layers ─────────────────────────────────────────────
    const satLayer     = buildSatelliteLayer();
    const maritimeLayer= buildMaritimeLayer();
    const conflictLayer= buildConflictLayer(SCORED_EVENTS);
    const connLayer    = buildConnectionLayer();

    satLayer.visible      = true;
    maritimeLayer.visible = true;
    conflictLayer.visible = true;
    connLayer.visible     = false;

    scene.add(satLayer, maritimeLayer, conflictLayer, connLayer);

    // ── Camera state ─────────────────────────────────────────────────────────
    const cam = {
      theta: 0.3, phi: 1.25, radius: initRadius,
      targetTheta: 0.3, targetPhi: 1.25, targetRadius: initRadius,
      dragging: false, lastX: 0, lastY: 0, autoSpin: true, spinTimer: null,
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

    function focusCameraOnEvent(ev) {
      cam.targetTheta  = -ev.lng * (Math.PI / 180);
      cam.targetPhi    = Math.max(0.25, Math.min(Math.PI - 0.25, (90 - ev.lat) * (Math.PI / 180)));
      cam.targetRadius = mob ? 1.9 : 2.05;
      cam.autoSpin     = false;
      resumeSpin();
    }

    // Interaction
    const raycaster = new THREE.Raycaster();
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
        cam.targetTheta += dx * DRAG_SENS;
        cam.targetPhi    = Math.max(0.15, Math.min(Math.PI-0.15, cam.targetPhi - dy*DRAG_SENS));
        return;
      }
      // Hover tooltip (desktop)
      raycaster.setFromCamera(getNDC(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(clickableObjects, false);
      if (hits.length > 0) {
        const ev2 = SCORED_EVENTS.find(ev => ev.id === hits[0].object.userData.eventId);
        setTooltip({ text: ev2?.title ?? null, x: e.clientX, y: e.clientY });
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
      if (hits.length > 0) {
        const ev2 = SCORED_EVENTS.find(ev => ev.id === hits[0].object.userData.eventId);
        if (ev2) { setSelectedEvent(ev2); setActiveScenario(0); focusCameraOnEvent(ev2); }
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
        cam.targetTheta += dx*DRAG_SENS;
        cam.targetPhi = Math.max(0.15, Math.min(Math.PI-0.15, cam.targetPhi - dy*DRAG_SENS));
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
          if (hits.length > 0) {
            const ev2 = SCORED_EVENTS.find(ev => ev.id === hits[0].object.userData.eventId);
            if (ev2) { setSelectedEvent(ev2); setActiveScenario(0); focusCameraOnEvent(ev2); }
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
      cam, scene, focusCameraOnEvent,
      liveLayers: { satellites: satLayer, maritime: maritimeLayer, conflict: conflictLayer, connections: connLayer },
      rebuildImpact: (event, scenarioIdx) => {
        scene.remove(impactLayer);
        impactLayer.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
        impactLayer = buildImpactLayer(event, scenarioIdx);
        scene.add(impactLayer);
        sceneRef.current.impactLayer = impactLayer;
      },
    };

    // ── Animation loop ────────────────────────────────────────────────────────
    let rafId;
    const clock = new THREE.Clock();

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();

      atm.material.uniforms.time.value = t;
      if (cam.autoSpin) cam.targetTheta += mob ? 0.0005 : 0.0007;

      cam.theta  += (cam.targetTheta  - cam.theta)  * LERP_SPD;
      cam.phi    += (cam.targetPhi    - cam.phi)    * LERP_SPD;
      cam.radius += (cam.targetRadius - cam.radius) * LERP_SPD;
      applyCam();

      // Hotspot pulse
      hotspotLayer.children.forEach(group => {
        group.traverse(obj => {
          if (!obj.userData.pulse) return;
          const s = obj.userData;
          const beat = Math.sin(t * s.speed + (s.phase ?? 0));
          const sc   = 1 + 0.55 * Math.max(0, beat);
          obj.scale.set(sc, sc, 1);
          obj.material.opacity = s.base * (0.2 + 0.8 * Math.max(0, beat));
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

      // Satellite animation
      if (satLayer.visible) {
        satLayer.children.forEach(obj => {
          if (!obj.userData.isSatellite) return;
          const { incRad, lanRad, alt, phase, speed } = obj.userData;
          const a = t * speed + phase;
          const x = Math.cos(a);
          const y = Math.sin(a) * Math.cos(incRad);
          const z = Math.sin(a) * Math.sin(incRad);
          const xr = x * Math.cos(lanRad) - z * Math.sin(lanRad);
          const zr = x * Math.sin(lanRad) + z * Math.cos(lanRad);
          obj.position.set(xr*(R+alt), y*(R+alt), zr*(R+alt));
        });
      }

      // Maritime & connection arc dot animation
      [maritimeLayer, connLayer].forEach(layer => {
        if (!layer.visible) return;
        layer.traverse(obj => {
          if (!obj.userData.arcPts) return;
          obj.userData.arcT = (obj.userData.arcT + obj.userData.arcSpeed * 0.01) % 1;
          const pts = obj.userData.arcPts;
          const idx = Math.min(Math.floor(obj.userData.arcT * pts.length), pts.length - 1);
          obj.position.copy(pts[idx]);
        });
      });

      // Maritime chokepoint pulse
      if (maritimeLayer.visible) {
        maritimeLayer.traverse(obj => {
          if (obj.userData.chokepoint) {
            obj.material.opacity = obj.userData.baseOpacity * (0.6 + 0.4 * Math.sin(t * 1.8));
          }
        });
      }

      // Conflict zone pulse
      if (conflictLayer.visible) {
        conflictLayer.traverse(obj => {
          if (obj.userData.conflictPulse) {
            obj.material.opacity = obj.userData.baseOpacity * (0.5 + 0.5 * Math.abs(Math.sin(t * obj.userData.speed + obj.userData.phase)));
          }
        });
      }

      renderer.render(scene, camera);
    };
    tick();
    setReady(true);
    // Developer: set your Gemini key in browser console:
    // window.__GRIGORI_GEMINI_KEY = "your-key"
    if (typeof window !== "undefined" && !window.__GRIGORI_GEMINI_KEY) {
      window.__GRIGORI_GEMINI_KEY = "";  // set via console or env injection
    }

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
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // Rebuild impact layer on event/scenario change
  useEffect(() => {
    sceneRef.current.rebuildImpact?.(selectedEvent, activeScenario);
  }, [selectedEvent, activeScenario]);

  // Focus camera from sidebar click
  const focusEvent = useCallback(ev => {
    sceneRef.current.focusCameraOnEvent?.(ev);
    setSelectedEvent(ev);
    setActiveScenario(0);
  }, []);

  const counts = useMemo(() => ({
    high:   EVENTS.filter(e => e.intensity === "high").length,
    medium: EVENTS.filter(e => e.intensity === "medium").length,
    low:    EVENTS.filter(e => e.intensity === "low").length,
  }), []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
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
          onWarRoom={() => setShowWarRoom(v => !v)}
          showWarRoom={showWarRoom}
          marketData={marketData}
          onPersonalize={() => setShowPersonalize(v => !v)}
          showPersonalize={showPersonalize} />

        {/* GLOBE ROW — fills all remaining space between topbar and (on mobile) bottom sheet */}
        <div style={{
          position: "absolute",
          top: 48,
          left: (!isMobile) ? 264 : 0,
          right: (!isMobile && selectedEvent) ? 420 : 0,
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
            <div style={{ position: "absolute", bottom: isMobile ? "12vh" : 18,
              left: "50%", transform: "translateX(-50%)",
              color: "rgba(0,180,255,0.25)", fontSize: 10, fontFamily: mono,
              letterSpacing: "0.12em", textAlign: "center", pointerEvents: "none",
              whiteSpace: "nowrap", animation: "fadeUp 1.2s ease 0.8s both" }}>
              {isMobile ? "TAP A HOTSPOT TO ANALYSE" : "DRAG · SCROLL TO ZOOM · CLICK HOTSPOT"}
            </div>
          )}
        </div>

        {/* DESKTOP: Left sidebar */}
        {!isMobile && (
          <DesktopSidebar events={filteredEvents} selectedEvent={selectedEvent} onSelect={focusEvent} />
        )}

        {/* WAR ROOM PANEL */}
        {showWarRoom && !isMobile && (
          <WarRoomPanel
            topEvents={liveTopEvents}
            onSelect={ev => { focusEvent(ev); }}
            selectedEventId={selectedEvent?.id}
            onClose={() => setShowWarRoom(false)}
          />
        )}

        {/* PERSONALIZATION PANEL */}
        {showPersonalize && !isMobile && (
          <PersonalizationPanel
            prefs={prefs}
            onChange={setPrefs}
            onClose={() => setShowPersonalize(false)}
          />
        )}

        {/* DESKTOP: Right detail panel */}
        {!isMobile && selectedEvent && (
          <DesktopEventPanel
            event={selectedEvent}
            activeScenario={activeScenario}
            onScenarioChange={setActiveScenario}
            onClose={() => { setSelectedEvent(null); setActiveScenario(0); }}
          />
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
          />
        )}

        {/* Tooltip (desktop only) */}
        {!isMobile && <Tooltip text={tooltip.text} x={tooltip.x} y={tooltip.y} />}

        {/* Loading overlay */}
        {!ready && (
          <div style={{ position: "absolute", inset: 0, background: "#020810", zIndex: 100,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: 18 }}>
            <div style={{ color: "rgba(0,200,255,0.88)", fontFamily: display,
              fontSize: 34, fontWeight: 700, letterSpacing: "0.18em" }}>GRIGORI</div>
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
