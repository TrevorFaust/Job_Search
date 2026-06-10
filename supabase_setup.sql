-- Already applied to the 'apartment-hunt' Supabase project via migration.
-- Kept here as a reference / for recreating the table elsewhere.

create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  source text not null,
  external_id text not null,
  title text not null,
  company text,
  location text,
  url text not null,
  salary text,
  description text,
  matched_keywords text[] not null default '{}',
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (source, external_id)
);

create index if not exists jobs_unsent_idx on public.jobs (created_at) where sent_at is null;

-- Lock the table down; the script uses the service role key which bypasses RLS
alter table public.jobs enable row level security;
