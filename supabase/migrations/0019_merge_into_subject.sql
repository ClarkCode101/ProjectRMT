-- Step 26: merge one of her books into a subject book (CC, HEMA, ...).
--
-- The book is removed and its questions join the subjects, under a topic named after the book ("Ewan").
-- Each question goes into ITS OWN subject (a HEMA question into HEMA, a CC one into CC); the ones written in her
-- book (no real subject) go into the subject she dropped the book on. So "Ewan" can show up in more than one subject.
--
-- "Ewan" is HER topic, so it isn't a row in `topics` (that list is shared by every account, and the seed files
-- depend on it). It's a label on her questions instead: questions.subject_topic. Each question keeps its board
-- topic (topic_id), so the scores per board topic stay right; the Contents shows it under her topic.
--
-- 1. questions.subject_topic, and my_questions shows it.
-- 2. merge_into_subject: the merge. Duplicates she ticks are skipped (deleted if they lived only in that book).
--    If the name is the same as a board topic in that subject ("Enzymes"), the question just goes into that topic.
-- 3. rename_subject_topic / split_subject_topic: the ⋯ on her topic in a subject (Rename, Move to its own book).
--    Built-in questions and board topics are never changed.
--
-- Run after 0018. Safe to run more than once.

-- ---------- 1. Her topic inside a subject ----------
alter table questions
  add column if not exists subject_topic text
  check (subject_topic is null or char_length(subject_topic) between 1 and 40);

-- my_questions (0009) with the new column at the end.
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
  case when o.stem is not null then o.explanation  else q.explanation  end as explanation,
  case when o.stem is not null then o.choice_notes else q.choice_notes end as choice_notes,
  case when o.stem is not null then o.difficulty   else q.difficulty   end as difficulty,
  coalesce(o.status, q.status)               as status,
  (o.stem is not null)                       as edited,
  q.subject_topic                            -- her topic in the subject (0019); null for built-in questions
from questions q
left join question_overrides o
  on o.question_id = q.id and o.user_id = (select auth.uid());

grant select on my_questions to authenticated;

-- A name is the same as a board topic in a subject (ignoring capitals)? Then that topic's id, else null.
create or replace function board_topic_named(p_subject_id int, p_name text)
returns int
language sql
stable
set search_path = public
as $$
  select id from topics where subject_id = p_subject_id and lower(name) = lower(p_name) order by id limit 1;
$$;

-- ---------- 2. Merge a book into a subject ----------
create or replace function merge_into_subject(p_source uuid, p_subject_id int, p_topic text, p_skip uuid[] default '{}')
returns int   -- how many questions joined the subjects
language plpgsql
security definer   -- checks that the book is hers itself
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := btrim(regexp_replace(coalesce(p_topic, ''), '\s+', ' ', 'g'));
  v_skip    uuid[] := coalesce(p_skip, '{}');
  v_book_subject int;
  v_general int;
  v_count   int;
begin
  if not exists (select 1 from books where id = p_source and owner_id = v_uid) then
    raise exception 'Book not found.';
  end if;
  if not exists (select 1 from subjects where id = p_subject_id and code <> 'BOOK') then
    raise exception 'Subject not found.';
  end if;
  if v_name = '' then
    raise exception 'Give the topic a name.';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'Keep the topic name to 40 letters or fewer.';
  end if;

  select id into v_book_subject from subjects where code = 'BOOK';
  -- Questions written in her book have no real subject: they go under the dropped-on subject's "General" (0005).
  v_general := board_topic_named(p_subject_id, 'General');

  -- Her questions in the book (not the skipped ones): into their own subject, under her topic.
  with moving as (
    select q.id,
           case when t.subject_id = v_book_subject then coalesce(v_general, q.topic_id) else q.topic_id end as new_topic
    from book_questions bq
    join questions q on q.id = bq.question_id
    join topics t    on t.id = q.topic_id
    where bq.book_id = p_source
      and q.owner_id = v_uid
      and not (q.id = any (v_skip))
  )
  update questions q
  set topic_id = m.new_topic,
      in_subject = true,
      subject_topic = v_name
  from moving m
  where q.id = m.id;
  get diagnostics v_count = row_count;

  -- The same name as a board topic in that subject: just put it in that topic (no topic of hers needed).
  update questions q
  set topic_id = board_topic_named(t.subject_id, v_name),
      subject_topic = null
  from topics t
  where t.id = q.topic_id
    and q.owner_id = v_uid
    and q.subject_topic = v_name
    and board_topic_named(t.subject_id, v_name) is not null;

  -- Skipped duplicates that lived only in this book: deleted, so none are left with no home (never built-in).
  delete from questions q
  where q.id = any (v_skip)
    and q.owner_id = v_uid
    and not q.in_subject
    and exists (select 1 from book_questions bq where bq.book_id = p_source and bq.question_id = q.id)
    and not exists (select 1 from book_questions bq where bq.book_id <> p_source and bq.question_id = q.id);

  delete from books where id = p_source;
  return v_count;
end;
$$;

-- ---------- 3a. Rename her topic in a subject ----------
-- The same name as another of her topics there = they join; the same as a board topic = they go into it.
create or replace function rename_subject_topic(p_subject_id int, p_old text, p_new text)
returns int
language plpgsql
security invoker   -- only her own questions are changed (RLS)
set search_path = public
as $$
declare
  v_new   text := btrim(regexp_replace(coalesce(p_new, ''), '\s+', ' ', 'g'));
  v_board int;
  v_count int;
begin
  if v_new = '' then
    raise exception 'Give the topic a name.';
  end if;
  if char_length(v_new) > 40 then
    raise exception 'Keep the topic name to 40 letters or fewer.';
  end if;
  v_board := board_topic_named(p_subject_id, v_new);

  update questions q
  set subject_topic = case when v_board is null then v_new end,
      topic_id = coalesce(v_board, q.topic_id)
  from topics t
  where t.id = q.topic_id
    and t.subject_id = p_subject_id
    and q.owner_id = auth.uid()
    and q.in_subject
    and q.subject_topic = p_old;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------- 3b. Her topic in a subject becomes a book again ----------
-- Her questions under it leave the subject (book-only again) and go into a new book named after the topic.
-- The new book shows "by <classmate>" again if they're all unedited copies from one classmate (0016).
create or replace function split_subject_topic(p_subject_id int, p_topic text, p_library smallint)
returns uuid
language plpgsql
security definer   -- needed to set "by" on the new book; only touches her own questions
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_ids  uuid[];
  v_used int;
  v_new  uuid;
begin
  if p_library is null or p_library not between 1 and 3 then
    raise exception 'Pick one of your libraries.';
  end if;

  select array_agg(q.id) into v_ids
  from questions q
  join topics t on t.id = q.topic_id
  where t.subject_id = p_subject_id
    and q.owner_id = v_uid
    and q.in_subject
    and q.subject_topic = p_topic;
  if v_ids is null then
    raise exception 'This topic has no questions of yours to move.';
  end if;

  -- Room in the library (12 books; Library 1 also holds the six subject books). Keep in step with lib/books.ts.
  select count(*) into v_used from books where owner_id = v_uid and library = p_library;
  if p_library = 1 then
    v_used := v_used + (select count(*) from subjects where code <> 'BOOK');
  end if;
  if v_used >= 12 then
    raise exception 'That library is full. Pick another one or make room first.';
  end if;

  insert into books (owner_id, title, color, library)
  values (v_uid, left(p_topic, 60), 'teal', p_library)
  returning id into v_new;

  insert into book_questions (book_id, question_id)
  select v_new, unnest(v_ids)
  on conflict (book_id, question_id) do nothing;

  update questions
  set in_subject = false,
      subject_topic = null
  where id = any (v_ids);

  perform refresh_book_origin(v_new);
  -- coming back from Community: the original's color
  update books n set color = o.color from books o where n.id = v_new and o.id = n.copied_from;
  return v_new;
end;
$$;

revoke execute on function board_topic_named(int, text)                      from public, anon;
revoke execute on function merge_into_subject(uuid, int, text, uuid[])       from public, anon;
revoke execute on function rename_subject_topic(int, text, text)             from public, anon;
revoke execute on function split_subject_topic(int, text, smallint)          from public, anon;
grant  execute on function board_topic_named(int, text)                      to authenticated;
grant  execute on function merge_into_subject(uuid, int, text, uuid[])       to authenticated;
grant  execute on function rename_subject_topic(int, text, text)             to authenticated;
grant  execute on function split_subject_topic(int, text, smallint)          to authenticated;
