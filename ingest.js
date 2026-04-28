/**
 * ingest.js — News ingestion and historical backfill
 *
 * Live refresh keeps the existing recent-ingest behavior.
 * Historical backfill reuses the same normalization and relevance scoring,
 * but fetches small date windows manually and never calls Gemini.
 */

import { describeEnvVar } from "./config.js";
import { detectEventCategories, detectRegion, extractKeywords } from "./keywords.js";
import { createLogger } from "./logger.js";
import { fetchCurrentsArticles } from "./sources/currents.adapter.js";
import { fetchGdeltArticles } from "./sources/gdelt.adapter.js";
import { fetchNewsApiArticles } from "./sources/newsapi.adapter.js";
import { fetchNewsDataArticles } from "./sources/newsdata.adapter.js";
import { fetchRssArticles } from "./sources/rss.adapter.js";
import { getAllArticles, saveArticles } from "./store.js";

const log = createLogger("ingest");

const LIVE_QUERY_PACKS = [
  "military conflict war escalation",
  "naval strait blockade warship tanker",
  "missile strike drone attack air defense",
  "sanctions diplomacy ceasefire negotiation",
  "geopolitical tension crisis chokepoint shipping",
  "coup insurgency rebel offensive militia",
  "election unrest coalition collapse parliament crisis",
  "protest movement government resignation europe",
  "EU sanctions migration pressure energy security",
  "NATO Europe defense spending black sea baltic",
  "cyberattack government infrastructure pipeline sabotage",
  "trade dispute export control semiconductor rare earth",
  "Bulgaria election government energy corruption",
  "Serbia Kosovo tensions Balkans protest",
  "Romania Moldova security Black Sea NATO",
  "Turkey Greece tensions eastern mediterranean",
];

const BACKFILL_QUERY_PACKS = [
  "geopolitical risk sanctions election protest europe",
  "military shipping chokepoint energy security conflict",
  "cyberattack infrastructure trade dispute export control",
  "EU Balkans NATO migration pressure black sea",
  "middle east taiwan ukraine russia iran red sea",
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
];

const SOURCE_QUALITY = {
  gdelt: 0.95,
  rss: 0.82,
  newsdata: 0.75,
  currents: 0.7,
  newsapi: 0.65,
};

const SOURCE_PRIORITY = ["gdelt", "rss", "newsdata", "currents", "newsapi"];
const HISTORICAL_SUPPORT = {
  gdelt: true,
  rss: false,
  newsdata: true,
  currents: true,
  newsapi: true,
};

const STRATEGIC_SIGNAL_PATTERNS = [
  /\b(war|conflict|strike|missile|drone|attack|military|naval|troops|ceasefire|sanctions|nuclear|diplomacy|talks|summit|election|coup|insurgency|rebel|militia)\b/i,
  /\b(hormuz|red sea|black sea|taiwan|ukraine|russia|iran|israel|gaza|hezbollah|nato|eu|balkans|syria|lebanon|sudan|sahel|kashmir|china|semiconductor|shipping|tanker|pipeline|grain corridor)\b/i,
  /\b(oil|gas|lng|freight|port|sanction|trade route|insurance premium|export control|airspace|escort|convoy)\b/i,
  /\b(election|protest|parliament|coalition|resignation|regulatory|commission|migration|cyber|infrastructure|grid|telecom|tariff|supply chain)\b/i,
];

const NOISE_TITLE_PATTERNS = [
  /\b(marathon|football|soccer|tennis|cricket|olympic|formula 1|f1|championship|boxing)\b/i,
  /\b(movie|tv|show|series|celebrity|fashion|music|album|trailer|netflix|streaming)\b/i,
  /\b(morning update|evening update|live blog update|daily briefing|best .* every year)\b/i,
  /\b(cyberfraud|lottery|horoscope|recipe|travel tips|luxury resort)\b/i,
];

const MIN_RELEVANCE_SCORE = 3;
const DOWNRANKED_SOURCE_PATTERNS = [
  /einnews|menafn|naturalnews|dailymail|latestly|chronicleonline|citizentribune/i,
];

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

function buildSourceDomains(raw) {
  if (Array.isArray(raw.sourceDomains) && raw.sourceDomains.length > 0) {
    return raw.sourceDomains;
  }
  if (!raw.url) return [];
  try {
    return [new URL(raw.url).hostname.replace(/^www\./, "")];
  } catch {
    return [];
  }
}

function normalise(raw) {
  const title = raw.title?.trim();
  const summary = (raw.summary ?? raw.description ?? "").trim();
  const content = (raw.content ?? summary ?? "").trim();
  if (!title || title === "[Removed]" || content === "[Removed]") return null;

  const text = `${title} ${summary} ${content}`;
  const keywords = extractKeywords(text);
  const region = detectRegion({ title, summary, content });

  return {
    id: raw.url,
    title,
    source: typeof raw.source === "string" ? raw.source : (raw.source?.name ?? "Unknown"),
    publishedAt: raw.publishedAt ?? new Date().toISOString(),
    summary,
    content,
    url: raw.url,
    keywords,
    region,
    categories: raw.categories ?? detectEventCategories(text),
    sourceQuality: raw.sourceQuality ?? 0.5,
    relevanceScore: raw.relevanceScore ?? 0,
    sourceDomains: buildSourceDomains(raw),
  };
}

function computeRelevanceScore(article) {
  const title = String(article.title ?? "");
  const summary = String(article.summary ?? article.description ?? "");
  const content = String(article.content ?? "");
  const text = `${title} ${summary} ${content}`;
  const region = detectRegion({ title, summary, content });
  const keywords = extractKeywords(text, 14);
  const categories = detectEventCategories(text);

  let score = 0;
  for (const pattern of STRATEGIC_SIGNAL_PATTERNS) {
    if (pattern.test(title)) score += 2;
    else if (pattern.test(text)) score += 1;
  }

  if (region) score += 1;
  if (keywords.length >= 4) score += 1;
  if ((article.sourceQuality ?? 0.5) >= 0.8) score += 1;
  if (categories.some((category) => ["Political", "Election", "Energy", "Cyber", "Diplomatic", "Infrastructure", "Trade", "Sanctions", "Migration", "Shipping", "Military"].includes(category))) {
    score += 1;
  }
  if (DOWNRANKED_SOURCE_PATTERNS.some((pattern) => pattern.test(String(article.source ?? "")))) {
    score -= 2;
  }
  for (const pattern of NOISE_TITLE_PATTERNS) {
    if (pattern.test(title)) score -= 4;
  }

  return { score, region, keywords, categories };
}

function isRelevantArticle(article) {
  const title = String(article.title ?? "").trim();
  if (!title) return false;
  const { score } = computeRelevanceScore(article);
  return score >= MIN_RELEVANCE_SCORE;
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

function toIsoDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function startOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function endOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function buildBackfillWindows(days, batchDays) {
  const today = startOfUtcDay(Date.now());
  const start = new Date(today.getTime() - Math.max(1, days - 1) * 24 * 60 * 60 * 1000);
  const windows = [];
  let cursor = new Date(start);

  while (cursor <= today) {
    const from = new Date(cursor);
    const to = new Date(Math.min(endOfUtcDay(new Date(cursor.getTime() + (batchDays - 1) * 24 * 60 * 60 * 1000)).getTime(), endOfUtcDay(today).getTime()));
    windows.push({ from: from.toISOString(), to: to.toISOString() });
    cursor = new Date(to.getTime() + 1000);
  }

  return windows;
}

function detectProviderFailure(err) {
  const status = err?.response?.status ?? err?.status ?? 0;
  if (status === 401 || status === 402 || status === 403) return "plan_or_auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  if (/histor|archive|plan|upgrade/i.test(String(err?.message ?? ""))) return "plan_or_auth";
  return "provider_error";
}

async function fetchFromSource(sourceName, fetcher, { historical = false, windowStart = null, windowEnd = null } = {}) {
  try {
    const articles = await fetcher();
    if (historical) {
      log.info(`[ingest] ${sourceName} ${toIsoDay(windowStart)}→${toIsoDay(windowEnd)} returned ${articles.length} articles`);
    } else {
      log.info(`[ingest] ${sourceName} returned ${articles.length} articles`);
    }
    return {
      status: "ok",
      sourceName,
      articles: articles.map((article) => ({
        ...article,
        sourceQuality: article.sourceQuality ?? SOURCE_QUALITY[sourceName] ?? 0.5,
        sourceDomains: buildSourceDomains(article),
      })),
    };
  } catch (err) {
    const kind = detectProviderFailure(err);
    const message = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 240)
      : String(err.message ?? "unknown error");
    log.warn(`[ingest] ${sourceName} failed${historical ? ` ${toIsoDay(windowStart)}→${toIsoDay(windowEnd)}` : ""} — ${message}`);
    return { status: kind, sourceName, articles: [], error: message };
  }
}

function collectSourceFetches({ queries, pageSize, windowStart = null, windowEnd = null, historical = false, includeRss = true }) {
  const newsApiStatus = describeEnvVar("NEWS_API_KEY");
  const newsDataStatus = describeEnvVar("NEWSDATA_API_KEY");
  const currentsStatus = describeEnvVar("CURRENTS_API_KEY");
  const rssFeeds = (process.env.RSS_FEED_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const tasks = [];

  if (isSourceEnabled("gdelt")) {
    tasks.push(fetchFromSource("gdelt", () => fetchGdeltArticles({
      queries,
      pageSize,
      from: windowStart,
      to: windowEnd,
    }), { historical, windowStart, windowEnd }));
  }

  if (includeRss && isSourceEnabled("rss") && !historical) {
    tasks.push(fetchFromSource("rss", () => fetchRssArticles({
      feedUrls: rssFeeds.length > 0 ? rssFeeds : undefined,
      pageSize,
    }), { historical: false }));
  }

  if (historical && !HISTORICAL_SUPPORT.rss) {
    tasks.push(Promise.resolve({ status: "unsupported", sourceName: "rss", articles: [], error: "RSS feeds do not reliably support 30-day history retrieval." }));
  }

  if (isSourceEnabled("newsdata") && newsDataStatus.usable) {
    tasks.push(fetchFromSource("newsdata", () => fetchNewsDataArticles({
      apiKey: process.env.NEWSDATA_API_KEY?.trim(),
      queries,
      pageSize,
      from: windowStart,
      to: windowEnd,
      historical,
    }), { historical, windowStart, windowEnd }));
  }

  if (isSourceEnabled("currents") && currentsStatus.usable) {
    tasks.push(fetchFromSource("currents", () => fetchCurrentsArticles({
      apiKey: process.env.CURRENTS_API_KEY?.trim(),
      queries,
      pageSize,
      from: windowStart,
      to: windowEnd,
      historical,
    }), { historical, windowStart, windowEnd }));
  }

  if (isSourceEnabled("newsapi") && newsApiStatus.usable) {
    tasks.push(fetchFromSource("newsapi", () => fetchNewsApiArticles({
      apiKey: process.env.NEWS_API_KEY?.trim(),
      queries,
      pageSize,
      from: windowStart,
      to: windowEnd,
    }), { historical, windowStart, windowEnd }));
  }

  return tasks;
}

function finalizeArticles(rawArticles, maxItems, { seedIfEmpty = false } = {}) {
  const beforeCount = getAllArticles().length;
  const deduped = dedupeArticles(rawArticles);
  const scored = deduped.map((article) => {
    const { score, categories } = computeRelevanceScore(article);
    return { ...article, relevanceScore: score, categories };
  });
  const relevant = scored.filter((article) => isRelevantArticle(article));
  const normalised = relevant
    .sort((a, b) => {
      const scoreDelta = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return (b.sourceQuality ?? 0) - (a.sourceQuality ?? 0);
    })
    .slice(0, maxItems)
    .map(normalise)
    .filter(Boolean);

  if (normalised.length === 0 && seedIfEmpty) {
    const seeded = seedArticles(maxItems);
    saveArticles(seeded);
    const added = Math.max(0, getAllArticles().length - beforeCount);
    const seededNewest = seeded.reduce((latest, article) => {
      const publishedAt = article?.publishedAt ? new Date(article.publishedAt).getTime() : 0;
      return publishedAt > latest ? publishedAt : latest;
    }, 0);
    return {
      mode: "seed",
      fetched: seeded.length,
      saved: added,
      keptCount: seeded.length,
      filteredOutCount: 0,
      lowRelevanceCount: 0,
      duplicatesSkipped: 0,
      newestArticleAt: seededNewest ? new Date(seededNewest).toISOString() : null,
    };
  }

  saveArticles(normalised);
  const afterCount = getAllArticles().length;
  const newestArticleAt = scored.reduce((latest, article) => {
    const publishedAt = article?.publishedAt ? new Date(article.publishedAt).getTime() : 0;
    return publishedAt > latest ? publishedAt : latest;
  }, 0);
  return {
    mode: "external",
    fetched: rawArticles.length,
    saved: Math.max(0, afterCount - beforeCount),
    keptCount: normalised.length,
    filteredOutCount: Math.max(0, deduped.length - normalised.length),
    lowRelevanceCount: Math.max(0, deduped.length - relevant.length),
    duplicatesSkipped: Math.max(0, rawArticles.length - Math.max(0, afterCount - beforeCount)),
    newestArticleAt: newestArticleAt ? new Date(newestArticleAt).toISOString() : null,
  };
}

export async function ingest({ apiKey, maxPerRun = 40 }) {
  const newsKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const newsApiStatus = describeEnvVar("NEWS_API_KEY");
  const newsDataStatus = describeEnvVar("NEWSDATA_API_KEY");
  const currentsStatus = describeEnvVar("CURRENTS_API_KEY");
  log.info(`[ingest] Starting multi-source ingestion — priority=${SOURCE_PRIORITY.join(" > ")}`);

  const configuredSources = [
    isSourceEnabled("gdelt"),
    isSourceEnabled("rss"),
    isSourceEnabled("newsdata") && newsDataStatus.usable,
    isSourceEnabled("currents") && currentsStatus.usable,
    isSourceEnabled("newsapi") && newsKey && newsApiStatus.usable,
  ].filter(Boolean).length || 1;

  const perSource = Math.max(5, Math.ceil(maxPerRun / configuredSources));
  const results = await Promise.all(
    collectSourceFetches({
      queries: LIVE_QUERY_PACKS,
      pageSize: perSource,
      historical: false,
      includeRss: true,
    })
  );

  const fetchedBySource = results.flatMap((result) => result.articles ?? []);
  const final = finalizeArticles(fetchedBySource, maxPerRun, { seedIfEmpty: true });
  log.info(`[ingest] Filtered ${final.lowRelevanceCount} low-relevance articles; kept ${Math.max(0, final.fetched - final.filteredOutCount)}`);

  const providerDiagnostics = results.map((result) => ({
    provider: result.sourceName,
    status: result.status,
    articlesFetched: result.articles?.length ?? 0,
    error: result.error ?? null,
  }));
  const providersUsed = providerDiagnostics
    .filter((item) => item.status === "ok" && item.articlesFetched > 0)
    .map((item) => item.provider);
  const rateLimitedProviders = providerDiagnostics
    .filter((item) => item.status === "rate_limited")
    .map((item) => item.provider);
  const skippedProviders = providerDiagnostics
    .filter((item) => item.status !== "ok" && item.status !== "rate_limited")
    .map((item) => ({ provider: item.provider, reason: item.error ?? item.status }));

  return {
    fetched: final.fetched,
    saved: final.saved,
    keptCount: final.keptCount,
    mode: final.mode === "seed" ? "seed" : "live",
    filteredOutCount: final.filteredOutCount,
    lowRelevanceCount: final.lowRelevanceCount,
    duplicatesSkipped: final.duplicatesSkipped,
    newestArticleAt: final.newestArticleAt ?? null,
    providerDiagnostics,
    providersUsed,
    rateLimitedProviders,
    skippedProviders,
  };
}

export async function ingestHistoricalBackfill({
  days = 30,
  batchDays = 3,
  maxArticlesPerBatch = 50,
} = {}) {
  const windows = buildBackfillWindows(days, batchDays);
  const providersUsed = new Set();
  const skippedProviders = new Map();
  const rateLimitedProviders = new Set();
  let articlesFetched = 0;
  let articlesSaved = 0;
  let filteredOutCount = 0;
  let lowRelevanceCount = 0;
  let duplicatesSkipped = 0;
  let windowsProcessed = 0;

  for (const window of windows) {
    const configuredSources = SOURCE_PRIORITY.filter((sourceName) => {
      if (sourceName === "rss") return false;
      if (sourceName === "newsapi") return isSourceEnabled("newsapi") && describeEnvVar("NEWS_API_KEY").usable;
      if (sourceName === "newsdata") return isSourceEnabled("newsdata") && describeEnvVar("NEWSDATA_API_KEY").usable;
      if (sourceName === "currents") return isSourceEnabled("currents") && describeEnvVar("CURRENTS_API_KEY").usable;
      return isSourceEnabled(sourceName);
    }).length || 1;

    const perSource = Math.max(4, Math.ceil(maxArticlesPerBatch / configuredSources));
    const results = await Promise.all(
      collectSourceFetches({
        queries: BACKFILL_QUERY_PACKS,
        pageSize: perSource,
        historical: true,
        includeRss: false,
        windowStart: window.from,
        windowEnd: window.to,
      })
    );

    const rawWindowArticles = [];
    for (const result of results) {
      if (result.status === "ok") {
        if (result.articles.length > 0) providersUsed.add(result.sourceName);
        rawWindowArticles.push(...result.articles);
        continue;
      }
      if (result.status === "unsupported" || result.status === "plan_or_auth") {
        skippedProviders.set(result.sourceName, result.error ?? "Historical retrieval unsupported on current plan.");
      }
      if (result.status === "rate_limited") {
        rateLimitedProviders.add(result.sourceName);
      }
    }

    const finalized = finalizeArticles(rawWindowArticles, maxArticlesPerBatch, { seedIfEmpty: false });
    articlesFetched += finalized.fetched;
    articlesSaved += finalized.saved;
    filteredOutCount += finalized.filteredOutCount;
    lowRelevanceCount += finalized.lowRelevanceCount;
    duplicatesSkipped += finalized.duplicatesSkipped;
    windowsProcessed += 1;

    log.info(`[ingest] backfill window ${toIsoDay(window.from)}→${toIsoDay(window.to)} fetched=${finalized.fetched} saved=${finalized.saved} filtered=${finalized.filteredOutCount}`);

    if (rateLimitedProviders.size >= 2 && rawWindowArticles.length === 0) {
      log.warn("[ingest] Backfill stopping early because multiple providers rate-limited the current window.");
      break;
    }
  }

  return {
    mode: "backfill",
    windowsProcessed,
    providersUsed: [...providersUsed],
    skippedProviders: [...skippedProviders.entries()].map(([provider, reason]) => ({ provider, reason })),
    rateLimitedProviders: [...rateLimitedProviders],
    articlesFetched,
    articlesSaved,
    filteredOutCount,
    lowRelevanceCount,
    duplicatesSkipped,
  };
}
