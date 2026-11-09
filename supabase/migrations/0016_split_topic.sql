-- Step 23: turn a topic in one of her books back into its own book (the opposite of merging, 0012).
--
-- Only in HER books (ones she made, and ones she added from Community), never the subject books, and only her own
-- questions move (built-in ones can't be in a new book, 0014).
--
-- The author comes back: every question copied from Community now remembers who wrote it (questions.copied_author)
-- and which shared book it came from (questions.copied_from_book). When a topic becomes a book again and EVERY
-- question in it came from the same classmate and none was edited, the new book shows "by <name>" again (and is
-- linked to the original, so Community says "Already in your library").
--
-- Editing a question's content takes its author away (it's now partly hers). Changing only its topic, its subject,
-- or "Needs a look" doesn't.
--
-- 1. questions.copied_author / copied_from_book, filled in for copies she already has.
-- 2. A rule (trigger) that the app can't set them itself, and that an edit clears them.
-- 3. add_community_book: same as 0015, and saves both on every copied question.
-- 4. refresh_book_origin: works out who a book is "by" from what's in it (mixed = nobody).
-- 5. merge_books: the target's questions without a topic now get the target's name as their topic, so both sides
--    of a merge keep a topic and can be split again.
-- 6. split_topic: makes the new book from the topic, in one step. If one topic is left in the old book, the old
--    book takes its name (so splitting undoes a merge, whichever side she moves out).
--
-- Run after 0015. Safe to run more than once.

-- ---------- 1. Every copied question remembers where it came from ----------
alter table questions
  add column if not exists copied_author    uuid references auth.users(id) on delete set null,
  add column if not exists copied_from_book uuid references books(id)      on delete set null;

-- Copies still in the book they were added as.
update questions q
set copied_author = b.copied_author,
    copied_from_book = b.copied_from
from book_questions bq
join books b on b.id = bq.book_id
where bq.question_id = q.id
  and b.copied_author is not null
  and q.owner_id = b.owner_id
  and q.copied_author is null;

-- Copies already merged into another book (their copied book is gone): find the classmate's question they were
-- copied from. Only an exact match counts (same question, choices, answer, explanation and notes = not edited),
-- written by someone else before hers, in a book that's still shared.
update questions q
set copied_author = src.owner_id,
    copied_from_book = src.book_id
from (
  select distinct on (mine.id) mine.id as mine_id, o.owner_id, sb.id as book_id
  from questions mine
  join questions o        on o.stem_hash = mine.stem_hash
                         and o.owner_id is not null
                         and o.owner_id <> mine.owner_id
                         and o.created_at < mine.created_at
                         and o.choices = mine.choices
                         and o.correct_index = mine.correct_index
                         and o.explanation is not distinct from mine.explanation
                         and o.choice_notes is not distinct from mine.choice_notes
  join book_questions obq on obq.question_id = o.id
  join books sb           on sb.id = obq.book_id and sb.published_at is not null
  where mine.owner_id is not null
    and mine.copied_author is null
  order by mine.id, o.created_at
) src
where q.id = src.mine_id;

-- ---------- 2. Only the database sets them; an edit clears them ----------
create or replace function keep_copied_author()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- The app can't claim a question came from someone (only add_community_book, which runs as the owner, can).
    if current_user in ('authenticated', 'anon') then
      new.copied_author := null;
      new.copied_from_book := null;
    end if;
    return new;
  end if;

  -- An update: her edit of the content means it's no longer the author's question as written.
  if (new.stem, new.choices, new.correct_index, new.explanation, new.choice_notes, new.difficulty)
     is distinct from
     (old.stem, old.choices, old.correct_index, old.explanation, old.choice_notes, old.difficulty) then
    new.copied_author := null;
    new.copied_from_book := null;
  elsif current_user in ('authenticated', 'anon') then
    -- Anything else (topic, subject, status): keep them as they were; the app can't change them.
    new.copied_author := old.copied_author;
    new.copied_from_book := old.copied_from_book;
  end if;
  return new;
end;
$$;

drop trigger if exists questions_keep_copied_author on questions;
create trigger questions_keep_copied_author
  before insert or update on questions
  for each row execute function keep_copied_author();

-- ---------- 3. Add to library: every copied question remembers its author ----------
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

  for r in
    select bq.question_id, bq.chapter, bq.added_at
    from book_questions bq
    join questions q on q.id = bq.question_id
    where bq.book_id = v_src.id
      and q.owner_id is not null
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

-- ---------- 4. Who a book is "by", worked out from what's in it ----------
-- A book shows "by <classmate>" only while EVERY one of her questions in it is an unedited copy from that one
-- classmate. Its link to the Community original (copied_from, for "Already in your library") stays while any of
-- its questions still came from that original; otherwise it links to the original they all share, if any.
-- Used by merge_books and split_topic (both run as the owner), never called by the app directly.
create or replace function refresh_book_origin(p_book_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count   int;
  v_authors int;
  v_unknown int;
  v_origins int;
  v_no_book int;
  v_author  uuid;
  v_origin  uuid;
begin
  select count(*),
         count(distinct q.copied_author), count(*) filter (where q.copied_author is null),
         count(distinct q.copied_from_book), count(*) filter (where q.copied_from_book is null),
         min(q.copied_author::text)::uuid, min(q.copied_from_book::text)::uuid
    into v_count, v_authors, v_unknown, v_origins, v_no_book, v_author, v_origin
  from books b
  join book_questions bq on bq.book_id = b.id
  join questions q       on q.id = bq.question_id and q.owner_id = b.owner_id
  where b.id = p_book_id;

  update books b
  set copied_author = case when v_count > 0 and v_authors = 1 and v_unknown = 0 then v_author end,
      copied_from = case
        when exists (select 1 from book_questions bq join questions q on q.id = bq.question_id
                     where bq.book_id = b.id and q.copied_from_book = b.copied_from) then b.copied_from
        when v_count > 0 and v_origins = 1 and v_no_book = 0 then v_origin
      end
  where b.id = p_book_id;
end;
$$;

-- ---------- 5. Merge (replaces 0014's): both sides keep a topic ----------
-- The merged book's questions go under its name (or the topic she typed). The target's own questions that had
-- no topic now go under the TARGET's name, so the two can be told apart and split again later.
-- Runs as the owner (to update "by"), so it checks that both books are hers itself.
create or replace function merge_books(p_source uuid, p_target uuid, p_chapter text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_chapter text := nullif(btrim(regexp_replace(coalesce(p_chapter, ''), '\s+', ' ', 'g')), '');
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

  -- The target's questions without a topic go under the target's name (cut to fit a topic, like lib/books.ts).
  if exists (select 1 from book_questions bq join questions q on q.id = bq.question_id
             where bq.book_id = p_source and q.owner_id = v_uid) then
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
    and q.owner_id = v_uid   -- built-in ones stay in their subjects
  on conflict (book_id, question_id) do nothing;
  get diagnostics v_added = row_count;

  delete from books where id = p_source;
  perform refresh_book_origin(p_target);   -- mixed now? then no "by"
  return v_added;
end;
$$;

-- ---------- 6. A topic becomes its own book ----------
-- Her questions under the topic leave the book and go into a new book named after the topic. If only ONE topic is
-- left in the old book (and nothing without a topic), the old book takes that topic's name and the topic is dropped:
-- splitting undoes a merge, whichever side she moves out. Both books then show "by" whoever their questions are from.
create or replace function split_topic(p_book_id uuid, p_chapter text, p_library smallint)
returns uuid
language plpgsql
security definer   -- needed to set "by" / copied_from on the books; checks her ownership itself
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_book   books;
  v_ids    uuid[];
  v_left   int;
  v_topics int;
  v_unnamed int;
  v_name   text;
  v_used   int;
  v_new    uuid;
begin
  select * into v_book from books where id = p_book_id and owner_id = v_uid;
  if not found then
    raise exception 'Book not found.';
  end if;
  if p_chapter is null or btrim(p_chapter) = '' then
    raise exception 'Pick a topic first.';
  end if;
  if p_library is null or p_library not between 1 and 3 then
    raise exception 'Pick one of your libraries.';
  end if;

  -- Her own questions under this topic (built-in ones, if any are left there, stay put).
  select array_agg(q.id) into v_ids
  from book_questions bq
  join questions q on q.id = bq.question_id
  where bq.book_id = p_book_id
    and bq.chapter = p_chapter
    and q.owner_id = v_uid;
  if v_ids is null then
    raise exception 'This topic has no questions of yours to move.';
  end if;
  if not exists (select 1 from book_questions where book_id = p_book_id and not (question_id = any (v_ids))) then
    raise exception 'This topic is already the whole book.';
  end if;

  -- Room in the library (12 books; Library 1 also holds the six subject books). Keep in step with lib/books.ts.
  select count(*) into v_used from books where owner_id = v_uid and library = p_library;
  if p_library = 1 then
    v_used := v_used + (select count(*) from subjects where code <> 'BOOK');
  end if;
  if v_used >= 12 then
    raise exception 'That library is full. Pick another one or make room first.';
  end if;

  -- The new book, named after the topic
  insert into books (owner_id, title, color, library)
  values (v_uid, left(btrim(p_chapter), 60), v_book.color, p_library)
  returning id into v_new;

  insert into book_questions (book_id, question_id)
  select v_new, unnest(v_ids);

  delete from book_questions
  where book_id = p_book_id
    and question_id = any (v_ids);

  -- What's left: one topic only (and nothing without one)? Then the old book is that topic now.
  select count(*), count(distinct chapter), count(*) filter (where chapter is null), min(chapter)
    into v_left, v_topics, v_unnamed, v_name
  from book_questions where book_id = p_book_id;
  if v_left > 0 and v_topics = 1 and v_unnamed = 0 then
    update books set title = left(v_name, 60) where id = p_book_id;
    update book_questions set chapter = null where book_id = p_book_id;
  end if;

  perform refresh_book_origin(v_new);
  perform refresh_book_origin(p_book_id);
  -- coming back from Community: the original's color
  update books n set color = o.color from books o where n.id = v_new and o.id = n.copied_from;

  return v_new;
end;
$$;

revoke execute on function refresh_book_origin(uuid)            from public, anon, authenticated;  -- inside use only
revoke execute on function add_community_book(uuid, smallint)  from public, anon;
revoke execute on function merge_books(uuid, uuid, text)       from public, anon;
revoke execute on function split_topic(uuid, text, smallint)   from public, anon;
grant  execute on function add_community_book(uuid, smallint)  to authenticated;
grant  execute on function merge_books(uuid, uuid, text)       to authenticated;
grant  execute on function split_topic(uuid, text, smallint)   to authenticated;
