// Last Card with classmates, live (PROJECT_PLAN.md §15 step 2). Pure logic, no database or React here:
// the Edge Function `cards-game` runs it on the server (so nobody can cheat or see other hands), and the tests run it here.
//
// It wraps the solo game (lib/cards.ts, the same rules) with what a live table needs:
// - seats: up to 4 people, computer players (Easy) fill the rest; a person who leaves or misses 3 turns in a row
//   is replaced by a computer player that keeps their cards
// - the question up now (with its answer, kept on the server) and the last answer (the reveal everyone sees)
// - a 90-second clock for the person whose turn it is
// - each person's own score in this game
// - what each person may see (their own cards; the others only as counts; no answer until it's revealed)
import { BOT_NAMES, botTurn, canPlay, chooseSubject, drawForTurn, endWithEveryoneGone, isHumanTurn, newCardGame, passDrawn, passTimedOutTurn, questionNeeded, setPendingQuestion, startPlay, answerDraw2, answerPlay, type Card, type CardEvent, type CardGame, type CardSubject } from './cards'
import type { SubjectTally } from './board'
import type { RandomFn } from './quiz'

export const LIVE_SEATS = 4
export const TURN_SECONDS = 90
/** Missed turns in a row before a person is replaced by a computer player (Board Review uses 2). */
export const MISSES_BEFORE_REMOVED = 3

export type LiveSeat = {
  /** the person in this seat; null = a computer player from the start */
  userId: string | null
  name: string
  /** missed turns in a row (reset by any move of theirs) */
  missed: number
  /** a person who left or missed 3 turns in a row: a computer player plays their cards now */
  gone: boolean
}

export type LiveStats = { answered: number; correct: number; drawnForMistakes: number; bySubject: Record<string, SubjectTally> }

/** A question on the server: everything, including the answer. */
export type LiveQuestion = {
  id: string
  stem: string
  choices: string[]
  correctIndex: number
  explanation: string | null
  choiceNotes: string[] | null
  topicId: number
  subjectCode: string
}

export type LiveReveal = { seat: number; question: LiveQuestion; selected: number; correct: boolean; move: number }

export type LiveGame = {
  version: 1
  game: CardGame
  seats: LiveSeat[]
  stats: LiveStats[]
  /** the question up now, for the person whose turn it is (null when none) */
  question: LiveQuestion | null
  /** the last answer, with the right one, for everyone to see */
  reveal: LiveReveal | null
  /** when the person whose turn it is runs out of time (ISO); null on a computer turn or when it's over */
  deadline: string | null
}

const emptyStats = (): LiveStats => ({ answered: 0, correct: 0, drawnForMistakes: 0, bySubject: {} })
const plusSeconds = (now: Date, seconds: number) => new Date(now.getTime() + seconds * 1000).toISOString()
const peopleLeft = (live: LiveGame) => live.seats.some((s) => s.userId !== null && !s.gone)

/**
 * Seats the people (in the order they joined), fills the empty seats with computer players, deals, and plays any
 * computer turns until it's a person's turn. The first player is seat 0 (the host).
 */
export function newLiveGame(people: readonly { userId: string; name: string }[], random: RandomFn, now: Date): LiveGame {
  const seats: LiveSeat[] = []
  people.slice(0, LIVE_SEATS).forEach((p) => seats.push({ userId: p.userId, name: p.name, missed: 0, gone: false }))
  const botNames = BOT_NAMES.filter((n) => !seats.some((s) => s.name === n))
  for (let i = 0; seats.length < LIVE_SEATS; i++) seats.push({ userId: null, name: botNames[i] ?? `Computer ${i + 1}`, missed: 0, gone: false })

  // newCardGame seats "You" + the names given; then each seat gets its real name, and only people are isHuman.
  const dealt = newCardGame(random, now, seats.slice(1).map((s) => s.name))
  const game = { ...dealt, players: dealt.players.map((p, i) => ({ ...p, name: seats[i].name, isHuman: seats[i].userId !== null })) }
  return settle({ version: 1, game, seats, stats: seats.map(emptyStats), question: null, reveal: null, deadline: null }, null, random, now)
}

/**
 * After any change: plays the computer players' turns until it's a person's turn (or the game ends), ends a game
 * nobody is playing any more, and starts a new clock when the turn (or the move) changed since `before` (the game as
 * it was before this change; null for a brand-new game).
 * Their turns happen in one go on the server; each one is in the move log, so screens can show them one by one.
 */
function settle(live: LiveGame, before: CardGame | null, random: RandomFn, now: Date): LiveGame {
  let game = live.game
  if (!peopleLeft(live)) game = endWithEveryoneGone(game)
  for (let guard = 0; guard < 200 && !game.finished && !isHumanTurn(game); guard++) game = botTurn(game, random)
  const changed = before === null || game.turn !== before.turn || game.moveCount !== before.moveCount
  return { ...live, game, deadline: game.finished ? null : changed || live.deadline === null ? plusSeconds(now, TURN_SECONDS) : live.deadline }
}

// ---------- A person's move ----------

export type LiveAction = { kind: 'play'; cardId: string } | { kind: 'draw' } | { kind: 'keep' } | { kind: 'choose'; subject: CardSubject }

/** What the server must do next: show a question for this, or nothing. */
export type QuestionNeed = { kind: 'subject'; subject: CardSubject } | { kind: 'weakest' } | null

export type LiveResult = { ok: true; live: LiveGame; need: QuestionNeed } | { ok: false; error: string }

/**
 * The question the server has to show now, if any: it's a person's turn, nothing is up yet, and they are waiting on
 * one (a card they picked, a Draw 2 played on them). Check it after EVERY change (a computer player can play a
 * Draw 2 on a person during its turn).
 */
export function liveNeed(live: LiveGame): QuestionNeed {
  if (live.question || !isHumanTurn(live.game)) return null
  return questionNeeded(live.game)
}

/** The seat of this person, or -1 if they aren't playing (never were, or are gone). */
export function seatOf(live: LiveGame, userId: string): number {
  return live.seats.findIndex((s) => s.userId === userId && !s.gone)
}

/** The checks every move starts with: the game is on, it's this person's turn. */
function checkTurn(live: LiveGame, userId: string): number | string {
  if (live.game.finished) return 'The game is over.'
  const seat = seatOf(live, userId)
  if (seat === -1) return 'You’re not playing in this game.'
  if (live.game.turn !== seat) return 'It’s not your turn.'
  return seat
}

/**
 * A person plays (picks a card and opens its question), draws, keeps a drawn card, or picks a subject after a Wild.
 * `need` says when a question has to be shown next (the server picks it, then calls withQuestion).
 */
export function liveAct(live: LiveGame, userId: string, action: LiveAction, random: RandomFn, now: Date): LiveResult {
  const seat = checkTurn(live, userId)
  if (typeof seat === 'string') return { ok: false, error: seat }
  if (live.question) return { ok: false, error: 'Answer the question first.' }
  const before = live.game
  let game = before
  if (action.kind === 'play') {
    const card = before.players[seat].hand.find((c) => c.id === action.cardId)
    if (!card || !canPlay(card, before)) return { ok: false, error: 'That card doesn’t fit.' }
    game = startPlay(before, action.cardId)
  } else if (action.kind === 'draw') game = drawForTurn(before, random)
  else if (action.kind === 'keep') game = passDrawn(before)
  else game = chooseSubject(before, action.subject)
  if (game === before) return { ok: false, error: 'You can’t do that right now.' }

  const seats = live.seats.map((s, i) => (i === seat ? { ...s, missed: 0 } : s))
  const next = settle({ ...live, game, seats }, before, random, now)
  return { ok: true, live: next, need: liveNeed(next) }
}

/** The server picked the question for what the person whose turn it is is waiting on: it goes up, with a fresh clock. */
export function withQuestion(live: LiveGame, question: LiveQuestion, now: Date): LiveGame {
  return { ...live, game: setPendingQuestion(live.game, question.id), question, deadline: plusSeconds(now, TURN_SECONDS) }
}

export type LiveAnswerResult =
  | { ok: true; live: LiveGame; need: QuestionNeed; attempt: { userId: string; questionId: string; selectedIndex: number; isCorrect: boolean } }
  | { ok: false; error: string }

/** A person answers the question up now (the card's, or a Draw 2's). Everyone then sees the reveal. */
export function liveAnswer(live: LiveGame, userId: string, selectedIndex: number, random: RandomFn, now: Date): LiveAnswerResult {
  const seat = checkTurn(live, userId)
  if (typeof seat === 'string') return { ok: false, error: seat }
  const question = live.question
  if (!question) return { ok: false, error: 'There’s no question to answer.' }
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.choices.length) return { ok: false, error: 'Pick one of the choices.' }

  const isCorrect = selectedIndex === question.correctIndex
  const answer = { questionId: question.id, subjectCode: question.subjectCode, isCorrect }
  const before = live.game
  const game = before.pending?.kind === 'draw2' ? answerDraw2(before, answer, random) : answerPlay(before, answer, random)
  if (game === before) return { ok: false, error: 'You can’t answer right now.' }

  const mine = live.stats[seat]
  const tally = mine.bySubject[question.subjectCode] ?? { answered: 0, correct: 0 }
  const drewNow = isCorrect ? 0 : 1
  const stats = live.stats.map((s, i) =>
    i === seat
      ? {
          answered: s.answered + 1,
          correct: s.correct + (isCorrect ? 1 : 0),
          drawnForMistakes: s.drawnForMistakes + drewNow,
          bySubject: { ...mine.bySubject, [question.subjectCode]: { answered: tally.answered + 1, correct: tally.correct + (isCorrect ? 1 : 0) } },
        }
      : s,
  )
  const seats = live.seats.map((s, i) => (i === seat ? { ...s, missed: 0 } : s))
  const reveal: LiveReveal = { seat, question, selected: selectedIndex, correct: isCorrect, move: game.moveCount ?? 0 }
  const next = settle({ ...live, game, seats, stats, question: null, reveal }, before, random, now)
  return {
    ok: true,
    live: next,
    need: liveNeed(next),
    attempt: { userId, questionId: question.id, selectedIndex, isCorrect },
  }
}

/**
 * Anyone may call this once the clock has run out: the person whose turn it was draws (see passTimedOutTurn) and the
 * turn passes. After 3 missed turns in a row a computer player takes their seat (and their cards).
 * Returns null when there's nothing to do (time isn't up, or it's not a person's turn).
 */
export function liveTimeout(live: LiveGame, random: RandomFn, now: Date): LiveGame | null {
  if (live.game.finished || !isHumanTurn(live.game) || !live.deadline || now.getTime() <= Date.parse(live.deadline)) return null
  const seat = live.game.turn
  const missed = live.seats[seat].missed + 1
  const gone = missed >= MISSES_BEFORE_REMOVED
  const seats = live.seats.map((s, i) => (i === seat ? { ...s, missed, gone } : s))
  let game = passTimedOutTurn(live.game, random)
  if (gone) game = handToComputer(game, seat)
  return settle({ ...live, game, seats, question: null }, live.game, random, now)
}

/** A person leaves the game (Exit): a computer player takes their seat and cards. */
export function liveLeave(live: LiveGame, userId: string, random: RandomFn, now: Date): LiveGame {
  const seat = seatOf(live, userId)
  if (seat === -1 || live.game.finished) return live
  const seats = live.seats.map((s, i) => (i === seat ? { ...s, gone: true } : s))
  let game = handToComputer(live.game, seat)
  // Leaving in the middle of their own question: it ends like a timeout (no answer saved).
  let question = live.question
  if (live.game.turn === seat && live.game.pending) {
    game = { ...game, pending: null }
    question = null
  }
  return settle({ ...live, game, seats, question }, live.game, random, now)
}

function handToComputer(game: CardGame, seat: number): CardGame {
  return { ...game, players: game.players.map((p, i) => (i === seat ? { ...p, isHuman: false } : p)) }
}

// ---------- What each person sees ----------

/** The question as everyone sees it while it's up: no answer, no notes, no explanation. */
export type LiveQuestionView = { id: string; stem: string; choices: string[]; subjectCode: string; topicId: number; seat: number }

export type LiveView = {
  /** this person's seat (-1: watching only, e.g. they left) */
  seat: number
  /**
   * The seat this person played in, even after leaving (-1: never played). Their score on the finish screen comes
   * from it. Missing in views saved before 2026-11-13: use `seat`.
   */
  playedSeat?: number
  /** `userId` is null for computer players (it matches the room's players, for the "Playing again" badges) */
  seats: { name: string; isComputer: boolean; gone: boolean; cards: number; userId?: string | null }[]
  /** this person's own cards; nobody else's */
  hand: Card[]
  drawPileCount: number
  /** the top of the pile and the two cards under it (what the table shows) */
  discard: Card[]
  subject: CardSubject
  direction: 1 | -1
  turn: number
  /** what the person whose turn it is is in the middle of (the card is shown: they're playing it) */
  pending: CardGame['pending']
  question: LiveQuestionView | null
  reveal: LiveReveal | null
  deadline: string | null
  log: CardEvent[]
  moveCount: number
  finished: boolean
  winner: number | null
  endReason: CardGame['endReason']
  /** everyone's score in this game (shown on the finish screen) */
  stats: LiveStats[]
}

export function liveView(live: LiveGame, userId: string): LiveView {
  // Someone who left (or was replaced after 3 missed turns) only watches: no seat, no cards.
  const seat = seatOf(live, userId)
  const g = live.game
  const q = live.question
  return {
    seat,
    playedSeat: live.seats.findIndex((s) => s.userId === userId),
    seats: live.seats.map((s, i) => ({
      name: s.name,
      isComputer: s.userId === null || s.gone,
      gone: s.gone,
      cards: g.players[i].hand.length,
      userId: s.userId,
    })),
    hand: seat === -1 ? [] : g.players[seat].hand,
    drawPileCount: g.drawPile.length,
    discard: g.discard.slice(-3),
    subject: g.subject,
    direction: g.direction,
    turn: g.turn,
    pending: g.pending,
    question: q ? { id: q.id, stem: q.stem, choices: q.choices, subjectCode: q.subjectCode, topicId: q.topicId, seat: g.turn } : null,
    reveal: live.reveal,
    deadline: live.deadline,
    log: g.log,
    moveCount: g.moveCount ?? 0,
    finished: g.finished,
    winner: g.winner,
    endReason: g.endReason,
    stats: live.stats,
  }
}
