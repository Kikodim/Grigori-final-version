/**
 * cluster.js — Event Clustering Module
 *
 * Groups related articles into events using three signals:
 *   1. Keyword overlap (Jaccard similarity on keyword sets)
 *   2. Region match (same detected region)
 *   3. Time proximity (both within a 24-hour window)
 *
 * Algorithm:
 *   - Single-pass greedy clustering (O(n²) — fine for ≤200 articles/cycle).
 *   - Each article is assigned to the first existing cluster it's similar
 *     enough to; otherwise it seeds a new cluster.
 *   - Clusters with only 1 article become low-confidence singleton events.
 *
 * No ML libraries required.
 */

import { getUnclustered, markClustered } from "./store.js";
import { createLogger } from "./logger.js";

const log = createLogger("cluster");

const TIME_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Jaccard similarity between two keyword arrays.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}  0–1
 */
function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const kw of setA) if (setB.has(kw)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Compute similarity score between two articles.
 * Keyword overlap is primary; region match and time proximity are bonuses.
 *
 * @param {Article} a
 * @param {Article} b
 * @param {number}  threshold
 * @returns {number}  composite score
 */
function similarity(a, b) {
  const kwScore = jaccard(a.keywords, b.keywords);

  const regionBonus =
    a.region && b.region && a.region.label === b.region.label ? 0.15 : 0;
  const regionPenalty =
    a.region && b.region && a.region.label !== b.region.label ? 0.15 : 0;

  const dtA = new Date(a.publishedAt).getTime();
  const dtB = new Date(b.publishedAt).getTime();
  const timeBonus = Math.abs(dtA - dtB) < TIME_WINDOW_MS ? 0.05 : 0;

  return kwScore + regionBonus + timeBonus - regionPenalty;
}

/**
 * Derive the representative region for a cluster.
 * Prefers the most-frequently occurring region label.
 *
 * @param {Article[]} articles
 * @returns {{ label: string, lat: number|null, lng: number|null }}
 */
function clusterRegion(articles) {
  const counts = {};
  for (const a of articles) {
    if (a.region) counts[a.region.label] = (counts[a.region.label] ?? 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return { label: "Region under review", lat: null, lng: null, confidence: "Low", reason: "No reliable region signals found in clustered articles." };
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return { label: "Region under review", lat: null, lng: null, confidence: "Low", reason: "Cluster contains competing region signals." };
  }

  const winner = sorted[0][0];
  const ref = articles.find((a) => a.region?.label === winner);
  return {
    ...ref.region,
    confidence: sorted[0][1] >= 3 ? "High" : sorted[0][1] >= 2 ? "Medium" : "Low",
    reason: sorted[0][1] >= 2
      ? "Location supported by repeated article region matches."
      : "Location supported by a single article region match.",
  };
}

/**
 * Pick the most representative title from a cluster.
 * Prefers the title from the article with the most keyword matches.
 *
 * @param {Article[]} articles
 * @param {string[]}  clusterKeywords
 * @returns {string}
 */
function representativeTitle(articles, clusterKeywords) {
  const kwSet = new Set(clusterKeywords);
  let best = articles[0];
  let bestScore = 0;

  for (const a of articles) {
    const score = a.keywords.filter((k) => kwSet.has(k)).length
      + ((a.sourceQuality ?? 0.5) * 4)
      + ((a.relevanceScore ?? 0) / 4);
    if (score > bestScore) { bestScore = score; best = a; }
  }

  // Truncate if needed
  return best.title.length > 100 ? best.title.slice(0, 97) + "…" : best.title;
}

/**
 * Merge keyword arrays and deduplicate; preserve rough frequency order.
 *
 * @param {Article[]} articles
 * @returns {string[]}
 */
function mergeKeywords(articles) {
  const freq = {};
  for (const a of articles) {
    for (const kw of a.keywords) freq[kw] = (freq[kw] ?? 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([kw]) => kw);
}

/**
 * Infer confidence level based on cluster size and source diversity.
 *
 * @param {Article[]} articles
 * @returns {"Low"|"Medium"|"High"}
 */
function inferConfidence(articles) {
  const sources = new Set(articles.map((a) => a.source)).size;
  if (articles.length >= 4 && sources >= 3) return "High";
  if (articles.length >= 2 && sources >= 2) return "Medium";
  return "Low";
}

/**
 * Run the clustering pipeline on all unclustered articles.
 *
 * @param {{ threshold?: number }} options
 * @returns {Cluster[]}  raw clusters (before AI summarization)
 */
export function cluster({ threshold = 0.18 } = {}) {
  const articles = getUnclustered();

  if (!articles.length) {
    log.info("[cluster] No unclustered articles — skipping");
    return [];
  }

  log.info(`[cluster] Clustering ${articles.length} articles (threshold=${threshold})`);

  /** @type {{ articles: Article[], centroid: string[] }[]} */
  const clusters = [];

  for (const article of articles) {
    let assigned = false;

    for (const c of clusters) {
      const score = similarity(article, {
        keywords: c.centroid,
        region: clusterRegion(c.articles),
        publishedAt: c.articles[0].publishedAt,
      });

      if (score >= threshold) {
        c.articles.push(article);
        // Update centroid incrementally
        c.centroid = mergeKeywords(c.articles);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      clusters.push({ articles: [article], centroid: [...article.keywords] });
    }
  }

  log.info(`[cluster] Formed ${clusters.length} clusters`);

  // Convert raw clusters → structured pre-events
  const preEvents = clusters.map((c, i) => {
    const keywords = mergeKeywords(c.articles);
    const region = clusterRegion(c.articles);
    const timestamp = c.articles
      .map((a) => a.publishedAt)
      .sort()
      .at(-1); // most recent

    return {
      _clusterId: `cluster-${Date.now()}-${i}`,
      title: representativeTitle(c.articles, keywords),
      region,
      timestamp,
      keywords,
      confidence: inferConfidence(c.articles),
      articleIds: c.articles.map((a) => a.id),
      sources: [...new Set(c.articles.map((a) => a.source))],
      sourceDomains: [...new Set(c.articles.flatMap((a) => a.sourceDomains ?? []))],
      relevanceScore: Math.round(c.articles.reduce((sum, article) => sum + Number(article.relevanceScore ?? 0), 0) / Math.max(c.articles.length, 1)),
      // Raw text passed to the AI summarizer
      articlesText: c.articles
        .map((a) => `TITLE: ${a.title}\nCONTENT: ${a.content}`)
        .join("\n\n---\n\n"),
    };
  });

  // Mark articles as clustered so they don't get re-processed
  markClustered(articles.map((a) => a.id));

  return preEvents;
}
