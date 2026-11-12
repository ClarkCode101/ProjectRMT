-- Forgot password, for now: the admin gives an email account a temporary password, and the member must choose a
-- new one right after logging in with it. (No email is sent: Supabase "Confirm email" / email sending is off
-- while the group is small. A real "Forgot password" email comes later, with a custom email sender.)
--
-- 1. members.must_change_password: true from the reset until the member saves a new password.
-- 2. my_access() also returns must_change_password, so the app can show "Choose a new password" first.
-- 3. admin_reset_password(user, password): admin only. Only for accounts that log in with email (not the admin's
--    own, not Google-only). Saves the password hashed (bcrypt, like Supabase itself; nothing readable is kept),
--    logs the member out on every device, and sets the flag.
-- 4. finish_password_change(): the member clears their own flag after saving a new password.
--
-- Run after 0037. Safe to run more than once.

-- ---------- 1. The flag ----------
alter table public.members add column if not exists must_change_password boolean not null default false;

-- ---------- 2. my_access() tells the app ----------
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
    'requested_at', v_row.requested_at,
    'must_change_password', v_row.must_change_password
  );
end;
$$;

-- ---------- 3. The admin sets a temporary password ----------
create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this.'; end if;
  if exists (select 1 from public.members where user_id = p_user and is_admin) then
    raise exception 'The admin''s own password can''t be reset here.';
  end if;
  if not exists (select 1 from auth.identities where user_id = p_user and provider = 'email') then
    raise exception 'This account doesn''t log in with email.';
  end if;
  if p_password is null or char_length(p_password) < 8 then
    raise exception 'The password is too short.';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user;

  -- Log them out everywhere: whoever had the old password (or an open session) can't keep using it.
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;

  update public.members set must_change_password = true where user_id = p_user;
end;
$$;

-- ---------- 4. The member clears the flag after choosing a new password ----------
create or replace function public.finish_password_change()
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not logged in.'; end if;
  update public.members set must_change_password = false where user_id = auth.uid();
end;
$$;

revoke all on function public.admin_reset_password(uuid, text) from public, anon;
revoke all on function public.finish_password_change() from public, anon;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.finish_password_change() to authenticated;

notify pgrst, 'reload schema';
