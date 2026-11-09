-- Step 16: each account gets its own fixes to built-in questions.
--
-- Before this (migration 0002), any logged-in account could change a built-in question row,
-- so one account's fix (or "Report a problem") changed it for every account.
--
-- Now built-in rows are read-only again. When she edits a built-in question, or marks it
-- verified / reported, the change goes into question_overrides under HER user id. The view
-- my_questions shows each built-in question with her own changes on top, so other accounts
-- still see the original (or their own changes).
--
-- Her own questions (owner_id = her id) work like before: they are changed in place.
--
-- Fixes already saved before this migration stay in the shared built-in rows (there was only
-- one account), so nothing she sees changes today.
--
-- Run this BEFORE using the app version that reads my_questions. Safe to run more than once.

-- ---------- Her changes to built-in questions ----------
create table if not exists question_overrides (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id   uuid not null references questions(id) on delete cascade,
  -- Her edited version. All of these are null when she only changed the status;
  -- once she edits the question, every one of them is saved together (see the check below).
  topic_id      int references topics(id),
  stem          text,
  choices       jsonb,
  correct_index int check (correct_index between 0 and 3),
  explanation   text,             -- null here can mean "she removed the explanation"
  choice_notes  jsonb,
  difficulty    int check (difficulty between 1 and 3),
  -- verified / reported, just for her; null = same as the built-in question
  status        verify_status,
  updated_at    timestamptz not null default now(),
  primary key (user_id, question_id),
  constraint overrides_choices_is_list      check (choices is null or jsonb_typeof(choices) = 'array'),
  constraint overrides_choice_notes_is_list check (choice_notes is null or jsonb_typeof(choice_notes) = 'array'),
  -- an edit always has a topic, a question, choices and an answer; a status-only row has none of them
  constraint overrides_edit_is_complete check (
    (stem is null) = (topic_id is null)
    and (stem is null) = (choices is null)
    and (stem is null) = (correct_index is null)
  )
);

alter table question_overrides enable row level security;

-- She sees and changes only her own overrides, and only for built-in questions.
drop policy if exists own_overrides on question_overrides;
create policy own_overrides on question_overrides for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from questions q where q.id = question_id and q.owner_id is null)
  );

grant select, insert, update, delete on question_overrides to authenticated;

-- ---------- Built-in rows are read-only again ----------
drop policy if exists q_update_builtin on questions;

-- ---------- Every question she can see, with her own changes on top ----------
-- security_invoker: the view follows the RLS of questions and question_overrides,
-- so it only ever shows built-in + her own questions, and only her own overrides.
create or replace view my_questions
with (security_invoker = true) as
select
  q.id,
  q.owner_id,
  q.source,
  q.upload_id,
  q.image_path,
  q.in_subject,
  q.created_at,
  coalesce(o.topic_id, q.topic_id)           as topic_id,
  coalesce(o.stem, q.stem)                   as stem,
  coalesce(o.choices, q.choices)             as choices,
  coalesce(o.correct_index, q.correct_index) as correct_index,
  -- these three can be null on purpose in her edit, so take them from the edit whenever there is one
  case when o.stem is not null then o.explanation  else q.explanation  end as explanation,
  case when o.stem is not null then o.choice_notes else q.choice_notes end as choice_notes,
  case when o.stem is not null then o.difficulty   else q.difficulty   end as difficulty,
  coalesce(o.status, q.status)               as status,
  -- true = she edited this built-in question (her version is the one shown)
  (o.stem is not null)                       as edited
from questions q
left join question_overrides o
  on o.question_id = q.id and o.user_id = (select auth.uid());

grant select on my_questions to authenticated;

-- ---------- Subject scores use her version's topic ----------
create or replace view topic_performance
with (security_invoker = true) as
select a.user_id, t.subject_id, q.topic_id,
       count(*)                                      as attempts,
       avg(case when a.is_correct then 1 else 0 end) as accuracy
from attempts a
join my_questions q on q.id = a.question_id
join topics t       on t.id = q.topic_id
where q.in_subject
group by a.user_id, t.subject_id, q.topic_id;
