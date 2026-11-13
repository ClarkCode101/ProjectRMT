-- DEV TESTING: more shortcuts for Board Review team games, for the red DEV panel that only shows on `npm run dev`
-- (like Last Card's). Same lock as board_dev_finish (0027): the dev key (VITE_DEV_KEY, matching board_dev_keys) or an
-- account in board_dev_testers; everyone else is refused. Only the caller's own game, only while it's being played.
--
--   my_turn      it's my turn now, waiting for my roll (fresh clock)
--   ladder       I'm on a ladder's foot and its question is up (answer right to climb)
--   snake        I'm on a snake's head and its question is up (answer wrong to slide)
--   near_end     I'm on square 54 and it's my turn to roll
--   time_up      the clock of the turn now runs out (the screens then pass the turn, as usual)
--   lifelines    I get all three lifelines back
--   finish_me    I reach square 60 and win
--
-- Run after 0044. Safe to run more than once.

create or replace function board_dev_action(p_room uuid, p_key text, p_op text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_pos int;
  v_jump board_layout_jumps;
begin
  if not (
    exists (select 1 from board_dev_testers where user_id = v_uid)
    or (p_key is not null and exists (select 1 from board_dev_keys where key = p_key))
  ) then
    raise exception 'Dev key missing or wrong. Check VITE_DEV_KEY in .env.local and board_dev_keys.';
  end if;
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_room.game <> 'board' or v_room.status <> 'playing' then raise exception 'This game isn''t being played.'; end if;
  if not exists (select 1 from board_room_players where room_id = p_room and user_id = v_uid and status = 'joined') then
    raise exception 'You''re not playing in this game.';
  end if;

  if p_op = 'my_turn' or p_op = 'near_end' then
    if p_op = 'near_end' then
      update board_room_players set position = 54 where room_id = p_room and user_id = v_uid;
    end if;
    update board_rooms
    set turn_user = v_uid, phase = 'roll', pending = null, question_id = null,
        deadline = now() + interval '100 seconds', version = version + 1
    where id = p_room;

  elsif p_op = 'ladder' or p_op = 'snake' then
    select position into v_pos from board_room_players where room_id = p_room and user_id = v_uid;
    -- the first one ahead of me, or else the first on the board
    select * into v_jump from board_layout_jumps
    where layout_id = v_room.layout_id and kind = p_op
    order by (from_sq <= v_pos), from_sq limit 1;
    if v_jump.from_sq is null then raise exception 'This board has no %.', p_op; end if;
    update board_room_players set position = v_jump.from_sq where room_id = p_room and user_id = v_uid;
    update board_rooms
    set turn_user = v_uid, phase = 'answer',
        pending = jsonb_build_object('kind', v_jump.kind, 'from', v_jump.from_sq, 'to', v_jump.to_sq),
        question_id = board__pick_question(p_room, v_uid, v_jump.kind, v_jump.from_sq),
        deadline = now() + interval '100 seconds', version = version + 1
    where id = p_room;

  elsif p_op = 'time_up' then
    update board_rooms set deadline = now() - interval '5 seconds', version = version + 1 where id = p_room;

  elsif p_op = 'lifelines' then
    update board_room_players set lifelines_used = '{}' where room_id = p_room and user_id = v_uid;
    update board_rooms set version = version + 1 where id = p_room;

  elsif p_op = 'finish_me' then
    update board_room_players set position = 60 where room_id = p_room and user_id = v_uid;
    perform board__finish(p_room, v_uid);

  else
    raise exception 'Unknown DEV action.';
  end if;
end;
$$;

revoke execute on function board_dev_action(uuid, text, text) from public, anon;
grant  execute on function board_dev_action(uuid, text, text) to authenticated;
