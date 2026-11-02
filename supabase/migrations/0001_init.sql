-- MTLE Reviewer: initial schema (PROJECT_PLAN.md §7)
-- Run this once in the Supabase SQL Editor (or with `supabase db push`).
--
-- Changes from the plan:
--   * user_id / owner_id columns default to auth.uid(), so the app never has to
--     send its own user id (and can't send someone else's).
--     questions.owner_id also defaults to auth.uid(): rows inserted from the SQL
--     Editor get NULL there (no logged-in user), which is exactly "built-in".
--   * RLS policies use (select auth.uid()), Supabase's recommended faster form.
--   * topic_performance view uses security_invoker so it follows RLS on attempts.

-- Extensions
-- Supabase keeps extensions in their own schema (not public).
create extension if not exists pg_trgm with schema extensions;
-- create extension if not exists vector;  -- phase 4 (optional)

-- ---------- Reference data ----------
create table subjects (
  id          serial primary key,
  code        text unique not null,      -- 'CC','MICRO','HEMA','BBIS','CM','HTMLE'
  name        text not null,
  weight      numeric not null,          -- 0.20, 0.10
  sort_order  int default 0
);

create table topics (
  id          serial primary key,
  subject_id  int not null references subjects(id) on delete cascade,
  name        text not null,
  unique (subject_id, name)
);

-- ---------- Uploads ----------
create table uploads (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  file_name      text not null,
  storage_path   text not null,
  status         text not null default 'processing', -- processing | review | done | failed
  question_count int default 0,
  created_at     timestamptz default now()
);

-- ---------- Questions ----------
create type question_source as enum ('builtin', 'user', 'upload');
create type verify_status   as enum ('unverified', 'verified');

create table questions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid default auth.uid() references auth.users(id) on delete cascade, -- null = builtin
  topic_id        int not null references topics(id),
  source          question_source not null,
  upload_id       uuid references uploads(id) on delete set null,
  stem            text not null,
  choices         jsonb not null,        -- ["A","B","C","D"]
  correct_index   int not null check (correct_index between 0 and 3),
  explanation     text,
  image_path      text,                  -- Supabase Storage path
  difficulty      int default 2 check (difficulty between 1 and 3),
  status          verify_status not null default 'unverified',
  normalized_stem text generated always as (
                    trim(regexp_replace(
                      regexp_replace(lower(stem), '[^a-z0-9 ]', ' ', 'g'),
                    '\s+', ' ', 'g'))
                  ) stored,
  stem_hash       text generated always as (md5(
                    trim(regexp_replace(
                      regexp_replace(lower(stem), '[^a-z0-9 ]', ' ', 'g'),
                    '\s+', ' ', 'g')))
                  ) stored,
  created_at      timestamptz default now()
);

create index questions_topic_idx on questions(topic_id);
create index questions_hash_idx  on questions(stem_hash);
create index questions_trgm_idx  on questions using gin (normalized_stem extensions.gin_trgm_ops);

-- ---------- Sessions & attempts ----------
create type session_mode as enum ('practice', 'mock', 'flashcard');

create table quiz_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode          session_mode not null,
  filters       jsonb,                 -- { source, subject_ids, topic_ids, upload_id, verified_only }
  total_items   int,
  score         int,
  duration_sec  int,
  started_at    timestamptz default now(),
  finished_at   timestamptz
);

create table attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id      uuid references quiz_sessions(id) on delete cascade,
  question_id     uuid not null references questions(id) on delete cascade,
  selected_index  int,                  -- index in ORIGINAL choices order
  is_correct      boolean not null,
  time_ms         int,
  created_at      timestamptz default now()
);
create index attempts_user_q_idx on attempts(user_id, question_id);
create index attempts_user_created_idx on attempts(user_id, created_at desc);

-- ---------- Flashcards (FSRS state) ----------
create table review_states (
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id    uuid not null references questions(id) on delete cascade,
  due            timestamptz not null default now(),
  stability      double precision,
  difficulty     double precision,
  elapsed_days   int,
  scheduled_days int,
  reps           int default 0,
  lapses         int default 0,
  state          int default 0,         -- ts-fsrs State enum
  last_review    timestamptz,
  primary key (user_id, question_id)
);

-- ---------- Extras ----------
create table study_settings (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  exam_date     date,
  daily_target  int default 50
);

create table encouragements (
  id         serial primary key,
  trigger    text not null,             -- 'mock_done' | 'streak_7' | 'streak_30' | 'random'
  message    text not null
);

create table reference_items (           -- quick reference page
  id         serial primary key,
  subject_id int references subjects(id),
  title      text not null,              -- e.g. 'Hemoglobin (male)'
  value      text not null,              -- e.g. '13.5–17.5 g/dL'
  notes      text
);

-- ---------- Duplicate check function ----------
create or replace function find_similar_questions(p_stem text, p_threshold real default 0.6)
returns table (id uuid, stem text, score real, exact boolean)
language sql stable
set search_path = public, extensions  -- fixed search_path, so the function can't be tricked into using other tables
as $$
  with n as (
    select trim(regexp_replace(
             regexp_replace(lower(p_stem), '[^a-z0-9 ]', ' ', 'g'),
           '\s+', ' ', 'g')) as s
  )
  select q.id, q.stem,
         similarity(q.normalized_stem, n.s) as score,
         q.stem_hash = md5(n.s) as exact
  from questions q, n
  where (q.owner_id = auth.uid() or q.owner_id is null)
    and (q.stem_hash = md5(n.s) or similarity(q.normalized_stem, n.s) > p_threshold)
  order by exact desc, score desc
  limit 5;
$$;

-- ---------- Weak-area view ----------
create or replace view topic_performance
with (security_invoker = true) as
select a.user_id, t.subject_id, q.topic_id,
       count(*)                                      as attempts,
       avg(case when a.is_correct then 1 else 0 end) as accuracy
from attempts a
join questions q on q.id = a.question_id
join topics t    on t.id = q.topic_id
group by a.user_id, t.subject_id, q.topic_id;

-- ---------- Row Level Security ----------
alter table questions       enable row level security;
alter table uploads         enable row level security;
alter table quiz_sessions   enable row level security;
alter table attempts        enable row level security;
alter table review_states   enable row level security;
alter table study_settings  enable row level security;

-- Questions: read built-in + own; write own only
create policy q_read  on questions for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy q_write on questions for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Owner-only tables
create policy own_uploads  on uploads        for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_sessions on quiz_sessions  for all to authenticated using (user_id  = (select auth.uid())) with check (user_id  = (select auth.uid()));
create policy own_attempts on attempts       for all to authenticated using (user_id  = (select auth.uid())) with check (user_id  = (select auth.uid()));
create policy own_reviews  on review_states  for all to authenticated using (user_id  = (select auth.uid())) with check (user_id  = (select auth.uid()));
create policy own_settings on study_settings for all to authenticated using (user_id  = (select auth.uid())) with check (user_id  = (select auth.uid()));

-- Reference tables: read-only for authenticated users
alter table subjects        enable row level security;
alter table topics          enable row level security;
alter table encouragements  enable row level security;
alter table reference_items enable row level security;
create policy read_subjects   on subjects        for select to authenticated using (true);
create policy read_topics     on topics          for select to authenticated using (true);
create policy read_encourage  on encouragements  for select to authenticated using (true);
create policy read_reference  on reference_items for select to authenticated using (true);

-- Storage buckets (uploads, question-images) are Phase 2; see README.
