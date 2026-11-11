-- Notices: a short message from the admin to every member, shown at the top of a page (first: Questions).
-- Example: "More Microbiology questions are coming this week."
--
-- - One notice per place ('questions' now; 'home' is allowed so it can be added later without a migration).
-- - Approved members can read it. Only the admin can post, change or remove it, through the two functions below.
-- - Plain text, 1 to 280 characters. The app shows it as text (never as HTML).
-- - Each member can hide it on their device; posting a new notice shows it to everyone again (the app compares
--   posted_at).
--
-- Run after 0035. Safe to run more than once.

create table if not exists public.notices (
  place      text primary key check (place in ('questions', 'home')),
  body       text not null check (char_length(body) between 1 and 280),
  posted_at  timestamptz not null default now()
);

alter table public.notices enable row level security;

-- Read: any logged-in account, plus the same "approved members only" lock every other table has (0033).
drop policy if exists "read notices" on public.notices;
create policy "read notices" on public.notices for select to authenticated using (true);
drop policy if exists "approved members only" on public.notices;
create policy "approved members only" on public.notices as restrictive for all to authenticated
  using ((select public.is_approved())) with check ((select public.is_approved()));

-- Write: nobody directly, only through the admin functions.
revoke all on public.notices from anon, authenticated;
grant select on public.notices to authenticated;

-- Admin: post a notice, or change it. Changing it counts as new (posted_at = now), so members who hid
-- the old one see the new one.
create or replace function public.set_notice(p_place text, p_body text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[ \t]+', ' ', 'g'));
begin
  if not public.is_admin() then raise exception 'Only the admin can do this.'; end if;
  if p_place not in ('questions', 'home') then raise exception 'Unknown place.'; end if;
  if v_body = '' then raise exception 'Write a message first.'; end if;
  if char_length(v_body) > 280 then raise exception 'Keep it to 280 characters or fewer.'; end if;

  insert into public.notices (place, body, posted_at) values (p_place, v_body, now())
  on conflict (place) do update set body = excluded.body, posted_at = excluded.posted_at;
end;
$$;

-- Admin: take the notice down.
create or replace function public.clear_notice(p_place text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this.'; end if;
  delete from public.notices where place = p_place;
end;
$$;

revoke all on function public.set_notice(text, text) from public, anon;
revoke all on function public.clear_notice(text) from public, anon;
grant execute on function public.set_notice(text, text) to authenticated;
grant execute on function public.clear_notice(text) to authenticated;

notify pgrst, 'reload schema';
