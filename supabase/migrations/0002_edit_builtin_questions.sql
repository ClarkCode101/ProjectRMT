-- Step 9: let her verify and fix built-in questions.
-- Built-in questions are AI-generated and can have mistakes, so she needs to be able to
-- mark them verified and correct a wrong answer or explanation.
--
-- Before this, q_write only allowed changes to her own rows (owner_id = her id), so
-- built-in rows (owner_id is null) were read-only.
--
-- Safe because the app is private: there is one account and "Allow new users to sign up"
-- is off (README). If more accounts are ever added, replace this with per-user
-- verification instead.
--
-- Update only: built-in questions still can't be deleted from the app, and the check
-- keeps them built-in (an update can't turn one into her own question or vice versa).

create policy q_update_builtin on questions for update to authenticated
  using (owner_id is null)
  with check (owner_id is null);
