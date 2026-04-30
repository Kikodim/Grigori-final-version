alter table reports
  alter column user_id drop not null;

alter table reports
  add column if not exists input_question text,
  add column if not exists report_text text,
  add column if not exists source_event_ids text[] not null default '{}',
  add column if not exists ai_provider text not null default 'gemini',
  add column if not exists ai_model text,
  add column if not exists generated_at timestamptz not null default now(),
  add column if not exists confidence_level text;

create index if not exists reports_generated_at on reports (generated_at desc);
