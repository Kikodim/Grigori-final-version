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
  assessment   text          not null default '',
  developments text[]        not null default '{}',
  tone         text          not null default 'Stable'
               check (tone in ('Stable', 'Escalating', 'Deteriorating', 'Volatile', 'De-escalating')),
  confidence   text          not null default 'Low'
               check (confidence in ('Low', 'Medium', 'High')),
  scenarios    jsonb         not null default '[]'::jsonb,
  why_this_matters text[]    not null default '{}',
  watch_indicators text[]    not null default '{}',
  confidence_rationale text  not null default '',
  market_impact jsonb        not null default '{}'::jsonb,
  source_assessment jsonb    not null default '{}'::jsonb,
  sources      text[]        not null default '{}',
  keywords     text[]        not null default '{}',
  article_ids  text[]        not null default '{}',
  ai_status    text          not null default 'fallback',
  ai_updated_at timestamptz,
  cluster_signature text,
  importance_score integer   not null default 0,
  is_historical boolean      not null default false,
  created_at   timestamptz   not null default now()
);

create index if not exists events_timestamp_desc on events (timestamp desc);
create index if not exists events_tone           on events (tone);
create index if not exists events_confidence     on events (confidence);
create index if not exists events_created_at     on events (created_at);
create index if not exists events_cluster_signature on events (cluster_signature);
create index if not exists events_is_historical on events (is_historical);

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

create table if not exists user_profiles (
  user_id              uuid primary key,
  email                text,
  subscription_tier    text not null default 'free',
  subscription_status  text not null default 'inactive',
  reports_used_today   integer not null default 0,
  reset_daily_at       timestamptz not null default now(),
  stripe_customer_id   text,
  waitlist_opt_in      boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  title          text not null,
  region         text not null,
  focus_area     text not null,
  time_horizon   text not null,
  audience_type  text not null,
  risk_appetite  text not null,
  status         text not null default 'draft',
  content        jsonb not null default '{}'::jsonb,
  favorite       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists reports_user_created_at on reports (user_id, created_at desc);

create table if not exists watchlists (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  name           text not null,
  topics         text[] not null default '{}',
  regions        text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists watchlists_user_created_at on watchlists (user_id, created_at desc);

create table if not exists report_waitlist (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  interest_tier    text not null default 'confidential',
  requested_region text not null default 'Global',
  note             text not null default '',
  created_at       timestamptz not null default now()
);

create table if not exists report_analytics (
  id             uuid primary key default gen_random_uuid(),
  event_name     text not null,
  user_id        uuid,
  region         text,
  tier           text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists report_analytics_event_created_at on report_analytics (event_name, created_at desc);

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
