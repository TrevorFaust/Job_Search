-- Reference schema for the apartment-hunt Supabase project.
-- Applied via migrations; run sections manually if recreating elsewhere.

-- Core jobs table (original)
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

-- Multi-user + salary + retention columns
alter table public.jobs add column if not exists salary_min_annual integer;
alter table public.jobs add column if not exists salary_max_annual integer;
alter table public.jobs add column if not exists salary_raw text;
alter table public.jobs add column if not exists expires_at timestamptz;
alter table public.jobs add column if not exists status text not null default 'active';
alter table public.jobs add column if not exists is_special boolean not null default false;
alter table public.jobs add column if not exists special_notified_at timestamptz;

create index if not exists jobs_special_active_idx
  on public.jobs (is_special, status)
  where is_special = true and status = 'active';

create index if not exists jobs_active_expires_idx
  on public.jobs (expires_at)
  where status = 'active';

create index if not exists jobs_active_board_posted_idx
  on public.jobs (posted_at DESC NULLS LAST, id DESC)
  where status = 'active';

create index if not exists jobs_active_nonspecial_board_posted_idx
  on public.jobs (posted_at DESC NULLS LAST, id DESC)
  where status = 'active' and is_special = false;

alter table public.jobs
  add column if not exists board_search tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(left(description, 4000), '')
    )
  ) stored;

create index if not exists jobs_active_board_search_idx
  on public.jobs using gin (board_search)
  where status = 'active';

create index if not exists jobs_created_at_desc_idx
  on public.jobs (created_at desc);

create table if not exists public.scraper_state (
  key text primary key,
  value timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.scraper_state enable row level security;

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  timezone text not null default 'America/Los_Angeles',
  edit_token text unique not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  name text not null,
  keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  locations text[] not null default '{}',
  remote_only boolean not null default false,
  min_salary_annual integer,
  include_unknown_salary boolean not null default true,
  frequency text not null default 'daily'
    check (frequency in ('daily', 'every_3_days', 'weekly')),
  last_sent_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_job_matches (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.search_profiles(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  matched_keywords text[] not null default '{}',
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, job_id)
);

alter table public.jobs enable row level security;
alter table public.subscribers enable row level security;
alter table public.search_profiles enable row level security;
alter table public.profile_job_matches enable row level security;

-- Resume tailoring
create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  label text not null default 'Master resume',
  content_text text not null,
  source_filename text,
  format_meta jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resumes_subscriber_active_idx
  on public.resumes (subscriber_id)
  where is_active = true;

create table if not exists public.tailoring_sessions (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  job_id bigint not null references public.jobs(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'analyzing', 'questioning', 'generating', 'done', 'failed')),
  keyword_analysis jsonb not null default '{}',
  gap_analysis jsonb not null default '{}',
  questions jsonb not null default '[]',
  answers jsonb not null default '[]',
  extra_context text not null default '',
  page_preference text not null default 'one'
    check (page_preference in ('one', 'two')),
  output_text text,
  cover_letter_text text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tailoring_sessions_subscriber_idx
  on public.tailoring_sessions (subscriber_id, created_at desc);

create index if not exists tailoring_sessions_job_idx
  on public.tailoring_sessions (subscriber_id, job_id);

alter table public.resumes enable row level security;
alter table public.tailoring_sessions enable row level security;

create table if not exists public.tailor_answer_bank (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  answer_key text not null,
  question text not null,
  answer text not null,
  related_requirement text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscriber_id, answer_key)
);

create index if not exists tailor_answer_bank_subscriber_idx
  on public.tailor_answer_bank (subscriber_id, updated_at desc);

alter table public.tailor_answer_bank enable row level security;

create table if not exists public.manual_jobs (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  title text not null,
  company text,
  location text,
  url text,
  salary text,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_jobs_subscriber_idx
  on public.manual_jobs (subscriber_id, created_at desc);

alter table public.tailoring_sessions
  alter column job_id drop not null;

alter table public.tailoring_sessions
  add column if not exists manual_job_id uuid references public.manual_jobs(id) on delete cascade;

alter table public.manual_jobs enable row level security;

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  job_id bigint references public.jobs(id) on delete cascade,
  manual_job_id uuid references public.manual_jobs(id) on delete cascade,
  stage text not null default 'applied'
    check (stage in ('applied', 'interviewing', 'rejected', 'offered')),
  tailoring_session_id uuid references public.tailoring_sessions(id) on delete set null,
  notes text not null default '',
  interview_prep jsonb not null default '{}'::jsonb,
  follow_up_contacts jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (job_id is not null and manual_job_id is null) or
    (job_id is null and manual_job_id is not null)
  )
);

-- Migrate legacy rows (job_id was NOT NULL before manual applications).
alter table public.job_applications alter column job_id drop not null;
alter table public.job_applications
  add column if not exists manual_job_id uuid references public.manual_jobs(id) on delete cascade;

alter table public.job_applications
  add column if not exists follow_up_contacts jsonb not null default '{}'::jsonb;

alter table public.job_applications drop constraint if exists job_applications_subscriber_id_job_id_key;
alter table public.job_applications drop constraint if exists job_applications_subscriber_id_job_id_key1;

create unique index if not exists job_applications_subscriber_scraped_job_idx
  on public.job_applications (subscriber_id, job_id)
  where job_id is not null;

create unique index if not exists job_applications_subscriber_manual_job_idx
  on public.job_applications (subscriber_id, manual_job_id)
  where manual_job_id is not null;

create index if not exists job_applications_subscriber_idx
  on public.job_applications (subscriber_id, applied_at desc);

create index if not exists job_applications_subscriber_stage_idx
  on public.job_applications (subscriber_id, stage);

alter table public.job_applications enable row level security;

-- Jobs a subscriber has hidden from their board (e.g. listing no longer available).
create table if not exists public.dismissed_jobs (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  job_id bigint references public.jobs(id) on delete cascade,
  manual_job_id uuid references public.manual_jobs(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  check (
    (job_id is not null and manual_job_id is null) or
    (job_id is null and manual_job_id is not null)
  )
);

create unique index if not exists dismissed_jobs_subscriber_scraped_job_idx
  on public.dismissed_jobs (subscriber_id, job_id)
  where job_id is not null;

create unique index if not exists dismissed_jobs_subscriber_manual_job_idx
  on public.dismissed_jobs (subscriber_id, manual_job_id)
  where manual_job_id is not null;

create index if not exists dismissed_jobs_subscriber_idx
  on public.dismissed_jobs (subscriber_id, dismissed_at desc);

alter table public.dismissed_jobs enable row level security;
