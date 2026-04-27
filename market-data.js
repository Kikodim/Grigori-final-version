import { getConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { getLayerCache, getLayerUsageStats, recordLayerUsage, setLayerCache } from "./supabase.js";

const log = createLogger("market-data");
const MARKET_LAYER_KEY = "market_context";
const BASE_URL = "https://www.alphavantage.co/query";

const MARKET_SYMBOLS = [
  { key: "wti", symbol: "USO", name: "WTI Crude Proxy", category: "oil", providerType: "equity" },
  { key: "brent", symbol: "BNO", name: "Brent Crude Proxy", category: "oil", providerType: "equity" },
  { key: "spy", symbol: "SPY", name: "S&P 500 / SPY", category: "equities", providerType: "equity" },
  { key: "vix", symbol: "VIX", name: "Cboe Volatility Index", category: "volatility", providerType: "index" },
  { key: "gold", symbol: "GLD", name: "Gold", category: "metals", providerType: "equity" },
];

function isoNow() {
  return new Date().toISOString();
}

function buildPlaceholderStatus(configured, provider, callsToday, dailyLimit, lastRefreshAt, nextRefreshAt, source = "cache") {
  const staleHours = lastRefreshAt ? (Date.now() - new Date(lastRefreshAt).getTime()) / 3600_000 : Infinity;
  const freshness = staleHours <= 2 ? "fresh" : staleHours <= 12 ? "aging" : "stale";
  return {
    configured,
    provider,
    lastRefreshAt: lastRefreshAt ?? null,
    nextRefreshAt: nextRefreshAt ?? null,
    callsToday,
    dailyLimit,
    freshness,
    source,
  };
}

function alphaVantageUrl(params, apiKey) {
  const query = new URLSearchParams({ ...params, apikey: apiKey });
  return `${BASE_URL}?${query.toString()}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`market provider ${res.status}`);
  }
  if (json?.Note || json?.Information || json?.["Error Message"]) {
    throw new Error(json.Note || json.Information || json["Error Message"] || "provider error");
  }
  return json;
}

function normalizeDailySeries(symbolMeta, timeSeries, meta = {}) {
  const entries = Object.entries(timeSeries ?? {})
    .map(([timestamp, row]) => ({
      timestamp,
      value: Number(
        row["4. close"] ??
        row["5. adjusted close"] ??
        row.close ??
        row.value ??
        row["4a. close (USD)"] ??
        NaN
      ),
    }))
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const latest = entries.at(-1) ?? null;
  const previous = entries.at(-2) ?? null;
  const currentPrice = latest?.value ?? null;
  const previousValue = previous?.value ?? currentPrice;
  const changeAbsolute = currentPrice != null && previousValue != null ? currentPrice - previousValue : null;
  const changePercent = currentPrice != null && previousValue ? (changeAbsolute / previousValue) * 100 : null;

  const windows = {
    "24h": entries.slice(-2),
    "7d": entries.slice(-7),
    "30d": entries.slice(-30),
  };

  return {
    symbol: symbolMeta.symbol,
    name: symbolMeta.name,
    category: symbolMeta.category,
    currentPrice,
    changePercent,
    changeAbsolute,
    timeframe: "daily",
    lastUpdated: latest?.timestamp ?? meta["3. Last Refreshed"] ?? null,
    source: "Alpha Vantage",
    points: entries,
    series: Object.entries(windows).map(([window, points]) => ({
      window,
      series: points.map((point, index) => ({
        label: window === "24h" ? `${index + 1}` : point.timestamp.slice(5),
        value: point.value,
        timestamp: point.timestamp,
      })),
    })),
  };
}

async function fetchAlphaVantageSeries(symbolMeta, apiKey) {
  const params = symbolMeta.providerType === "index"
    ? { function: "INDEX_DATA", symbol: symbolMeta.symbol, interval: "daily" }
    : { function: "TIME_SERIES_DAILY_ADJUSTED", symbol: symbolMeta.symbol, outputsize: "compact" };
  const json = await fetchJson(alphaVantageUrl(params, apiKey));
  const timeSeries = json["Time Series (Daily)"] ?? json.data ?? null;
  const meta = json["Meta Data"] ?? {};
  if (!timeSeries) {
    throw new Error(`missing timeseries for ${symbolMeta.symbol}`);
  }
  return normalizeDailySeries(symbolMeta, timeSeries, meta);
}

function summarizeForAi(payload) {
  const byKey = Object.fromEntries((payload?.instruments ?? []).map((item) => [item.key, item]));
  const fragments = [];
  if (byKey.wti?.changePercent != null) fragments.push(`WTI proxy ${byKey.wti.changePercent >= 0 ? "up" : "down"} ${Math.abs(byKey.wti.changePercent).toFixed(1)}%`);
  if (byKey.brent?.changePercent != null) fragments.push(`Brent proxy ${byKey.brent.changePercent >= 0 ? "up" : "down"} ${Math.abs(byKey.brent.changePercent).toFixed(1)}%`);
  if (byKey.spy?.changePercent != null) fragments.push(`SPY ${byKey.spy.changePercent >= 0 ? "risk-on" : "risk-off"} ${byKey.spy.changePercent.toFixed(1)}%`);
  if (byKey.vix?.currentPrice != null) fragments.push(`VIX near ${byKey.vix.currentPrice.toFixed(1)}`);
  if (byKey.gold?.changePercent != null) fragments.push(`gold ${byKey.gold.changePercent >= 0 ? "firmer" : "softer"} ${Math.abs(byKey.gold.changePercent).toFixed(1)}%`);
  return fragments.join("; ");
}

export async function getCachedMarketContextSummary() {
  const cache = await getLayerCache(MARKET_LAYER_KEY);
  if (!cache.record?.payload?.instruments?.length) return null;
  return summarizeForAi(cache.record.payload);
}

export async function getMarketContext({ forceRefresh = false } = {}) {
  const config = getConfig();
  const cache = await getLayerCache(MARKET_LAYER_KEY);
  const usage = await getLayerUsageStats(MARKET_LAYER_KEY);
  const provider = config.marketDataProvider;
  const configured = config.enableMarketData && Boolean(config.marketDataApiKey?.trim());
  const cachedPayload = cache.record?.payload && typeof cache.record.payload === "object"
    ? cache.record.payload
    : { instruments: [] };
  const lastRefreshAt = cache.record?.lastRefresh ?? null;
  const nextRefreshAt = cache.record?.nextRefresh ?? null;
  const intervalMs = Math.max(15, config.marketDataRefreshIntervalMinutes) * 60_000;
  const stale = !lastRefreshAt || (Date.now() - new Date(lastRefreshAt).getTime()) >= intervalMs;

  if (!configured) {
    return {
      ok: true,
      instruments: cachedPayload.instruments ?? [],
      summary: cachedPayload.summary ?? null,
      status: {
        ...buildPlaceholderStatus(false, provider, usage.callsToday ?? 0, config.marketDataDailyLimit, lastRefreshAt, nextRefreshAt, cache.mode),
        message: "Market price feed not configured yet",
      },
    };
  }

  if (!forceRefresh && !stale && (cachedPayload.instruments ?? []).length > 0) {
    return {
      ok: true,
      instruments: cachedPayload.instruments,
      summary: cachedPayload.summary ?? summarizeForAi(cachedPayload),
      status: {
        ...buildPlaceholderStatus(true, provider, usage.callsToday ?? 0, config.marketDataDailyLimit, lastRefreshAt, nextRefreshAt, cache.mode),
        message: "Serving cached market context",
      },
    };
  }

  if ((usage.callsToday ?? 0) + MARKET_SYMBOLS.length > config.marketDataDailyLimit) {
    return {
      ok: true,
      instruments: cachedPayload.instruments ?? [],
      summary: cachedPayload.summary ?? summarizeForAi(cachedPayload),
      status: {
        ...buildPlaceholderStatus(true, provider, usage.callsToday ?? 0, config.marketDataDailyLimit, lastRefreshAt, nextRefreshAt, "cache"),
        message: "Market data daily limit reached; serving cached context",
      },
    };
  }

  if (provider !== "alpha_vantage") {
    return {
      ok: true,
      instruments: cachedPayload.instruments ?? [],
      summary: cachedPayload.summary ?? summarizeForAi(cachedPayload),
      status: {
        ...buildPlaceholderStatus(true, provider, usage.callsToday ?? 0, config.marketDataDailyLimit, lastRefreshAt, nextRefreshAt, "cache"),
        message: "Configured market provider adapter is not implemented yet",
      },
    };
  }

  try {
    const instruments = [];
    for (const item of MARKET_SYMBOLS) {
      const series = await fetchAlphaVantageSeries(item, config.marketDataApiKey);
      instruments.push({ key: item.key, ...series });
      await recordLayerUsage(MARKET_LAYER_KEY, provider);
    }
    const nextRefresh = new Date(Date.now() + intervalMs).toISOString();
    const payload = {
      instruments,
      summary: summarizeForAi({ instruments }),
    };
    await setLayerCache(
      MARKET_LAYER_KEY,
      payload,
      {
        configured: true,
        provider,
      },
      nextRefresh
    );
    const refreshedUsage = await getLayerUsageStats(MARKET_LAYER_KEY);
    return {
      ok: true,
      instruments,
      summary: payload.summary,
      status: {
        ...buildPlaceholderStatus(true, provider, refreshedUsage.callsToday ?? instruments.length, config.marketDataDailyLimit, isoNow(), nextRefresh, "provider"),
        message: "Market context refreshed",
      },
    };
  } catch (err) {
    log.warn(`Market context fetch failed: ${err.message}`);
    return {
      ok: true,
      instruments: cachedPayload.instruments ?? [],
      summary: cachedPayload.summary ?? summarizeForAi(cachedPayload),
      status: {
        ...buildPlaceholderStatus(true, provider, usage.callsToday ?? 0, config.marketDataDailyLimit, lastRefreshAt, nextRefreshAt, "cache"),
        message: "Provider unavailable; serving cached market context",
      },
    };
  }
}
