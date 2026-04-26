alter table if exists external_layer_cache
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists external_layer_cache (
  layer_key     text primary key,
  payload       jsonb not null default '[]'::jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  last_refresh  timestamptz,
  next_refresh  timestamptz,
  updated_at    timestamptz not null default now()
);

create table if not exists external_layer_usage (
  id            bigint generated always as identity primary key,
  layer_key     text not null,
  source        text not null default 'api',
  created_at    timestamptz not null default now()
);

create index if not exists external_layer_usage_layer_created_at
  on external_layer_usage (layer_key, created_at desc);
