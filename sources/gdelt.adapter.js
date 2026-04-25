import axios from "axios";

const GDELT_API_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

export async function fetchGdeltArticles({ queries, pageSize = 10 }) {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const articles = [];

  for (const query of queries) {
    const { data } = await axios.get(GDELT_API_BASE, {
      params: {
        query,
        mode: "ArtList",
        format: "json",
        maxrecords: pageSize,
        startdatetime: `${from.replace(/-/g, "")}000000`,
      },
      timeout: 12_000,
    });

    for (const item of data?.articles ?? []) {
      articles.push({
        title: item.title ?? "",
        url: item.url ?? "",
        publishedAt: item.seendate ? new Date(item.seendate).toISOString() : undefined,
        summary: item.socialimage ? `Related geopolitical coverage from GDELT.` : (item.domain ?? ""),
        source: item.domain ?? "GDELT",
        content: item.title ?? "",
      });
    }
  }

  return articles;
}
