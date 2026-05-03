/**
 * ingest.js — News ingestion and historical backfill
 *
 * Live refresh keeps the existing recent-ingest behavior.
 * Historical backfill reuses the same normalization and relevance scoring,
 * but fetches small date windows manually and never calls Gemini.
 */

import { describeEnvVar, getConfig } from "./config.js";
import { detectEventCategories, detectRegion, extractKeywords } from "./keywords.js";
import { createLogger } from "./logger.js";
import { fetchCurrentsArticles } from "./sources/currents.adapter.js";
import { fetchGdeltArticles } from "./sources/gdelt.adapter.js";
import { fetchGNewsArticles } from "./sources/gnews.adapter.js";
import { fetchNewsApiArticles } from "./sources/newsapi.adapter.js";
import { fetchNewsDataArticles } from "./sources/newsdata.adapter.js";
import { fetchRssArticles } from "./sources/rss.adapter.js";
import { getLayerCache, getLayerUsageStats, recordLayerUsage, setLayerCache } from "./supabase.js";
import { getAllArticles, saveArticles } from "./store.js";
import { classifySourceTier, detectContentType, evaluateArticleQuality, isAmbiguousNonStrategicDraft } from "./signal-quality.js";

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

const GNEWS_LIVE_QUERY_PACKS = [
  "geopolitical risk sanctions elections protests diplomacy",
  "Europe Balkans political risk EU sanctions election protest",
  "energy security oil gas chokepoint tanker shipping pipeline",
  "military sanctions cyber critical infrastructure government attack",
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
  currents: 0.76,
  gnews: 0.73,
  thenewsapi: 0.72,
  worldnewsapi: 0.71,
  gdelt: 0.95,
  rss: 0.82,
  newsdata: 0.75,
  newsapi: 0.65,
};

const SOURCE_PRIORITY = ["currents", "gnews", "thenewsapi", "worldnewsapi", "newsdata", "newsapi", "gdelt", "rss"];
const HISTORICAL_SUPPORT = {
  gnews: false,
  gdelt: true,
  rss: false,
  newsdata: true,
  currents: true,
  newsapi: true,
};
const SUPPORTED_SOURCES = new Set(["currents", "gnews", "newsdata", "newsapi", "gdelt", "rss"]);
const PROVIDER_STATE_PREFIX = "news_provider_";

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

function providerLayerKey(name) {
  return `${PROVIDER_STATE_PREFIX}${name}`;
}

function startOfUtcDayIso(value = Date.now()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function isSameUtcDay(left, right = Date.now()) {
  if (!left) return false;
  return startOfUtcDayIso(left) === startOfUtcDayIso(right);
}

function getProviderCredentialStatus(name) {
  if (name === "gnews") return describeEnvVar("GNEWS_API_KEY");
  if (name === "newsapi") return describeEnvVar("NEWS_API_KEY");
  if (name === "newsdata") return describeEnvVar("NEWSDATA_API_KEY");
  if (name === "currents") return describeEnvVar("CURRENTS_API_KEY");
  return { present: true, usable: true, reason: "n/a" };
}

function getProviderDailyLimit(name) {
  const config = getConfig();
  if (name === "gnews") return config.gnewsDailyLimit;
  return null;
}

async function getProviderRuntimeState(name) {
  const config = getConfig();
  const enabled = name === "gnews" ? config.enableGnews : isSourceEnabled(name);
  const credentials = getProviderCredentialStatus(name);
  const cache = await getLayerCache(providerLayerKey(name));
  const usage = await getLayerUsageStats(providerLayerKey(name));
  const metadata = cache.record?.metadata ?? {};

  return {
    provider: name,
    enabled,
    configured: credentials.usable,
    callsToday: usage.callsToday ?? 0,
    dailyLimit: getProviderDailyLimit(name),
    lastCallAt: metadata.lastCallAt ?? null,
    lastSuccessAt: metadata.lastSuccessAt ?? null,
    lastRateLimitedAt: metadata.lastRateLimitedAt ?? null,
    status: metadata.status ?? (enabled ? (credentials.usable ? "active" : "disabled") : "disabled"),
    message: metadata.message ?? null,
  };
}

async function saveProviderRuntimeState(name, metadata = {}) {
  const state = await getProviderRuntimeState(name);
  const nextMetadata = {
    provider: name,
    enabled: state.enabled,
    dailyLimit: state.dailyLimit,
    ...metadata,
  };
  await setLayerCache(providerLayerKey(name), [], nextMetadata, null);
}

async function recordProviderCalls(name, count = 1, source = "provider") {
  const safeCount = Math.max(0, Number(count) || 0);
  for (let index = 0; index < safeCount; index += 1) {
    await recordLayerUsage(providerLayerKey(name), source);
  }
}

function getGnewsQueries(maxCalls, historical = false) {
  const base = historical ? BACKFILL_QUERY_PACKS : GNEWS_LIVE_QUERY_PACKS;
  return base.slice(0, Math.max(0, maxCalls));
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
  const sourceDomains = buildSourceDomains(raw);
  const source = typeof raw.source === "string" ? raw.source : (raw.source?.name ?? "Unknown");
  const sourceTier = classifySourceTier({ domain: sourceDomains[0] ?? raw.url, source });
  const contentType = raw.contentType ?? detectContentType({ ...raw, title, summary, content, source });

  return {
    id: raw.url,
    title,
    source,
    publishedAt: raw.publishedAt ?? null,
    summary,
    content,
    url: raw.url,
    keywords,
    region,
    categories: raw.categories ?? detectEventCategories(text),
    sourceQuality: Math.max(Number(raw.sourceQuality ?? 0.5), sourceTier.score),
    sourceTier: sourceTier.tier,
    sourceTierLabel: sourceTier.label,
    contentType,
    relevanceScore: raw.relevanceScore ?? 0,
    sourceDomains,
    provider: raw.provider ?? null,
    fetchedAt: raw.fetchedAt ?? new Date().toISOString(),
    rawPublishedAt: raw.rawPublishedAt ?? raw.publishedAt ?? null,
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
  const quality = evaluateArticleQuality({
    ...article,
    region,
    categories,
    relevanceScore: 0,
  });

  let score = 0;
  for (const pattern of STRATEGIC_SIGNAL_PATTERNS) {
    if (pattern.test(title)) score += 2;
    else if (pattern.test(text)) score += 1;
  }

  if (region) score += 1;
  if (keywords.length >= 4) score += 1;
  if ((article.sourceQuality ?? 0.5) >= 0.8) score += 1;
  if (quality.sourceTier === "tier_1") score += 2;
  if (quality.sourceTier === "tier_2") score += 1;
  if (quality.sourceTier === "tier_3") score -= 2;
  if (categories.some((category) => ["Political", "Election", "Energy", "Cyber", "Diplomatic", "Infrastructure", "Trade", "Sanctions", "Migration", "Shipping", "Military"].includes(category))) {
    score += 1;
  }
  if (["opinion", "editorial", "letter"].includes(quality.contentType)) score -= 5;
  if (isAmbiguousNonStrategicDraft(article)) score -= 5;
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

function createProviderDiagnosticsBucket(provider) {
  return {
    provider,
    fetched: 0,
    normalized: 0,
    saved_article: 0,
    save_failed: 0,
    afterDateFilter: 0,
    articlesUsable: 0,
    articlesRejectedAsOld: 0,
    articlesRejectedAsDuplicate: 0,
    duplicateReconfirmed: 0,
    articlesRejectedAsLowRelevance: 0,
    articlesRejectedAsLowQuality: 0,
    dropped_missing_title: 0,
    dropped_missing_url: 0,
    dropped_missing_date: 0,
    clusteredIntoExistingEvents: 0,
    clustered_new: 0,
    clustered_existing: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    event_refreshed: 0,
    newestArticlePublishedAt: null,
    oldestArticlePublishedAt: null,
    cluster_failed: 0,
    unaccounted: 0,
    qualityRejectReasons: {},
    debugSamples: [],
  };
}

function updateProviderDateWindow(bucket, value) {
  if (!value) return;
  bucket.newestArticlePublishedAt = [bucket.newestArticlePublishedAt, value].filter(Boolean).sort().at(-1) ?? bucket.newestArticlePublishedAt;
  bucket.oldestArticlePublishedAt = [bucket.oldestArticlePublishedAt, value].filter(Boolean).sort().at(0) ?? bucket.oldestArticlePublishedAt;
}

function sampleArticle(article) {
  return {
    title: String(article?.title ?? "").slice(0, 140),
    url: String(article?.url ?? "").slice(0, 240),
    provider: article?.provider ?? "unknown",
  };
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
    const fetchedAt = new Date().toISOString();
    const fetched = await fetcher();
    const payload = Array.isArray(fetched) ? { articles: fetched } : (fetched ?? { articles: [] });
    const articles = payload.articles ?? [];
    const callsUsed = Math.max(0, Number(payload.callsUsed ?? 0));
    if (callsUsed > 0) {
      await recordProviderCalls(sourceName, callsUsed, historical ? "historical" : "live");
    }
    await saveProviderRuntimeState(sourceName, {
      status: articles.length > 0 ? "success" : "active",
      lastCallAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      message: articles.length > 0 ? `${articles.length} article${articles.length === 1 ? "" : "s"} fetched` : "No matching articles returned",
    });
    if (historical) {
      log.info(`[ingest] ${sourceName} ${toIsoDay(windowStart)}→${toIsoDay(windowEnd)} returned ${articles.length} articles`);
    } else {
      log.info(`[ingest] ${sourceName} returned ${articles.length} articles`);
    }
    return {
      status: "ok",
      sourceName,
      callsUsed,
      queryCount: payload.queryCount ?? callsUsed,
      articles: articles.map((article) => ({
        ...article,
        sourceQuality: article.sourceQuality ?? SOURCE_QUALITY[sourceName] ?? 0.5,
        sourceDomains: buildSourceDomains(article),
        provider: article.provider ?? sourceName,
        fetchedAt: article.fetchedAt ?? fetchedAt,
      })),
    };
  } catch (err) {
    const kind = detectProviderFailure(err);
    const message = err.response?.data
      ? JSON.stringify(err.response.data).slice(0, 240)
      : String(err.message ?? "unknown error");
    log.warn(`[ingest] ${sourceName} failed${historical ? ` ${toIsoDay(windowStart)}→${toIsoDay(windowEnd)}` : ""} — ${message}`);
    await saveProviderRuntimeState(sourceName, {
      status: kind,
      lastCallAt: new Date().toISOString(),
      lastRateLimitedAt: kind === "rate_limited" ? new Date().toISOString() : undefined,
      message,
    });
    return { status: kind, sourceName, articles: [], error: message };
  }
}

async function collectSourceFetches({ queries, pageSize, windowStart = null, windowEnd = null, historical = false, includeRss = true }) {
  const config = getConfig();
  const newsApiStatus = describeEnvVar("NEWS_API_KEY");
  const newsDataStatus = describeEnvVar("NEWSDATA_API_KEY");
  const currentsStatus = describeEnvVar("CURRENTS_API_KEY");
  const gnewsStatus = describeEnvVar("GNEWS_API_KEY");
  const rssFeeds = (process.env.RSS_FEED_URLS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const tasks = [];

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

  if (config.enableGnews && gnewsStatus.usable) {
    const gnewsState = await getProviderRuntimeState("gnews");
    const dailyLimit = config.gnewsDailyLimit;
    const remainingBudget = Math.max(0, dailyLimit - (gnewsState.callsToday ?? 0));
    const rateLimitedToday = gnewsState.lastRateLimitedAt && isSameUtcDay(gnewsState.lastRateLimitedAt);
    const intervalMs = Math.max(15, config.gnewsRefreshEveryMinutes) * 60_000;
    const lastCallAgeMs = gnewsState.lastCallAt ? (Date.now() - new Date(gnewsState.lastCallAt).getTime()) : Infinity;
    const allowHistorical = !historical || config.enableGnewsBackfill;

    if (!allowHistorical) {
      await saveProviderRuntimeState("gnews", {
        status: "disabled",
        message: "Historical GNews backfill disabled",
      });
      tasks.push(Promise.resolve({ status: "unsupported", sourceName: "gnews", articles: [], error: "GNews historical backfill disabled." }));
    } else if (rateLimitedToday) {
      tasks.push(Promise.resolve({ status: "rate_limited", sourceName: "gnews", articles: [], error: "GNews previously rate limited; skipping until daily reset." }));
    } else if (remainingBudget <= 0) {
      await saveProviderRuntimeState("gnews", {
        status: "skipped_budget",
        message: "GNews daily quota exhausted",
      });
      tasks.push(Promise.resolve({ status: "skipped_budget", sourceName: "gnews", articles: [], error: "GNews daily quota exhausted." }));
    } else if (!historical && lastCallAgeMs < intervalMs) {
      await saveProviderRuntimeState("gnews", {
        status: "skipped_interval",
        message: "GNews refresh interval not reached",
      });
      tasks.push(Promise.resolve({ status: "skipped_interval", sourceName: "gnews", articles: [], error: "GNews refresh interval not reached." }));
    } else {
      const maxCalls = Math.max(1, Math.min(config.gnewsMaxCallsPerRefresh, remainingBudget));
      const gnewsQueries = getGnewsQueries(maxCalls, historical);
      tasks.push(fetchFromSource("gnews", () => fetchGNewsArticles({
        apiKey: process.env.GNEWS_API_KEY?.trim(),
        queries: gnewsQueries,
        pageSize,
        from: windowStart,
        to: windowEnd,
        maxCalls,
      }), { historical, windowStart, windowEnd }));
    }
  } else if (config.enableGnews && !gnewsStatus.usable) {
    await saveProviderRuntimeState("gnews", {
      status: "disabled",
      message: "GNews API key missing or placeholder",
    });
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

  if (isSourceEnabled("newsapi") && newsApiStatus.usable) {
    tasks.push(fetchFromSource("newsapi", () => fetchNewsApiArticles({
      apiKey: process.env.NEWS_API_KEY?.trim(),
      queries,
      pageSize,
      from: windowStart,
      to: windowEnd,
    }), { historical, windowStart, windowEnd }));
  }

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

  return tasks;
}

function finalizeArticles(rawArticles, maxItems, { seedIfEmpty = false, historical = false } = {}) {
  const beforeCount = getAllArticles().length;
  const now = Date.now();
  const providerBuckets = new Map();
  const getBucket = (provider) => {
    const key = provider || "unknown";
    if (!providerBuckets.has(key)) providerBuckets.set(key, createProviderDiagnosticsBucket(key));
    return providerBuckets.get(key);
  };
  const candidates = [];

  for (const raw of rawArticles) {
    const provider = raw.provider ?? "unknown";
    const bucket = getBucket(provider);
    bucket.fetched += 1;

    if (!String(raw.title ?? "").trim()) {
      bucket.dropped_missing_title += 1;
      bucket.debugSamples.push(sampleArticle(raw));
      continue;
    }

    if (!raw.url) {
      bucket.dropped_missing_url += 1;
      bucket.debugSamples.push(sampleArticle(raw));
      continue;
    }

    let publishedAt = raw.publishedAt ? new Date(raw.publishedAt).toISOString() : null;
    const invalidDate = !publishedAt || Number.isNaN(new Date(publishedAt).getTime());
    if (invalidDate) {
      const fallbackDate = raw.fetchedAt ? new Date(raw.fetchedAt).toISOString() : null;
      if (!fallbackDate || Number.isNaN(new Date(fallbackDate).getTime())) {
        bucket.dropped_missing_date += 1;
        bucket.debugSamples.push(sampleArticle(raw));
        continue;
      }
      publishedAt = fallbackDate;
    }

    updateProviderDateWindow(bucket, publishedAt);

    const ageHours = Math.max(0, (now - new Date(publishedAt).getTime()) / 3600_000);
    if (!historical && ageHours > 72) {
      bucket.articlesRejectedAsOld += 1;
      continue;
    }

    bucket.afterDateFilter += 1;
    const normalized = normalise({ ...raw, publishedAt, provider });
    if (!normalized) {
      bucket.dropped_missing_title += 1;
      bucket.debugSamples.push(sampleArticle(raw));
      continue;
    }
    bucket.normalized += 1;

    const { score, categories } = computeRelevanceScore(normalized);
    const quality = evaluateArticleQuality({
      ...normalized,
      relevanceScore: score,
      categories,
    });
    normalized.sourceTier = quality.sourceTier;
    normalized.sourceTierLabel = quality.sourceTierLabel;
    normalized.contentType = quality.contentType;
    normalized.qualityScore = quality.score;

    if (!quality.activeEligible) {
      bucket.articlesRejectedAsLowQuality += 1;
      for (const reason of quality.reasons) {
        bucket.qualityRejectReasons[reason] = (bucket.qualityRejectReasons[reason] ?? 0) + 1;
      }
      bucket.debugSamples.push(sampleArticle(normalized));
      continue;
    }

    if (score < MIN_RELEVANCE_SCORE) {
      bucket.articlesRejectedAsLowRelevance += 1;
      bucket.debugSamples.push(sampleArticle(normalized));
      continue;
    }

    candidates.push({
      ...normalized,
      relevanceScore: score,
      categories,
      sourceTier: quality.sourceTier,
      sourceTierLabel: quality.sourceTierLabel,
      contentType: quality.contentType,
      qualityScore: quality.score,
      _provider: provider,
      _ageHours: ageHours,
    });
    bucket.articlesUsable += 1;
  }

  const deduped = [];
  for (const article of candidates) {
    const bucket = getBucket(article._provider);
    const existing = deduped.find((candidate) =>
      (article.url && candidate.url && article.url === candidate.url) ||
      titleSimilarity(article.title, candidate.title) >= 0.9
    );

    if (!existing) {
      deduped.push(article);
      continue;
    }

    bucket.articlesRejectedAsDuplicate += 1;
    if ((article.sourceQuality ?? 0) > (existing.sourceQuality ?? 0)) {
      Object.assign(existing, article);
    }
  }

  const storedById = new Map(getAllArticles().map((article) => [article.id, article]));
  const reconfirmedArticles = [];
  const toPersist = [];

  for (const article of deduped) {
    const bucket = getBucket(article._provider);
    const existing = storedById.get(article.id);
    if (existing) {
      if (article._ageHours <= 72) {
        bucket.duplicateReconfirmed += 1;
        reconfirmedArticles.push(article);
      } else {
        bucket.articlesRejectedAsDuplicate += 1;
      }
      toPersist.push({
        ...existing,
        ...article,
        lastSeenAt: new Date().toISOString(),
        newestSourceAt: [existing.newestSourceAt, existing.publishedAt, article.publishedAt].filter(Boolean).sort().at(-1) ?? article.publishedAt,
      });
      continue;
    }
    toPersist.push(article);
  }

  const relevant = deduped;
  const normalised = toPersist
    .sort((a, b) => {
      const scoreDelta = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return (b.sourceQuality ?? 0) - (a.sourceQuality ?? 0);
    })
    .filter(Boolean);

  if (normalised.length === 0 && seedIfEmpty) {
    const seeded = seedArticles(maxItems);
    const persisted = saveArticles(seeded);
    const added = persisted.saved;
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
      providerDiagnostics: [],
      reconfirmedArticles: [],
      articlesNormalized: seeded.length,
      articlesUsable: seeded.length,
      saveFailures: 0,
      unaccountedArticles: 0,
      debugSamples: [],
    };
  }

  const persisted = saveArticles(normalised);
  const newestArticleAt = candidates.reduce((latest, article) => {
    const publishedAt = article?.publishedAt ? new Date(article.publishedAt).getTime() : 0;
    return publishedAt > latest ? publishedAt : latest;
  }, 0);
  const providerDiagnostics = [...providerBuckets.values()];
  for (const bucket of providerDiagnostics) {
    bucket.saved_article = Math.max(0, bucket.articlesUsable - bucket.articlesRejectedAsDuplicate - bucket.duplicateReconfirmed);
    bucket.unaccounted = 0;
  }
  const duplicatesSkipped = providerDiagnostics.reduce((sum, bucket) => sum + bucket.articlesRejectedAsDuplicate, 0);
  const filteredOutCount = providerDiagnostics.reduce((sum, bucket) =>
    sum +
    bucket.articlesRejectedAsOld +
    bucket.articlesRejectedAsLowRelevance +
    bucket.articlesRejectedAsLowQuality +
    bucket.dropped_missing_title +
    bucket.dropped_missing_url +
    bucket.dropped_missing_date,
  0);
  const lowRelevanceCount = providerDiagnostics.reduce((sum, bucket) => sum + bucket.articlesRejectedAsLowRelevance, 0);

  return {
    mode: "external",
    fetched: rawArticles.length,
    saved: persisted.saved,
    savedArticleCount: persisted.saved + persisted.updated,
    keptCount: normalised.length,
    articlesNormalized: providerDiagnostics.reduce((sum, bucket) => sum + bucket.normalized, 0),
    articlesUsable: providerDiagnostics.reduce((sum, bucket) => sum + bucket.articlesUsable, 0),
    filteredOutCount,
    lowRelevanceCount,
    duplicatesSkipped,
    duplicateReconfirmed: providerDiagnostics.reduce((sum, bucket) => sum + bucket.duplicateReconfirmed, 0),
    newestArticleAt: newestArticleAt ? new Date(newestArticleAt).toISOString() : null,
    providerDiagnostics,
    reconfirmedArticles,
    saveFailures: 0,
    unaccountedArticles: providerDiagnostics.reduce((sum, bucket) => sum + bucket.unaccounted, 0),
    debugSamples: providerDiagnostics.flatMap((bucket) => bucket.debugSamples.slice(0, 2)).slice(0, 10),
  };
}

export async function getNewsProviderStatuses() {
  const config = getConfig();
  const gnews = await getProviderRuntimeState("gnews");
  return [
    {
      provider: "gnews",
      enabled: config.enableGnews,
      status: gnews.status,
      callsToday: gnews.callsToday ?? 0,
      dailyLimit: config.gnewsDailyLimit,
      lastSuccessAt: gnews.lastSuccessAt ?? null,
      lastRateLimitedAt: gnews.lastRateLimitedAt ?? null,
      lastCallAt: gnews.lastCallAt ?? null,
      message: gnews.message ?? null,
    },
  ];
}

export async function ingest({ apiKey, maxPerRun = 40 }) {
  const config = getConfig();
  const newsKey = typeof apiKey === "string" ? apiKey.trim() : "";
  const newsApiStatus = describeEnvVar("NEWS_API_KEY");
  const newsDataStatus = describeEnvVar("NEWSDATA_API_KEY");
  const currentsStatus = describeEnvVar("CURRENTS_API_KEY");
  const gnewsStatus = describeEnvVar("GNEWS_API_KEY");
  log.info(`[ingest] Starting multi-source ingestion — priority=${SOURCE_PRIORITY.join(" > ")}`);

  const liveWindowEnd = new Date().toISOString();
  const liveWindowStart = new Date(Date.now() - 24 * 3600_000).toISOString();
  const configuredSources = [
    isSourceEnabled("currents") && currentsStatus.usable,
    config.enableGnews && gnewsStatus.usable,
    isSourceEnabled("newsdata") && newsDataStatus.usable,
    isSourceEnabled("newsapi") && newsKey && newsApiStatus.usable,
    isSourceEnabled("gdelt"),
    isSourceEnabled("rss"),
  ].filter(Boolean).length || 1;

  const perSource = Math.max(5, Math.ceil(maxPerRun / configuredSources));
  const tasks = await collectSourceFetches({
    queries: LIVE_QUERY_PACKS,
    pageSize: perSource,
    historical: false,
    includeRss: true,
    windowStart: liveWindowStart,
    windowEnd: liveWindowEnd,
  });
  const results = await Promise.all(tasks);

  const fetchedBySource = results.flatMap((result) => result.articles ?? []);
  const final = finalizeArticles(fetchedBySource, maxPerRun, { seedIfEmpty: true, historical: false });
  log.info(`[ingest] Filtered ${final.lowRelevanceCount} low-relevance articles; kept ${Math.max(0, final.fetched - final.filteredOutCount)}`);

  const finalizedDiagnostics = new Map((final.providerDiagnostics ?? []).map((item) => [item.provider, item]));
  const providerDiagnostics = results.map((result) => ({
    provider: result.sourceName,
    status: result.status,
    articlesFetched: result.articles?.length ?? 0,
    callsUsed: result.callsUsed ?? 0,
    error: result.error ?? null,
    ...(finalizedDiagnostics.get(result.sourceName) ?? createProviderDiagnosticsBucket(result.sourceName)),
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
    duplicateReconfirmed: final.duplicateReconfirmed ?? 0,
    newestArticleAt: final.newestArticleAt ?? null,
    providerDiagnostics,
    reconfirmedArticles: final.reconfirmedArticles ?? [],
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
  const config = getConfig();
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
      if (!SUPPORTED_SOURCES.has(sourceName)) return false;
      if (sourceName === "rss") return false;
      if (sourceName === "newsapi") return isSourceEnabled("newsapi") && describeEnvVar("NEWS_API_KEY").usable;
      if (sourceName === "newsdata") return isSourceEnabled("newsdata") && describeEnvVar("NEWSDATA_API_KEY").usable;
      if (sourceName === "currents") return isSourceEnabled("currents") && describeEnvVar("CURRENTS_API_KEY").usable;
      if (sourceName === "gnews") return config.enableGnews && describeEnvVar("GNEWS_API_KEY").usable && config.enableGnewsBackfill;
      return isSourceEnabled(sourceName);
    }).length || 1;

    const perSource = Math.max(4, Math.ceil(maxArticlesPerBatch / configuredSources));
    const tasks = await collectSourceFetches({
      queries: BACKFILL_QUERY_PACKS,
      pageSize: perSource,
      historical: true,
      includeRss: false,
      windowStart: window.from,
      windowEnd: window.to,
    });
    const results = await Promise.all(tasks);

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

    const finalized = finalizeArticles(rawWindowArticles, maxArticlesPerBatch, { seedIfEmpty: false, historical: true });
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
