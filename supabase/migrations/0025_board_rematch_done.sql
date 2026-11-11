-- Board Review team games: "Back to Board Review" on the finish screen counts as "no" to Play again.
--
-- Play again is the "yes" (0024). Tapping Back to Board Review now saves a "done", so:
--   - a later Play again by someone else doesn't invite them (no unwanted invite or red dot);
--   - the others see a "Done" badge next to their name and don't wait for them.
-- Someone who just closed the tab hasn't said no, so they're still invited. Tapping Play again later clears "done".
--
-- Run after 0024. Safe to run more than once.

alter table board_room_players add column if not exists rematch_done boolean not null default false;

-- "I'm done": from the finish screen's Back to Board Review. Quiet if the game isn't over or she isn't in it.
create or replace function board_rematch_done(p_room uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update board_room_players p set rematch_done = true
  from board_rooms r
  where p.room_id = p_room and p.user_id = auth.uid() and r.id = p.room_id and r.status = 'finished';
  if found then
    update board_rooms set version = version + 1 where id = p_room;  -- the others' screens show the badge
  end if;
end;
$$;

revoke execute on function board_rematch_done(uuid) from public, anon;
grant  execute on function board_rematch_done(uuid) to authenticated;

-- Same as 0024, plus: tapping it clears her own "done", and players who said done aren't invited.
create or replace function board_rematch(p_room uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old board_rooms;
  v_next board_rooms;
  v_new uuid;
begin
  if v_uid is null then raise exception 'Log in first.'; end if;
  select * into v_old from board_rooms where id = p_room for update;  -- one Play again at a time per game
  if v_old.id is null or not board__is_member(p_room) then raise exception 'Game not found.'; end if;
  if v_old.status <> 'finished' then raise exception 'This game isn''t over yet.'; end if;

  update board_room_players set rematch_done = false where room_id = p_room and user_id = v_uid;  -- changed her mind

  -- Someone already made the next game
  if v_old.rematch_room_id is not null then
    select * into v_next from board_rooms where id = v_old.rematch_room_id;
    if v_next.status = 'lobby' then
      return board__join(v_next.id);
    elsif v_next.status = 'playing' then
      raise exception 'The next game has already started without you. Start a new one from Board Review.';
    end if;
    -- it was cancelled or is over: make a fresh one below
  end if;

  v_new := board_create_room();  -- checks she isn't in another game; makes her the host
  update board_rooms set rematch_room_id = v_new, version = version + 1 where id = p_room;

  -- invite the others from this game who haven't said they're done (they may have left the finish screen)
  insert into board_invites (room_id, from_id, to_id)
  select v_new, v_uid, p.user_id from board_room_players p
  where p.room_id = p_room and p.user_id <> v_uid and not p.rematch_done
  on conflict (room_id, to_id) do nothing;

  return v_new;
end;
$$;

revoke execute on function board_rematch(uuid) from public, anon;
grant  execute on function board_rematch(uuid) to authenticated;

-- Same as 0024, plus each player's "done" (rematch_done) for the finish screen's badge.
create or replace function board_room_state(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_room board_rooms;
  v_question jsonb;
  v_last_question jsonb;
  v_rematch jsonb;
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
  if v_room.rematch_room_id is not null then
    -- who's in the next lobby: shown as "wants to play again" on the finish screen
    select jsonb_build_object('id', r.id, 'host_id', r.host_id, 'host_name', board__name(r.host_id), 'status', r.status,
                              'players', coalesce((
                                select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', board__name(p.user_id)) order by p.joined_at)
                                from board_room_players p where p.room_id = r.id and p.status = 'joined'), '[]'::jsonb))
    into v_rematch
    from board_rooms r where r.id = v_room.rematch_room_id;
  end if;

  return jsonb_build_object(
    'id', v_room.id, 'host_id', v_room.host_id, 'invite_code', v_room.invite_code, 'layout_id', v_room.layout_id,
    'status', v_room.status, 'turn_user', v_room.turn_user, 'phase', v_room.phase, 'pending', v_room.pending,
    'deadline', v_room.deadline, 'last_event', v_room.last_event, 'winner_id', v_room.winner_id,
    'version', v_room.version, 'now', now(), 'me', auth.uid(),
    'question', v_question, 'last_question', v_last_question, 'rematch', v_rematch,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', p.user_id, 'name', board__name(p.user_id), 'seat', p.seat, 'order_roll', p.order_roll,
               'position', p.position, 'status', p.status, 'answered', p.answered, 'correct', p.correct,
               'rematch_done', p.rematch_done)
             order by p.seat nulls last, p.joined_at)
      from board_room_players p where p.room_id = p_room), '[]'::jsonb),
    'invited', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', i.to_id, 'name', board__name(i.to_id)))
      from board_invites i where i.room_id = p_room and board__invite_active(i.status, i.created_at)), '[]'::jsonb)
  );
end;
$$;

revoke execute on function board_room_state(uuid) from public, anon;
grant  execute on function board_room_state(uuid) to authenticated;
