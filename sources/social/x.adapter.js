import { createLogger } from "../../logger.js";

const log = createLogger("x-adapter");

function buildQuery(accounts) {
  return accounts
    .filter(Boolean)
    .map((account) => `from:${account}`)
    .join(" OR ");
}

function extractKeywords(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s#@/-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !token.startsWith("@"))
    .slice(0, 14);
}

function inferRegion(text = "") {
  const haystack = String(text).toLowerCase();
  if (/hormuz|iran|gulf|tanker/.test(haystack)) return "Strait of Hormuz";
  if (/red sea|houthi|suez|yemen/.test(haystack)) return "Yemen / Red Sea";
  if (/taiwan|pla|tsmc|strait/.test(haystack)) return "Taiwan Strait";
  if (/black sea|odesa|crimea|grain/.test(haystack)) return "Black Sea";
  if (/balkans|serbia|kosovo|bosnia/.test(haystack)) return "Balkans";
  return "Region under review";
}

function normalizeTweet(tweet, includes = {}) {
  const users = includes.users ?? [];
  const author = users.find((user) => user.id === tweet.author_id);
  const username = author?.username ?? "unknown";
  const url = `https://x.com/${username}/status/${tweet.id}`;
  const text = String(tweet.text ?? "").trim();
  const summary = text.length > 220 ? `${text.slice(0, 217)}...` : text;

  return {
    id: `x-${tweet.id}`,
    title: `X signal from @${username}`,
    source: `X / @${username}`,
    url,
    publishedAt: tweet.created_at ?? new Date().toISOString(),
    summary,
    content: text,
    keywords: extractKeywords(text),
    region: inferRegion(text),
    sourceQuality: 0.32,
    signalType: "social",
    verificationStatus: "unverified",
    account: username,
  };
}

export async function fetchXSignals(bearerToken, { accounts = [], limit = 12 } = {}) {
  const query = buildQuery(accounts);
  if (!query) return [];

  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", `${query} -is:retweet`);
  url.searchParams.set("max_results", String(Math.min(Math.max(limit, 10), 50)));
  url.searchParams.set("tweet.fields", "created_at,author_id,text,entities,lang");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const preview = body.slice(0, 300);
    log.warn(`X API request failed: ${res.status} ${preview}`);
    throw new Error(`X API request failed with ${res.status}`);
  }

  const payload = await res.json();
  const tweets = Array.isArray(payload.data) ? payload.data : [];
  const includes = payload.includes ?? {};
  return tweets.map((tweet) => normalizeTweet(tweet, includes));
}
