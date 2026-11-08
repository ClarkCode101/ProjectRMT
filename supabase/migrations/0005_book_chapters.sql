-- Step 12: chapters in her books, and a "General" topic in every subject.
--
-- 1. A chapter is a name she types herself ("Week 3 – Enzymes") to group the questions inside one of her books.
--    It belongs to the link between a book and a question, so the same question can sit in a different
--    chapter in each book. No chapter = null.
-- 2. Every question still needs a topic (stats, Practice, Smart pick and Mock exam all rely on it), so each
--    subject gets a "General" topic for questions that don't fit a specific one. The app hides it in lists
--    while it has no questions.
--
-- Safe to run on a live database: it only adds a column and new topic rows; nothing existing changes.

alter table book_questions
  add column chapter text check (chapter is null or char_length(btrim(chapter)) between 1 and 40);

insert into topics (subject_id, name)
select id, 'General' from subjects
on conflict (subject_id, name) do nothing;
