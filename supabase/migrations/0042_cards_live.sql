-- Step 31: Last Card with classmates, live (PROJECT_PLAN.md §15 step 2).
--
-- Rooms, invites, the code/link, the lobby, chat and kick are Board Review's (board_rooms & co.), with a new
-- `game` column. The game itself runs in the Edge Function `cards-game` (the same rules as the solo game, from
-- src/lib/cardsLive.ts), which reads and writes through the server-only functions below.
--
--   card_games  the whole game (every hand, the draw pile, the answer to the question up now): server only
--   card_views  what each player may see (their own cards; the others only as counts; no answer until it's
--               revealed): each player can read ONLY their own row, and Realtime sends it to them on every change
--
-- A Last Card room goes lobby → 'live' → finished. Board Review's game functions only act on 'playing' rooms, so
-- they can't touch a Last Card game.
--
-- Run this BEFORE deploying the app version with live Last Card, and deploy the Edge Function `cards-game`.
-- Safe to run more than once.

-- ---------- 1. Which game a room is for, and the 'live' status ----------
alter table board_rooms add column if not exists game text not null default 'board';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'board_rooms_game_check') then
    alter table board_rooms add constraint board_rooms_game_check check (game in ('board', 'cards'));
  end if;
end $$;

-- The status check gets 'live' (a Last Card game in progress).
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'board_rooms'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%status%' and conname <> 'board_rooms_game_check';
  if v_name is not null then
    execute format('alter table board_rooms drop constraint %I', v_name);
  end if;
  alter table board_rooms add constraint board_rooms_status_check
    check (status in ('lobby', 'playing', 'live', 'finished', 'cancelled'));
end $$;

-- In a lobby or a game that isn't over? (one at a time per person; now also a live Last Card game)
create or replace function board__active_room_of(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select r.id from board_room_players p join board_rooms r on r.id = p.room_id
  where p.user_id = p_user and p.status = 'joined' and r.status in ('lobby', 'playing', 'live')
  order by r.created_at desc limit 1;
$$;
revoke execute on function board__active_room_of(uuid) from public, anon, authenticated;

-- ---------- 2. Making a Last Card lobby ----------
-- Same as board_create_room() (0023), for the game asked for ('board' or 'cards').
create or replace function board_create_room(p_game text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_room uuid;
begin
  if v_uid is null then raise exception 'Log in first.'; end if;
  if p_game not in ('board', 'cards') then raise exception 'Unknown game.'; end if;
  if board__active_room_of(v_uid) is not null then raise exception 'You''re already in a team game. Open it, or leave it first.'; end if;
  loop
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from board_rooms where invite_code = v_code);
  end loop;
  insert into board_rooms (host_id, invite_code, layout_id, game) values (v_uid, v_code, floor(random() * 3)::int, p_game)
  returning id into v_room;
  insert into board_room_players (room_id, user_id) values (v_room, v_uid);
  return v_room;
end;
$$;
revoke execute on function board_create_room(text) from public, anon;
grant  execute on function board_create_room(text) to authenticated;

-- Board Review's Start must never start a Last Card room (that one starts in the Edge Function).
-- Same as board_start (0023), with the check on top.
create or replace function board_start(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_first uuid;
  v_order jsonb;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.game = 'cards' then raise exception 'Start this game from Last Card.'; end if;
  if v_room.id is null or v_room.host_id <> v_uid then raise exception 'Only the host can start the game.'; end if;
  if v_room.status <> 'lobby' then raise exception 'The game has already started.'; end if;
  if (select count(*) from board_room_players where room_id = p_room and status = 'joined') < 2 then
    raise exception 'You need at least 2 players. Invite a classmate first.';
  end if;

  update board_room_players set order_roll = 1 + floor(random() * 6)::int where room_id = p_room and status = 'joined';
  with ranked as (
    select user_id, row_number() over (order by order_roll desc, random()) - 1 as s
    from board_room_players where room_id = p_room and status = 'joined'
  )
  update board_room_players p set seat = ranked.s from ranked where p.room_id = p_room and p.user_id = ranked.user_id;

  with made as (
    insert into quiz_sessions (user_id, mode, total_items, filters, started_at)
    select user_id, 'board', 0, jsonb_build_object('source', 'builtin', 'board', true, 'team_room', p_room), now()
    from board_room_players where room_id = p_room and status = 'joined'
    returning id, user_id
  )
  update board_room_players p set session_id = made.id from made where p.room_id = p_room and p.user_id = made.user_id;

  select user_id into v_first from board_room_players where room_id = p_room and seat = 0;
  select jsonb_agg(jsonb_build_object('user', user_id, 'name', board__name(user_id), 'roll', order_roll, 'seat', seat) order by seat)
  into v_order from board_room_players where room_id = p_room and status = 'joined';

  update board_rooms
  set status = 'playing', started_at = now(), turn_user = v_first, phase = 'roll',
      deadline = now() + interval '105 seconds',
      last_event = jsonb_build_object('kind', 'order', 'order', v_order, 'at', now()),
      version = version + 1
  where id = p_room;
  update board_invites set status = 'declined' where room_id = p_room and status = 'pending';
end;
$$;

-- ---------- 3. The game and each player's view ----------
create table if not exists card_games (
  room_id    uuid primary key references board_rooms(id) on delete cascade,
  -- the whole LiveGame (src/lib/cardsLive.ts): every hand, the draw pile, the question with its answer
  state      jsonb not null,
  -- goes up by one on every save; a save that expected an older version is refused (two moves at once)
  version    int not null default 0,
  updated_at timestamptz not null default now()
);
alter table card_games enable row level security;
-- No policies: nobody reads or writes it through the API; only the server functions below (and the Edge Function).
revoke all on card_games from anon, authenticated;

create table if not exists card_views (
  room_id    uuid not null references board_rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- liveView(): her own cards, the others as counts, the question without its answer
  view       jsonb not null,
  version    int not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table card_views enable row level security;
drop policy if exists card_views_own on card_views;
create policy card_views_own on card_views for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on card_views from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'card_views') then
    alter publication supabase_realtime add table card_views;
  end if;
end $$;

-- ---------- 4. Server-only functions (the Edge Function calls these with the server key) ----------

-- Starts a Last Card lobby: checks it's the host, still a lobby, and the people in it are exactly `p_people`
-- (in seat order, as the Edge Function dealt them); gives everyone a quiz session (mode 'cards'); saves the game
-- and every view; the room goes 'live'.
create or replace function cards__begin(p_room uuid, p_host uuid, p_people uuid[], p_state jsonb, p_views jsonb, p_turn_user uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_joined uuid[];
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.game <> 'cards' then raise exception 'That isn''t a Last Card room.'; end if;
  if v_room.host_id <> p_host then raise exception 'Only the host can start the game.'; end if;
  if v_room.status <> 'lobby' then raise exception 'The game has already started.'; end if;
  select array_agg(user_id order by user_id) into v_joined from board_room_players where room_id = p_room and status = 'joined';
  if coalesce(array_length(v_joined, 1), 0) < 2 then raise exception 'You need at least 2 players. Invite a classmate first.'; end if;
  if v_joined <> (select array_agg(u order by u) from unnest(p_people) u) then
    raise exception 'Someone joined or left just now. Try Start again.';
  end if;

  update board_room_players p set seat = s.seat
  from (select u, (ordinality - 1)::int as seat from unnest(p_people) with ordinality as t(u, ordinality)) s
  where p.room_id = p_room and p.user_id = s.u;

  with made as (
    insert into quiz_sessions (user_id, mode, total_items, filters, started_at)
    select user_id, 'cards', 0, jsonb_build_object('source', 'builtin', 'cards', true, 'team_room', p_room), now()
    from board_room_players where room_id = p_room and status = 'joined'
    returning id, user_id
  )
  update board_room_players p set session_id = made.id from made where p.room_id = p_room and p.user_id = made.user_id;

  insert into card_games (room_id, state, version) values (p_room, p_state, 1);
  insert into card_views (room_id, user_id, view, version)
  select p_room, (v ->> 'user_id')::uuid, v -> 'view', 1 from jsonb_array_elements(p_views) v;

  update board_rooms
  set status = 'live', started_at = now(), turn_user = p_turn_user, version = version + 1,
      last_event = jsonb_build_object('kind', 'cards_start', 'at', now())
  where id = p_room;
  update board_invites set status = 'declined' where room_id = p_room and status = 'pending';
end;
$$;

-- Saves a move: only if nobody saved in between (p_expected = the version it was read at; else 'conflict', and the
-- Edge Function reads again and retries). Saves every view, her answer as an attempt (so it counts in her scores),
-- each player's score, who has left, whose turn it is (for the red dot), and finishes the room when it's over.
create or replace function cards__save(
  p_room uuid, p_expected int, p_state jsonb, p_views jsonb, p_turn_user uuid,
  p_attempt jsonb, p_scores jsonb, p_gone uuid[], p_finished boolean
)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_version int;
begin
  update card_games set state = p_state, version = version + 1, updated_at = now()
  where room_id = p_room and version = p_expected
  returning version into v_version;
  if v_version is null then raise exception 'conflict'; end if;

  insert into card_views (room_id, user_id, view, version)
  select p_room, (v ->> 'user_id')::uuid, v -> 'view', v_version from jsonb_array_elements(p_views) v
  on conflict (room_id, user_id) do update set view = excluded.view, version = excluded.version, updated_at = now();

  if p_attempt is not null then
    insert into attempts (user_id, session_id, question_id, selected_index, is_correct)
    select (p_attempt ->> 'user_id')::uuid, p.session_id, (p_attempt ->> 'question_id')::uuid,
           (p_attempt ->> 'selected_index')::int, (p_attempt ->> 'is_correct')::boolean
    from board_room_players p where p.room_id = p_room and p.user_id = (p_attempt ->> 'user_id')::uuid;
  end if;

  update board_room_players p set answered = (s ->> 'answered')::int, correct = (s ->> 'correct')::int
  from jsonb_array_elements(p_scores) s
  where p.room_id = p_room and p.user_id = (s ->> 'user_id')::uuid;

  update board_room_players set status = 'left'
  where room_id = p_room and status = 'joined' and user_id = any(coalesce(p_gone, '{}'));

  update board_rooms set turn_user = p_turn_user, version = version + 1 where id = p_room;

  if p_finished then
    update board_rooms set status = 'finished', finished_at = now(), turn_user = null where id = p_room and status = 'live';
    update quiz_sessions s
    set score = p.correct, total_items = p.answered, finished_at = now(),
        duration_sec = greatest(0, extract(epoch from now() - s.started_at))::int
    from board_room_players p
    where p.room_id = p_room and s.id = p.session_id and s.finished_at is null;
  end if;
  return v_version;
end;
$$;

-- A built-in question for a player: from `p_subject`; or, for a Wild (p_subject null), from their weakest topic
-- (3+ answers, like the Board Review snake), else one of their latest mistakes, else any. Never one already used
-- in this game, unless there's nothing else. Comes WITH its answer: only the Edge Function calls this.
create or replace function cards__pick_question(p_used uuid[], p_user uuid, p_subject text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_used uuid[] := coalesce(p_used, '{}');
  v_topics int[];
  v_weak int;
  v_pick uuid;
begin
  if p_subject is not null then
    select array_agg(t.id) into v_topics from topics t join subjects s on s.id = t.subject_id where s.code = p_subject;
  else
    select q.topic_id into v_weak
    from attempts a join questions q on q.id = a.question_id
    where a.user_id = p_user and q.in_subject and not a.assisted
    group by q.topic_id having count(*) >= 3
    order by avg(case when a.is_correct then 1.0 else 0.0 end), count(*) desc
    limit 1;
    if v_weak is not null then v_topics := array[v_weak]; end if;
    if v_weak is null then
      select m.question_id into v_pick from (
        select distinct on (a.question_id) a.question_id, a.is_correct
        from attempts a join questions q on q.id = a.question_id
        where a.user_id = p_user and q.owner_id is null and q.in_subject and not (a.question_id = any(v_used))
        order by a.question_id, a.created_at desc
      ) m where not m.is_correct order by random() limit 1;
    end if;
  end if;

  if v_pick is null then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and (v_topics is null or q.topic_id = any(v_topics))
      and not (q.id = any(v_used)) and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;
  if v_pick is null then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and (v_topics is null or q.topic_id = any(v_topics))
      and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;
  if v_pick is null then return null; end if;

  return (
    select jsonb_build_object(
      'id', q.id, 'stem', q.stem, 'choices', q.choices, 'correctIndex', q.correct_index,
      'explanation', q.explanation, 'choiceNotes', q.choice_notes, 'topicId', q.topic_id, 'subjectCode', s.code)
    from questions q join topics t on t.id = q.topic_id join subjects s on s.id = t.subject_id
    where q.id = v_pick
  );
end;
$$;

-- Server only: not callable with a player's login.
revoke execute on function cards__begin(uuid, uuid, uuid[], jsonb, jsonb, uuid) from public, anon, authenticated;
revoke execute on function cards__save(uuid, int, jsonb, jsonb, uuid, jsonb, jsonb, uuid[], boolean) from public, anon, authenticated;
revoke execute on function cards__pick_question(uuid[], uuid, text) from public, anon, authenticated;
grant  execute on function cards__begin(uuid, uuid, uuid[], jsonb, jsonb, uuid) to service_role;
grant  execute on function cards__save(uuid, int, jsonb, jsonb, uuid, jsonb, jsonb, uuid[], boolean) to service_role;
grant  execute on function cards__pick_question(uuid[], uuid, text) to service_role;
