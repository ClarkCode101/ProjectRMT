-- Step 17: the Community shelf.
--
-- Any logged-in account can share one of their books. Everyone logged in can browse shared books, peek at a few
-- questions, and "Add to library": that makes their OWN COPY of the book. The copy is theirs from then on, so if the
-- author edits or deletes the book later, the copy stays exactly as it was.
--
-- RLS stays the same ("you only see your own rows"). Opening it up would make other people's questions show up in
-- my_questions, and from there in Practice and the subject scores. Instead, four functions below do the sharing.
-- They run as the database owner (security definer), so each one checks by itself who is calling and only ever
-- shows SHARED books or copies INTO the caller's account.
--
-- Run this BEFORE using the app version that has the Community page. Safe to run more than once.

-- ---------- New columns on books ----------
alter table books
  -- when it was shared; null = not shared (private, like every book before this)
  add column if not exists published_at timestamptz,
  -- the author's first name when they shared it (first names live on the login account, which others can't read)
  add column if not exists author_name  text check (author_name is null or char_length(author_name) between 1 and 40),
  -- the shared book this one was copied from; becomes null if the author deletes theirs (the copy stays)
  add column if not exists copied_from  uuid references books(id) on delete set null;

create index if not exists books_published_idx   on books(published_at) where published_at is not null;
create index if not exists books_copied_from_idx on books(copied_from);

-- The app may only write a book's title, color and library itself. published_at, author_name and copied_from are
-- set only by the functions below, so nobody can pose as another author or fake an "added" count.
revoke insert, update on books from anon, authenticated;
grant  insert (title, color, library) on books to authenticated;
grant  update (title, color, library) on books to authenticated;

-- ---------- Share / stop sharing one of my books ----------
create or replace function publish_book(p_book_id uuid, p_publish boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not exists (select 1 from books where id = p_book_id and owner_id = auth.uid()) then
    raise exception 'Book not found.';
  end if;

  if p_publish then
    if not exists (select 1 from book_questions where book_id = p_book_id) then
      raise exception 'Add at least one question before sharing this book.';
    end if;
    select nullif(btrim(left(raw_user_meta_data ->> 'first_name', 40)), '') into v_name
    from auth.users where id = auth.uid();

    update books
    set published_at = coalesce(published_at, now()),   -- sharing again keeps the first date
        author_name  = coalesce(v_name, 'A classmate')   -- no first name set in Settings yet
    where id = p_book_id;
  else
    update books set published_at = null where id = p_book_id;
  end if;
end;
$$;

-- ---------- Every shared book, newest first (for the Community page) ----------
create or replace function community_books()
returns table (
  id             uuid,
  title          text,
  color          text,
  author_name    text,
  published_at   timestamptz,
  question_count int,
  subject_codes  text[],   -- board subjects its questions are from (empty = only book-only questions)
  times_added    int,      -- how many accounts have a copy
  is_mine        boolean,  -- I shared this one
  my_copy_id     uuid      -- my copy of it, if I already added it (null = not added)
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id, b.title, b.color, b.author_name, b.published_at,
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
  where b.published_at is not null
    and auth.uid() is not null
  order by b.published_at desc, b.id;
$$;

-- ---------- A few questions from a shared book, so she can see what's inside before adding ----------
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
    and auth.uid() is not null
  order by bq.added_at, q.id
  limit least(greatest(p_limit, 1), 10);
$$;

-- ---------- Add to library: make my own copy of a shared book ----------
-- Built-in questions are linked, not copied (they are never deleted). The author's own questions are copied into
-- new rows that belong to me. The copies are book-only (in_subject = false), so adding a book doesn't change my
-- subject scores; I can still tick "Also add to <subject>" on any of them in the editor.
-- Returns the id of my new book.
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
  v_used int;   -- how many places in the library are taken
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
  -- (Counted into a variable first: inside "if ... then", a CASE's own "then" would end the condition too early.)
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

  for r in
    select bq.question_id, bq.chapter, bq.added_at, q.owner_id as q_owner
    from book_questions bq
    join questions q on q.id = bq.question_id
    where bq.book_id = v_src.id
  loop
    if r.q_owner is null then
      v_qid := r.question_id;   -- built-in: link the same question
    else
      insert into questions (owner_id, topic_id, source, stem, choices, correct_index,
                             explanation, choice_notes, difficulty, status, in_subject)
      select v_uid, q.topic_id, q.source, q.stem, q.choices, q.correct_index,
             q.explanation, q.choice_notes, q.difficulty, q.status, false
      from questions q
      where q.id = r.question_id
      returning id into v_qid;
    end if;

    -- same chapter and same order as the author's book
    insert into book_questions (book_id, question_id, chapter, added_at)
    values (v_new, v_qid, r.chapter, r.added_at);
  end loop;

  return v_new;
end;
$$;

-- Only logged-in accounts can call these (Supabase lets everyone call new functions unless told otherwise).
revoke execute on function publish_book(uuid, boolean)              from public, anon;
revoke execute on function community_books()                         from public, anon;
revoke execute on function community_book_preview(uuid, int)         from public, anon;
revoke execute on function add_community_book(uuid, smallint)        from public, anon;
grant  execute on function publish_book(uuid, boolean)              to authenticated;
grant  execute on function community_books()                         to authenticated;
grant  execute on function community_book_preview(uuid, int)         to authenticated;
grant  execute on function add_community_book(uuid, smallint)        to authenticated;
