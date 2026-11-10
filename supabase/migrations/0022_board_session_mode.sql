-- Step 24: Board Review (PROJECT_PLAN.md §14).
--
-- Each board game is one quiz session with mode 'board', so its answers count toward her subject and topic scores
-- and the Mistake notebook like Practice, but can still be told apart from Practice later.
--
-- Run this BEFORE using the app version that has the Board Review page. Safe to run more than once.

alter type session_mode add value if not exists 'board';
