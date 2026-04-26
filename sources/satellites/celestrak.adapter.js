import { createLogger } from "../../logger.js";

const log = createLogger("celestrak");

const GROUPS = [
  { group: "stations", type: "ISS / Human Spaceflight", max: 4 },
  { group: "starlink", type: "Starlink", max: 60 },
  { group: "resource", type: "Earth Observation", max: 24 },
  { group: "gps-ops", type: "GPS", max: 24 },
];

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function wrapLng(value) {
  let lng = value;
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return lng;
}

function approximatePosition(row, now = Date.now()) {
  const inclination = toNumber(row.INCLINATION) ?? 0;
  const meanMotion = toNumber(row.MEAN_MOTION) ?? 15;
  const meanAnomaly = toNumber(row.MEAN_ANOMALY) ?? 0;
  const raan = toNumber(row.RA_OF_ASC_NODE) ?? 0;
  const epoch = Date.parse(row.EPOCH ?? new Date().toISOString());
  const minutesSinceEpoch = Math.max(0, (now - epoch) / 60000);
  const angle = ((meanAnomaly + minutesSinceEpoch * meanMotion * 360) % 360) * (Math.PI / 180);
  const incRad = inclination * (Math.PI / 180);

  const lat = Math.sin(angle) * inclination;
  const lng = wrapLng(raan + (angle * 180 / Math.PI) * Math.cos(incRad) - 180);
  const altitudeKm = meanMotion > 13 ? 420 : meanMotion > 2 ? 20200 : 550;

  return {
    lat: Number(lat.toFixed(3)),
    lng: Number(lng.toFixed(3)),
    altitudeKm,
    inclination,
  };
}

function normalizeSatellite(row, type) {
  const { lat, lng, altitudeKm, inclination } = approximatePosition(row);
  return {
    id: String(row.NORAD_CAT_ID ?? row.OBJECT_ID ?? row.OBJECT_NAME),
    name: row.OBJECT_NAME ?? "Unknown Satellite",
    noradId: String(row.NORAD_CAT_ID ?? ""),
    type,
    lat,
    lng,
    altitudeKm,
    inclination,
    updatedAt: row.EPOCH ?? new Date().toISOString(),
  };
}

async function fetchGroup(group, type, max) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const text = await res.text();

  if (!res.ok) {
    log.warn(`CelesTrak request failed for ${group}: status=${res.status} body=${text.slice(0, 300)}`);
    throw new Error(`CelesTrak ${group} ${res.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    log.warn(`CelesTrak JSON parse failed for ${group}: ${err.message}`);
    throw new Error("CelesTrak invalid JSON");
  }

  return (Array.isArray(data) ? data : [])
    .slice(0, max)
    .map((row) => normalizeSatellite(row, type));
}

export async function fetchCelestrakSatellites({ limit = 150 } = {}) {
  const batches = await Promise.allSettled(
    GROUPS.map(({ group, type, max }) => fetchGroup(group, type, max))
  );

  const satellites = batches.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    return [];
  });

  return satellites.slice(0, limit);
}
