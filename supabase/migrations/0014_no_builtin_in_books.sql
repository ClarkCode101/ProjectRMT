-- Step 21: built-in questions can't go into her books.
--
-- Built-in questions already live in their subject books (CC, HEMA, ...), so putting them in her own books only made
-- copies of the same thing. From now on her books hold only her own questions (written, uploaded, or copied from
-- Community).
--
-- 1. book_questions: a new link must be to one of HER questions (no longer built-in ones).
-- 2. Community (0010/0011): a shared book's built-in questions aren't counted, shown, or copied.
--    A shared book with only built-in questions doesn't show at all.
--    Copies start ready to use ("verified"), never "Needs a look", whatever the author's status was.
-- 3. merge_books (0012): built-in questions in the merged book aren't moved (they'd be refused by rule 1).
--
-- Built-in questions already in a book stay there until she removes them ("Remove from book").
--
-- Run this BEFORE using the app version that hides "Add to book" on built-in questions. Safe to run more than once.

-- ---------- 1. Only her own questions go into her books ----------
drop policy if exists own_book_questions on book_questions;
create policy own_book_questions on book_questions for all to authenticated
  using (exists (select 1 from books b where b.id = book_id and b.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from books b where b.id = book_id and b.owner_id = (select auth.uid()))
    and exists (select 1 from questions q where q.id = question_id and q.owner_id = (select auth.uid()))
  );

-- ---------- 2. Community: only the author's own questions ----------
create or replace function community_books()
returns table (
  id             uuid,
  title          text,
  color          text,
  author_name    text,
  published_at   timestamptz,
  question_count int,
  subject_codes  text[],
  times_added    int,
  is_mine        boolean,
  my_copy_id     uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.title, b.color,
    coalesce(nullif(btrim(left(u.raw_user_meta_data ->> 'first_name', 40)), ''), 'A classmate'),
    b.published_at,
    (select count(*)::int
       from book_questions bq join questions q on q.id = bq.question_id
      where bq.book_id = b.id and q.owner_id is not null),
    coalesce((
      select array_agg(distinct s.code order by s.code)
      from book_questions bq
      join questions q on q.id = bq.question_id
      join topics t    on t.id = q.topic_id
      join subjects s  on s.id = t.subject_id
      where bq.book_id = b.id and q.owner_id is not null and s.code <> 'BOOK'
    ), '{}'),
    (select count(distinct c.owner_id)::int from books c where c.copied_from = b.id),
    b.owner_id = auth.uid(),
    (select c.id from books c where c.copied_from = b.id and c.owner_id = auth.uid() order by c.created_at limit 1)
  from books b
  join auth.users u on u.id = b.owner_id
  where b.published_at is not null
    and auth.uid() is not null
    -- nothing to add if it only has built-in questions
    and exists (select 1 from book_questions bq join questions q on q.id = bq.question_id
                where bq.book_id = b.id and q.owner_id is not null)
  order by b.published_at desc, b.id;
$$;

create or replace function community_book_preview(p_book_id uuid, p_limit int default 5)
returns table (question_id uuid, stem text, subject_code text, chapter text)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.stem, s.code, bq.chapter
  from books b
  join book_questions bq on bq.book_id = b.id
  join questions q       on q.id = bq.question_id
  join topics t          on t.id = q.topic_id
  join subjects s        on s.id = t.subject_id
  where b.id = p_book_id
    and b.published_at is not null
    and q.owner_id is not null
    and auth.uid() is not null
  order by bq.added_at, q.id
  limit least(greatest(p_limit, 1), 10);
$$;

create or replace function add_community_book(p_book_id uuid, p_library smallint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_src  books;
  v_new  uuid;
  v_qid  uuid;
  v_used int;
  r      record;
begin
  if v_uid is null then
    raise exception 'Log in first.';
  end if;

  select * into v_src from books where id = p_book_id and published_at is not null;
  if not found then
    raise exception 'This book is no longer shared.';
  end if;
  if v_src.owner_id = v_uid then
    raise exception 'This is your own book.';
  end if;
  if exists (select 1 from books where copied_from = p_book_id and owner_id = v_uid) then
    raise exception 'This book is already in your library.';
  end if;
  if p_library is null or p_library not between 1 and 3 then
    raise exception 'Pick one of your libraries.';
  end if;

  -- 12 books per library; Library 1 also holds the six subject books. Keep in step with LIBRARY_SLOTS in lib/books.ts.
  select count(*) into v_used from books where owner_id = v_uid and library = p_library;
  if p_library = 1 then
    v_used := v_used + (select count(*) from subjects where code <> 'BOOK');
  end if;
  if v_used >= 12 then
    raise exception 'That library is full. Pick another one or make room first.';
  end if;

  insert into books (owner_id, title, color, library, copied_from)
  values (v_uid, v_src.title, v_src.color, p_library, v_src.id)
  returning id into v_new;

  -- Only the author's own questions (built-in ones are already in her subject books).
  for r in
    select bq.question_id, bq.chapter, bq.added_at
    from book_questions bq
    join questions q on q.id = bq.question_id
    where bq.book_id = v_src.id
      and q.owner_id is not null
  loop
    insert into questions (owner_id, topic_id, source, stem, choices, correct_index,
                           explanation, choice_notes, difficulty, status, in_subject)
    -- status 'verified': her copy starts ready to use, not "Needs a look" (whatever the author's status was)
    select v_uid, q.topic_id, q.source, q.stem, q.choices, q.correct_index,
           q.explanation, q.choice_notes, q.difficulty, 'verified'::verify_status, false
    from questions q
    where q.id = r.question_id
    returning id into v_qid;

    insert into book_questions (book_id, question_id, chapter, added_at)
    values (v_new, v_qid, r.chapter, r.added_at);
  end loop;

  return v_new;
end;
$$;

-- ---------- 3. Merge: move only her own questions ----------
create or replace function merge_books(p_source uuid, p_target uuid, p_chapter text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_chapter text := nullif(btrim(regexp_replace(coalesce(p_chapter, ''), '\s+', ' ', 'g')), '');
  v_added   int;
begin
  if p_source = p_target then
    raise exception 'Pick a different book to merge into.';
  end if;
  if not exists (select 1 from books where id = p_source and owner_id = auth.uid())
     or not exists (select 1 from books where id = p_target and owner_id = auth.uid()) then
    raise exception 'Book not found.';
  end if;
  if char_length(v_chapter) > 40 then
    raise exception 'Keep the topic name to 40 letters or fewer.';
  end if;

  insert into book_questions (book_id, question_id, chapter)
  select p_target, bq.question_id, v_chapter
  from book_questions bq
  join questions q on q.id = bq.question_id
  where bq.book_id = p_source
    and q.owner_id = auth.uid()   -- built-in ones stay in their subjects
  on conflict (book_id, question_id) do nothing;
  get diagnostics v_added = row_count;

  delete from books where id = p_source;
  return v_added;
end;
$$;

-- create or replace keeps the grants; repeated so this file is complete on its own.
revoke execute on function community_books()                 from public, anon;
revoke execute on function community_book_preview(uuid, int) from public, anon;
revoke execute on function add_community_book(uuid, smallint) from public, anon;
revoke execute on function merge_books(uuid, uuid, text)      from public, anon;
grant  execute on function community_books()                 to authenticated;
grant  execute on function community_book_preview(uuid, int) to authenticated;
grant  execute on function add_community_book(uuid, smallint) to authenticated;
grant  execute on function merge_books(uuid, uuid, text)      to authenticated;
