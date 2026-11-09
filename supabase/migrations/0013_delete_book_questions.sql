-- Step 20: deleting a book also deletes the questions that lived only in it.
--
-- Before this, deleting a book only took its links away. A question that lived only in that book (book-only,
-- in_subject = false, in no other book) was left behind with no home: not in any book, not in a subject, so she
-- couldn't find it anymore, but the upload duplicate check still did ("Possible duplicate" for questions she
-- no longer has). Copies added from Community are like that, and so are questions written or uploaded into a book.
--
-- 1. delete_book: deletes the book and, in the same step, her questions that lived only in it.
--    Questions in a subject, in another of her books, or built-in are never touched.
-- 2. A one-time cleanup of the questions already left behind like that (every account).
--    Their answers and flashcard progress go with them (they couldn't be studied anymore anyway).
--
-- Run this BEFORE using the app version that calls delete_book. Safe to run more than once.

-- ---------- 1. Delete a book and the questions that lived only in it ----------
create or replace function delete_book(p_book_id uuid)
returns int   -- how many questions were deleted with it
language plpgsql
security invoker   -- runs as her: RLS makes sure the book and the questions are hers
set search_path = public
as $$
declare
  v_deleted int;
begin
  if not exists (select 1 from books where id = p_book_id and owner_id = auth.uid()) then
    raise exception 'Book not found.';
  end if;

  delete from questions q
  where q.owner_id = auth.uid()
    and not q.in_subject
    and exists (select 1 from book_questions bq where bq.book_id = p_book_id and bq.question_id = q.id)
    and not exists (select 1 from book_questions bq where bq.book_id <> p_book_id and bq.question_id = q.id);
  get diagnostics v_deleted = row_count;

  delete from books where id = p_book_id;
  return v_deleted;
end;
$$;

revoke execute on function delete_book(uuid) from public, anon;
grant  execute on function delete_book(uuid) to authenticated;

-- ---------- 2. Clean up the questions already left with no home ----------
-- Her own (never built-in), not in a subject, and in none of her books.
delete from questions q
where q.owner_id is not null
  and not q.in_subject
  and not exists (select 1 from book_questions bq where bq.question_id = q.id);
