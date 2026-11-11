-- Board Review lifelines (PROJECT_PLAN.md §14, Step 2b).
--
-- Three lifelines, the same for everyone, each usable once per game, chosen BEFORE the first pick:
--   rule_out       two wrong choices disappear
--   second_chance  a wrong pick doesn't count yet: pick once more
--   shield         (snake Rescue only) a wrong answer doesn't slide you down
-- No lifeline involves another player: everyone at the board is racing each other.
--
-- 1. attempts.assisted: an answer helped by Rule out 2 or Second chance. Still saved (Mistake notebook, history),
--    but left out of the subject/topic scores (topic_performance) and of "weakest topic", so the scores stay honest.
-- 2. Team games: the database does all three lifelines, like the roll and the answer check, so nobody can cheat.
--    board_rooms.lifeline_state holds the current question's lifelines ({"q": question id, "rule_out": [..],
--    "second_chance": bool, "first_wrong": int|null, "shield": bool}); it only counts while "q" is the question on
--    screen, so a new question starts clean without touching the other functions.
--    board_room_players.lifelines_used: which ones each player has spent this game.
--
-- Run after 0031. Safe to run more than once.

-- ---------- 1. Assisted answers ----------
alter table attempts add column if not exists assisted boolean not null default false;

-- Same as 0009, without assisted answers.
create or replace view topic_performance
with (security_invoker = true) as
select a.user_id, t.subject_id, q.topic_id,
       count(*)                                      as attempts,
       avg(case when a.is_correct then 1 else 0 end) as accuracy
from attempts a
join my_questions q on q.id = a.question_id
join topics t       on t.id = q.topic_id
where q.in_subject and not a.assisted
group by a.user_id, t.subject_id, q.topic_id;

-- ---------- 2. Team game columns ----------
alter table board_rooms        add column if not exists lifeline_state jsonb;
alter table board_room_players add column if not exists lifelines_used text[] not null default '{}';

-- The current question's lifelines, or an empty set when they belong to an earlier question.
create or replace function board__lifelines(p_room board_rooms)
returns jsonb language sql stable set search_path = public as $$
  select case
    when p_room.question_id is not null and p_room.lifeline_state ->> 'q' = p_room.question_id::text then p_room.lifeline_state
    else jsonb_build_object('q', p_room.question_id, 'rule_out', '[]'::jsonb, 'second_chance', false, 'first_wrong', null, 'shield', false)
  end;
$$;

-- Same as 0023, but a snake's "weakest topic" leaves out assisted answers (like the scores).
create or replace function board__pick_question(p_room uuid, p_user uuid, p_kind text, p_square int)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_used uuid[];
  v_zone_topics int[];
  v_pick uuid;
  v_weak int;
begin
  select used_question_ids into v_used from board_rooms where id = p_room;
  select array_agg(t.id) into v_zone_topics
  from topics t join subjects s on s.id = t.subject_id where s.code = board__zone(p_square);

  if p_kind = 'snake' then
    select q.topic_id into v_weak
    from attempts a join questions q on q.id = a.question_id
    where a.user_id = p_user and q.in_subject and not a.assisted
    group by q.topic_id
    having count(*) >= 3
    order by avg(case when a.is_correct then 1.0 else 0.0 end), count(*) desc
    limit 1;
    if v_weak is not null then
      select q.id into v_pick from questions q
      where q.owner_id is null and q.in_subject and q.topic_id = v_weak and not (q.id = any(v_used))
        and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
      order by random() limit 1;
    end if;
    if v_pick is null then
      select m.question_id into v_pick from (
        select distinct on (a.question_id) a.question_id, a.is_correct
        from attempts a join questions q on q.id = a.question_id
        where a.user_id = p_user and q.owner_id is null and q.in_subject and not (a.question_id = any(v_used))
        order by a.question_id, a.created_at desc
      ) m where not m.is_correct order by random() limit 1;
    end if;
  elsif p_kind = 'ladder' then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and q.topic_id = any(v_zone_topics) and q.difficulty = 3
      and not (q.id = any(v_used)) and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;

  if v_pick is null then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and q.topic_id = any(v_zone_topics)
      and not (q.id = any(v_used)) and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;
  if v_pick is null then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and q.topic_id = any(v_zone_topics)
      and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;
  return v_pick;
end;
$$;

-- ---------- Use a lifeline on my question ----------
create or replace function board_use_lifeline(p_room uuid, p_lifeline text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_used text[];
  v_state jsonb;
  v_choices int;
  v_correct int;
  v_remove jsonb;
begin
  if p_lifeline not in ('rule_out', 'second_chance', 'shield') then raise exception 'Unknown lifeline.'; end if;
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.status <> 'playing' or v_room.turn_user is distinct from v_uid
     or v_room.phase <> 'answer' or v_room.question_id is null then
    raise exception 'It''s not your turn.';
  end if;
  if now() > v_room.deadline then raise exception 'Time''s up for this turn.'; end if;

  select lifelines_used into v_used from board_room_players where room_id = p_room and user_id = v_uid;
  if p_lifeline = any(v_used) then raise exception 'You already used that lifeline this game.'; end if;

  v_state := board__lifelines(v_room);
  if v_state ->> 'first_wrong' is not null then raise exception 'Lifelines go before your first pick.'; end if;
  if p_lifeline = 'shield' and v_room.pending ->> 'kind' <> 'snake' then
    raise exception 'Snake shield only works on a snake''s Rescue question.';
  end if;

  if p_lifeline = 'rule_out' then
    select jsonb_array_length(choices), correct_index into v_choices, v_correct from questions where id = v_room.question_id;
    if v_choices < 3 then raise exception 'This question has too few choices to rule any out.'; end if;
    -- two wrong choices at random (one when there are only 3), always leaving the right one and one wrong one
    select coalesce(jsonb_agg(i), '[]'::jsonb) into v_remove from (
      select i from generate_series(0, v_choices - 1) i
      where i <> v_correct
      order by random() limit least(2, v_choices - 2)
    ) w;
    v_state := jsonb_set(v_state, '{rule_out}', v_remove);
  elsif p_lifeline = 'second_chance' then
    v_state := jsonb_set(v_state, '{second_chance}', 'true'::jsonb);
  else
    v_state := jsonb_set(v_state, '{shield}', 'true'::jsonb);
  end if;

  update board_room_players set lifelines_used = array_append(lifelines_used, p_lifeline)
  where room_id = p_room and user_id = v_uid;
  update board_rooms set lifeline_state = v_state, version = version + 1 where id = p_room;
end;
$$;

-- ---------- Same as 0023, plus the lifelines ----------
-- A wrong pick with Second chance on: nothing is saved yet, the pick stays crossed out, and she picks again.
-- The final answer is saved as an assisted attempt when Rule out 2 or Second chance helped.
-- A wrong Rescue with Snake shield on: she stays where she is.
create or replace function board_answer(p_room uuid, p_selected int)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_player board_room_players;
  v_correct_index int;
  v_ok boolean;
  v_kind text;
  v_from int;
  v_to int;
  v_new int;
  v_jump board_layout_jumps;
  v_state jsonb;
  v_assisted boolean;
  v_shielded boolean := false;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.status <> 'playing' or v_room.turn_user is distinct from v_uid
     or v_room.phase <> 'answer' or v_room.question_id is null then
    raise exception 'It''s not your turn.';
  end if;
  if now() > v_room.deadline + interval '3 seconds' then raise exception 'Time''s up for this turn.'; end if;

  v_state := board__lifelines(v_room);
  if (v_state -> 'rule_out') @> to_jsonb(p_selected) or (v_state ->> 'first_wrong')::int = p_selected then
    raise exception 'That choice is crossed out. Pick another one.';
  end if;

  select * into v_player from board_room_players where room_id = p_room and user_id = v_uid;
  select correct_index into v_correct_index from questions where id = v_room.question_id;
  v_ok := p_selected = v_correct_index;
  v_kind := v_room.pending ->> 'kind';

  -- Second chance: the first wrong pick only gets crossed out.
  if not v_ok and (v_state ->> 'second_chance')::boolean and v_state ->> 'first_wrong' is null then
    update board_rooms set lifeline_state = jsonb_set(v_state, '{first_wrong}', to_jsonb(p_selected)), version = version + 1
    where id = p_room;
    return false;
  end if;

  v_assisted := jsonb_array_length(v_state -> 'rule_out') > 0 or (v_state ->> 'second_chance')::boolean;

  -- Saved as her attempt, so it counts in her Mistake notebook (and in her scores unless a lifeline helped).
  insert into attempts (user_id, session_id, question_id, selected_index, is_correct, assisted)
  values (v_uid, v_player.session_id, v_room.question_id, p_selected, v_ok, v_assisted);
  update board_room_players
  set answered = answered + 1, correct = correct + case when v_ok then 1 else 0 end, missed_turns = 0
  where room_id = p_room and user_id = v_uid;

  v_from := v_player.position;
  v_new := v_player.position;
  if v_kind = 'move' and v_ok then
    v_new := least(60, v_player.position + (v_room.pending ->> 'roll')::int);
  elsif v_kind = 'ladder' and v_ok then
    v_new := (v_room.pending ->> 'to')::int;
  elsif v_kind = 'snake' and not v_ok then
    if (v_state ->> 'shield')::boolean then
      v_shielded := true;
    else
      v_new := (v_room.pending ->> 'to')::int;
    end if;
  end if;
  update board_room_players set position = v_new where room_id = p_room and user_id = v_uid;

  update board_rooms
  set used_question_ids = array_append(used_question_ids, v_room.question_id),
      last_event = jsonb_build_object(
        'kind', 'answer', 'user', v_uid, 'name', board__name(v_uid), 'purpose', v_room.pending,
        'question_id', v_room.question_id, 'selected', p_selected, 'correct_index', v_correct_index,
        'is_correct', v_ok, 'from', v_from, 'to', v_new, 'at', now(),
        'rule_out', v_state -> 'rule_out', 'first_wrong', v_state -> 'first_wrong', 'shielded', v_shielded),
      version = version + 1
  where id = p_room;

  if v_new >= 60 then
    perform board__finish(p_room, v_uid);
    return v_ok;
  end if;

  if v_kind = 'move' and v_ok then
    select * into v_jump from board_layout_jumps where layout_id = v_room.layout_id and from_sq = v_new;
    if v_jump.from_sq is not null then
      update board_rooms
      set pending = jsonb_build_object('kind', v_jump.kind, 'from', v_jump.from_sq, 'to', v_jump.to_sq),
          question_id = board__pick_question(p_room, v_uid, v_jump.kind, v_new),
          deadline = now() + interval '100 seconds', version = version + 1
      where id = p_room;
      return v_ok;
    end if;
  end if;

  perform board__next_turn(p_room);
  return v_ok;
end;
$$;

-- ---------- Same as 0025, plus the lifelines (the question's, and what each player has spent) ----------
create or replace function board_room_state(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_question jsonb;
  v_last_question jsonb;
  v_rematch jsonb;
begin
  select * into v_room from board_rooms where id = p_room;
  if v_room.id is null or not board__is_member(p_room) then return null; end if;

  if v_room.question_id is not null then
    select jsonb_build_object('id', q.id, 'topic_id', q.topic_id, 'stem', q.stem, 'choices', q.choices) into v_question
    from questions q where q.id = v_room.question_id;
  end if;
  if v_room.last_event ->> 'kind' = 'answer' then
    select jsonb_build_object('id', q.id, 'topic_id', q.topic_id, 'stem', q.stem, 'choices', q.choices,
                              'correct_index', q.correct_index, 'explanation', q.explanation, 'choice_notes', q.choice_notes)
    into v_last_question
    from questions q where q.id = (v_room.last_event ->> 'question_id')::uuid;
  end if;
  if v_room.rematch_room_id is not null then
    select jsonb_build_object('id', r.id, 'host_id', r.host_id, 'host_name', board__name(r.host_id), 'status', r.status,
                              'players', coalesce((
                                select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', board__name(p.user_id)) order by p.joined_at)
                                from board_room_players p where p.room_id = r.id and p.status = 'joined'), '[]'::jsonb))
    into v_rematch
    from board_rooms r where r.id = v_room.rematch_room_id;
  end if;

  return jsonb_build_object(
    'id', v_room.id, 'host_id', v_room.host_id, 'invite_code', v_room.invite_code, 'layout_id', v_room.layout_id,
    'status', v_room.status, 'turn_user', v_room.turn_user, 'phase', v_room.phase, 'pending', v_room.pending,
    'deadline', v_room.deadline, 'last_event', v_room.last_event, 'winner_id', v_room.winner_id,
    'version', v_room.version, 'now', now(), 'me', auth.uid(),
    'question', v_question, 'last_question', v_last_question, 'rematch', v_rematch,
    'lifelines', board__lifelines(v_room),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'name', board__name(p.user_id), 'seat', p.seat, 'order_roll', p.order_roll,
               'position', p.position, 'status', p.status, 'answered', p.answered, 'correct', p.correct,
               'rematch_done', p.rematch_done, 'lifelines_used', to_jsonb(p.lifelines_used))
             order by p.seat nulls last, p.joined_at)
      from board_room_players p where p.room_id = p_room), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', i.to_id, 'name', board__name(i.to_id)))
      from board_invites i where i.room_id = p_room and board__invite_active(i.status, i.created_at)), '[]'::jsonb)
  );
end;
$$;

-- ---------- Who can call what ----------
revoke execute on function board__lifelines(board_rooms) from public, anon, authenticated;
revoke execute on function board__pick_question(uuid, uuid, text, int) from public, anon, authenticated;
revoke execute on function board_use_lifeline(uuid, text) from public, anon;
grant  execute on function board_use_lifeline(uuid, text) to authenticated;
revoke execute on function board_answer(uuid, int) from public, anon;
grant  execute on function board_answer(uuid, int) to authenticated;
revoke execute on function board_room_state(uuid) from public, anon;
grant  execute on function board_room_state(uuid) to authenticated;
