import { createLogger } from "../../logger.js";

const log = createLogger("aviationstack");
const AVIATIONSTACK_URL = "https://api.aviationstack.com/v1/flights";

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeFlight(row, index = 0) {
  const live = row.live ?? {};
  const departure = row.departure ?? {};
  const arrival = row.arrival ?? {};
  const flight = row.flight ?? {};
  const airline = row.airline ?? {};

  const lat = toNumber(live.latitude);
  const lng = toNumber(live.longitude);
  if (lat === null || lng === null) return null;

  return {
    id: row.flight_date ? `${flight.iata ?? flight.icao ?? "flight"}-${row.flight_date}-${index}` : `${flight.iata ?? flight.icao ?? "flight"}-${index}`,
    flightNumber: flight.iata ?? flight.icao ?? row.flight?.number ?? "Unknown",
    airline: airline.name ?? airline.iata ?? "Unknown Airline",
    departureAirport: departure.airport ?? departure.iata ?? "Unknown",
    arrivalAirport: arrival.airport ?? arrival.iata ?? "Unknown",
    departureCity: departure.timezone?.split("/").at(-1)?.replace(/_/g, " ") ?? departure.airport ?? "Unknown",
    arrivalCity: arrival.timezone?.split("/").at(-1)?.replace(/_/g, " ") ?? arrival.airport ?? "Unknown",
    lat,
    lng,
    altitude: toNumber(live.altitude),
    speed: toNumber(live.speed_horizontal ?? live.speed),
    heading: toNumber(live.direction),
    status: row.flight_status ?? "unknown",
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

export async function fetchAviationstackFlights(apiKey, { limit = 100 } = {}) {
  const url = new URL(AVIATIONSTACK_URL);
  url.searchParams.set("access_key", apiKey);
  url.searchParams.set("limit", String(Math.max(1, Math.min(limit, 100))));

  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const text = await res.text();

  if (!res.ok) {
    log.warn(`Aviationstack request failed: status=${res.status} body=${text.slice(0, 400)}`);
    throw new Error(`Aviationstack ${res.status}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    log.warn(`Aviationstack JSON parse failed: ${err.message}`);
    throw new Error("Aviationstack invalid JSON");
  }

  if (data.error) {
    log.warn(`Aviationstack API error: code=${data.error.code ?? "unknown"} message=${String(data.error.message ?? "unknown").slice(0, 300)}`);
    throw new Error(`Aviationstack ${data.error.code ?? "error"}`);
  }

  return (data.data ?? [])
    .map(normalizeFlight)
    .filter(Boolean);
}
