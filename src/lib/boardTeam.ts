// Board Review team games (PROJECT_PLAN.md §14, Step 2): reading a room's state from the database
// (board_room_state, migration 0023), the turn clock, token colors, the finish order, and the "what just happened" line.
// Pure logic: no Supabase or React here, so it is easy to unit test.
import type { Json } from './database.types'
import type { Pending } from './board'
import { parseChoiceNotes, parseChoices } from './quiz'

export type TeamPlayerStatus = 'joined' | 'left' | 'removed'
export type TeamPlayer = {
  userId: string
  name: string
  /** turn order, 0 goes first; null in the lobby */
  seat: number | null
  /** the roll that decided the order; null in the lobby */
  orderRoll: number | null
  position: number
  status: TeamPlayerStatus
  answered: number
  correct: number
  /** finished games: tapped Back to Board Review, so not playing again (migration 0025) */
  rematchDone: boolean
}

export type TeamQuestion = { id: string; topicId: number; stem: string; choices: string[] }
/** The last answered question, with its answer (for the reveal). */
export type TeamRevealQuestion = TeamQuestion & { correctIndex: number; explanation: string | null; choiceNotes: string[] | null }

export type TeamEvent =
  | { kind: 'order'; at: string; order: { userId: string; name: string; roll: number; seat: number }[] }
  | { kind: 'roll'; at: string; userId: string; name: string; roll: number }
  | {
      kind: 'answer'
      at: string
      userId: string
      name: string
      purpose: Pending
      questionId: string
      selected: number
      correctIndex: number
      isCorrect: boolean
      from: number
      to: number
    }
  | { kind: 'timeout'; at: string; userId: string; name: string; removed: boolean }
  | { kind: 'left'; at: string; userId: string; name: string }

export type TeamRoomStatus = 'lobby' | 'playing' | 'finished' | 'cancelled'
export type TeamRoom = {
  id: string
  hostId: string
  inviteCode: string
  layoutId: number
  status: TeamRoomStatus
  turnUser: string | null
  phase: 'roll' | 'answer' | null
  pending: Pending | null
  /** when the turn's clock runs out (ISO) */
  deadline: string | null
  lastEvent: TeamEvent | null
  winnerId: string | null
  version: number
  /** the server's clock when this was read (ISO), to correct for a phone whose clock is off */
  serverNow: string
  me: string
  /** the question on screen, without its answer */
  question: TeamQuestion | null
  lastQuestion: TeamRevealQuestion | null
  players: TeamPlayer[]
  /** classmates invited who haven't answered yet */
  invited: { userId: string; name: string }[]
  /** finished games: the next game someone made with "Play again" (migration 0024) */
  rematch: TeamRematch | null
}

export type TeamRematch = {
  roomId: string
  hostId: string
  hostName: string
  status: TeamRoomStatus
  /** who's in the next lobby (they tapped Play again) */
  players: { userId: string; name: string }[]
}

// ---------- Reading the database's answer (anything odd gives a safe default, never a crash) ----------

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : null)
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null)
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parsePending(v: unknown): Pending | null {
  const p = obj(v)
  if (!p) return null
  if (p.kind === 'move') return { kind: 'move', roll: num(p.roll, 1) }
  if (p.kind === 'ladder' || p.kind === 'snake') return { kind: p.kind, from: num(p.from, 1), to: num(p.to, 1) }
  return null
}

function parseQuestion(v: unknown): TeamQuestion | null {
  const q = obj(v)
  if (!q || typeof q.id !== 'string') return null
  const choices = parseChoices((q.choices ?? []) as Json)
  if (choices.length < 2) return null
  return { id: q.id, topicId: num(q.topic_id), stem: str(q.stem), choices }
}

function parseRevealQuestion(v: unknown): TeamRevealQuestion | null {
  const base = parseQuestion(v)
  const q = obj(v)
  if (!base || !q) return null
  return {
    ...base,
    correctIndex: num(q.correct_index, -1),
    explanation: strOrNull(q.explanation),
    choiceNotes: parseChoiceNotes((q.choice_notes ?? null) as Json | null, base.choices.length),
  }
}

export function parseEvent(v: unknown): TeamEvent | null {
  const e = obj(v)
  if (!e) return null
  const at = str(e.at)
  const userId = str(e.user)
  const name = str(e.name, 'A classmate')
  switch (e.kind) {
    case 'order':
      return {
        kind: 'order',
        at,
        order: (Array.isArray(e.order) ? e.order : []).flatMap((o) => {
          const r = obj(o)
          return r ? [{ userId: str(r.user), name: str(r.name, 'A classmate'), roll: num(r.roll, 1), seat: num(r.seat) }] : []
        }),
      }
    case 'roll':
      return { kind: 'roll', at, userId, name, roll: num(e.roll, 1) }
    case 'answer': {
      const purpose = parsePending(e.purpose)
      if (!purpose) return null
      return {
        kind: 'answer',
        at,
        userId,
        name,
        purpose,
        questionId: str(e.question_id),
        selected: num(e.selected, -1),
        correctIndex: num(e.correct_index, -1),
        isCorrect: e.is_correct === true,
        from: num(e.from, 1),
        to: num(e.to, 1),
      }
    }
    case 'timeout':
      return { kind: 'timeout', at, userId, name, removed: e.removed === true }
    case 'left':
      return { kind: 'left', at, userId, name }
    default:
      return null
  }
}

const STATUSES: TeamRoomStatus[] = ['lobby', 'playing', 'finished', 'cancelled']
const PLAYER_STATUSES: TeamPlayerStatus[] = ['joined', 'left', 'removed']

/** The room as the app uses it. null when the database said nothing (not a member, or no such room). */
export function parseTeamRoom(v: unknown): TeamRoom | null {
  const r = obj(v)
  if (!r || typeof r.id !== 'string') return null
  const status = STATUSES.includes(r.status as TeamRoomStatus) ? (r.status as TeamRoomStatus) : 'cancelled'
  const phase = r.phase === 'roll' || r.phase === 'answer' ? r.phase : null
  return {
    id: r.id,
    hostId: str(r.host_id),
    inviteCode: str(r.invite_code),
    layoutId: num(r.layout_id),
    status,
    turnUser: strOrNull(r.turn_user),
    phase,
    pending: parsePending(r.pending),
    deadline: strOrNull(r.deadline),
    lastEvent: parseEvent(r.last_event),
    winnerId: strOrNull(r.winner_id),
    version: num(r.version),
    serverNow: str(r.now, new Date().toISOString()),
    me: str(r.me),
    question: parseQuestion(r.question),
    lastQuestion: parseRevealQuestion(r.last_question),
    players: (Array.isArray(r.players) ? r.players : []).flatMap((p) => {
      const o = obj(p)
      if (!o || typeof o.user_id !== 'string') return []
      return [
        {
          userId: o.user_id,
          name: str(o.name, 'A classmate'),
          seat: numOrNull(o.seat),
          orderRoll: numOrNull(o.order_roll),
          position: Math.min(60, Math.max(1, num(o.position, 1))),
          status: PLAYER_STATUSES.includes(o.status as TeamPlayerStatus) ? (o.status as TeamPlayerStatus) : 'left',
          answered: num(o.answered),
          correct: num(o.correct),
          rematchDone: o.rematch_done === true,
        },
      ]
    }),
    invited: (Array.isArray(r.invited) ? r.invited : []).flatMap((i) => {
      const o = obj(i)
      return o && typeof o.user_id === 'string' ? [{ userId: o.user_id, name: str(o.name, 'A classmate') }] : []
    }),
    rematch: parseRematch(r.rematch),
  }
}

function parseRematch(v: unknown): TeamRematch | null {
  const m = obj(v)
  if (!m || typeof m.id !== 'string') return null
  return {
    roomId: m.id,
    hostId: str(m.host_id),
    hostName: str(m.host_name, 'A classmate'),
    status: STATUSES.includes(m.status as TeamRoomStatus) ? (m.status as TeamRoomStatus) : 'cancelled',
    players: (Array.isArray(m.players) ? m.players : []).flatMap((p) => {
      const o = obj(p)
      return o && typeof o.user_id === 'string' ? [{ userId: o.user_id, name: str(o.name, 'A classmate') }] : []
    }),
  }
}

/** What the finish screen offers for playing again. */
export type RematchChoice =
  /** nobody has tapped Play again yet (or their lobby was cancelled or is over) */
  | { kind: 'start' }
  /** someone made the next lobby: join it in one tap */
  | { kind: 'join'; roomId: string; hostName: string }
  /** she's already in the next lobby (made it, or joined it) */
  | { kind: 'back'; roomId: string }
  /** the next game started without her */
  | { kind: 'started'; hostName: string }

export function rematchChoice(rematch: TeamRematch | null, me: string): RematchChoice {
  if (!rematch || rematch.status === 'cancelled' || rematch.status === 'finished') return { kind: 'start' }
  const inIt = rematch.players.some((p) => p.userId === me)
  if (inIt) return { kind: 'back', roomId: rematch.roomId }
  if (rematch.status === 'playing') return { kind: 'started', hostName: rematch.hostName }
  return { kind: 'join', roomId: rematch.roomId, hostName: rematch.hostName }
}

/** Who tapped Play again (they're in the next lobby): their badge in the standings. Empty once it's over or cancelled. */
export function playingAgainIds(rematch: TeamRematch | null): Set<string> {
  if (!rematch || (rematch.status !== 'lobby' && rematch.status !== 'playing')) return new Set()
  return new Set(rematch.players.map((p) => p.userId))
}

/** "Ana wants to play again", "Ana and Ben want to…", "Ana, Ben and Cy want to…" (others only; null if nobody). */
export function playAgainLine(rematch: TeamRematch | null, me: string): string | null {
  if (!rematch || rematch.status !== 'lobby') return null
  const names = rematch.players.filter((p) => p.userId !== me).map((p) => p.name)
  if (names.length === 0) return null
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${list} ${names.length === 1 ? 'wants' : 'want'} to play again`
}

// ---------- The turn clock ----------

/** Every turn's clock, as shown (the database adds a few seconds of grace on top). */
export const TURN_SECONDS = 90

/**
 * Seconds left on the turn's clock, as a whole number from 0 to 90.
 * `serverNow` and `fetchedAt` correct for a phone whose clock is a bit off: what counts is the server's time.
 */
export function turnSecondsLeft(deadline: string | null, serverNow: string, fetchedAt: number, now: number): number {
  if (!deadline) return 0
  const offset = Date.parse(serverNow) - fetchedAt // server clock minus this phone's clock
  const left = (Date.parse(deadline) - (now + offset)) / 1000
  if (!Number.isFinite(left)) return 0
  return Math.max(0, Math.min(TURN_SECONDS, Math.ceil(left)))
}

/** True once the clock (with the database's grace) has really run out, so the turn can be passed on. */
export function turnExpired(deadline: string | null, serverNow: string, fetchedAt: number, now: number): boolean {
  if (!deadline) return false
  const offset = Date.parse(serverNow) - fetchedAt
  return now + offset > Date.parse(deadline) + 500 // half a second late, so the server agrees it's over
}

/** 75 → "1:15" */
export function formatTurnClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// ---------- Players ----------

/** Token colors, one per seat: gold, purple, green, magenta (from the app's palette; none is the ladders' blue or the snakes' red). */
export const TOKEN_COLORS = ['#E9A23B', '#5E3B9C', '#1E7348', '#9C3A68']

/** A player's color: by seat once the game has started, by join order in the lobby. */
export function playerColor(players: readonly TeamPlayer[], userId: string): string {
  const player = players.find((p) => p.userId === userId)
  const index = player?.seat ?? players.findIndex((p) => p.userId === userId)
  return TOKEN_COLORS[Math.max(0, index) % TOKEN_COLORS.length]
}

/** Players still in the game, in turn order. */
export function turnOrder(players: readonly TeamPlayer[]): TeamPlayer[] {
  return players.filter((p) => p.status === 'joined').sort((a, b) => (a.seat ?? 99) - (b.seat ?? 99))
}

/** The finish order: the winner, then the furthest along (still playing before those who left), then most correct. */
export function finishOrder(players: readonly TeamPlayer[], winnerId: string | null): TeamPlayer[] {
  return [...players].sort(
    (a, b) =>
      Number(b.userId === winnerId) - Number(a.userId === winnerId) ||
      Number(b.status === 'joined') - Number(a.status === 'joined') ||
      b.position - a.position ||
      b.correct - a.correct,
  )
}

/** A short line about what just happened, for the top of the game screen. "You" for the reader herself. */
export function eventLine(event: TeamEvent | null, me: string): string | null {
  if (!event || event.kind === 'order') return null
  const who = event.userId === me ? 'You' : event.name
  switch (event.kind) {
    case 'roll':
      return `${who} rolled ${event.roll}.`
    case 'answer': {
      if (event.purpose.kind === 'ladder') return event.isCorrect ? `${who} climbed a ladder to ${event.to}!` : `${who} missed the ladder.`
      if (event.purpose.kind === 'snake') return event.isCorrect ? `${who} escaped a snake!` : `${who} slid down a snake to ${event.to}.`
      return event.isCorrect ? `${who} answered right and moved to ${event.to}.` : `${who} missed and stays on ${event.from}.`
    }
    case 'timeout':
      return event.removed ? `${who} missed 2 turns and is out of the game.` : `${who} ran out of time.`
    case 'left':
      return `${who} left the game.`
  }
}

/** The link that opens the lobby for a classmate (the share sheet sends it, e.g. to Messenger). */
export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, '')}/board/join/${encodeURIComponent(code)}`
}

/** Game codes are 6 letters/digits (made in board_create_room). */
export const GAME_CODE_LENGTH = 6

/** What she typed in the code box, as a code: capitals, no spaces or dashes, at most 6 characters. */
export function cleanGameCode(typed: string): string {
  return typed
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, GAME_CODE_LENGTH)
}
