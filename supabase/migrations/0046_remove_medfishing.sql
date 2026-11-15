-- Removing MedFishing (2026-11-16). The fishing game was tried on 2026-11-15/16 and taken out: it had drifted away
-- from what the app is for (reviewing for the MTLE). Its code was never committed; a backup of the code and of the
-- data below is kept outside the project (medfishing-backup-2026-11-16.zip).
--
-- On the live database two migrations had been run for it (never committed): one added 'fishing' to session_mode,
-- one made the fishing_progress table. This undoes both and deletes the answers given while fishing (the owner
-- chose to remove everything, so they no longer count in the scores).
--
-- Safe to run more than once, and harmless on a database that never had MedFishing.

-- 1. The answers and sessions from fishing trips (attempts go with their session: on delete cascade).
do $$
begin
  if exists (select 1 from pg_enum where enumtypid = 'session_mode'::regtype and enumlabel = 'fishing') then
    delete from quiz_sessions where mode::text = 'fishing';
  end if;
end $$;

-- 2. Her saved fishing progress.
drop table if exists fishing_progress;

-- 3. Take 'fishing' out of session_mode. Postgres can't remove a value from an enum, so the type is made again
--    without it (only quiz_sessions.mode uses it: no functions, views, policies or defaults depend on it).
do $$
begin
  if exists (select 1 from pg_enum where enumtypid = 'session_mode'::regtype and enumlabel = 'fishing') then
    alter type session_mode rename to session_mode_old;
    create type session_mode as enum ('practice', 'mock', 'flashcard', 'board', 'cards');
    alter table quiz_sessions alter column mode type session_mode using mode::text::session_mode;
    drop type session_mode_old;
  end if;
end $$;
