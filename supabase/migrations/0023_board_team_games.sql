-- Step 25: Board Review with classmates — live team games (PROJECT_PLAN.md §14, Step 2).
--
-- 2–4 players, each with their own token, race to square 60 in one sitting. The host makes a lobby, invites
-- classmates (from a list, or with a link), and starts. At the start everyone rolls once for the turn order.
-- Each turn has a 90-second clock; 2 missed turns in a row = removed, like Exit. Everyone watches each question.
--
-- The app never writes these tables itself: every change goes through the functions below (security definer),
-- which check who is calling. The DATABASE rolls the die, picks the question and checks the answer, so nobody can
-- move without answering. Team games use built-in questions only (everyone's own questions are different).
-- Each answer is saved as the answering player's attempt, so it counts in their own scores.
--
-- Run after 0022. Safe to run more than once.

-- ---------- The three board layouts (keep in step with LAYOUTS in src/lib/board.ts; board.test.ts checks) ----------
create table if not exists board_layout_jumps (
  layout_id smallint not null,
  kind      text     not null check (kind in ('ladder', 'snake')),
  from_sq   smallint not null check (from_sq between 2 and 59),
  to_sq     smallint not null check (to_sq between 2 and 59),
  primary key (layout_id, from_sq)
);

delete from board_layout_jumps;
insert into board_layout_jumps (layout_id, kind, from_sq, to_sq) values
  -- layout A (0)
  (0, 'ladder', 3, 17), (0, 'ladder', 8, 35), (0, 'ladder', 22, 43), (0, 'ladder', 32, 50), (0, 'ladder', 46, 54),
  (0, 'snake', 16, 5), (0, 'snake', 29, 11), (0, 'snake', 37, 24), (0, 'snake', 48, 28), (0, 'snake', 58, 21),
  -- layout B (1)
  (1, 'ladder', 6, 14), (1, 'ladder', 19, 44), (1, 'ladder', 28, 49), (1, 'ladder', 36, 46), (1, 'ladder', 41, 59),
  (1, 'snake', 17, 3), (1, 'snake', 24, 15), (1, 'snake', 31, 11), (1, 'snake', 54, 26), (1, 'snake', 57, 43),
  -- layout C (2)
  (2, 'ladder', 4, 39), (2, 'ladder', 7, 28), (2, 'ladder', 15, 27), (2, 'ladder', 25, 45), (2, 'ladder', 38, 57),
  (2, 'snake', 17, 5), (2, 'snake', 34, 26), (2, 'snake', 47, 33), (2, 'snake', 53, 30), (2, 'snake', 59, 41);

-- ---------- Rooms, players, invites ----------
create table if not exists board_rooms (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references auth.users(id) on delete cascade,
  -- for the invite link (/board/join/CODE); 6 letters/digits
  invite_code       text not null unique,
  layout_id         smallint not null check (layout_id between 0 and 2),
  status            text not null default 'lobby' check (status in ('lobby', 'playing', 'finished', 'cancelled')),
  -- whose turn it is, and where in the turn: 'roll' (waiting for the die) or 'answer' (a question is up)
  turn_user         uuid references auth.users(id) on delete set null,
  phase             text check (phase in ('roll', 'answer')),
  -- what the question on screen is for: {"kind":"move","roll":4} | {"kind":"ladder","from":3,"to":17} | {"kind":"snake",...}
  pending           jsonb,
  question_id       uuid references questions(id) on delete set null,
  -- the turn's clock: after this, anyone in the room can pass the turn on
  deadline          timestamptz,
  used_question_ids uuid[] not null default '{}',
  -- the latest thing that happened, for everyone's screen (the turn order, a roll, an answer, a timeout, a leave)
  last_event        jsonb,
  winner_id         uuid references auth.users(id) on delete set null,
  -- goes up by one on every change, so screens know to refresh
  version           int not null default 0,
  created_at        timestamptz not null default now(),
  started_at        timestamptz,
  finished_at       timestamptz
);

create table if not exists board_room_players (
  room_id      uuid not null references board_rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- turn order, 0 goes first (set at the start), and the roll that decided it
  seat         int,
  order_roll   int,
  position     int not null default 1 check (position between 1 and 60),
  status       text not null default 'joined' check (status in ('joined', 'left', 'removed')),
  missed_turns int not null default 0,
  answered     int not null default 0,
  correct      int not null default 0,
  -- this player's quiz session (mode 'board'), so their answers count in their scores
  session_id   uuid references quiz_sessions(id) on delete set null,
  joined_at    timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists board_room_players_user_idx on board_room_players(user_id);

create table if not exists board_invites (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references board_rooms(id) on delete cascade,
  from_id    uuid not null references auth.users(id) on delete cascade,
  to_id      uuid not null references auth.users(id) on delete cascade,
  -- a pending invite older than 24 hours counts as expired (see board__invite_active)
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (room_id, to_id)
);
create index if not exists board_invites_to_idx on board_invites(to_id, status);

-- ---------- Small helpers (not callable by the app) ----------

-- The first name she set in Settings, like Community (0011); no name = "A classmate".
create or replace function board__name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(left(u.raw_user_meta_data ->> 'first_name', 40)), ''), 'A classmate')
  from auth.users u where u.id = p_user;
$$;

create or replace function board__is_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from board_room_players where room_id = p_room and user_id = auth.uid());
$$;

create or replace function board__invite_active(p_status text, p_created timestamptz)
returns boolean language sql stable set search_path = public as $$
  select p_status = 'pending' and p_created > now() - interval '24 hours';
$$;

-- In a lobby or game that isn't over? (one at a time per person)
create or replace function board__active_room_of(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select r.id from board_room_players p join board_rooms r on r.id = p.room_id
  where p.user_id = p_user and p.status = 'joined' and r.status in ('lobby', 'playing')
  order by r.created_at desc limit 1;
$$;

-- The subject code of a square's zone: 1–10 CC, 11–20 MICRO, … 51–60 HTMLE (same as zoneOf in board.ts).
create or replace function board__zone(p_square int)
returns text language sql immutable set search_path = public as $$
  select (array['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE'])[least(6, greatest(1, (p_square - 1) / 10 + 1))];
$$;

-- A built-in question for the player: from the zone's subject; a ladder prefers difficulty 3; a snake prefers the
-- player's weakest topic (3+ answers), then their latest mistakes. Never one already used in this room, unless
-- there's nothing else.
create or replace function board__pick_question(p_room uuid, p_user uuid, p_kind text, p_square int)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_used uuid[];
  v_zone_topics int[];
  v_pick uuid;
  v_weak int;
begin
  select used_question_ids into v_used from board_rooms where id = p_room;
  select array_agg(t.id) into v_zone_topics
  from topics t join subjects s on s.id = t.subject_id where s.code = board__zone(p_square);

  if p_kind = 'snake' then
    -- weakest topic with 3+ answers that has built-in questions
    select q.topic_id into v_weak
    from attempts a join questions q on q.id = a.question_id
    where a.user_id = p_user and q.in_subject
    group by q.topic_id
    having count(*) >= 3
    order by avg(case when a.is_correct then 1.0 else 0.0 end), count(*) desc
    limit 1;
    if v_weak is not null then
      select q.id into v_pick from questions q
      where q.owner_id is null and q.in_subject and q.topic_id = v_weak and not (q.id = any(v_used))
        and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
      order by random() limit 1;
    end if;
    if v_pick is null then
      -- a built-in question whose latest answer from this player was wrong
      select m.question_id into v_pick from (
        select distinct on (a.question_id) a.question_id, a.is_correct
        from attempts a join questions q on q.id = a.question_id
        where a.user_id = p_user and q.owner_id is null and q.in_subject and not (a.question_id = any(v_used))
        order by a.question_id, a.created_at desc
      ) m where not m.is_correct order by random() limit 1;
    end if;
  elsif p_kind = 'ladder' then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and q.topic_id = any(v_zone_topics) and q.difficulty = 3
      and not (q.id = any(v_used)) and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;

  if v_pick is null then
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and q.topic_id = any(v_zone_topics)
      and not (q.id = any(v_used)) and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;
  if v_pick is null then
    -- every question here was used already: allow a repeat rather than no question
    select q.id into v_pick from questions q
    where q.owner_id is null and q.in_subject and q.topic_id = any(v_zone_topics)
      and jsonb_typeof(q.choices) = 'array' and jsonb_array_length(q.choices) >= 2
    order by random() limit 1;
  end if;
  return v_pick;
end;
$$;

-- Ends the game: the winner (or none), and each player's session score.
create or replace function board__finish(p_room uuid, p_winner uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update board_rooms
  set status = 'finished', winner_id = p_winner, finished_at = now(), turn_user = null, phase = null,
      pending = null, question_id = null, deadline = null, version = version + 1
  where id = p_room;
  update quiz_sessions s
  set score = p.correct, total_items = p.answered, finished_at = now(),
      duration_sec = greatest(0, extract(epoch from now() - s.started_at))::int
  from board_room_players p
  where p.room_id = p_room and s.id = p.session_id;
end;
$$;

-- The next player still in the game (after the current one, in seat order) gets the turn. Nobody left = game over.
create or replace function board__next_turn(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_current_seat int;
  v_next uuid;
begin
  select p.seat into v_current_seat
  from board_rooms r join board_room_players p on p.room_id = r.id and p.user_id = r.turn_user
  where r.id = p_room;

  select user_id into v_next from board_room_players
  where room_id = p_room and status = 'joined'
  order by (seat <= coalesce(v_current_seat, -1)), seat   -- the seats after the current one first, then wrap around
  limit 1;

  if v_next is null then
    perform board__finish(p_room, null);
    return;
  end if;
  update board_rooms
  set turn_user = v_next, phase = 'roll', pending = null, question_id = null,
      -- 90 seconds, plus 10 so the last player's answer can be read before the clock really starts
      deadline = now() + interval '100 seconds', version = version + 1
  where id = p_room;
end;
$$;

-- Adds the caller to a lobby (checks: lobby, not full, not in another game).
create or replace function board__join(p_room uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_other uuid;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null then raise exception 'This game doesn''t exist anymore.'; end if;
  if exists (select 1 from board_room_players where room_id = p_room and user_id = v_uid and status = 'joined') then
    return p_room;  -- already in
  end if;
  if v_room.status <> 'lobby' then raise exception 'This game has already started.'; end if;
  v_other := board__active_room_of(v_uid);
  if v_other is not null and v_other <> p_room then raise exception 'You''re already in another team game. Leave it first.'; end if;
  if (select count(*) from board_room_players where room_id = p_room) >= 4 then raise exception 'This game is full (4 players).'; end if;

  insert into board_room_players (room_id, user_id) values (p_room, v_uid)
  on conflict (room_id, user_id) do update set status = 'joined';
  update board_invites set status = 'accepted' where room_id = p_room and to_id = v_uid and status = 'pending';
  update board_rooms set version = version + 1 where id = p_room;
  return p_room;
end;
$$;

-- ---------- What the app can call ----------

-- Classmates to invite: every other account with a first name (never the email).
create or replace function board_classmates()
returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select u.id, btrim(left(u.raw_user_meta_data ->> 'first_name', 40))
  from auth.users u
  where auth.uid() is not null and u.id <> auth.uid()
    and nullif(btrim(u.raw_user_meta_data ->> 'first_name'), '') is not null
  order by 2;
$$;

-- A new lobby with the caller as host, on a random layout. Returns its id.
create or replace function board_create_room()
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_room uuid;
begin
  if v_uid is null then raise exception 'Log in first.'; end if;
  if board__active_room_of(v_uid) is not null then raise exception 'You''re already in a team game. Open it from Board Review, or leave it first.'; end if;
  loop
    -- 6 letters/digits, without look-alikes (0/O, 1/I)
    v_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from board_rooms where invite_code = v_code);
  end loop;
  insert into board_rooms (host_id, invite_code, layout_id) values (v_uid, v_code, floor(random() * 3)::int)
  returning id into v_room;
  insert into board_room_players (room_id, user_id) values (v_room, v_uid);
  return v_room;
end;
$$;

-- Invite a classmate to my lobby. Limits: 3 pending invites per person, one per classmate, 4 players per game.
create or replace function board_invite(p_room uuid, p_to uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_room.status <> 'lobby' then raise exception 'The game has already started.'; end if;
  if p_to = v_uid or not exists (select 1 from auth.users where id = p_to) then raise exception 'Classmate not found.'; end if;
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

-- My invites still waiting (lobbies that haven't started), newest first.
create or replace function board_my_invites()
returns table (invite_id uuid, room_id uuid, from_name text, players int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.room_id, board__name(i.from_id),
         (select count(*)::int from board_room_players p where p.room_id = i.room_id and p.status = 'joined'),
         i.created_at
  from board_invites i join board_rooms r on r.id = i.room_id
  where i.to_id = auth.uid() and board__invite_active(i.status, i.created_at) and r.status = 'lobby'
  order by i.created_at desc;
$$;

-- Join or decline an invite. Returns the room id when joining.
create or replace function board_respond_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_inv board_invites;
begin
  select * into v_inv from board_invites where id = p_invite and to_id = auth.uid();
  if v_inv.id is null or not board__invite_active(v_inv.status, v_inv.created_at) then raise exception 'This invite has expired.'; end if;
  if not p_accept then
    update board_invites set status = 'declined' where id = p_invite;
    update board_rooms set version = version + 1 where id = v_inv.room_id;
    return null;
  end if;
  return board__join(v_inv.room_id);
end;
$$;

-- Join with the code from an invite link.
create or replace function board_join(p_code text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_room uuid;
begin
  select id into v_room from board_rooms where invite_code = upper(btrim(p_code));
  if v_room is null then raise exception 'This invite link isn''t valid anymore.'; end if;
  return board__join(v_room);
end;
$$;

-- My lobby or game that isn't over (at most one), for Board Review's start screen and the nav dot.
create or replace function board_my_room()
returns table (room_id uuid, status text, my_turn boolean, players int)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, coalesce(r.turn_user = auth.uid(), false),
         (select count(*)::int from board_room_players p where p.room_id = r.id and p.status = 'joined')
  from board_rooms r
  where r.id = board__active_room_of(auth.uid());
$$;

-- Leave a lobby or a game. In a lobby the host leaving closes it; in a game the player is out of the turns.
create or replace function board_leave(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_left int;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) then return; end if;

  if v_room.status = 'lobby' then
    if v_room.host_id = v_uid then
      update board_rooms set status = 'cancelled', version = version + 1 where id = p_room;
      update board_invites set status = 'declined' where room_id = p_room and status = 'pending';
    else
      delete from board_room_players where room_id = p_room and user_id = v_uid;
      update board_rooms set version = version + 1 where id = p_room;
    end if;
    return;
  end if;

  if v_room.status = 'playing' then
    update board_room_players set status = 'left' where room_id = p_room and user_id = v_uid and status = 'joined';
    update board_rooms set last_event = jsonb_build_object('kind', 'left', 'user', v_uid, 'name', board__name(v_uid), 'at', now()),
                           version = version + 1
    where id = p_room;
    select count(*) into v_left from board_room_players where room_id = p_room and status = 'joined';
    if v_left = 0 then
      perform board__finish(p_room, null);
    elsif v_room.turn_user = v_uid then
      perform board__next_turn(p_room);
    end if;
  end if;
end;
$$;

-- The host starts the game: everyone rolls once for the turn order, each player gets a quiz session.
create or replace function board_start(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_first uuid;
  v_order jsonb;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.host_id <> v_uid then raise exception 'Only the host can start the game.'; end if;
  if v_room.status <> 'lobby' then raise exception 'The game has already started.'; end if;
  if (select count(*) from board_room_players where room_id = p_room and status = 'joined') < 2 then
    raise exception 'You need at least 2 players. Invite a classmate first.';
  end if;

  -- The order roll: 1–6 each; highest goes first, ties broken at random.
  update board_room_players set order_roll = 1 + floor(random() * 6)::int where room_id = p_room and status = 'joined';
  with ranked as (
    select user_id, row_number() over (order by order_roll desc, random()) - 1 as s
    from board_room_players where room_id = p_room and status = 'joined'
  )
  update board_room_players p set seat = ranked.s from ranked where p.room_id = p_room and p.user_id = ranked.user_id;

  -- One quiz session per player, so their answers count in their own scores (mode 'board', migration 0022).
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
      -- extra time on the first turn: everyone is looking at the turn order first
      deadline = now() + interval '105 seconds',
      last_event = jsonb_build_object('kind', 'order', 'order', v_order, 'at', now()),
      version = version + 1
  where id = p_room;
  -- invites still waiting can't be used anymore
  update board_invites set status = 'declined' where room_id = p_room and status = 'pending';
end;
$$;

-- My turn: roll the die (the database rolls it). A question from my zone comes up.
create or replace function board_roll(p_room uuid)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_pos int;
  v_roll int;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.status <> 'playing' or v_room.turn_user is distinct from v_uid or v_room.phase <> 'roll' then
    raise exception 'It''s not your turn.';
  end if;
  if now() > v_room.deadline then raise exception 'Time''s up for this turn.'; end if;

  select position into v_pos from board_room_players where room_id = p_room and user_id = v_uid;
  v_roll := 1 + floor(random() * 6)::int;
  update board_rooms
  set phase = 'answer', pending = jsonb_build_object('kind', 'move', 'roll', v_roll),
      question_id = board__pick_question(p_room, v_uid, 'move', v_pos),
      deadline = now() + interval '90 seconds',
      last_event = jsonb_build_object('kind', 'roll', 'user', v_uid, 'name', board__name(v_uid), 'roll', v_roll, 'at', now()),
      version = version + 1
  where id = p_room;
  return v_roll;
end;
$$;

-- My answer to the question on screen (index in the question's ORIGINAL choice order).
-- The database checks it, saves it as my attempt, and moves my token.
create or replace function board_answer(p_room uuid, p_selected int)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_room board_rooms;
  v_player board_room_players;
  v_correct_index int;
  v_ok boolean;
  v_kind text;
  v_from int;
  v_to int;
  v_new int;
  v_jump board_layout_jumps;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or v_room.status <> 'playing' or v_room.turn_user is distinct from v_uid
     or v_room.phase <> 'answer' or v_room.question_id is null then
    raise exception 'It''s not your turn.';
  end if;
  if now() > v_room.deadline + interval '3 seconds' then raise exception 'Time''s up for this turn.'; end if;

  select * into v_player from board_room_players where room_id = p_room and user_id = v_uid;
  select correct_index into v_correct_index from questions where id = v_room.question_id;
  v_ok := p_selected = v_correct_index;
  v_kind := v_room.pending ->> 'kind';

  -- Saved as her attempt, so it counts in her scores and Mistake notebook.
  insert into attempts (user_id, session_id, question_id, selected_index, is_correct)
  values (v_uid, v_player.session_id, v_room.question_id, p_selected, v_ok);
  update board_room_players
  set answered = answered + 1, correct = correct + case when v_ok then 1 else 0 end, missed_turns = 0
  where room_id = p_room and user_id = v_uid;

  v_from := v_player.position;
  v_new := v_player.position;
  if v_kind = 'move' and v_ok then
    v_new := least(60, v_player.position + (v_room.pending ->> 'roll')::int);
  elsif v_kind = 'ladder' and v_ok then
    v_new := (v_room.pending ->> 'to')::int;
  elsif v_kind = 'snake' and not v_ok then
    v_new := (v_room.pending ->> 'to')::int;
  end if;
  update board_room_players set position = v_new where room_id = p_room and user_id = v_uid;

  update board_rooms
  set used_question_ids = array_append(used_question_ids, v_room.question_id),
      last_event = jsonb_build_object(
        'kind', 'answer', 'user', v_uid, 'name', board__name(v_uid), 'purpose', v_room.pending,
        'question_id', v_room.question_id, 'selected', p_selected, 'correct_index', v_correct_index,
        'is_correct', v_ok, 'from', v_from, 'to', v_new, 'at', now()),
      version = version + 1
  where id = p_room;

  if v_new >= 60 then
    perform board__finish(p_room, v_uid);
    return v_ok;
  end if;

  -- A correct move that lands on a ladder or a snake: one more question, same turn, a new clock.
  if v_kind = 'move' and v_ok then
    select * into v_jump from board_layout_jumps where layout_id = v_room.layout_id and from_sq = v_new;
    if v_jump.from_sq is not null then
      update board_rooms
      set pending = jsonb_build_object('kind', v_jump.kind, 'from', v_jump.from_sq, 'to', v_jump.to_sq),
          question_id = board__pick_question(p_room, v_uid, v_jump.kind, v_new),
          -- 90 seconds, plus 10 to read the answer she just gave
          deadline = now() + interval '100 seconds', version = version + 1
      where id = p_room;
      return v_ok;
    end if;
  end if;

  perform board__next_turn(p_room);
  return v_ok;
end;
$$;

-- The turn's clock ran out: anyone in the room can pass the turn on. 2 missed turns in a row = removed.
create or replace function board_skip(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_missed int;
  v_left int;
begin
  select * into v_room from board_rooms where id = p_room for update;
  if v_room.id is null or not board__is_member(p_room) or v_room.status <> 'playing' or now() <= v_room.deadline then
    return;  -- not over yet (or someone else already passed it on)
  end if;
  update board_room_players set missed_turns = missed_turns + 1
  where room_id = p_room and user_id = v_room.turn_user
  returning missed_turns into v_missed;
  if v_missed >= 2 then
    update board_room_players set status = 'removed' where room_id = p_room and user_id = v_room.turn_user;
  end if;
  update board_rooms
  set last_event = jsonb_build_object('kind', 'timeout', 'user', v_room.turn_user, 'name', board__name(v_room.turn_user),
                                      'removed', coalesce(v_missed, 0) >= 2, 'at', now()),
      version = version + 1
  where id = p_room;
  select count(*) into v_left from board_room_players where room_id = p_room and status = 'joined';
  if v_left = 0 then
    perform board__finish(p_room, null);
  else
    perform board__next_turn(p_room);
  end if;
end;
$$;

-- Everything a screen needs for one room, in one call. The question on screen comes without its answer;
-- the last answered question comes with it (for the reveal).
create or replace function board_room_state(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_question jsonb;
  v_last_question jsonb;
begin
  select * into v_room from board_rooms where id = p_room;
  if v_room.id is null or not board__is_member(p_room) then return null; end if;

  if v_room.question_id is not null then
    select jsonb_build_object('id', q.id, 'topic_id', q.topic_id, 'stem', q.stem, 'choices', q.choices) into v_question
    from questions q where q.id = v_room.question_id;
  end if;
  if v_room.last_event ->> 'kind' = 'answer' then
    select jsonb_build_object('id', q.id, 'topic_id', q.topic_id, 'stem', q.stem, 'choices', q.choices,
                              'correct_index', q.correct_index, 'explanation', q.explanation, 'choice_notes', q.choice_notes)
    into v_last_question
    from questions q where q.id = (v_room.last_event ->> 'question_id')::uuid;
  end if;

  return jsonb_build_object(
    'id', v_room.id, 'host_id', v_room.host_id, 'invite_code', v_room.invite_code, 'layout_id', v_room.layout_id,
    'status', v_room.status, 'turn_user', v_room.turn_user, 'phase', v_room.phase, 'pending', v_room.pending,
    'deadline', v_room.deadline, 'last_event', v_room.last_event, 'winner_id', v_room.winner_id,
    'version', v_room.version, 'now', now(), 'me', auth.uid(),
    'question', v_question, 'last_question', v_last_question,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'name', board__name(p.user_id), 'seat', p.seat, 'order_roll', p.order_roll,
               'position', p.position, 'status', p.status, 'answered', p.answered, 'correct', p.correct)
             order by p.seat nulls last, p.joined_at)
      from board_room_players p where p.room_id = p_room), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', i.to_id, 'name', board__name(i.to_id)))
      from board_invites i where i.room_id = p_room and board__invite_active(i.status, i.created_at)), '[]'::jsonb)
  );
end;
$$;

-- ---------- Who can read what (writes only go through the functions above) ----------
alter table board_layout_jumps enable row level security;
alter table board_rooms        enable row level security;
alter table board_room_players enable row level security;
alter table board_invites      enable row level security;

drop policy if exists board_jumps_read   on board_layout_jumps;
drop policy if exists board_rooms_read   on board_rooms;
drop policy if exists board_players_read on board_room_players;
drop policy if exists board_invites_read on board_invites;
create policy board_jumps_read   on board_layout_jumps for select to authenticated using (true);
-- a room: its players (Realtime uses this to send them its changes)
create policy board_rooms_read   on board_rooms        for select to authenticated using (board__is_member(id));
create policy board_players_read on board_room_players for select to authenticated using (board__is_member(room_id));
create policy board_invites_read on board_invites      for select to authenticated using (from_id = auth.uid() or to_id = auth.uid());

revoke insert, update, delete on board_layout_jumps, board_rooms, board_room_players, board_invites from anon, authenticated;

-- Live updates: screens listen for changes to their room (and to invites sent to them).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'board_rooms') then
    alter publication supabase_realtime add table board_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'board_invites') then
    alter publication supabase_realtime add table board_invites;
  end if;
end $$;

-- ---------- Grants: the helpers stay private ----------
revoke execute on function board__name(uuid)                          from public, anon, authenticated;
revoke execute on function board__is_member(uuid)                     from public, anon;
revoke execute on function board__invite_active(text, timestamptz)    from public, anon;
revoke execute on function board__active_room_of(uuid)                from public, anon, authenticated;
revoke execute on function board__zone(int)                           from public, anon, authenticated;
revoke execute on function board__pick_question(uuid, uuid, text, int) from public, anon, authenticated;
revoke execute on function board__finish(uuid, uuid)                  from public, anon, authenticated;
revoke execute on function board__next_turn(uuid)                     from public, anon, authenticated;
revoke execute on function board__join(uuid)                          from public, anon, authenticated;
-- the RLS policies above call these two, so signed-in users need them
grant  execute on function board__is_member(uuid)                     to authenticated;
grant  execute on function board__invite_active(text, timestamptz)    to authenticated;

revoke execute on function board_classmates()               from public, anon;
revoke execute on function board_create_room()              from public, anon;
revoke execute on function board_invite(uuid, uuid)         from public, anon;
revoke execute on function board_my_invites()               from public, anon;
revoke execute on function board_respond_invite(uuid, boolean) from public, anon;
revoke execute on function board_join(text)                 from public, anon;
revoke execute on function board_my_room()                  from public, anon;
revoke execute on function board_leave(uuid)                from public, anon;
revoke execute on function board_start(uuid)                from public, anon;
revoke execute on function board_roll(uuid)                 from public, anon;
revoke execute on function board_answer(uuid, int)          from public, anon;
revoke execute on function board_skip(uuid)                 from public, anon;
revoke execute on function board_room_state(uuid)           from public, anon;
grant  execute on function board_classmates()               to authenticated;
grant  execute on function board_create_room()              to authenticated;
grant  execute on function board_invite(uuid, uuid)         to authenticated;
grant  execute on function board_my_invites()               to authenticated;
grant  execute on function board_respond_invite(uuid, boolean) to authenticated;
grant  execute on function board_join(text)                 to authenticated;
grant  execute on function board_my_room()                  to authenticated;
grant  execute on function board_leave(uuid)                to authenticated;
grant  execute on function board_start(uuid)                to authenticated;
grant  execute on function board_roll(uuid)                 to authenticated;
grant  execute on function board_answer(uuid, int)          to authenticated;
grant  execute on function board_skip(uuid)                 to authenticated;
grant  execute on function board_room_state(uuid)           to authenticated;
