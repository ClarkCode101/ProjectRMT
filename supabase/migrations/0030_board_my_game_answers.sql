-- Board Review team games: "Your answers" on the finish screen (PROJECT_PLAN.md §14, Step 2).
--
-- How the caller did in one team game, per subject: answered and correct. Read from the caller's own quiz session
-- for that game (board_room_players.session_id, made in board_start), so it's only ever her own answers.
-- The finish screen shows it as bars per subject, plus "Review next" for the subjects under 60%.
--
-- Run after 0029. Safe to run more than once.

create or replace function board_my_game_answers(p_room uuid)
returns table (subject_code text, answered int, correct int)
language sql stable security definer set search_path = public as $$
  select s.code, count(*)::int, count(*) filter (where a.is_correct)::int
  from board_room_players p
  join attempts a  on a.session_id = p.session_id and a.user_id = p.user_id
  join questions q on q.id = a.question_id
  join topics t    on t.id = q.topic_id
  join subjects s  on s.id = t.subject_id
  where p.room_id = p_room and p.user_id = auth.uid() and p.session_id is not null
  group by s.code;
$$;

revoke execute on function board_my_game_answers(uuid) from public, anon;
grant  execute on function board_my_game_answers(uuid) to authenticated;
