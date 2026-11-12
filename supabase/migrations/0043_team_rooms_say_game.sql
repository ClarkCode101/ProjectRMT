-- Step 32: invites and "my room" say which game they're for (PROJECT_PLAN.md §15 step 2, after 0042).
--
-- Board Review and Last Card share the rooms, invites, the code/link and the lobby. The app needs to know which game
-- an invite or her current room is for, to label it ("Ana invited you to Last Card") and to open the right screen.
-- (Inside a room she's a player in, the app reads board_rooms.game itself: the member-only policy already allows it.)
--
-- Same as 0023, with `game` added to what they return (a new column means dropping them first).
-- Run this BEFORE deploying the app version with the Last Card lobby. Safe to run more than once.

drop function if exists board_my_invites();
create function board_my_invites()
returns table (invite_id uuid, room_id uuid, from_name text, players int, created_at timestamptz, game text)
language sql stable security definer set search_path = public as $$
  select i.id, i.room_id, board__name(i.from_id),
         (select count(*)::int from board_room_players p where p.room_id = i.room_id and p.status = 'joined'),
         i.created_at, r.game
  from board_invites i join board_rooms r on r.id = i.room_id
  where i.to_id = auth.uid() and board__invite_active(i.status, i.created_at) and r.status = 'lobby'
  order by i.created_at desc;
$$;
revoke execute on function board_my_invites() from public, anon;
grant  execute on function board_my_invites() to authenticated;

drop function if exists board_my_room();
create function board_my_room()
returns table (room_id uuid, status text, my_turn boolean, players int, game text)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, coalesce(r.turn_user = auth.uid(), false),
         (select count(*)::int from board_room_players p where p.room_id = r.id and p.status = 'joined'),
         r.game
  from board_rooms r
  where r.id = board__active_room_of(auth.uid());
$$;
revoke execute on function board_my_room() from public, anon;
grant  execute on function board_my_room() to authenticated;
