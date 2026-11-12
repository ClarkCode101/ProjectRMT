-- Step 29: Last Card, the card game (PROJECT_PLAN.md §15).
--
-- Each card game is one quiz session with mode 'cards', so its answers count toward her subject and topic scores
-- and the Mistake notebook like Practice, but can still be told apart from Practice and Board Review later.
--
-- Run this BEFORE using the app version that has the Last Card page. Safe to run more than once.

alter type session_mode add value if not exists 'cards';
