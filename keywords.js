/**
 * keywords.js — Keyword Extraction & Region Detection
 *
 * Pure JS — no ML library required.
 *
 * Strategy:
 *  1. Strip stop-words, tokenise.
 *  2. Score tokens by a weighted geopolitical lexicon.
 *  3. Detect regions via a named-entity gazetteer.
 *
 * This keeps the pipeline fast and dependency-free while producing
 * clusters that are "good enough" for grouping related conflict stories.
 */

// ─── Stop-words ───────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with",
  "by","from","up","about","into","than","then","that","this","it","its",
  "is","was","are","were","be","been","being","have","has","had","do","did",
  "will","would","could","should","may","might","shall","can","need","must",
  "not","no","nor","so","yet","as","if","when","where","who","which","how",
  "said","says","say","one","two","three","also","after","before","over",
  "under","between","through","during","while","since","until","within",
  "more","most","some","any","all","both","each","few","many","much","such",
  "own","same","other","new","first","last","long","great","little","large",
  "next","early","old","young","public","private","local","national",
  "according","report","reported","reports","amid","against","us","they",
  "their","them","he","she","we","our","you","your","i","my","his","her",
  "paid","plans","available","only","email","internal","newsletter",
  "morning","evening","update","updates","live","blog","briefing",
  "breaking","watch","photo","video","analysis","opinion","comment",
]);

// ─── Geopolitical lexicon weights ─────────────────────────────────────────────
// Higher weight = more signal for clustering
const GEO_LEXICON = {
  // Conflict actions
  war: 3, attack: 3, strike: 3, invasion: 3, offensive: 3, bombing: 3,
  shelling: 3, airstrike: 3, missile: 3, drone: 3, ambush: 3, siege: 3,
  blockade: 3, clash: 2, skirmish: 2, battle: 3, ceasefire: 3,
  // Military entities
  military: 2, troops: 2, soldiers: 2, forces: 2, army: 2, navy: 2,
  airforce: 2, warship: 2, submarine: 2, battalion: 2, brigade: 2,
  // Diplomatic
  sanctions: 2, diplomacy: 2, negotiations: 2, treaty: 2, alliance: 2,
  nato: 3, un: 2, security: 2, council: 1,
  // Geopolitical nouns
  crisis: 2, escalation: 3, conflict: 3, tension: 2, standoff: 2,
  coup: 3, insurgency: 3, rebel: 2, militia: 2, terrorist: 2,
  // Resources
  oil: 2, gas: 1, pipeline: 2, uranium: 2, nuclear: 3, weapons: 2,
  electricity: 2, grid: 2, power: 2, refinery: 2, lng: 2,
  // Outcomes
  casualties: 2, killed: 2, wounded: 2, displaced: 2, refugees: 2,
  // Vessels / territory
  strait: 2, corridor: 2, border: 2, territory: 2, sovereignty: 2,
  // Political / civic pressure
  election: 3, elections: 3, vote: 2, voting: 2, coalition: 2, parliament: 2,
  government: 2, resignation: 2, protest: 3, protests: 3, demonstrators: 2,
  crackdown: 2, corruption: 2, regulation: 2, regulatory: 2, sanctions: 3,
  tariff: 2, tariffs: 2, trade: 2, dispute: 2, commission: 2, european: 2,
  migration: 2, asylum: 2, borderguards: 2, diplomacy: 2, minister: 1,
  // Cyber / infrastructure
  cyber: 3, cyberattack: 3, ransomware: 3, malware: 2, telecom: 2,
  infrastructure: 2, sabotage: 3, outage: 2, railway: 2, port: 2,
  data: 1, espionage: 2, network: 1, gridlock: 1,
};

/**
 * Extract weighted keywords from free text.
 * Returns top-N terms sorted by descending weight.
 *
 * @param {string} text
 * @param {number} topN
 * @returns {string[]}
 */
export function extractKeywords(text, topN = 15) {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !STOP_WORDS.has(t));

  // Frequency map weighted by lexicon
  const scores = {};
  for (const token of tokens) {
    const weight = GEO_LEXICON[token] ?? 1;
    scores[token] = (scores[token] ?? 0) + weight;
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);
}

// ─── Region Gazetteer ──────────────────────────────────────────────────────────
// Maps a keyword → canonical region label + approximate lat/lng centroid.

export const REGION_MAP = [
  { keywords: ["european union","european commission","eu parliament","brussels"], label: "European Union", lat: 50.85, lng: 4.35 },
  { keywords: ["uk","united kingdom","britain","london","westminster","downing street"], label: "United Kingdom", lat: 51.5, lng: -0.12 },
  { keywords: ["france","paris","macron","elysee"], label: "France", lat: 46.2, lng: 2.2 },
  { keywords: ["germany","berlin","bundestag","scholz"], label: "Germany", lat: 51.2, lng: 10.4 },
  { keywords: ["bulgaria","sofia","bulgarian","plovdiv","varna"], label: "Bulgaria", lat: 42.7, lng: 25.5 },
  { keywords: ["romania","bucharest","romanian"], label: "Romania", lat: 45.9, lng: 24.9 },
  { keywords: ["moldova","chisinau","transnistria"], label: "Moldova", lat: 47.0, lng: 28.8 },
  { keywords: ["serbia","belgrade"], label: "Serbia", lat: 44.0, lng: 20.9 },
  { keywords: ["kosovo","pristina"], label: "Kosovo", lat: 42.7, lng: 21.1 },
  { keywords: ["bosnia","sarajevo","republika srpska"], label: "Bosnia and Herzegovina", lat: 44.2, lng: 17.7 },
  { keywords: ["north macedonia","skopje"], label: "North Macedonia", lat: 41.6, lng: 21.7 },
  { keywords: ["greece","athens","aegean"], label: "Greece", lat: 39.1, lng: 22.9 },
  { keywords: ["turkey","turkiye","ankara","erdogan","aegean", "istanbul"], label: "Turkey", lat: 39.0, lng: 35.2 },
  { keywords: ["hungary","budapest","orban"], label: "Hungary", lat: 47.1, lng: 19.5 },
  { keywords: ["poland","warsaw"], label: "Poland", lat: 52.1, lng: 19.1 },
  { keywords: ["latvia","riga","lithuania","vilnius","estonia","tallinn","baltic states"], label: "Baltic Region", lat: 56.9, lng: 24.6 },
  { keywords: ["ukraine","kyiv","kharkiv","mariupol","zaporizhzhia","donbas","kherson","odesa","odessa"], label: "Ukraine", lat: 49.0, lng: 32.0 },
  { keywords: ["russia","moscow","kremlin","putin","siberia","kaliningrad"], label: "Russia", lat: 61.5, lng: 90.0 },
  { keywords: ["taiwan","taipei","tsmc","taiwan strait","median line","plaaf","rocaf"], label: "Taiwan Strait", lat: 24.5, lng: 122.0 },
  { keywords: ["china","beijing","pla","xinjiang","hongkong","south china sea"], label: "China", lat: 35.8, lng: 104.0 },
  { keywords: ["south china sea","spratly","paracel","manila"], label: "South China Sea", lat: 12.5, lng: 114.2 },
  { keywords: ["hormuz","iran","irgc","tehran","persian gulf","strait of hormuz"], label: "Strait of Hormuz", lat: 26.6, lng: 56.3 },
  { keywords: ["israel","gaza","hamas","hezbollah","west bank","jerusalem","tel aviv","idf"], label: "Middle East", lat: 31.5, lng: 35.2 },
  { keywords: ["lebanon","beirut","syria","damascus"], label: "Levant", lat: 33.9, lng: 36.3 },
  { keywords: ["iraq","baghdad","mosul","erbil"], label: "Iraq", lat: 33.3, lng: 44.4 },
  { keywords: ["yemen","houthi","aden","sanaa","red sea","bab el-mandeb","suez"], label: "Yemen / Red Sea", lat: 15.6, lng: 48.5 },
  { keywords: ["saudi","riyadh","aramco","opec"], label: "Saudi Arabia", lat: 24.0, lng: 45.0 },
  { keywords: ["colombia","bogota","cauca","medellin","farc"], label: "Colombia", lat: 4.7, lng: -74.1 },
  { keywords: ["venezuela","maduro","guyana","essequibo","caracas"], label: "Venezuela–Guyana", lat: 6.8, lng: -61.2 },
  { keywords: ["kashmir","line of control","pakistan","india","loc","islamabad","new delhi"], label: "Kashmir", lat: 34.5, lng: 74.3 },
  { keywords: ["pakistan","islamabad","karachi","lahore"], label: "Pakistan", lat: 30.4, lng: 69.3 },
  { keywords: ["india","new delhi","mumbai","modi"], label: "India", lat: 22.6, lng: 79.0 },
  { keywords: ["myanmar","burmese","junta","tatmadaw","mandalay","naypyidaw"], label: "Myanmar", lat: 21.9, lng: 96.1 },
  { keywords: ["north korea","pyongyang","kim jong","icbm","dprk"], label: "Korean Peninsula", lat: 39.0, lng: 127.5 },
  { keywords: ["mali","niger","burkina","sahel","jnim","gao","timbuktu"], label: "Sahel, West Africa", lat: 15.5, lng: 2.1 },
  { keywords: ["sudan","khartoum","darfur","rsf","saf"], label: "Sudan", lat: 15.6, lng: 32.5 },
  { keywords: ["ethiopia","tigray","amhara","addis ababa"], label: "Ethiopia", lat: 9.0, lng: 40.5 },
  { keywords: ["somalia","mogadishu","al-shabaab","horn of africa"], label: "Somalia", lat: 5.2, lng: 46.2 },
  { keywords: ["black sea","bosphorus","kerch","sevastopol","constanta","varna","odessa"], label: "Black Sea", lat: 43.0, lng: 34.0 },
  { keywords: ["balkans","western balkans","serbia","kosovo","belgrade","pristina","sarajevo","skopje","bosnia","bulgaria","romania"], label: "Balkans", lat: 43.7, lng: 22.4 },
  { keywords: ["afghanistan","kabul","taliban","kandahar"], label: "Afghanistan", lat: 33.9, lng: 67.7 },
];

const CATEGORY_RULES = [
  { category: "Military", pattern: /\b(war|military|missile|drone|troops|naval|airstrike|artillery|exercise|warship|carrier)\b/i },
  { category: "Political", pattern: /\b(government|coalition|parliament|cabinet|resignation|minister|commission|regulation|legislation)\b/i },
  { category: "Election", pattern: /\b(election|elections|vote|voting|ballot|polls|snap election)\b/i },
  { category: "Protest", pattern: /\b(protest|protests|demonstration|demonstrators|riot|strike action)\b/i },
  { category: "Energy", pattern: /\b(oil|gas|lng|pipeline|refinery|opec|energy security|power grid)\b/i },
  { category: "Cyber", pattern: /\b(cyber|cyberattack|ransomware|hack|breach|telecom outage|malware)\b/i },
  { category: "Trade", pattern: /\b(trade|tariff|customs|export control|supply chain|shipment|freight)\b/i },
  { category: "Sanctions", pattern: /\b(sanctions|asset freeze|export ban|blacklist)\b/i },
  { category: "Infrastructure", pattern: /\b(infrastructure|grid|railway|port disruption|telecom|pipeline sabotage|blackout)\b/i },
  { category: "Migration", pattern: /\b(migration|migrant|asylum|border crossing|refugee)\b/i },
  { category: "Diplomatic", pattern: /\b(diplomatic|talks|meeting|summit|envoy|mediation|ceasefire|agreement)\b/i },
  { category: "Shipping", pattern: /\b(shipping|tanker|container|rerouting|port|red sea|hormuz|suez|black sea)\b/i },
  { category: "Market", pattern: /\b(market|stocks|equities|vix|gold|bond|currency|investor sentiment)\b/i },
];

export function detectEventCategories(text) {
  const corpus = String(text ?? "");
  const matches = CATEGORY_RULES
    .filter((rule) => rule.pattern.test(corpus))
    .map((rule) => rule.category);
  return matches.length > 0 ? matches : ["Political"];
}

/**
 * Detect the most likely region from article text.
 *
 * @param {string} text
 * @returns {{ label: string, lat: number, lng: number }|null}
 */
export function detectRegion(input) {
  const title = typeof input === "string" ? input : String(input?.title ?? "");
  const summary = typeof input === "string" ? "" : String(input?.summary ?? input?.description ?? "");
  const content = typeof input === "string" ? "" : String(input?.content ?? "");
  const lower = `${title} ${summary} ${content}`.toLowerCase();
  const titleLower = title.toLowerCase();
  const summaryLower = summary.toLowerCase();

  let best = null;
  let bestScore = 0;
  let secondBestScore = 0;

  for (const region of REGION_MAP) {
    let score = 0;
    for (const kw of region.keywords) {
      if (titleLower.includes(kw)) score += 3;
      else if (summaryLower.includes(kw)) score += 2;
      else if (lower.includes(kw)) score += 1;
    }
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      best = region;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }

  if (!best || bestScore < 2) return null;
  if (secondBestScore > 0 && bestScore - secondBestScore < 2) return null;

  return { label: best.label, lat: best.lat, lng: best.lng };
}
