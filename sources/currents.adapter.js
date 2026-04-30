import axios from "axios";

const API_BASE = "https://api.currentsapi.services/v1/search";

export async function fetchCurrentsArticles({ apiKey, queries, pageSize = 10, from = null, to = null, historical = false }) {
  const articles = [];
  const fetchedAt = new Date().toISOString();

  for (const query of queries) {
    const { data } = await axios.get(API_BASE, {
      headers: {
        Authorization: apiKey,
      },
      params: {
        keywords: query,
        language: "en",
        limit: pageSize,
        start_date: from ?? undefined,
        end_date: to ?? undefined,
      },
      timeout: 12_000,
    });

    for (const item of data?.news ?? []) {
      const rawPublishedAt = item.published ?? item.publishedAt ?? item.published_at ?? item.date ?? null;
      articles.push({
        title: item.title ?? "",
        url: item.url ?? "",
        publishedAt: rawPublishedAt ? new Date(rawPublishedAt).toISOString() : undefined,
        summary: item.description ?? "",
        source: item.author || item.id || "Currents",
        content: item.description ?? item.title ?? "",
        provider: "currents",
        fetchedAt,
        rawPublishedAt,
      });
    }
  }

  return articles;
}
