-- Step 10: uploaded files are read in the browser and NOT stored.
-- Only the questions found in them are saved, so an upload record has no storage path.
-- (Decision: keep copyrighted reviewers out of the cloud and skip Storage setup.
--  If files ever need keeping, add a private bucket and fill this in again.)

alter table uploads alter column storage_path drop not null;
