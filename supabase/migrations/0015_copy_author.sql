-- Step 22: a book added from Community shows who made it ("by Ana") instead of just "From Community".
--
-- The copy remembers its author (books.copied_author), so the name still shows after the author deletes or stops
-- sharing the original (copied_from then becomes null). The name itself is read live from the author's account,
-- like on the Community page (0011), so a new first name shows here too.
--
-- 1. books.copied_author: the account that shared the original. Set only by add_community_book.
--    Filled in for copies made before this, while their original still exists.
-- 2. add_community_book: same as 0014, and saves copied_author.
-- 3. my_book_authors(): the author's first name for each of HER copied books (only hers).
--
-- Run after 0014. Safe to run more than once.

-- ---------- 1. Remember the author on the copy ----------
alter table books
  add column if not exists copied_author uuid references auth.users(id) on delete set null;

-- Copies made before this: take the author from the original, if it's still there.
update books c
set copied_author = o.owner_id
from books o
where c.copied_from = o.id
  and c.copied_author is null;

-- (The app still may only write title, color and library: the grants from 0010 don't include this column.)

-- ---------- 2. Add to library: also save who the author is ----------
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

  insert into books (owner_id, title, color, library, copied_from, copied_author)
  values (v_uid, v_src.title, v_src.color, p_library, v_src.id, v_src.owner_id)
  returning id into v_new;

  -- Only the author's own questions (built-in ones are already in her subject books).
  for r in
    select bq.question_id, bq.chapter, bq.added_at
    from book_questions bq
    join questions q on q.id = bq.question_id
    where bq.book_id = v_src.id
      and q.owner_id is not null
  loop
    -- status 'verified': her copy starts ready to use, not "Needs a look" (whatever the author's status was)
    insert into questions (owner_id, topic_id, source, stem, choices, correct_index,
                           explanation, choice_notes, difficulty, status, in_subject)
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

-- ---------- 3. The author's name for each of her copied books ----------
create or replace function my_book_authors()
returns table (book_id uuid, author_name text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id,
         -- the first name the author set in Settings (same as community_books), never their email
         coalesce(nullif(btrim(left(u.raw_user_meta_data ->> 'first_name', 40)), ''), 'A classmate')
  from books b
  join auth.users u on u.id = b.copied_author
  where b.owner_id = auth.uid();
$$;

revoke execute on function add_community_book(uuid, smallint) from public, anon;
revoke execute on function my_book_authors()                  from public, anon;
grant  execute on function add_community_book(uuid, smallint) to authenticated;
grant  execute on function my_book_authors()                  to authenticated;
