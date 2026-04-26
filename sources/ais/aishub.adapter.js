import { createLogger } from "../../logger.js";

const log = createLogger("aishub");

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeVessel(row, index = 0) {
  const lat = toNumber(row.lat ?? row.latitude);
  const lng = toNumber(row.lng ?? row.longitude);
  if (lat === null || lng === null) return null;

  return {
    id: String(row.MMSI ?? row.mmsi ?? `vessel-${index}`),
    mmsi: String(row.MMSI ?? row.mmsi ?? ""),
    name: row.NAME ?? row.name ?? row.SHIPNAME ?? "Unknown Vessel",
    vesselType: row.TYPE_NAME ?? row.vessel_type ?? row.SHIPTYPE ?? "Unknown",
    lat,
    lng,
    speed: toNumber(row.SPEED ?? row.speed ?? row.SOG),
    heading: toNumber(row.COURSE ?? row.heading ?? row.COG),
    destination: row.DESTINATION ?? row.destination ?? "Unknown",
    eta: row.ETA ?? row.eta ?? null,
    flag: row.FLAG ?? row.flag ?? null,
    updatedAt: row.TIMESTAMP ?? row.updated_at ?? new Date().toISOString(),
  };
}

export async function fetchAishubVessels(apiKey, { limit = 100 } = {}) {
  const url = new URL("https://data.aishub.net/ws.php");
  url.searchParams.set("username", apiKey);
  url.searchParams.set("format", "1");
  url.searchParams.set("output", "json");
  url.searchParams.set("compress", "0");

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const text = await res.text();

  if (!res.ok) {
    log.warn(`AISHub request failed: status=${res.status} body=${text.slice(0, 400)}`);
    throw new Error(`AISHub ${res.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    log.warn(`AISHub JSON parse failed: ${err.message}`);
    throw new Error("AISHub invalid JSON");
  }

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.result)
        ? data.result
        : [];

  return rows
    .map(normalizeVessel)
    .filter(Boolean)
    .slice(0, limit);
}
