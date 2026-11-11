-- The admin can delete a DECLINED account for good (Settings → Access requests → Declined → Delete).
--
-- Decline vs Delete:
--   Decline  the account stays, blocked: signing in again still shows "Request declined". Accept brings it back,
--            with all its progress.
--   Delete   the account and everything in it are gone (progress, questions, books, game history). Signing in again
--            makes a brand-new request. Can't be undone.
--
-- Only a declined account can be deleted, so a member always has to be removed (declined) first: two separate
-- steps, never one tap. The admin's own account can't be deleted here.
--
-- What goes with it: every table that points at the account deletes its rows with it (on delete cascade), and the
-- "copied from <author>" links on other people's copies are just cleared (on delete set null), so their copies stay.
--
-- Run after 0034. Safe to run more than once.

create or replace function public.delete_member(p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_row public.members;
begin
  if not public.is_admin() then raise exception 'Only the admin can do this.'; end if;

  select * into v_row from public.members where user_id = p_user;
  if not found then raise exception 'Account not found.'; end if;
  if v_row.is_admin then raise exception 'The admin''s own account can''t be deleted here.'; end if;
  if v_row.status <> 'declined' then raise exception 'Remove this person first, then delete the account.'; end if;

  delete from auth.users where id = p_user;
end;
$$;

revoke all on function public.delete_member(uuid) from public, anon;
grant execute on function public.delete_member(uuid) to authenticated;

notify pgrst, 'reload schema';
