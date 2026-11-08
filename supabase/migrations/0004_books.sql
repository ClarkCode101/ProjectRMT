-- Step 11: her own books on the Questions shelf.
-- A book is a named collection she makes ("Pre-board week 3") and fills with questions whenever she wants.
-- It works like a playlist: one question can be in several books, built-in questions can be added too,
-- and deleting a book only takes the questions out of it (they stay in their subject).
-- Every question still has its topic, so stats, Practice and Smart pick keep working the same.
--
-- Books stand in one of three libraries (rooms of shelves) that she can rename. Library 1 also holds the six
-- subject books. A library's name is only stored once she renames it; until then the app shows a default name.

create table books (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null check (char_length(btrim(title)) between 1 and 60),
  color      text not null default 'teal' check (color in ('teal', 'red', 'green', 'gold', 'purple', 'slate')),
  library    smallint not null default 1 check (library between 1 and 3),
  created_at timestamptz not null default now()
);

create table libraries (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slot     smallint not null check (slot between 1 and 3),
  name     text not null check (char_length(btrim(name)) between 1 and 40),
  primary key (owner_id, slot)
);

create table book_questions (
  book_id     uuid not null references books(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (book_id, question_id)
);

create index books_owner_idx           on books(owner_id);
create index book_questions_question_idx on book_questions(question_id);

-- ---------- RLS: she only sees and changes her own books ----------
alter table books          enable row level security;
alter table book_questions enable row level security;
alter table libraries      enable row level security;

create policy own_books on books for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy own_libraries on libraries for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- A link is hers when its book is hers. When adding, the question must also be one she can see
-- (built-in or her own), so nobody can file someone else's question into a book.
create policy own_book_questions on book_questions for all to authenticated
  using (exists (select 1 from books b where b.id = book_id and b.owner_id = (select auth.uid())))
  with check (
    exists (select 1 from books b where b.id = book_id and b.owner_id = (select auth.uid()))
    and exists (select 1 from questions q where q.id = question_id and (q.owner_id is null or q.owner_id = (select auth.uid())))
  );
