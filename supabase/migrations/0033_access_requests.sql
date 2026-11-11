-- Access requests: people sign in with Google, then wait for the admin to accept them.
--
-- Before this, every account was made by hand in the Supabase dashboard, and any logged-in account could use
-- everything. Now anyone can create an account (Continue with Google), so "logged in" is no longer enough:
-- an account must also be an APPROVED member.
--
--   members.status   pending   just signed in, waiting for the admin
--                    approved  can use the app
--                    declined  the admin said no (or removed them later); the admin can accept them again
--
-- The check lives in the database, in two places, so the app's screens are never the only lock:
--   1. check_access() runs before EVERY Data API request (tables and functions). A logged-in account that is
--      not approved gets "403" for everything except my_access(), which tells it its own status.
--   2. A restrictive policy on every table, for what does not go through the Data API (Realtime).
--
-- Everyone who already has an account when this runs becomes approved, so nobody is locked out.
--
-- Run after 0032. Safe to run more than once.
--
-- AFTER running it, make one account the admin (run once in the SQL editor, with the admin's own email):
--   update public.members set is_admin = true
--   where user_id = (select id from auth.users where lower(email) = lower('admin@example.com'));

-- ---------- 1. The members list ----------
create table if not exists public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  is_admin     boolean not null default false,
  requested_at timestamptz not null default now(),
  decided_at   timestamptz
);

-- No policies on purpose: nobody reads or writes this table directly, only through the functions below.
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;

-- Accounts that already exist are approved.
insert into public.members (user_id, status, requested_at, decided_at)
select id, 'approved', created_at, now() from auth.users
on conflict (user_id) do nothing;

-- A new account starts as pending. (my_access() also adds the row if this ever misses one.)
create or replace function public.members__on_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists members_on_new_user on auth.users;
create trigger members_on_new_user
  after insert on auth.users
  for each row execute function public.members__on_new_user();

-- ---------- 2. The checks ----------
-- Is the logged-in account an approved member?
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members where user_id = (select auth.uid()) and status = 'approved'
  );
$$;

-- Is the logged-in account the admin?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members where user_id = (select auth.uid()) and status = 'approved' and is_admin
  );
$$;

-- Runs before every Data API request (see the "alter role" at the bottom).
-- Not logged in (or the server's own key): nothing to check here, the usual rules apply.
create or replace function public.check_access()
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_path text := trim(leading '/' from coalesce(current_setting('request.path', true), ''));
begin
  if auth.uid() is null then return; end if;
  if v_path = 'rpc/my_access' then return; end if;
  if not public.is_approved() then
    raise insufficient_privilege using message = 'Your account is waiting for approval.';
  end if;
end;
$$;

-- The same lock on every table, for Realtime. "Restrictive" = it is added ON TOP of the table's own policies:
-- a row is visible only if the table's policies allow it AND the account is approved.
-- (A table added later is still covered by check_access(); add it here too if it is sent over Realtime.)
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname <> 'members'
  loop
    execute format('drop policy if exists "approved members only" on public.%I', t.relname);
    execute format(
      'create policy "approved members only" on public.%I as restrictive for all to authenticated '
      'using ((select public.is_approved())) with check ((select public.is_approved()))',
      t.relname
    );
  end loop;
end;
$$;

-- ---------- 3. What the app calls ----------
-- My own status. The one thing an account that is still waiting may call.
create or replace function public.my_access()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row public.members;
begin
  if v_uid is null then raise exception 'Not logged in.'; end if;
  insert into public.members (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_row from public.members where user_id = v_uid;
  return jsonb_build_object(
    'status', v_row.status,
    'is_admin', v_row.is_admin and v_row.status = 'approved',
    'requested_at', v_row.requested_at
  );
end;
$$;

-- Admin: everyone who has an account, newest request first.
create or replace function public.list_members()
returns table (user_id uuid, email text, name text, status text, is_admin boolean, requested_at timestamptz)
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
           m.status,
           m.is_admin,
           m.requested_at
    from public.members m
    join auth.users u on u.id = m.user_id
    order by m.requested_at desc;
end;
$$;

-- Admin: accept or decline someone. Also used to remove a member later (decline) or let them back in (approve).
create or replace function public.set_member_access(p_user uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this.'; end if;
  if p_status not in ('approved', 'declined') then raise exception 'Unknown status.'; end if;
  if exists (select 1 from public.members where user_id = p_user and is_admin) then
    raise exception 'The admin''s own access can''t be changed here.';
  end if;

  update public.members set status = p_status, decided_at = now() where user_id = p_user;
  if not found then raise exception 'Account not found.'; end if;
end;
$$;

-- ---------- 4. Who may call what ----------
revoke all on function public.members__on_new_user() from public, anon, authenticated;
revoke all on function public.my_access() from public, anon;
revoke all on function public.list_members() from public, anon;
revoke all on function public.set_member_access(uuid, text) from public, anon;
grant execute on function public.my_access() to authenticated;
grant execute on function public.list_members() to authenticated;
grant execute on function public.set_member_access(uuid, text) to authenticated;
-- These two run for every request and inside policies, so every API role must be able to call them.
grant execute on function public.is_approved() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.check_access() to anon, authenticated, service_role;

-- ---------- 5. Switch the check on ----------
alter role authenticator set pgrst.db_pre_request = 'public.check_access';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
