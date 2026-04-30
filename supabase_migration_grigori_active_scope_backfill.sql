alter table if exists events
  add column if not exists last_seen_at timestamptz,
  add column if not exists refreshed_at timestamptz,
  add column if not exists freshness_status text;

update events
set
  refreshed_at = coalesce(refreshed_at, updated_at, created_at, timestamp),
  last_seen_at = coalesce(last_seen_at, updated_at, created_at, timestamp)
where refreshed_at is null
   or last_seen_at is null;
