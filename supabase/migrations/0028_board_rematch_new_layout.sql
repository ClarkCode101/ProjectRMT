-- Board Review team games, two Play again fixes:
--
-- 1. Play again always gets a different board from the game that just ended (like the solo game's pickLayoutId).
--    A new game from Board Review still gets a random one of the three.
--    Same as board_rematch in 0025, plus one line: the next lobby's layout is one of the two OTHER layouts.
--
-- 2. Back to Board Review ("done") also takes back an invite to the next game that was already sent
--    (someone tapped Play again BEFORE she left), so no invite or red dot is left waiting for her.
--
-- Run after 0027. Safe to run more than once.

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
    elsif v_next.status = 'playing' then
      raise exception 'The next game has already started without you. Start a new one from Board Review.';
    end if;
    -- it was cancelled or is over: make a fresh one below
  end if;

  v_new := board_create_room();  -- checks she isn't in another game; makes her the host
  -- a different board from the one just played: one of the other two layouts (0, 1, 2), at random
  update board_rooms set layout_id = (v_old.layout_id + 1 + floor(random() * 2)::int) % 3 where id = v_new;
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

-- "I'm done" (0025), plus: decline her pending invite to this game's next lobby, whoever sent it and whenever.
create or replace function board_rematch_done(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_next uuid;
begin
  update board_room_players p set rematch_done = true
  from board_rooms r
  where p.room_id = p_room and p.user_id = auth.uid() and r.id = p.room_id and r.status = 'finished';
  if not found then return; end if;

  select rematch_room_id into v_next from board_rooms where id = p_room;
  if v_next is not null then
    update board_invites set status = 'declined'
    where room_id = v_next and to_id = auth.uid() and status = 'pending';
    if found then
      update board_rooms set version = version + 1 where id = v_next;  -- the next lobby stops showing her as invited
    end if;
  end if;
  update board_rooms set version = version + 1 where id = p_room;  -- the others' screens show "Done"
end;
$$;

revoke execute on function board_rematch_done(uuid) from public, anon;
grant  execute on function board_rematch_done(uuid) to authenticated;
