import axios from "axios";

const GNEWS_API_BASE = "https://gnews.io/api/v4/search";

export async function fetchGNewsArticles({
  apiKey,
  queries,
  pageSize = 10,
  from = null,
  to = null,
  maxCalls = 4,
}) {
  const articles = [];
  const selectedQueries = (queries ?? []).filter(Boolean).slice(0, Math.max(0, maxCalls));

  for (const query of selectedQueries) {
    const { data } = await axios.get(GNEWS_API_BASE, {
      params: {
        apikey: apiKey,
        q: query,
        lang: "en",
        max: Math.min(10, pageSize),
        sortby: "publishedAt",
        expand: "content",
        from: from ?? undefined,
        to: to ?? undefined,
      },
      timeout: 12_000,
    });

    for (const item of data?.articles ?? []) {
      articles.push({
        title: item.title ?? "",
        url: item.url ?? "",
        publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined,
        summary: item.description ?? "",
        source: item.source?.name ?? "GNews",
        content: item.content ?? item.description ?? item.title ?? "",
      });
    }
  }

  return {
    articles,
    callsUsed: selectedQueries.length,
    queryCount: selectedQueries.length,
  };
}
