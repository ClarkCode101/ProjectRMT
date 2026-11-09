-- Step 24: merging skips the duplicates she ticked.
--
-- Before merging, the app compares the two books (lib/mergeDuplicates.ts) and lists the questions coming in that
-- are already in the other book (the same ones ticked, ones only alike not ticked). The ticked ones are p_skip:
--   - they don't go into the other book;
--   - the incoming duplicate itself is deleted if it lived only in the book being merged (hers, book-only, in no
--     other book), since that book is deleted and it would be left with no home (see 0013).
--     A duplicate that's also in a subject or another of her books stays there. Built-in questions are never deleted.
--   - the question already in the other book is never touched.
-- Everything else works like 0016's merge_books.
--
-- Run after 0016. Safe to run more than once.

-- The old version without p_skip (0012/0014/0016): replaced by the one below.
drop function if exists merge_books(uuid, uuid, text);

create or replace function merge_books(p_source uuid, p_target uuid, p_chapter text, p_skip uuid[] default '{}')
returns int   -- how many questions were added to the target
language plpgsql
security definer   -- needed to update "by" (refresh_book_origin); checks that both books are hers itself
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_chapter text := nullif(btrim(regexp_replace(coalesce(p_chapter, ''), '\s+', ' ', 'g')), '');
  v_skip    uuid[] := coalesce(p_skip, '{}');
  v_target  books;
  v_added   int;
begin
  if p_source = p_target then
    raise exception 'Pick a different book to merge into.';
  end if;
  select * into v_target from books where id = p_target and owner_id = v_uid;
  if not found or not exists (select 1 from books where id = p_source and owner_id = v_uid) then
    raise exception 'Book not found.';
  end if;
  if char_length(v_chapter) > 40 then
    raise exception 'Keep the topic name to 40 letters or fewer.';
  end if;

  -- The target's questions without a topic go under the target's name, if anything is coming in.
  if exists (select 1 from book_questions bq join questions q on q.id = bq.question_id
             where bq.book_id = p_source and q.owner_id = v_uid and not (q.id = any (v_skip))) then
    update book_questions bq
    set chapter = btrim(left(regexp_replace(btrim(v_target.title), '\s+', ' ', 'g'), 40))
    from questions q
    where bq.book_id = p_target
      and bq.chapter is null
      and q.id = bq.question_id
      and q.owner_id = v_uid;
  end if;

  insert into book_questions (book_id, question_id, chapter)
  select p_target, bq.question_id, v_chapter
  from book_questions bq
  join questions q on q.id = bq.question_id
  where bq.book_id = p_source
    and q.owner_id = v_uid              -- built-in ones stay in their subjects
    and not (q.id = any (v_skip))       -- the duplicates she chose to skip
  on conflict (book_id, question_id) do nothing;
  get diagnostics v_added = row_count;

  -- The skipped duplicates that lived only in the book being merged: deleted, so none are left with no home.
  delete from questions q
  where q.id = any (v_skip)
    and q.owner_id = v_uid              -- never a built-in question, never someone else's
    and not q.in_subject
    and exists (select 1 from book_questions bq where bq.book_id = p_source and bq.question_id = q.id)
    and not exists (select 1 from book_questions bq where bq.book_id <> p_source and bq.question_id = q.id);

  delete from books where id = p_source;
  perform refresh_book_origin(p_target);
  return v_added;
end;
$$;

revoke execute on function merge_books(uuid, uuid, text, uuid[]) from public, anon;
grant  execute on function merge_books(uuid, uuid, text, uuid[]) to authenticated;
