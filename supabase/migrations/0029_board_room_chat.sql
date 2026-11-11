-- Step 27: Board Review room chat that clears after 5 hours (PROJECT_PLAN.md §14, Step 3).
--
-- One chat per team-game room (lobby, game and finish screen). Text only, at most 200 characters,
-- at most 5 messages per 10 seconds per person. Only the room's players can read or send.
-- Messages show only while under 5 hours old, and an hourly pg_cron job deletes the older ones.
-- A finished game's chat stays (the finish screen is where "Good game!" happens); a cancelled lobby's is deleted at once.
-- The sender can delete their own message.
--
-- Like the other board tables, the app never writes this table itself: sending and deleting go through the
-- functions below (security definer), which check who is calling.
--
-- Run after 0028. Safe to run more than once.

create table if not exists board_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references board_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists board_messages_room_idx on board_messages(room_id, created_at);

-- ---------- Who can read (Realtime uses this too, so only the room's players get its messages live) ----------
alter table board_messages enable row level security;
drop policy if exists board_messages_read on board_messages;
create policy board_messages_read on board_messages for select to authenticated
  using (board__is_member(room_id) and created_at > now() - interval '5 hours');
revoke insert, update, delete on board_messages from anon, authenticated;

-- ---------- What the app can call ----------

-- The room's messages under 5 hours old, oldest first (the latest 100).
create or replace function board_room_messages(p_room uuid)
returns table (id uuid, user_id uuid, name text, body text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, m.name, m.body, m.created_at from (
    select m.id, m.user_id, board__name(m.user_id) as name, m.body, m.created_at
    from board_messages m
    where m.room_id = p_room and board__is_member(p_room) and m.created_at > now() - interval '5 hours'
    order by m.created_at desc
    limit 100
  ) m
  order by m.created_at;
$$;

-- Send a message to my room. Spaces are tidied; 1–200 characters; 5 per 10 seconds.
create or replace function board_send_message(p_room uuid, p_body text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  if v_uid is null then raise exception 'Log in first.'; end if;
  select status into v_status from board_rooms where id = p_room;
  if v_status is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_status = 'cancelled' then raise exception 'This game was cancelled.'; end if;
  if v_body = '' then raise exception 'Type a message first.'; end if;
  if char_length(v_body) > 200 then raise exception 'Messages can be up to 200 characters.'; end if;
  if (select count(*) from board_messages
      where room_id = p_room and user_id = v_uid and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Slow down a little. Try again in a few seconds.';
  end if;
  insert into board_messages (room_id, user_id, body) values (p_room, v_uid, v_body) returning id into v_id;
  return v_id;
end;
$$;

-- Delete one of my own messages.
create or replace function board_delete_message(p_message uuid)
returns void language sql volatile security definer set search_path = public as $$
  delete from board_messages where id = p_message and user_id = auth.uid();
$$;

-- ---------- A cancelled lobby's chat goes at once ----------
create or replace function board__clear_cancelled_chat()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from board_messages where room_id = new.id;
  return new;
end;
$$;
drop trigger if exists board_rooms_clear_chat on board_rooms;
create trigger board_rooms_clear_chat
  after update of status on board_rooms
  for each row when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function board__clear_cancelled_chat();

-- ---------- Every hour: delete messages older than 5 hours (they're already hidden by the policy above) ----------
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'board-chat-clear') then
    perform cron.unschedule('board-chat-clear');
  end if;
  perform cron.schedule('board-chat-clear', '7 * * * *',
    $job$delete from public.board_messages where created_at < now() - interval '5 hours'$job$);
end $$;

-- ---------- Live updates: screens listen for new (and deleted) messages in their room ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'board_messages') then
    alter publication supabase_realtime add table board_messages;
  end if;
end $$;

-- ---------- Grants ----------
revoke execute on function board__clear_cancelled_chat()       from public, anon, authenticated;
revoke execute on function board_room_messages(uuid)           from public, anon;
revoke execute on function board_send_message(uuid, text)      from public, anon;
revoke execute on function board_delete_message(uuid)          from public, anon;
grant  execute on function board_room_messages(uuid)           to authenticated;
grant  execute on function board_send_message(uuid, text)      to authenticated;
grant  execute on function board_delete_message(uuid)          to authenticated;
