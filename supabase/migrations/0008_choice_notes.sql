-- Step 15: a short note for every choice ("why this one is right / why that one is wrong").
--
-- choice_notes is a list in the same order as choices: choice_notes[i] explains choices[i].
-- An empty string means "no note for this choice". null = the question has no notes at all,
-- and the answer screen looks the way it did before.
--
-- Optional on purpose: her own uploaded questions don't have notes, and old built-in ones
-- get them subject by subject (re-run the seed SQL to fill them in).
--
-- Safe to run more than once.

alter table questions add column if not exists choice_notes jsonb;

alter table questions drop constraint if exists questions_choice_notes_is_list;
alter table questions add constraint questions_choice_notes_is_list
  check (choice_notes is null or jsonb_typeof(choice_notes) = 'array');
