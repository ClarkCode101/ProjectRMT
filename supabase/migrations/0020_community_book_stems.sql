-- Step 27: the duplicate check before "Add to my library" on Community.
--
-- The peek inside a shared book shows at most 10 questions (community_book_preview). To warn her that some of a
-- book's questions look like ones she already has, the app needs the text of EVERY question that would be copied.
-- This only reads: the id and the question text, nothing else (no answers or explanations), and only from a book
-- that is shared right now. The check itself runs in the browser (lib/mergeDuplicates.ts), like the merge check.
--
-- Only the author's own questions (owner_id not null), since those are the ones add_community_book copies.

create or replace function community_book_stems(p_book_id uuid)
returns table (question_id uuid, stem text)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.stem
  from books b
  join book_questions bq on bq.book_id = b.id
  join questions q       on q.id = bq.question_id
  where b.id = p_book_id
    and b.published_at is not null
    and q.owner_id is not null
    and auth.uid() is not null
  order by bq.added_at, q.id;
$$;

revoke execute on function community_book_stems(uuid) from public, anon;
grant  execute on function community_book_stems(uuid) to authenticated;
