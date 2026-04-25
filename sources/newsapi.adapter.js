import axios from "axios";

const NEWS_API_BASE = "https://newsapi.org/v2/everything";

export async function fetchNewsApiArticles({ apiKey, queries, pageSize = 10 }) {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const articles = [];

  for (const query of queries) {
    const { data } = await axios.get(NEWS_API_BASE, {
      headers: {
        "X-Api-Key": apiKey,
      },
      params: {
        q: query,
        from,
        sortBy: "publishedAt",
        language: "en",
        pageSize,
      },
      timeout: 10_000,
    });

    for (const item of data?.articles ?? []) {
      articles.push({
        title: item.title ?? "",
        url: item.url ?? "",
        publishedAt: item.publishedAt,
        summary: item.description ?? "",
        source: item.source?.name ?? "NewsAPI",
        content: item.content ?? item.description ?? item.title ?? "",
      });
    }
  }

  return articles;
}
