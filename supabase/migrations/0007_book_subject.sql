-- Step 14: a hidden home for questions written in her own books.
--
-- Every question needs a topic, but a question she writes inside one of her books isn't about a board subject
-- (it lives only in that book, in_subject = false, migration 0006). So instead of making her pick a subject she
-- doesn't need, those questions get this hidden "Your books" subject's "General" topic.
-- The app never shows this subject as a subject (not in Practice, Mock exam, Flashcards, the shelf or the stats):
-- it only uses it to label such questions "BOOK" while she answers them.
--
-- weight 0: it isn't part of the board exam. Safe to run more than once.

insert into subjects (code, name, weight, sort_order)
values ('BOOK', 'Your books', 0, 99)
on conflict (code) do nothing;

insert into topics (subject_id, name)
select id, 'General' from subjects where code = 'BOOK'
on conflict (subject_id, name) do nothing;
