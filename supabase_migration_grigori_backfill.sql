alter table events
  add column if not exists is_historical boolean not null default false;

create index if not exists events_is_historical
  on events (is_historical);
