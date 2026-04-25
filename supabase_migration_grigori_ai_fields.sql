-- Grigori schema update: AI metadata + usage tracking
-- Safe to run multiple times.

alter table if exists events
  add column if not exists ai_status text not null default 'fallback',
  add column if not exists ai_updated_at timestamptz,
  add column if not exists cluster_signature text,
  add column if not exists importance_score numeric not null default 0;

create index if not exists events_cluster_signature_idx
  on events (cluster_signature);

create index if not exists events_timestamp_idx
  on events ("timestamp");

create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  "date" date not null,
  provider text not null default 'gemini',
  calls integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_usage_logs_date_provider_uidx
  on ai_usage_logs ("date", provider);
