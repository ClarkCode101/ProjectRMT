-- DEV TESTING: end a team game at once, from a button that only shows on `npm run dev`.
--
-- Only accounts listed in board_dev_testers can use it; for everyone else the function refuses. The list can't be
-- read or changed from the app (RLS on, no policies): add test accounts in the Supabase SQL Editor, e.g.
--
--   insert into board_dev_testers (user_id)
--   select id from auth.users where email in ('test-account-1@example.com', 'test-account-2@example.com')
--   on conflict do nothing;
--
-- Run after 0025. Safe to run more than once.

create table if not exists board_dev_testers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table board_dev_testers enable row level security;
revoke all on board_dev_testers from anon, authenticated;

-- Ends the game now: the player furthest ahead goes to square 60 and wins. Testers only, and only their own game.
create or replace function board_dev_finish(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_winner uuid;
begin
  if not exists (select 1 from board_dev_testers where user_id = auth.uid()) then
    raise exception 'Only for test accounts.';
  end if;
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_room.status <> 'playing' then raise exception 'This game isn''t being played.'; end if;

  select user_id into v_winner from board_room_players
  where room_id = p_room and status = 'joined'
  order by position desc, seat limit 1;

  update board_room_players set position = 60 where room_id = p_room and user_id = v_winner;
  perform board__finish(p_room, v_winner);
end;
$$;

revoke execute on function board_dev_finish(uuid) from public, anon;
grant  execute on function board_dev_finish(uuid) to authenticated;
