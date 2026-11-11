-- DEV TESTING: let the "DEV · Finish game" button work for ANY account on localhost, with a dev key.
--
-- The database can't tell localhost from the real app, so the button sends a secret key that only lives in the
-- owner's .env.local (VITE_DEV_KEY; git-ignored, and the button's code isn't in the deployed build).
-- The function works when the key matches one in board_dev_keys, or (as before) for accounts in board_dev_testers.
-- board_dev_keys can't be read or changed from the app (RLS on, no policies). Add the key in the SQL Editor:
--
--   insert into board_dev_keys (key) values ('<the same value as VITE_DEV_KEY>') on conflict do nothing;
--
-- To turn it off: delete from board_dev_keys;
--
-- Run after 0026. Safe to run more than once.

create table if not exists board_dev_keys (
  key text primary key check (length(key) >= 24)
);
alter table board_dev_keys enable row level security;
revoke all on board_dev_keys from anon, authenticated;

-- The old one took only the room; the new one also takes the key.
drop function if exists board_dev_finish(uuid);

create or replace function board_dev_finish(p_room uuid, p_key text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_winner uuid;
begin
  if not (
    exists (select 1 from board_dev_testers where user_id = auth.uid())
    or (p_key is not null and exists (select 1 from board_dev_keys where key = p_key))
  ) then
    raise exception 'Dev key missing or wrong. Check VITE_DEV_KEY in .env.local and board_dev_keys.';
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

revoke execute on function board_dev_finish(uuid, text) from public, anon;
grant  execute on function board_dev_finish(uuid, text) to authenticated;
