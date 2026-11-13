// cards-game: runs Last Card games with classmates on the server (PROJECT_PLAN.md §15 step 2, migration 0042).
//
// The app calls it with the player's login: { action, roomId, ... }. It never trusts the app with the game:
// it reads the whole game (every hand, the answer to the question up now) with the server key, applies the move
// with the SAME rules as the solo game (rules.js, built from src/lib/cardsLive.ts by `npm run build:cards-rules`),
// picks the next question when one is needed, and saves the game plus what each player may see (card_views,
// which Realtime sends to each player). Two moves at once: the second save is refused ("conflict"), so it reads the
// game again and tries once more.
//
// Actions:
//   start    the host starts the lobby (computer players fill the empty seats)
//   play     pick a card that fits (its question comes up)      { cardId }
//   draw     draw a card (only when nothing fits)
//   keep     keep the card just drawn
//   choose   pick the next subject after a right Wild           { subject }
//   answer   answer the question up now                         { selectedIndex }
//   timeout  anyone in the room, once the 90-second clock has run out
//   leave    leave the game (a computer player takes the seat)
//   dev      DEV ONLY (npm run dev's panel): test shortcuts { op, devKey }; refused without the dev key (VITE_DEV_KEY,
//            matching board_dev_keys) unless the account is in board_dev_testers. op "answer" only reads the answer.
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are filled in by Supabase itself.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import * as rules from './rules.js'

type LiveGame = ReturnType<typeof rules.newLiveGame>

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const SUBJECTS = ['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE']
const MAX_TRIES = 3

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

/** A message the player can read (the app shows it as is). */
class PlayerError extends Error {}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Use POST.' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const asPlayer = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await asPlayer.auth.getUser()
    const userId = auth.user?.id
    if (!userId) return reply({ error: 'Log in first.' }, 401)

    const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const roomId = typeof body.roomId === 'string' ? body.roomId : ''
    if (!roomId) throw new PlayerError('Which game?')

    const action = String(body.action ?? '')
    if (action === 'start') return reply(await start(server, roomId, userId))

    const now = () => new Date()
    switch (action) {
      case 'play': {
        const cardId = String(body.cardId ?? '')
        return reply(await move(server, roomId, userId, (live) => rules.liveAct(live, userId, { kind: 'play', cardId }, Math.random, now())))
      }
      case 'draw':
        return reply(await move(server, roomId, userId, (live) => rules.liveAct(live, userId, { kind: 'draw' }, Math.random, now())))
      case 'keep':
        return reply(await move(server, roomId, userId, (live) => rules.liveAct(live, userId, { kind: 'keep' }, Math.random, now())))
      case 'choose': {
        const subject = String(body.subject ?? '')
        if (!SUBJECTS.includes(subject)) throw new PlayerError('Pick one of the six subjects.')
        return reply(await move(server, roomId, userId, (live) => rules.liveAct(live, userId, { kind: 'choose', subject }, Math.random, now())))
      }
      case 'answer': {
        const selectedIndex = Number(body.selectedIndex)
        return reply(await move(server, roomId, userId, (live) => rules.liveAnswer(live, userId, selectedIndex, Math.random, now())))
      }
      case 'timeout':
        return reply(
          await move(server, roomId, userId, (live) => {
            const next = rules.liveTimeout(live, Math.random, now())
            return next ? { ok: true, live: next } : null // not time yet (or someone already passed it on): nothing to do
          }),
        )
      case 'leave':
        return reply(await move(server, roomId, userId, (live) => ({ ok: true, live: rules.liveLeave(live, userId, Math.random, now()) })))
      case 'dev': {
        await checkDevKey(server, userId, body.devKey)
        const op = String(body.op ?? '')
        if (op === 'answer') return reply(await devAnswer(server, roomId, userId))
        if (!(rules.LIVE_DEV_OPS as readonly string[]).includes(op)) throw new PlayerError('Unknown DEV action.')
        return reply(await move(server, roomId, userId, (live) => rules.liveDev(live, userId, op as (typeof rules.LIVE_DEV_OPS)[number], now())))
      }
      default:
        throw new PlayerError('Unknown action.')
    }
  } catch (error) {
    if (error instanceof PlayerError) return reply({ error: error.message }, 400)
    console.error(error)
    return reply({ error: 'Something went wrong. Try again.' }, 500)
  }
})

// ---------- Start ----------

/** First name from Settings (like board__name), or "A classmate". */
async function nameOf(server: SupabaseClient, userId: string): Promise<string> {
  const { data } = await server.auth.admin.getUserById(userId)
  const first = String(data.user?.user_metadata?.first_name ?? '').trim().slice(0, 40)
  return first || 'A classmate'
}

async function start(server: SupabaseClient, roomId: string, userId: string) {
  const { data: room } = await server.from('board_rooms').select('id, game, status, host_id').eq('id', roomId).maybeSingle()
  if (!room || room.game !== 'cards') throw new PlayerError('That isn’t a Last Card game.')
  if (room.host_id !== userId) throw new PlayerError('Only the host can start the game.')
  if (room.status !== 'lobby') throw new PlayerError('The game has already started.')
  const { data: players } = await server
    .from('board_room_players')
    .select('user_id, joined_at')
    .eq('room_id', roomId)
    .eq('status', 'joined')
    .order('joined_at')
  // The host sits first (and goes first); the others in the order they joined.
  const ids = (players ?? []).map((p) => p.user_id as string).sort((a, b) => (a === userId ? -1 : b === userId ? 1 : 0))
  if (ids.length < 2) throw new PlayerError('You need at least 2 players. Invite a classmate first.')
  const people = await Promise.all(ids.map(async (id) => ({ userId: id, name: await nameOf(server, id) })))

  const live = await withQuestions(server, rules.newLiveGame(people, Math.random, new Date()))
  const { error } = await server.rpc('cards__begin', {
    p_room: roomId,
    p_host: userId,
    p_people: ids,
    p_state: live,
    p_views: viewsFor(live),
    p_turn_user: turnUser(live),
  })
  if (error) throw new PlayerError(error.message)
  return { view: rules.liveView(live, userId) }
}

// ---------- A move ----------

type Outcome = { ok: true; live: LiveGame; attempt?: { userId: string; questionId: string; selectedIndex: number; isCorrect: boolean } } | { ok: false; error: string } | null

async function move(server: SupabaseClient, roomId: string, userId: string, apply: (live: LiveGame) => Outcome) {
  const { data: member } = await server.from('board_room_players').select('user_id').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
  if (!member) throw new PlayerError('You’re not in this game.')

  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const { data: row } = await server.from('card_games').select('state, version').eq('room_id', roomId).maybeSingle()
    if (!row) throw new PlayerError('This game hasn’t started.')
    const before = row.state as LiveGame
    const outcome = apply(before)
    if (outcome === null) return { view: rules.liveView(before, userId) }
    if (!outcome.ok) throw new PlayerError(outcome.error)

    const live = await withQuestions(server, outcome.live)
    const attempt = outcome.attempt
    const { error } = await server.rpc('cards__save', {
      p_room: roomId,
      p_expected: row.version,
      p_state: live,
      p_views: viewsFor(live),
      p_turn_user: turnUser(live),
      p_attempt: attempt
        ? { user_id: attempt.userId, question_id: attempt.questionId, selected_index: attempt.selectedIndex, is_correct: attempt.isCorrect }
        : null,
      p_scores: live.seats.flatMap((s, i) => (s.userId ? [{ user_id: s.userId, answered: live.stats[i].answered, correct: live.stats[i].correct }] : [])),
      p_gone: live.seats.flatMap((s) => (s.userId && s.gone ? [s.userId] : [])),
      p_finished: live.game.finished,
    })
    if (!error) return { view: rules.liveView(live, userId) }
    if (!String(error.message).includes('conflict')) throw error
    // Someone else's move was saved first: read the game again and try this move on top of it.
  }
  throw new PlayerError('Lots happening at once. Try again.')
}

// ---------- DEV ----------

/** DEV actions only with the dev key (as board_dev_finish, migration 0027), or for accounts in board_dev_testers. */
async function checkDevKey(server: SupabaseClient, userId: string, key: unknown) {
  const { data: tester } = await server.from('board_dev_testers').select('user_id').eq('user_id', userId).maybeSingle()
  if (tester) return
  if (typeof key === 'string' && key.length >= 24) {
    const { data: match } = await server.from('board_dev_keys').select('key').eq('key', key).maybeSingle()
    if (match) return
  }
  throw new PlayerError('Dev key missing or wrong. Check VITE_DEV_KEY in .env.local and board_dev_keys.')
}

/** DEV: the answer to the question up now, for the dev panel's "Show answers" (nothing is saved). */
async function devAnswer(server: SupabaseClient, roomId: string, userId: string) {
  const { data: member } = await server.from('board_room_players').select('user_id').eq('room_id', roomId).eq('user_id', userId).maybeSingle()
  if (!member) throw new PlayerError('You’re not in this game.')
  const { data: row } = await server.from('card_games').select('state').eq('room_id', roomId).maybeSingle()
  if (!row) throw new PlayerError('This game hasn’t started.')
  const live = row.state as LiveGame
  return { view: rules.liveView(live, userId), devAnswer: rules.liveDevAnswer(live) }
}

// ---------- Helpers ----------

/** Puts up the question the person whose turn it is is waiting on (a computer's Draw 2 can need one, too). */
async function withQuestions(server: SupabaseClient, start: LiveGame): Promise<LiveGame> {
  let live = start
  for (let i = 0; i < 3; i++) {
    const need = rules.liveNeed(live)
    if (!need) return live
    const forUser = live.seats[live.game.turn].userId
    const { data: question, error } = await server.rpc('cards__pick_question', {
      p_used: live.game.usedQuestionIds,
      p_user: forUser,
      p_subject: need.kind === 'subject' ? need.subject : null,
    })
    if (error) throw error
    if (!question) throw new PlayerError('No questions to ask yet.')
    live = rules.withQuestion(live, question, new Date())
  }
  return live
}

/** What each person in the game may see (also the ones who left, so they can see how it ends). */
function viewsFor(live: LiveGame) {
  return live.seats.flatMap((s) => (s.userId ? [{ user_id: s.userId, view: rules.liveView(live, s.userId) }] : []))
}

/** The person whose turn it is (for the red dot on the Games icon); null once it's over. */
function turnUser(live: LiveGame): string | null {
  return live.game.finished ? null : (live.seats[live.game.turn]?.userId ?? null)
}
