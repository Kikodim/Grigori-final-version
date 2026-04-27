import axios from "axios";

const API_BASE = "https://newsdata.io/api/1/news";

export async function fetchNewsDataArticles({ apiKey, queries, pageSize = 10, from = null, to = null, historical = false }) {
  const articles = [];

  for (const query of queries) {
    const { data } = await axios.get(API_BASE, {
      params: {
        apikey: apiKey,
        q: query,
        language: "en",
        size: pageSize,
        from_date: historical && from ? from.slice(0, 10) : undefined,
        to_date: historical && to ? to.slice(0, 10) : undefined,
      },
      timeout: 12_000,
    });

    for (const item of data?.results ?? []) {
      articles.push({
        title: item.title ?? "",
        url: item.link ?? "",
        publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : undefined,
        summary: item.description ?? "",
        source: item.source_id ?? "NewsData.io",
        content: item.content ?? item.description ?? item.title ?? "",
      });
    }
  }

  return articles;
}
