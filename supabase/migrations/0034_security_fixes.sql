-- Security fixes from the security review (November 2026).
--
-- 1. The classmate list and game invites only include APPROVED members. Before, any account with a first name
--    showed up, including people still waiting or declined (and a stranger can set their own first name).
-- 2. The admin's Access requests list also says how each person signed in (Google or email), so the screen can
--    lead with the email: the name is typed by the person themself and could copy a real classmate's name.
-- 3. The not-logged-in role (anon) loses table and function rights it never needed. Row Level Security already
--    blocked it; this just takes away the unused keys (defense in depth).
--    Only check_access() stays callable by anon: it runs before every request, logged in or not.
--
-- Run after 0033. Safe to run more than once.

-- ---------- 1. Classmates and invites: approved members only ----------
create or replace function public.board_classmates()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select u.id, btrim(left(u.raw_user_meta_data ->> 'first_name', 40))
  from auth.users u
  join public.members m on m.user_id = u.id and m.status = 'approved'
  where auth.uid() is not null and u.id <> auth.uid()
    and nullif(btrim(u.raw_user_meta_data ->> 'first_name'), '') is not null
  order by 2;
$$;

-- Same as 0023, but "Classmate not found" also covers anyone who isn't an approved member.
create or replace function public.board_invite(p_room uuid, p_to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_room.status <> 'lobby' then raise exception 'The game has already started.'; end if;
  if p_to = v_uid or not exists (select 1 from public.members where user_id = p_to and status = 'approved') then
    raise exception 'Classmate not found.';
  end if;
  if exists (select 1 from board_room_players where room_id = p_room and user_id = p_to and status = 'joined') then
    raise exception 'They''re already in this game.';
  end if;
  if (select count(*) from board_room_players where room_id = p_room) >= 4 then raise exception 'The game is full (4 players).'; end if;
  if exists (select 1 from board_invites where room_id = p_room and to_id = p_to and board__invite_active(status, created_at)) then
    return;  -- already invited: nothing to do
  end if;
  if (select count(*) from board_invites where from_id = v_uid and board__invite_active(status, created_at)) >= 3 then
    raise exception 'You can have 3 invites waiting at a time. Wait for an answer, or send the invite link instead.';
  end if;
  insert into board_invites (room_id, from_id, to_id) values (p_room, v_uid, p_to)
  on conflict (room_id, to_id) do update set from_id = v_uid, status = 'pending', created_at = now();
  update board_rooms set version = version + 1 where id = p_room;
end;
$$;

-- ---------- 2. The admin list says how each person signed in ----------
-- The result gets a new column, so the old function has to go first.
drop function if exists public.list_members();
create function public.list_members()
returns table (user_id uuid, email text, name text, providers text[], status text, is_admin boolean, requested_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can see this.'; end if;
  return query
    select m.user_id,
           u.email::text,
           coalesce(
             nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
             nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(trim(u.raw_user_meta_data ->> 'name'), '')
           ),
           coalesce((select array_agg(distinct i.provider order by i.provider) from auth.identities i where i.user_id = u.id), '{}'),
           m.status,
           m.is_admin,
           m.requested_at
    from public.members m
    join auth.users u on u.id = m.user_id
    order by m.requested_at desc;
end;
$$;
revoke all on function public.list_members() from public, anon;
grant execute on function public.list_members() to authenticated;

-- ---------- 3. Take away what anon never needed ----------
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from public;
-- What the logged-in app uses keeps working (it always had these rights).
grant execute on all functions in schema public to authenticated, service_role;
-- The trigger and the internal helpers stay closed to the API, as before.
revoke execute on function public.members__on_new_user() from authenticated;
revoke execute on function public.board__active_room_of(uuid) from authenticated;
revoke execute on function public.board__clear_cancelled_chat() from authenticated;
revoke execute on function public.board__finish(uuid, uuid) from authenticated;
revoke execute on function public.board__join(uuid) from authenticated;
revoke execute on function public.board__name(uuid) from authenticated;
revoke execute on function public.board__next_turn(uuid) from authenticated;
revoke execute on function public.board__pick_question(uuid, uuid, text, integer) from authenticated;
revoke execute on function public.board__lifelines(public.board_rooms) from authenticated;
revoke execute on function public.board__zone(integer) from authenticated;
revoke execute on function public.refresh_book_origin(uuid) from authenticated;
-- check_access() runs before EVERY request, including not-logged-in ones, so anon must be able to call it.
grant execute on function public.check_access() to anon;

-- New tables and functions made later don't hand anon rights by default either.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

notify pgrst, 'reload schema';
