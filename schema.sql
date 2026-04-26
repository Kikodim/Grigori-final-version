-- ============================================================
-- GRIGORI – THE WATCHER  |  Supabase Schema
-- ============================================================
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this entire file → Run
--   3. Expected: "Success. No rows returned."
-- ============================================================

create table if not exists events (
  id           uuid          primary key default gen_random_uuid(),
  title        text          not null,
  location     jsonb         not null
               default '{"label":"Unknown Region","lat":null,"lng":null}'::jsonb,
  timestamp    timestamptz   not null default now(),
  summary      text          not null default '',
  developments text[]        not null default '{}',
  tone         text          not null default 'Stable'
               check (tone in ('Escalating', 'Stable', 'De-escalating')),
  confidence   text          not null default 'Low'
               check (confidence in ('Low', 'Medium', 'High')),
  scenarios    jsonb         not null default '[]'::jsonb,
  sources      text[]        not null default '{}',
  keywords     text[]        not null default '{}',
  article_ids  text[]        not null default '{}',
  ai_status    text          not null default 'fallback',
  ai_updated_at timestamptz,
  cluster_signature text,
  importance_score integer   not null default 0,
  created_at   timestamptz   not null default now()
);

create index if not exists events_timestamp_desc on events (timestamp desc);
create index if not exists events_tone           on events (tone);
create index if not exists events_confidence     on events (confidence);
create index if not exists events_created_at     on events (created_at);
create index if not exists events_cluster_signature on events (cluster_signature);

create table if not exists ai_usage_logs (
  id                bigint generated always as identity primary key,
  source            text        not null,
  cluster_signature text,
  input_tokens      integer     not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_logs_created_at on ai_usage_logs (created_at desc);

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

alter table events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'events' and policyname = 'block_anon'
  ) then
    execute 'create policy block_anon on events for all using (false)';
  end if;
end $$;
