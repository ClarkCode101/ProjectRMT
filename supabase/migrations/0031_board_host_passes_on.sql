-- Board Review team games: when the host leaves a lobby that still has other players, the host passes to the
-- player who joined next (the earliest), instead of cancelling the lobby for everyone.
-- Matters most after Play again, where the host is simply whoever tapped first (PROJECT_PLAN.md §14, Step 2).
-- A host alone in the lobby still cancels it (nobody to pass it to).
--
-- Same as board_leave in 0023; only the lobby branch for the host changed.
--
-- Run after 0030. Safe to run more than once.

create or replace function board_leave(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_left int;
  v_next_host uuid;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) then return; end if;

  if v_room.status = 'lobby' then
    if v_room.host_id = v_uid then
      select user_id into v_next_host from board_room_players
      where room_id = p_room and user_id <> v_uid and status = 'joined'
      order by joined_at
      limit 1;
      if v_next_host is null then
        -- alone: nobody to pass it to, so the lobby closes
        update board_rooms set status = 'cancelled', version = version + 1 where id = p_room;
        update board_invites set status = 'declined' where room_id = p_room and status = 'pending';
      else
        delete from board_room_players where room_id = p_room and user_id = v_uid;
        update board_rooms set host_id = v_next_host, version = version + 1 where id = p_room;
      end if;
    else
      delete from board_room_players where room_id = p_room and user_id = v_uid;
      update board_rooms set version = version + 1 where id = p_room;
    end if;
    return;
  end if;

  if v_room.status = 'playing' then
    update board_room_players set status = 'left' where room_id = p_room and user_id = v_uid and status = 'joined';
    update board_rooms set last_event = jsonb_build_object('kind', 'left', 'user', v_uid, 'name', board__name(v_uid), 'at', now()),
                           version = version + 1
    where id = p_room;
    select count(*) into v_left from board_room_players where room_id = p_room and status = 'joined';
    if v_left = 0 then
      perform board__finish(p_room, null);
    elsif v_room.turn_user = v_uid then
      perform board__next_turn(p_room);
    end if;
  end if;
end;
$$;

revoke execute on function board_leave(uuid) from public, anon;
grant  execute on function board_leave(uuid) to authenticated;
