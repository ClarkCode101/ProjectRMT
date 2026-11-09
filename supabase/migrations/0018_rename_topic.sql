-- Step 25: rename a topic in one of her books: every question under it gets the new name at once.
--
-- If the new name is already another topic in that book, the two become one topic (the app says so first).
-- It's a function (not a plain update from the app) because the link rule from 0014 refuses any change to a link
-- to a built-in question, and an older book may still have some under the topic; this renames those too.
--
-- Run this BEFORE using the app version with "Rename topic". Safe to run more than once.

create or replace function rename_topic(p_book_id uuid, p_old text, p_new text)
returns int   -- how many questions got the new name
language plpgsql
security definer   -- see above; checks that the book is hers itself
set search_path = public
as $$
declare
  -- same cleanup as cleanChapter in lib/books.ts: single spaces, no spaces at the ends
  v_new   text := btrim(regexp_replace(coalesce(p_new, ''), '\s+', ' ', 'g'));
  v_count int;
begin
  if not exists (select 1 from books where id = p_book_id and owner_id = auth.uid()) then
    raise exception 'Book not found.';
  end if;
  if v_new = '' then
    raise exception 'Give the topic a name.';
  end if;
  if char_length(v_new) > 40 then
    raise exception 'Keep the topic name to 40 letters or fewer.';
  end if;

  update book_questions
  set chapter = v_new
  where book_id = p_book_id
    and chapter = p_old;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function rename_topic(uuid, text, text) from public, anon;
grant  execute on function rename_topic(uuid, text, text) to authenticated;
