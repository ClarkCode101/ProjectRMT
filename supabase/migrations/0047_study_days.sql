-- Study days (2026-11-19): on the Plan page's "This week" she picks how much to study each day: a full day,
-- a light day (one small task) or a rest day (no plan; her streak stays safe, at most one a week).
-- Kept on her account, beside her exam date and daily goal, so every device plans the same week.
--
-- study_days (jsonb):
--   { "weekly": ["full","full","full","full","full","light","rest"],   -- by weekday, Sunday first (JS getDay)
--     "dates":  { "2026-11-25": "light" } }                            -- one-off days, win over "weekly"
-- '{}' = every day a full day. The app checks the shape when it reads it, so a bad value is just ignored.
--
-- The table's row-level security (own_settings: only her own row) already covers the new column.
-- Safe to run more than once.

alter table study_settings
  add column if not exists study_days jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'study_settings_study_days_is_object') then
    alter table study_settings
      add constraint study_settings_study_days_is_object check (jsonb_typeof(study_days) = 'object');
  end if;
end $$;
