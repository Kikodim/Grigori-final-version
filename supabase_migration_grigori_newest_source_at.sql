alter table if exists events
  add column if not exists newest_source_at timestamptz;

create index if not exists events_newest_source_at on events (newest_source_at desc);

update events
set newest_source_at = coalesce(newest_source_at, refreshed_at, last_seen_at, updated_at, created_at, timestamp)
where newest_source_at is null;
