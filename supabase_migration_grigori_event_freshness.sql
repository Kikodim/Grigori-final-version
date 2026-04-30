alter table events
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz,
  add column if not exists refreshed_at timestamptz,
  add column if not exists freshness_status text not null default 'Fresh';

update events
set
  updated_at = coalesce(updated_at, created_at, timestamp, now()),
  last_seen_at = coalesce(last_seen_at, updated_at, created_at, timestamp, now()),
  refreshed_at = coalesce(refreshed_at, updated_at, created_at, timestamp, now()),
  freshness_status = case
    when is_historical then 'Historical'
    when coalesce(refreshed_at, last_seen_at, updated_at, created_at, timestamp, now()) >= now() - interval '2 hours' then 'Fresh'
    when coalesce(refreshed_at, last_seen_at, updated_at, created_at, timestamp, now()) >= now() - interval '6 hours' then 'Recent'
    when coalesce(refreshed_at, last_seen_at, updated_at, created_at, timestamp, now()) >= now() - interval '12 hours' then 'Aging'
    else 'Stale'
  end
where true;

create index if not exists events_updated_at on events (updated_at desc);
create index if not exists events_refreshed_at on events (refreshed_at desc);
