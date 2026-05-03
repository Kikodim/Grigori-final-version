const TIER_1_PATTERNS = [
  /(^|\.)reuters\.com$/i,
  /(^|\.)apnews\.com$/i,
  /associated press/i,
  /(^|\.)afp\.com$/i,
  /(^|\.)bbc\./i,
  /(^|\.)ft\.com$/i,
  /financial times/i,
  /(^|\.)bloomberg\.com$/i,
  /(^|\.)wsj\.com$/i,
  /wall street journal/i,
  /\.(gov|int)$/i,
  /(^|\.)nato\.int$/i,
  /(^|\.)europa\.eu$/i,
  /(^|\.)un\.org$/i,
];

const TIER_2_PATTERNS = [
  /aljazeera|economist|guardian|nytimes|washingtonpost|dw\.com|france24|cnbc|cnn|npr|skynews/i,
  /politico|euractiv|defensenews|janes|maritime-executive|lloydslist|spglobal|argusmedia/i,
  /timesofisrael|haaretz|kyivindependent|pravda\.com\.ua|balkaninsight|anadolu|middleeasteye/i,
];

const TIER_3_PATTERNS = [
  /einnews|menafn|latestly|naturalnews|dailymail|triblive|chronicleonline|citizentribune/i,
  /blogspot|substack|medium\.com|wordpress|contentfarm|newsbreak/i,
];

const OPINION_PATTERNS = [
  /\b(opinion|op-ed|oped|commentary|column|editorial|letter to the editor|letters to the editor|personal essay|my view|thoughts on)\b/i,
  /\b(i think|i was shocked|i wondered|in my view|our city|our young men|dear editor)\b/i,
];

const LETTER_PATTERNS = /\b(letter to the editor|letters to the editor|dear editor|to the editor)\b|\/letters?\//i;
const EDITORIAL_PATTERNS = /\b(editorial|op-ed|oped|column|commentary)\b/i;
const AGGREGATOR_PATTERNS = /\b(aggregator|syndicated|press release|einnews|menafn)\b/i;

const SPORTS_DRAFT_PATTERNS = /\b(nfl|nba|nhl|mlb|sports|football|basketball|baseball|fantasy|mock draft|draft pick|draft lottery)\b/i;
const MILITARY_DRAFT_PATTERNS = /\b(military draft|conscription|mobilization|mobilisation|reservists?|selective service|forced enlistment|call-up|draft law)\b/i;
const LOCAL_LOW_SIGNAL_PATTERNS = /\b(county|township|school board|city council|local election letter|our city|our town|pittsburgh)\b/i;

export function normalizeDomain(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const url = raw.startsWith("http") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw.replace(/^www\./i, "").toLowerCase();
  }
}

export function classifySourceTier({ domain = "", source = "" } = {}) {
  const subject = `${normalizeDomain(domain)} ${String(source ?? "").toLowerCase()}`.trim();
  if (!subject) return { tier: "unknown", label: "Unknown source quality", score: 0.5 };
  if (TIER_1_PATTERNS.some((pattern) => pattern.test(subject))) return { tier: "tier_1", label: "High source quality", score: 0.95 };
  if (TIER_2_PATTERNS.some((pattern) => pattern.test(subject))) return { tier: "tier_2", label: "Medium source quality", score: 0.76 };
  if (TIER_3_PATTERNS.some((pattern) => pattern.test(subject))) return { tier: "tier_3", label: "Low source quality", score: 0.42 };
  return { tier: "unknown", label: "Unclassified source quality", score: 0.58 };
}

export function detectContentType(article = {}) {
  const title = String(article.title ?? "");
  const url = String(article.url ?? "");
  const source = String(article.source ?? "");
  const summary = String(article.summary ?? article.description ?? "");
  const content = String(article.content ?? "");
  const text = `${title} ${url} ${source} ${summary} ${content}`;

  if (LETTER_PATTERNS.test(text)) return "letter";
  if (EDITORIAL_PATTERNS.test(text)) return "editorial";
  if (OPINION_PATTERNS.some((pattern) => pattern.test(text))) return "opinion";
  if (AGGREGATOR_PATTERNS.test(text)) return "aggregator";
  if (/\b(statement|press release|ministry said|officials said|central bank|regulator announced)\b/i.test(text)) return "official_statement";
  if (/\b(analysis|explainer|what to know|background)\b/i.test(text)) return "analysis";
  return "news_report";
}

export function isAmbiguousNonStrategicDraft(article = {}) {
  const text = `${article.title ?? ""} ${article.summary ?? ""} ${article.content ?? ""} ${article.url ?? ""}`;
  if (!/\bdraft\b/i.test(text)) return false;
  if (MILITARY_DRAFT_PATTERNS.test(text)) return false;
  return SPORTS_DRAFT_PATTERNS.test(text) || LOCAL_LOW_SIGNAL_PATTERNS.test(text) || OPINION_PATTERNS.some((pattern) => pattern.test(text));
}

export function evaluateArticleQuality(article = {}) {
  const domains = Array.isArray(article.sourceDomains) ? article.sourceDomains : [];
  const primaryDomain = normalizeDomain(domains[0] ?? article.url ?? "");
  const sourceTier = classifySourceTier({ domain: primaryDomain, source: article.source });
  const contentType = article.contentType ?? article.content_type ?? detectContentType(article);
  const regionLabel = String(article.region?.label ?? article.region ?? "").trim();
  const regionResolved = Boolean(regionLabel && !/^region under review$/i.test(regionLabel));
  const relevanceScore = Number(article.relevanceScore ?? 0);
  const categories = article.categories ?? [];
  const reasons = [];
  let score = relevanceScore;

  if (sourceTier.tier === "tier_1") score += 2;
  else if (sourceTier.tier === "tier_2") score += 1;
  else if (sourceTier.tier === "tier_3") score -= 2;

  if (regionResolved) score += 1;
  else score -= 2;

  if (["opinion", "editorial", "letter"].includes(contentType)) {
    score -= 5;
    reasons.push(`content_type_${contentType}`);
  }
  if (isAmbiguousNonStrategicDraft(article)) {
    score -= 5;
    reasons.push("ambiguous_non_geopolitical_draft");
  }
  if (sourceTier.tier === "tier_3") reasons.push("low_source_tier");
  if (!regionResolved) reasons.push("region_unresolved");
  if (!categories.length) reasons.push("no_relevant_category");

  const activeEligible = score >= 4 &&
    !["opinion", "editorial", "letter"].includes(contentType) &&
    !isAmbiguousNonStrategicDraft(article) &&
    (regionResolved || sourceTier.tier === "tier_1");

  return {
    score,
    activeEligible,
    sourceTier: sourceTier.tier,
    sourceTierLabel: sourceTier.label,
    sourceTierScore: sourceTier.score,
    contentType,
    regionResolved,
    reasons,
  };
}

export function evaluateClusterPublishQuality(preEvent = {}, articles = []) {
  const sourceDomains = new Set(articles.flatMap((article) => article.sourceDomains ?? []));
  const sourceCount = new Set(preEvent.sources ?? articles.map((article) => article.source)).size || articles.length;
  const regionLabel = String(preEvent.region?.label ?? "").trim();
  const regionResolved = Boolean(regionLabel && !/^region under review$/i.test(regionLabel));
  const articleQuality = articles.map(evaluateArticleQuality);
  const contentTypes = articleQuality.map((item) => item.contentType);
  const opinionCount = contentTypes.filter((type) => ["opinion", "editorial", "letter"].includes(type)).length;
  const bestTierScore = Math.max(0, ...articleQuality.map((item) => item.sourceTierScore));
  const bestTier = articleQuality.find((item) => item.sourceTierScore === bestTierScore)?.sourceTier ?? "unknown";
  const lowTierOnly = articleQuality.length > 0 && articleQuality.every((item) => item.sourceTier === "tier_3" || item.sourceTier === "unknown");
  const relevanceScore = Number(preEvent.relevanceScore ?? 0);
  const corpus = `${preEvent.title ?? ""} ${(preEvent.keywords ?? []).join(" ")} ${articles.map((article) => `${article.title ?? ""} ${article.summary ?? ""}`).join(" ")}`;
  const highRiskEntity = /\b(hormuz|red sea|black sea|taiwan|ukraine|russia|iran|israel|gaza|nato|eu|sanctions|missile|drone|military|cyber|pipeline|shipping|tanker|election|protest|coalition)\b/i.test(corpus);
  const relevantCategory = (articles.flatMap((article) => article.categories ?? []).length > 0) || highRiskEntity;
  const reasons = [];

  if (!regionResolved) reasons.push("region_unresolved");
  if (opinionCount > 0) reasons.push("contains_opinion_or_editorial");
  if (lowTierOnly) reasons.push("weak_source_mix");
  if (!relevantCategory) reasons.push("no_relevant_category");

  const strongSingleSource = sourceCount >= 1 && bestTier === "tier_1" && regionResolved && relevanceScore >= 4 && relevantCategory && opinionCount === 0;
  const multiSourceCorroborated = sourceDomains.size >= 2 && regionResolved && relevanceScore >= 3 && opinionCount === 0 && relevantCategory;
  const highRiskChokepoint = highRiskEntity && regionResolved && bestTierScore >= 0.7 && opinionCount === 0 && relevantCategory;

  const publishable = strongSingleSource || multiSourceCorroborated || highRiskChokepoint;
  if (!publishable && reasons.length === 0) reasons.push("below_public_publish_threshold");

  return {
    publishable,
    reasons,
    sourceCount,
    independentDomainCount: sourceDomains.size,
    bestTier,
    bestTierScore,
    contentTypes: [...new Set(contentTypes)],
    regionResolved,
    highRiskEntity,
    relevantCategory,
  };
}
