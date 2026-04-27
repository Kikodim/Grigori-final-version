alter table if exists events
  add column if not exists assessment text not null default '',
  add column if not exists why_this_matters text[] not null default '{}',
  add column if not exists watch_indicators text[] not null default '{}',
  add column if not exists confidence_rationale text not null default '',
  add column if not exists market_impact jsonb not null default '{}'::jsonb,
  add column if not exists source_assessment jsonb not null default '{}'::jsonb;

alter table if exists events
  drop constraint if exists events_tone_check;

alter table if exists events
  add constraint events_tone_check
  check (tone in ('Stable', 'Escalating', 'Deteriorating', 'Volatile', 'De-escalating'));
