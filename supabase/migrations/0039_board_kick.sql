-- Board Review team games: the host can remove a player from the lobby (e.g. one who logged off and won't be back,
-- or someone who joined with the code by mistake). Lobby only: once the game starts, the turn timer handles players
-- who are away. The removed player can come back with an invite or the code (a small private group: no ban list).
--
-- Their screen reads the room every few seconds; it now gets "not a player" and says the host removed them.
--
-- Run after 0038. Safe to run more than once.

create or replace function board_kick(p_room uuid, p_user uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.host_id is distinct from v_uid then
    raise exception 'Only the host can remove players.';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'Players can only be removed before the game starts.';
  end if;
  if p_user = v_uid then
    raise exception 'To leave, tap Leave lobby.';
  end if;

  delete from board_room_players where room_id = p_room and user_id = p_user;
  if found then
    update board_rooms set version = version + 1 where id = p_room;
  end if;
end;
$$;

revoke execute on function board_kick(uuid, uuid) from public, anon;
grant  execute on function board_kick(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
