/**
 * store.js — In-memory data store
 *
 * Holds raw articles and fully-processed events (including scenarios).
 * Every exported function is a pure interface — swap the internals for
 * SQLite / Supabase / Postgres without touching any caller.
 */

/** @type {Map<string, Article>}  keyed by article URL (stable dedup key) */
const articleMap = new Map();

/** @type {Map<string, GrigoriEvent>}  keyed by event UUID */
const eventMap = new Map();

// ─── Type Definitions ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} Article
 * @property {string}   id           — article URL used as stable id
 * @property {string}   title
 * @property {string}   source
 * @property {string}   publishedAt  — ISO 8601
 * @property {string}   content
 * @property {string}   url
 * @property {string[]} keywords     — extracted by ingester
 * @property {{ label:string, lat:number, lng:number }|null} region
 * @property {boolean}  clustered    — assigned to an event?
 */

/**
 * @typedef {Object} Scenario
 * @property {string}   name
 * @property {number}   probability   — integer 0–100; all scenarios in an event sum to 100
 * @property {string}   description
 * @property {object}   impact
 * @property {"Up"|"Neutral"|"Down"}   impact.oil
 * @property {"Risk-on"|"Risk-off"}    impact.markets
 * @property {string[]}                impact.sectors   — e.g. ["Energy","Defense"]
 */

/**
 * @typedef {Object} GrigoriEvent
 * @property {string}   id
 * @property {string}   title
 * @property {{ label:string, lat:number|null, lng:number|null }} location
 * @property {string}   timestamp          — ISO 8601, most-recent article
 * @property {string}   summary
 * @property {string[]} developments
 * @property {"Escalating"|"Stable"|"De-escalating"} tone
 * @property {"Low"|"Medium"|"High"}        confidence
 * @property {Scenario[]} scenarios
 * @property {string[]} sources
 * @property {string[]} keywords
 * @property {string[]} articleIds
 */

// ─── Articles ─────────────────────────────────────────────────────────────────

/** Upsert-safe: silently skips articles already in the store */
export function saveArticles(articles) {
  for (const a of articles) {
    if (!articleMap.has(a.id)) {
      articleMap.set(a.id, { ...a, clustered: false });
    }
  }
}

export function getUnclustered() {
  return [...articleMap.values()].filter((a) => !a.clustered);
}

export function getAllArticles() {
  return [...articleMap.values()];
}

export function markClustered(ids) {
  for (const id of ids) {
    const a = articleMap.get(id);
    if (a) a.clustered = true;
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export function saveEvent(event) {
  eventMap.set(event.id, event);
}

/** Returns all events sorted newest-first */
export function getAllEvents() {
  return [...eventMap.values()].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

export function getEventById(id) {
  return eventMap.get(id) ?? null;
}

/** Remove events older than maxAgeMs (default 24 h) */
export function clearStaleEvents(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const [id, ev] of eventMap) {
    const activity = ev.refreshedAt ?? ev.refreshed_at ?? ev.lastSeenAt ?? ev.last_seen_at ?? ev.updatedAt ?? ev.updated_at ?? ev.timestamp;
    if (!ev.isHistorical && new Date(activity).getTime() < cutoff) {
      eventMap.delete(id);
      removed++;
    }
  }
  return removed;
}

export function clearArticles() {
  articleMap.clear();
}

export function clearEvents() {
  eventMap.clear();
}

export function resetStore() {
  clearArticles();
  clearEvents();
}

export function stats() {
  return {
    articles: articleMap.size,
    unclustered: getUnclustered().length,
    events: eventMap.size,
  };
}
