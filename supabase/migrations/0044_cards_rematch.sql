-- Last Card live, step 4 (PROJECT_PLAN.md §15): Play again for the group.
--
-- Same as board_rematch in 0028, for both games:
--   - the next lobby is for the SAME game as the one that just ended (board_create_room(p_game), migration 0042)
--   - a Board Review rematch still gets one of the two other boards; a Last Card one has no board to change
--   - a Last Card game in progress is 'live' (not 'playing'), so "already started without you" checks both
-- board_rematch_done (0028) works for both games as it is.
--
-- Run after 0043. Safe to run more than once.

create or replace function board_rematch(p_room uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old board_rooms;
  v_next board_rooms;
  v_new uuid;
begin
  if v_uid is null then raise exception 'Log in first.'; end if;
  select * into v_old from board_rooms where id = p_room for update;  -- one Play again at a time per game
  if v_old.id is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_old.status <> 'finished' then raise exception 'This game isn''t over yet.'; end if;

  update board_room_players set rematch_done = false where room_id = p_room and user_id = v_uid;  -- changed her mind

  -- Someone already made the next game
  if v_old.rematch_room_id is not null then
    select * into v_next from board_rooms where id = v_old.rematch_room_id;
    if v_next.status = 'lobby' then
      return board__join(v_next.id);
    elsif v_next.status in ('playing', 'live') then
      raise exception 'The next game has already started without you. Start a new one from Games.';
    end if;
    -- it was cancelled or is over: make a fresh one below
  end if;

  v_new := board_create_room(v_old.game);  -- same game; checks she isn't in another game; makes her the host
  if v_old.game = 'board' then
    -- a different board from the one just played: one of the other two layouts (0, 1, 2), at random
    update board_rooms set layout_id = (v_old.layout_id + 1 + floor(random() * 2)::int) % 3 where id = v_new;
  end if;
  update board_rooms set rematch_room_id = v_new, version = version + 1 where id = p_room;

  -- invite the others from this game who haven't said they're done (they may have left the finish screen)
  insert into board_invites (room_id, from_id, to_id)
  select v_new, v_uid, p.user_id from board_room_players p
  where p.room_id = p_room and p.user_id <> v_uid and not p.rematch_done
  on conflict (room_id, to_id) do nothing;

  return v_new;
end;
$$;

revoke execute on function board_rematch(uuid) from public, anon;
grant  execute on function board_rematch(uuid) to authenticated;
