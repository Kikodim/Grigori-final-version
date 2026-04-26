import { getConfig, isPlaceholderValue } from "./config.js";
import { createLogger } from "./logger.js";
import { getLayerCache, getLayerUsageStats, recordLayerUsage, setLayerCache } from "./supabase.js";
import { fetchAishubVessels } from "./sources/ais/aishub.adapter.js";
import { fetchAviationstackFlights } from "./sources/flights/aviationstack.adapter.js";
import { fetchXSignals } from "./sources/social/x.adapter.js";
import { fetchCelestrakSatellites } from "./sources/satellites/celestrak.adapter.js";

const log = createLogger("layers");

const REGION_PRIORITIES = [
  { label: "Middle East", bounds: { latMin: 10, latMax: 38, lngMin: 34, lngMax: 62 } },
  { label: "Europe", bounds: { latMin: 35, latMax: 72, lngMin: -12, lngMax: 40 } },
  { label: "Black Sea", bounds: { latMin: 40, latMax: 48, lngMin: 27, lngMax: 42 } },
  { label: "Taiwan Strait", bounds: { latMin: 19, latMax: 29, lngMin: 116, lngMax: 126 } },
  { label: "Red Sea", bounds: { latMin: 10, latMax: 30, lngMin: 32, lngMax: 45 } },
];

function isWithinBounds(item, bounds) {
  return item.lat >= bounds.latMin &&
    item.lat <= bounds.latMax &&
    item.lng >= bounds.lngMin &&
    item.lng <= bounds.lngMax;
}

function prioritizeByRegion(items, limit) {
  const scored = items.map((item, index) => {
    const regionBonus = REGION_PRIORITIES.findIndex((region) => isWithinBounds(item, region.bounds));
    return {
      ...item,
      _score: regionBonus === -1 ? 0 : REGION_PRIORITIES.length - regionBonus,
      _index: index,
    };
  });

  return scored
    .sort((a, b) => (b._score - a._score) || (a._index - b._index))
    .slice(0, limit)
    .map(({ _score, _index, ...item }) => item);
}

function prioritizeVessels(items, limit) {
  const preferredTypes = ["tanker", "container", "lng", "cargo"];
  return items
    .map((item, index) => {
      const type = String(item.vesselType ?? "").toLowerCase();
      const match = preferredTypes.findIndex((needle) => type.includes(needle));
      return { ...item, _score: match === -1 ? 0 : preferredTypes.length - match, _index: index };
    })
    .sort((a, b) => (b._score - a._score) || (a._index - b._index))
    .slice(0, limit)
    .map(({ _score, _index, ...item }) => item);
}

function hasUsableKey(value) {
  return typeof value === "string" && value.trim() && !isPlaceholderValue(value);
}

function getCacheFreshness(record, refreshHours) {
  if (!record?.lastRefresh) return { fresh: false, nextRefresh: null };
  const nextRefresh = new Date(new Date(record.lastRefresh).getTime() + refreshHours * 3600_000).toISOString();
  return {
    fresh: Date.now() < Date.parse(nextRefresh),
    nextRefresh,
  };
}

async function getLayerQuotaState(layerKey, monthlyLimit, refreshHours) {
  const [{ record }, usage] = await Promise.all([
    getLayerCache(layerKey),
    getLayerUsageStats(layerKey),
  ]);
  const freshness = getCacheFreshness(record, refreshHours);

  return {
    record,
    callsToday: usage.callsToday,
    callsThisMonth: usage.callsThisMonth,
    remainingMonthlyCalls: Math.max(0, monthlyLimit - usage.callsThisMonth),
    lastRefreshAt: record?.lastRefresh ?? null,
    nextRefreshAt: record?.nextRefresh ?? freshness.nextRefresh ?? null,
    fresh: freshness.fresh,
  };
}

async function getPassiveLayerStatus() {
  const config = getConfig();
  const [flights, vessels, satellites, social] = await Promise.all([
    getLayerQuotaState("flights", config.flightMonthlyLimit, config.flightRefreshIntervalHours),
    getLayerQuotaState("vessels", config.vesselMonthlyLimit, config.vesselRefreshIntervalHours),
    getLayerQuotaState("satellites", Number.MAX_SAFE_INTEGER, config.satelliteRefreshIntervalHours),
    getLayerQuotaState("social", config.xDailyReadLimit, config.xRefreshIntervalMinutes / 60),
  ]);

  return {
    flights: {
      enabled: config.enableFlights,
      configured: hasUsableKey(config.aviationstackApiKey),
      callsToday: flights.callsToday,
      callsThisMonth: flights.callsThisMonth,
      remaining: flights.remainingMonthlyCalls,
      lastRefresh: flights.lastRefreshAt,
      nextRefresh: flights.nextRefreshAt,
    },
    vessels: {
      enabled: config.enableVessels,
      configured: config.aisProvider === "aishub" && hasUsableKey(config.aishubApiKey),
      callsToday: vessels.callsToday,
      callsThisMonth: vessels.callsThisMonth,
      remaining: vessels.remainingMonthlyCalls,
      lastRefresh: vessels.lastRefreshAt,
      nextRefresh: vessels.nextRefreshAt,
    },
    satellites: {
      enabled: config.enableSatellites,
      configured: true,
      lastRefresh: satellites.lastRefreshAt,
      nextRefresh: satellites.nextRefreshAt,
    },
    social: {
      enabled: config.enableXSignals,
      configured: hasUsableKey(config.xBearerToken) && config.xMonitoredAccounts.length > 0,
      callsToday: social.callsToday,
      callsThisMonth: social.callsThisMonth,
      remaining: Math.max(0, config.xDailyReadLimit - social.callsToday),
      lastRefresh: social.lastRefreshAt,
      nextRefresh: social.nextRefreshAt,
    },
  };
}

async function refreshLayerCache(layerKey, payload, metadata, refreshHours) {
  const nextRefresh = new Date(Date.now() + refreshHours * 3600_000).toISOString();
  await setLayerCache(layerKey, payload, metadata, nextRefresh);
  await recordLayerUsage(layerKey, "api");
  return nextRefresh;
}

export async function getFlightsLayer() {
  const config = getConfig();
  const configured = hasUsableKey(config.aviationstackApiKey);
  const status = await getLayerQuotaState("flights", config.flightMonthlyLimit, config.flightRefreshIntervalHours);

  if (!config.enableFlights) {
    return {
      ok: true,
      enabled: false,
      configured,
      reason: "Flights layer disabled",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  if (!configured) {
    return {
      ok: true,
      enabled: true,
      configured: false,
      reason: "AVIATIONSTACK_API_KEY not configured",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  if (status.fresh || status.remainingMonthlyCalls <= 0) {
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: status.remainingMonthlyCalls <= 0 ? "cache-quota" : "cache",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  try {
    const flights = prioritizeByRegion(
      await fetchAviationstackFlights(config.aviationstackApiKey, { limit: config.maxFlightsRendered }),
      config.maxFlightsRendered
    );
    const nextRefreshAt = await refreshLayerCache("flights", flights, { provider: "aviationstack" }, config.flightRefreshIntervalHours);
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: "live",
      data: flights,
      quota: {
        ...status,
        callsToday: status.callsToday + 1,
        callsThisMonth: status.callsThisMonth + 1,
        remainingMonthlyCalls: Math.max(0, config.flightMonthlyLimit - (status.callsThisMonth + 1)),
        lastRefreshAt: new Date().toISOString(),
        nextRefreshAt,
      },
    };
  } catch (err) {
    log.warn(`Flights layer refresh failed: ${err.message}`);
    return {
      ok: true,
      enabled: true,
      configured: true,
      reason: "Flight provider request failed",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }
}

export async function getVesselsLayer() {
  const config = getConfig();
  const configured = config.aisProvider === "aishub" && hasUsableKey(config.aishubApiKey);
  const status = await getLayerQuotaState("vessels", config.vesselMonthlyLimit, config.vesselRefreshIntervalHours);

  if (!config.enableVessels) {
    return {
      ok: true,
      enabled: false,
      configured,
      reason: "AIS provider not configured",
      data: [],
      quota: status,
    };
  }

  if (!configured) {
    return {
      ok: true,
      enabled: false,
      configured: false,
      reason: "AIS provider not configured",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  if (status.fresh || status.remainingMonthlyCalls <= 0) {
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: status.remainingMonthlyCalls <= 0 ? "cache-quota" : "cache",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  try {
    let vessels = [];
    if (config.aisProvider === "aishub") {
      vessels = await fetchAishubVessels(config.aishubApiKey, { limit: config.maxVesselsRendered });
    }
    vessels = prioritizeVessels(vessels, config.maxVesselsRendered);
    const nextRefreshAt = await refreshLayerCache("vessels", vessels, { provider: config.aisProvider }, config.vesselRefreshIntervalHours);
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: "live",
      data: vessels,
      quota: {
        ...status,
        callsToday: status.callsToday + 1,
        callsThisMonth: status.callsThisMonth + 1,
        remainingMonthlyCalls: Math.max(0, config.vesselMonthlyLimit - (status.callsThisMonth + 1)),
        lastRefreshAt: new Date().toISOString(),
        nextRefreshAt,
      },
    };
  } catch (err) {
    log.warn(`Vessels layer refresh failed: ${err.message}`);
    return {
      ok: true,
      enabled: true,
      configured: true,
      reason: "AIS provider request failed",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }
}

export async function getSatellitesLayer() {
  const config = getConfig();
  const status = await getLayerQuotaState("satellites", Number.MAX_SAFE_INTEGER, config.satelliteRefreshIntervalHours);

  if (!config.enableSatellites) {
    return {
      ok: true,
      enabled: false,
      configured: true,
      reason: "Satellite layer disabled",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  if (status.fresh && status.record?.payload?.length) {
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: "cache",
      data: status.record.payload,
      quota: status,
    };
  }

  try {
    const satellites = await fetchCelestrakSatellites({ limit: config.maxSatellitesRendered });
    const cacheResult = await setLayerCache(
      "satellites",
      satellites,
      { provider: config.satelliteSource },
      new Date(Date.now() + config.satelliteRefreshIntervalHours * 3600_000).toISOString()
    );
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: "live",
      data: satellites,
      quota: {
        ...status,
        lastRefreshAt: new Date().toISOString(),
        nextRefreshAt: cacheResult.record?.nextRefresh ?? status.nextRefreshAt,
      },
    };
  } catch (err) {
    log.warn(`Satellites layer refresh failed: ${err.message}`);
    return {
      ok: true,
      enabled: true,
      configured: true,
      reason: "Satellite source request failed",
      data: status.record?.payload ?? [],
      quota: status,
    };
  }
}

export async function getSocialSignalsLayer() {
  const config = getConfig();
  const configured = hasUsableKey(config.xBearerToken) && config.xMonitoredAccounts.length > 0;
  const refreshHours = Math.max(0.5, config.xRefreshIntervalMinutes / 60);
  const status = await getLayerQuotaState("social", config.xDailyReadLimit, refreshHours);

  if (!config.enableXSignals) {
    return {
      ok: true,
      enabled: false,
      configured,
      reason: "X signals disabled",
      monitoredAccounts: config.xMonitoredAccounts,
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  if (!configured) {
    return {
      ok: true,
      enabled: true,
      configured: false,
      reason: "X API not configured",
      monitoredAccounts: config.xMonitoredAccounts,
      data: status.record?.payload ?? [],
      quota: status,
    };
  }

  if (status.fresh || status.callsToday >= config.xDailyReadLimit) {
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: status.callsToday >= config.xDailyReadLimit ? "cache-quota" : "cache",
      monitoredAccounts: config.xMonitoredAccounts,
      data: status.record?.payload ?? [],
      quota: {
        ...status,
        remainingDailyCalls: Math.max(0, config.xDailyReadLimit - status.callsToday),
      },
    };
  }

  try {
    const signals = await fetchXSignals(config.xBearerToken, {
      accounts: config.xMonitoredAccounts,
      limit: 12,
    });
    const nextRefreshAt = await refreshLayerCache("social", signals, { provider: "x" }, refreshHours);
    return {
      ok: true,
      enabled: true,
      configured: true,
      source: "live",
      monitoredAccounts: config.xMonitoredAccounts,
      data: signals,
      quota: {
        ...status,
        callsToday: status.callsToday + 1,
        callsThisMonth: status.callsThisMonth + 1,
        remainingDailyCalls: Math.max(0, config.xDailyReadLimit - (status.callsToday + 1)),
        lastRefreshAt: new Date().toISOString(),
        nextRefreshAt,
      },
    };
  } catch (err) {
    log.warn(`Social layer refresh failed: ${err.message}`);
    return {
      ok: true,
      enabled: true,
      configured: true,
      reason: "X provider request failed",
      monitoredAccounts: config.xMonitoredAccounts,
      data: status.record?.payload ?? [],
      quota: {
        ...status,
        remainingDailyCalls: Math.max(0, config.xDailyReadLimit - status.callsToday),
      },
    };
  }
}

export async function getLayersStatus() {
  return getPassiveLayerStatus();
}
