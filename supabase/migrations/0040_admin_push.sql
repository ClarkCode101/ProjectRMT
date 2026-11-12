-- Phone notifications for the admin: "New access request" pops up on her phone even when the app is closed.
--
-- How it works (Web Push, free):
--   1. On her phone, the admin taps "Turn on" in Settings. The phone gives the app an address to send to
--      (a "subscription"); save_push_subscription() keeps it in push_subscriptions.
--   2. Someone new signs in -> a row is added to members (status pending) -> the trigger below pokes the
--      Edge Function "notify-admin" (supabase/functions/notify-admin).
--   3. The function calls claim_push_jobs() with the server's own key, gets "who is new" + "where to send",
--      and sends the notification through Apple's / Google's push service, encrypted.
--
-- Safety:
--   - The poke carries NOTHING: no names, no keys. The function always reads the jobs from the database itself,
--     and a request is only announced once (members.notified_at). So anyone who calls the function's address
--     can at most make it look for work that isn't there.
--   - push_subscriptions has no policies: nobody reads it directly. Only an admin can save a subscription,
--     and only the server's own key (the Edge Function) can read them.
--
-- Run after 0039. Safe to run more than once.

create extension if not exists pg_net;

-- ---------- 1. Where to send ----------
create table if not exists public.push_subscriptions (
  endpoint          text primary key,  -- the address the phone gave us (Apple's / Google's push service)
  user_id           uuid not null references auth.users(id) on delete cascade,
  p256dh            text not null,     -- the phone's public key: the message is encrypted for it
  auth              text not null,     -- a second, shared secret for the same encryption
  created_at        timestamptz not null default now(),
  test_requested_at timestamptz        -- "Send test" was tapped; the function sends one and clears this
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- 0033 put "approved members only" on every table; this table has no other policies, so it stays closed anyway.

-- When each request was announced. Requests from before this migration count as announced (no surprise flood).
alter table public.members add column if not exists notified_at timestamptz;
update public.members set notified_at = now() where notified_at is null;

-- ---------- 2. Poke the Edge Function ----------
-- The function's address is public anyway (same project URL as the app). The body is empty on purpose.
create or replace function public.poke_notify_admin()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url     := 'https://dutdsfsmsxyivbvzuowp.supabase.co/functions/v1/notify-admin',
    body    := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  -- A notification must never stop someone from signing up.
  raise warning 'notify-admin poke failed: %', sqlerrm;
end;
$$;

create or replace function public.members__on_new_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and new.notified_at is null then
    perform public.poke_notify_admin();
  end if;
  return new;
end;
$$;

drop trigger if exists members_on_new_request on public.members;
create trigger members_on_new_request
  after insert on public.members
  for each row execute function public.members__on_new_request();

-- ---------- 3. What the app calls (admin, on her own phone) ----------
-- Save this phone. Admin only. The same phone saved again just updates its keys.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can turn on notifications.'; end if;
  -- Only real push services, so the server never sends requests anywhere else.
  if p_endpoint is null or p_endpoint !~ '^https://[^/]+\.(push\.apple\.com|googleapis\.com|mozilla\.com|windows\.com|mozaws\.net)/' then
    raise exception 'Unknown push service.';
  end if;
  if length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'Subscription too long.';
  end if;

  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Forget this phone (Turn off). Only your own.
create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Is this phone saved? (The phone may still have a subscription the server has forgotten.)
create or replace function public.has_push_subscription(p_endpoint text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid());
$$;

-- "Send test": mark this phone, then poke the function.
create or replace function public.send_test_push(p_endpoint text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Only the admin can do this.'; end if;
  update public.push_subscriptions set test_requested_at = now()
  where endpoint = p_endpoint and user_id = auth.uid();
  if not found then raise exception 'This device isn''t turned on yet.'; end if;
  perform public.poke_notify_admin();
end;
$$;

-- ---------- 4. What the Edge Function calls (server key only) ----------
-- Takes the new requests and the test taps, marks them done, and says where to send.
create or replace function public.claim_push_jobs()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_requests jsonb;
  v_tests    jsonb;
  v_subs     jsonb;
begin
  with claimed as (
    update public.members m set notified_at = now()
    where m.status = 'pending' and m.notified_at is null
    returning m.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', u.id,
           'email', u.email,
           'name', coalesce(
             nullif(trim(u.raw_user_meta_data ->> 'first_name'), ''),
             nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(trim(u.raw_user_meta_data ->> 'name'), '')
           )
         )), '[]'::jsonb)
  into v_requests
  from claimed c join auth.users u on u.id = c.user_id;

  with tested as (
    update public.push_subscriptions s set test_requested_at = null
    where s.test_requested_at is not null
    returning s.endpoint
  )
  select coalesce(jsonb_agg(endpoint), '[]'::jsonb) into v_tests from tested;

  -- Only phones of accounts that are still admins.
  select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
  into v_subs
  from public.push_subscriptions s
  join public.members m on m.user_id = s.user_id
  where m.is_admin and m.status = 'approved';

  return jsonb_build_object('requests', v_requests, 'tests', v_tests, 'subscriptions', v_subs);
end;
$$;

-- The push service said this phone is gone (app deleted, notifications turned off): stop sending to it.
create or replace function public.forget_push_subscription(p_endpoint text)
returns void language sql volatile security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- ---------- 5. Who may call what ----------
revoke all on function public.poke_notify_admin() from public, anon, authenticated;
revoke all on function public.members__on_new_request() from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
revoke all on function public.has_push_subscription(text) from public, anon;
revoke all on function public.send_test_push(text) from public, anon;
revoke all on function public.claim_push_jobs() from public, anon, authenticated;
revoke all on function public.forget_push_subscription(text) from public, anon, authenticated;

grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.has_push_subscription(text) to authenticated;
grant execute on function public.send_test_push(text) to authenticated;
grant execute on function public.claim_push_jobs() to service_role;
grant execute on function public.forget_push_subscription(text) to service_role;

notify pgrst, 'reload schema';
