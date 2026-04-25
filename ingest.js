/**
 * ingest.js — News Ingestion Module
 *
 * Fetches geopolitical articles from NewsAPI, extracts keywords,
 * detects regions, and persists normalised articles to the store.
 *
 * Query strategy: we run several targeted queries covering the major
 * conflict/tension categories Grigori tracks, then deduplicate.
 */

import { saveArticles } from "./store.js";
import { describeEnvVar } from "./config.js";
import { extractKeywords, detectRegion } from "./keywords.js";
import { createLogger } from "./logger.js";
import { fetchCurrentsArticles } from "./sources/currents.adapter.js";
import { fetchGdeltArticles } from "./sources/gdelt.adapter.js";
import { fetchNewsApiArticles } from "./sources/newsapi.adapter.js";
import { fetchNewsDataArticles } from "./sources/newsdata.adapter.js";
import { fetchRssArticles } from "./sources/rss.adapter.js";

const log = createLogger("ingest");

/**
 * Topic queries sent to NewsAPI.
 * Keep them broad enough to catch evolving stories.
 */
const QUERIES = [
  "military conflict war escalation",
  "naval strait blockade warship",
  "missile strike drone attack",
  "sanctions diplomacy ceasefire",
  "geopolitical tension crisis",
  "coup insurgency rebel offensive",
];

const SEED_ARTICLES = [
  {
    title: "Black Sea shipping insurers reprice after renewed naval strikes",
    description: "Commercial traffic near Odesa slowed after fresh attacks and naval patrols.",
    content: "Commercial traffic near Odesa slowed after fresh attacks and naval patrols. Insurers raised war-risk pricing while Turkish officials discussed corridor security with NATO counterparts.",
    source: { name: "Seed Wire" },
    url: "https://grigori.local/seed/black-sea-insurers",
  },
  {
    title: "Drone strikes disrupt port infrastructure near Odesa overnight",
    description: "Port operators reported temporary diversions after damage assessments.",
    content: "Port operators reported temporary diversions after damage assessments. Regional officials said grain shipments could face short delays while surveillance activity intensified in the Black Sea.",
    source: { name: "Seed Wire" },
    url: "https://grigori.local/seed/black-sea-port-strikes",
  },
  {
    title: "Tanker escorts reviewed after harassment in the Strait of Hormuz",
    description: "Maritime security agencies warned shippers to review routing and convoy options.",
    content: "Maritime security agencies warned shippers to review routing and convoy options after small craft harassment near the Strait of Hormuz. Energy traders flagged renewed supply risk.",
    source: { name: "Seed Wire" },
    url: "https://grigori.local/seed/hormuz-escorts",
  },
  {
    title: "Gulf shippers weigh rerouting after insurance premiums jump",
    description: "War-risk insurance rose sharply for some Gulf voyages.",
    content: "War-risk insurance rose sharply for some Gulf voyages, prompting shippers to weigh rerouting and schedule changes. Analysts warned of spillover into Red Sea freight markets.",
    source: { name: "Seed Wire" },
    url: "https://grigori.local/seed/gulf-shippers-rerouting",
  },
  {
    title: "Taiwan reports new air incursions across median line",
    description: "Defence officials tracked multiple sorties in the Taiwan Strait.",
    content: "Defence officials tracked multiple sorties in the Taiwan Strait and activated response patrols. Regional markets watched semiconductor supply risk and shipping exposure.",
    source: { name: "Seed Wire" },
    url: "https://grigori.local/seed/taiwan-air-incursions",
  },
  {
    title: "Allied patrols expand as cross-strait tensions intensify",
    description: "Allied patrols and exercises expanded around the first island chain.",
    content: "Allied patrols and exercises expanded around the first island chain as cross-strait tensions intensified. Diplomats urged restraint while traders assessed technology supply-chain risk.",
    source: { name: "Seed Wire" },
    url: "https://grigori.local/seed/cross-strait-patrols",
  },
];

const SOURCE_QUALITY = {
  gdelt: 0.95,
  rss: 0.82,
  newsdata: 0.75,
  currents: 0.7,
  newsapi: 0.65,
};

const SOURCE_PRIORITY = ["gdelt", "rss", "newsdata", "currents", "newsapi"];

function isSourceEnabled(name) {
  const raw = process.env[`ENABLE_${name.toUpperCase()}`];
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw.trim().toLowerCase());
}

function titleKey(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a, b) {
  const left = new Set(titleKey(a).split(" ").filter(Boolean));
  const right = new Set(titleKey(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection++;
  }

  return intersection / Math.max(left.size, right.size);
}

/**
 * Normalise a raw NewsAPI article into our internal Article shape.
 * @param {RawArticle} raw
 * @returns {Article|null}
 */
function normalise(raw) {
  const title = raw.title?.trim();
  const summary = (raw.summary ?? raw.description ?? "").trim();
  const content = (raw.content ?? summary ?? "").trim();

  // Drop articles with no usable text or removed content
  if (!title || title === "[Removed]" || content === "[Removed]") return null;

  const text = `${title} ${content}`;
  const keywords = extractKeywords(text);
  const region = detectRegion(text);

  return {
    id: raw.url,                          // stable dedup key
    title,
    source: typeof raw.source === "string" ? raw.source : (raw.source?.name ?? "Unknown"),
    publishedAt: raw.publishedAt ?? new Date().toISOString(),
    summary,
    content,
    url: raw.url,
    keywords,
    region,
    sourceQuality: raw.sourceQuality ?? 0.5,
  };
}

function seedArticles(maxPerRun) {
  const now = Date.now();

  return SEED_ARTICLES.slice(0, Math.max(1, Math.min(maxPerRun, SEED_ARTICLES.length)))
    .map((article, index) => normalise({
      ...article,
      publishedAt: new Date(now - index * 45 * 60 * 1000).toISOString(),
    }))
    .filter(Boolean);
}

function dedupeArticles(rawArticles) {
  const unique = [];

  for (const article of rawArticles) {
    const existing = unique.find((candidate) =>
      (article.url && candidate.url && article.url === candidate.url) ||
      titleSimilarity(article.title, candidate.title) >= 0.9
    );

    if (!existing) {
      unique.push(article);
      continue;
    }

    if ((article.sourceQuality ?? 0) > (existing.sourceQuality ?? 0)) {
      Object.assign(existing, article);
    }
  }

  return unique;
}

async function fetchFromSource(sourceName, fetcher) {
  try {
    const articles = await fetcher();
    log.info(`[ingest] ${sourceName} returned ${articles.length} articles`);
    return articles.map((article) => ({
      ...article,
      sourceQuality: article.sourceQuality ?? SOURCE_QUALITY[sourceName] ?? 0.5,
    }));
  } catch (err) {
    const message = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 300)
      : err.message;
    log.warn(`[ingest] ${sourceName} failed — ${message}`);
    return [];
  }
}

/**
 * Run a full ingestion cycle.
 * Fetches all query sets, deduplicates, normalises, and saves.
 *
 * @param {{ apiKey: string, maxPerRun?: number }} options
 * @returns {Promise<{ fetched: number, saved: number }>}
 */
export async function ingest({ apiKey, maxPerRun = 40 }) {
  const newsKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const newsApiStatus = describeEnvVar("NEWS_API_KEY");
  const newsDataStatus = describeEnvVar("NEWSDATA_API_KEY");
  const currentsStatus = describeEnvVar("CURRENTS_API_KEY");
  const rssFeeds = (process.env.RSS_FEED_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  log.info(`[ingest] Starting multi-source ingestion — priority=${SOURCE_PRIORITY.join(" > ")}`);

  const perSource = Math.max(4, Math.ceil(maxPerRun / SOURCE_PRIORITY.length));
  const sourceResults = [];

  if (isSourceEnabled("gdelt")) {
    sourceResults.push(fetchFromSource("gdelt", () => fetchGdeltArticles({
      queries: QUERIES,
      pageSize: perSource,
    })));
  }

  if (isSourceEnabled("rss")) {
    sourceResults.push(fetchFromSource("rss", () => fetchRssArticles({
      feedUrls: rssFeeds.length > 0 ? rssFeeds : undefined,
      pageSize: perSource,
    })));
  }

  if (isSourceEnabled("newsdata") && newsDataStatus.usable) {
    sourceResults.push(fetchFromSource("newsdata", () => fetchNewsDataArticles({
      apiKey: process.env.NEWSDATA_API_KEY?.trim(),
      queries: QUERIES,
      pageSize: perSource,
    })));
  }

  if (isSourceEnabled("currents") && currentsStatus.usable) {
    sourceResults.push(fetchFromSource("currents", () => fetchCurrentsArticles({
      apiKey: process.env.CURRENTS_API_KEY?.trim(),
      queries: QUERIES,
      pageSize: perSource,
    })));
  }

  if (isSourceEnabled("newsapi") && newsKey && newsApiStatus.usable) {
    sourceResults.push(fetchFromSource("newsapi", () => fetchNewsApiArticles({
      apiKey: newsKey,
      queries: QUERIES,
      pageSize: perSource,
    })));
  }

  const fetchedBySource = (await Promise.all(sourceResults)).flat();
  const deduped = dedupeArticles(fetchedBySource);

  const normalised = deduped
    .slice(0, maxPerRun)
    .map(normalise)
    .filter(Boolean);

  if (normalised.length === 0) {
    const seeded = seedArticles(maxPerRun);
    saveArticles(seeded);
    log.warn("[ingest] All external sources unavailable or empty — loaded local seed articles");
    return { fetched: seeded.length, saved: seeded.length, mode: "seed" };
  }

  saveArticles(normalised);
  log.info(`[ingest] Saved ${normalised.length} normalised articles`);
  return { fetched: fetchedBySource.length, saved: normalised.length, mode: "live" };
}
