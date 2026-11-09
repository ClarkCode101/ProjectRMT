-- Step 28: "Skip the ones I have" when adding a Community book.
--
-- Before "Add to my library", Community lists the questions that look like ones she already has (0020). The same
-- ones start ticked, alike ones don't; the ticked ones are p_skip, and they are simply not copied. Like merge_books
-- (0017), the check runs in the browser; this function only leaves those questions out.
--
-- Everything else is the same as 0016's version. If every question would be skipped, nothing is added (an empty
-- copy is no use to her).

-- The old version without p_skip (0010/0014/0015/0016): replaced by the one below.
drop function if exists add_community_book(uuid, smallint);

create or replace function add_community_book(p_book_id uuid, p_library smallint, p_skip uuid[] default '{}')
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
  v_skip uuid[] := coalesce(p_skip, '{}');
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

  -- At least one question has to be left after skipping.
  if not exists (
    select 1
    from book_questions bq
    join questions q on q.id = bq.question_id
    where bq.book_id = v_src.id
      and q.owner_id is not null
      and not (bq.question_id = any (v_skip))
  ) then
    raise exception 'You skipped every question in this book. Untick one to add it.';
  end if;

  insert into books (owner_id, title, color, library, copied_from, copied_author)
  values (v_uid, v_src.title, v_src.color, p_library, v_src.id, v_src.owner_id)
  returning id into v_new;

  for r in
    select bq.question_id, bq.chapter, bq.added_at
    from book_questions bq
    join questions q on q.id = bq.question_id
    where bq.book_id = v_src.id
      and q.owner_id is not null
      and not (bq.question_id = any (v_skip))
  loop
    -- status 'verified': her copy starts ready to use, not "Needs a look"
    insert into questions (owner_id, topic_id, source, stem, choices, correct_index,
                           explanation, choice_notes, difficulty, status, in_subject,
                           copied_author, copied_from_book)
    select v_uid, q.topic_id, q.source, q.stem, q.choices, q.correct_index,
           q.explanation, q.choice_notes, q.difficulty, 'verified'::verify_status, false,
           v_src.owner_id, v_src.id
    from questions q
    where q.id = r.question_id
    returning id into v_qid;

    insert into book_questions (book_id, question_id, chapter, added_at)
    values (v_new, v_qid, r.chapter, r.added_at);
  end loop;

  return v_new;
end;
$$;

revoke execute on function add_community_book(uuid, smallint, uuid[]) from public, anon;
grant  execute on function add_community_book(uuid, smallint, uuid[]) to authenticated;
