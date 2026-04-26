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

create index if not exists report_analytics_event_created_at
  on report_analytics (event_name, created_at desc);
