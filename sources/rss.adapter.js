import axios from "axios";

const DEFAULT_FEEDS = [
  "https://feeds.reuters.com/reuters/worldNews",
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
  "https://www.aljazeera.com/xml/rss/all.xml",
];

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1]
    ?.replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchRssArticles({ feedUrls = DEFAULT_FEEDS, pageSize = 12 }) {
  const articles = [];

  for (const feedUrl of feedUrls.slice(0, 6)) {
    const { data } = await axios.get(feedUrl, { timeout: 12_000, responseType: "text" });
    const items = data.match(/<item>[\s\S]*?<\/item>/gi) ?? [];

    for (const item of items.slice(0, pageSize)) {
      articles.push({
        title: extractTag(item, "title") ?? "",
        url: extractTag(item, "link") ?? "",
        publishedAt: extractTag(item, "pubDate") ? new Date(extractTag(item, "pubDate")).toISOString() : undefined,
        summary: extractTag(item, "description") ?? "",
        source: new URL(feedUrl).hostname.replace(/^www\./, ""),
        content: extractTag(item, "description") ?? extractTag(item, "title") ?? "",
      });
    }
  }

  return articles;
}
