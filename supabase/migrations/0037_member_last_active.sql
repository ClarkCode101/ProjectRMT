-- Members list: when each person last studied (admin only, like the rest of list_members).
-- "Last studied" = the newest of: an answer (attempts), a session start (quiz_sessions), a flashcard review
-- (review_states.last_review). Only studying counts: opening the app and looking around does not.
-- Answers made offline count once they sync.
--
-- Adds one column (last_active_at, null = never studied). The old app ignores it, so this can run before the
-- new app is deployed. Postgres can't change a function's columns in place, so it is dropped and made again.
--
-- Run after 0036. Safe to run more than once.

drop function if exists public.list_members();

create function public.list_members()
returns table (
  user_id uuid,
  email text,
  name text,
  providers text[],
  status text,
  is_admin boolean,
  requested_at timestamptz,
  last_active_at timestamptz
)
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
           m.requested_at,
           -- greatest() skips nulls, so one kind of activity is enough
           greatest(
             (select max(a.created_at) from public.attempts a where a.user_id = m.user_id),
             (select max(s.started_at) from public.quiz_sessions s where s.user_id = m.user_id),
             (select max(r.last_review) from public.review_states r where r.user_id = m.user_id)
           )
    from public.members m
    join auth.users u on u.id = m.user_id
    order by m.requested_at desc;
end;
$$;

revoke all on function public.list_members() from public, anon;
grant execute on function public.list_members() to authenticated;

notify pgrst, 'reload schema';
