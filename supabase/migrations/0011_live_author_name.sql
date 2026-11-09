-- Step 18: the author's name on Community follows their account.
--
-- Migration 0010 saved the author's first name in books.author_name when they shared a book, so a name set or
-- changed later in Settings never showed up there (it stayed "A classmate"). Now community_books reads the
-- first name from the author's account every time, so a new name shows on all their shared books right away.
-- books.author_name isn't needed anymore and is removed.
--
-- Only the first name is shown (never the email). No first name set = "A classmate".
--
-- Run after 0010. Safe to run more than once.

-- ---------- Share / stop sharing: same as 0010, without saving a name ----------
create or replace function publish_book(p_book_id uuid, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from books where id = p_book_id and owner_id = auth.uid()) then
    raise exception 'Book not found.';
  end if;

  if p_publish then
    if not exists (select 1 from book_questions where book_id = p_book_id) then
      raise exception 'Add at least one question before sharing this book.';
    end if;
    update books set published_at = coalesce(published_at, now()) where id = p_book_id;  -- sharing again keeps the first date
  else
    update books set published_at = null where id = p_book_id;
  end if;
end;
$$;

-- ---------- Every shared book: the author's name now comes from their account ----------
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
    -- the first name she set in Settings (lib/profile.ts keeps it the same way: trimmed, at most 40 letters)
    coalesce(nullif(btrim(left(u.raw_user_meta_data ->> 'first_name', 40)), ''), 'A classmate'),
    b.published_at,
    (select count(*)::int from book_questions bq where bq.book_id = b.id),
    coalesce((
      select array_agg(distinct s.code order by s.code)
      from book_questions bq
      join questions q on q.id = bq.question_id
      join topics t    on t.id = q.topic_id
      join subjects s  on s.id = t.subject_id
      where bq.book_id = b.id and s.code <> 'BOOK'
    ), '{}'),
    (select count(distinct c.owner_id)::int from books c where c.copied_from = b.id),
    b.owner_id = auth.uid(),
    (select c.id from books c where c.copied_from = b.id and c.owner_id = auth.uid() order by c.created_at limit 1)
  from books b
  join auth.users u on u.id = b.owner_id
  where b.published_at is not null
    and auth.uid() is not null
  order by b.published_at desc, b.id;
$$;

-- ---------- The saved name from 0010 isn't used anymore ----------
alter table books drop column if exists author_name;

-- create or replace keeps the grants from 0010; repeated here so this file is complete on its own.
revoke execute on function publish_book(uuid, boolean) from public, anon;
revoke execute on function community_books()            from public, anon;
grant  execute on function publish_book(uuid, boolean) to authenticated;
grant  execute on function community_books()            to authenticated;
