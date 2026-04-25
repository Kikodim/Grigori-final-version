import axios from "axios";

const API_BASE = "https://api.currentsapi.services/v1/search";

export async function fetchCurrentsArticles({ apiKey, queries, pageSize = 10 }) {
  const articles = [];

  for (const query of queries) {
    const { data } = await axios.get(API_BASE, {
      headers: {
        Authorization: apiKey,
      },
      params: {
        keywords: query,
        language: "en",
        limit: pageSize,
      },
      timeout: 12_000,
    });

    for (const item of data?.news ?? []) {
      articles.push({
        title: item.title ?? "",
        url: item.url ?? "",
        publishedAt: item.published ? new Date(item.published).toISOString() : undefined,
        summary: item.description ?? "",
        source: item.author || item.id || "Currents",
        content: item.description ?? item.title ?? "",
      });
    }
  }

  return articles;
}
