-- Step 19: merge one of her books into another.
--
-- On the shelf she holds a book and drops it on another one (or uses "Merge into another book…" in Edit book).
-- Every question of the dropped book (the source) goes into the other book (the target) under one topic,
-- usually the source's name. Then the source book is deleted. Its questions are never deleted: they now live
-- in the target book (book-only ones too).
--
-- - A question already in the target keeps its topic there (it isn't moved).
-- - The source's own topics are not kept: all of its questions get the one topic (topics are one level deep).
-- - Empty topic name = no topic.
--
-- All of it happens in one go: if anything fails, nothing changes.
-- security invoker: it runs as her, so RLS still makes sure both books are hers.
--
-- Run this BEFORE using the app version that can merge books. Safe to run more than once.

create or replace function merge_books(p_source uuid, p_target uuid, p_chapter text)
returns int   -- how many questions were added to the target
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- same cleanup as cleanChapter in lib/books.ts: single spaces, no spaces at the ends, empty = no topic
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
  where bq.book_id = p_source
  on conflict (book_id, question_id) do nothing;   -- already in the target: keep its topic there
  get diagnostics v_added = row_count;

  delete from books where id = p_source;           -- its links go with it (on delete cascade)

  return v_added;
end;
$$;

revoke execute on function merge_books(uuid, uuid, text) from public, anon;
grant  execute on function merge_books(uuid, uuid, text) to authenticated;
