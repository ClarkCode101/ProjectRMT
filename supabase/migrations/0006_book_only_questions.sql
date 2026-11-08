-- Step 13: questions that live only in her own book.
--
-- A question she writes inside one of her books stays in that book by default: it doesn't show in its subject's
-- book on the shelf, isn't counted in the subject's score, and doesn't come up in Practice / Mock exam /
-- Flashcards for that subject. She can tick "Also add to <subject>" to include it (in_subject = true).
-- It still has a topic (usually that subject's "General"), since every question needs one.
--
-- Every question that already exists keeps in_subject = true, so nothing she has now changes.
--
-- Run this BEFORE using the app version that reads in_subject (Practice and Questions need the column).

alter table questions
  add column in_subject boolean not null default true;

-- Subject scores (Home, Practice, the stars on the shelf) only count questions that are in their subject.
create or replace view topic_performance
with (security_invoker = true) as
select a.user_id, t.subject_id, q.topic_id,
       count(*)                                      as attempts,
       avg(case when a.is_correct then 1 else 0 end) as accuracy
from attempts a
join questions q on q.id = a.question_id
join topics t    on t.id = q.topic_id
where q.in_subject
group by a.user_id, t.subject_id, q.topic_id;
