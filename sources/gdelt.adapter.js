import axios from "axios";

const GDELT_API_BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

function toGdeltDate(value, fallbackTime = "000000") {
  const iso = new Date(value).toISOString().slice(0, 19).replace(/[-:T]/g, "");
  return iso.length >= 14 ? iso.slice(0, 14) : `${iso.slice(0, 8)}${fallbackTime}`;
}

export async function fetchGdeltArticles({ queries, pageSize = 10, from = null, to = null }) {
  const resolvedFrom = from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const resolvedTo = to ?? new Date().toISOString();
  const articles = [];

  for (const query of queries) {
    const { data } = await axios.get(GDELT_API_BASE, {
      params: {
        query,
        mode: "ArtList",
        format: "json",
        maxrecords: pageSize,
        startdatetime: toGdeltDate(resolvedFrom),
        enddatetime: toGdeltDate(resolvedTo, "235959"),
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
