// Board Review: a snakes-and-ladders board where she only moves if she answers right (PROJECT_PLAN.md §14).
// Pure logic: no Supabase or React here, so it is easy to unit test.
import type { RandomFn, SubjectSummary } from './quiz'

export const BOARD_SIZE = 60
export const ZONE_SIZE = 10

/** One zone of 10 squares per subject, in exam order: 1–10 CC, 11–20 MICRO, … 51–60 HTMLE. */
export const ZONE_SUBJECTS = ['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE'] as const
export type ZoneSubject = (typeof ZONE_SUBJECTS)[number]

export type Jump = { from: number; to: number }

/**
 * The one hand-made layout. Rules (checked in the tests):
 * nothing on 1 or 60, no square used twice, ladders go up, snakes go down.
 * CC (the first zone) has no snake, so the game starts gently.
 */
export const LADDERS: readonly Jump[] = [
  { from: 4, to: 14 },
  { from: 17, to: 27 },
  { from: 29, to: 38 },
  { from: 33, to: 45 },
  { from: 42, to: 53 },
]
export const SNAKES: readonly Jump[] = [
  { from: 25, to: 12 },
  { from: 36, to: 23 },
  { from: 47, to: 34 },
  { from: 56, to: 43 },
  { from: 59, to: 48 },
]

/** The subject of the zone a square is in (squares below 1 count as 1, above 60 as 60). */
export function zoneOf(square: number): ZoneSubject {
  const clamped = Math.min(BOARD_SIZE, Math.max(1, Math.floor(square)))
  return ZONE_SUBJECTS[Math.floor((clamped - 1) / ZONE_SIZE)]
}

/** A number from 1 to 6. */
export function rollDie(random: RandomFn = Math.random): number {
  return Math.min(6, Math.floor(random() * 6) + 1)
}

/** Where a roll takes her. Going past 60 just finishes (no "exact roll" rule). */
export function moveBy(position: number, steps: number): number {
  return Math.min(BOARD_SIZE, position + steps)
}

export type SquareEffect = { kind: 'ladder'; to: number } | { kind: 'snake'; to: number } | { kind: 'finish' } | { kind: 'none' }

/** What happens when she lands on a square. */
export function squareEffect(square: number): SquareEffect {
  if (square >= BOARD_SIZE) return { kind: 'finish' }
  const ladder = LADDERS.find((l) => l.from === square)
  if (ladder) return { kind: 'ladder', to: ladder.to }
  const snake = SNAKES.find((s) => s.from === square)
  if (snake) return { kind: 'snake', to: snake.to }
  return { kind: 'none' }
}

// ---------- Game state ----------

/**
 * What the current question is for:
 * - move: answer right to walk `roll` squares
 * - ladder: answer right to climb from `from` to `to`
 * - snake: answer right to stay on `from`; wrong slides to `to`
 */
export type Pending =
  | { kind: 'move'; roll: number }
  | { kind: 'ladder'; from: number; to: number }
  | { kind: 'snake'; from: number; to: number }

export type SubjectTally = { answered: number; correct: number }

export type BoardGame = {
  position: number
  /** how many times she rolled */
  turns: number
  answered: number
  correct: number
  laddersClimbed: number
  snakesEscaped: number
  snakesSlid: number
  /** never the same question twice in one game */
  usedQuestionIds: string[]
  /** keyed by subject code (a snake's rescue question can be from any subject) */
  bySubject: Record<string, SubjectTally>
  /** null = waiting for her to roll */
  pending: Pending | null
  finished: boolean
  startedAt: string
}

export function newGame(now: Date = new Date()): BoardGame {
  return {
    position: 1,
    turns: 0,
    answered: 0,
    correct: 0,
    laddersClimbed: 0,
    snakesEscaped: 0,
    snakesSlid: 0,
    usedQuestionIds: [],
    bySubject: {},
    pending: null,
    finished: false,
    startedAt: now.toISOString(),
  }
}

/** She rolled: the next question decides whether she walks. Ignored if a question is already waiting or the game is over. */
export function startTurn(game: BoardGame, roll: number): BoardGame {
  if (game.finished || game.pending) return game
  return { ...game, turns: game.turns + 1, pending: { kind: 'move', roll } }
}

/** After she walks (or climbs) to a square, what's next there: a ladder or snake question, the finish, or the next roll. */
function arriveAt(game: BoardGame, square: number): BoardGame {
  const effect = squareEffect(square)
  if (effect.kind === 'finish') return { ...game, position: square, pending: null, finished: true }
  if (effect.kind === 'ladder' || effect.kind === 'snake') {
    return { ...game, position: square, pending: { kind: effect.kind, from: square, to: effect.to } }
  }
  return { ...game, position: square, pending: null }
}

export type AnswerInput = { questionId: string; subjectCode: string; isCorrect: boolean }

/** She answered the waiting question. Ignored if nothing is waiting. */
export function answerQuestion(game: BoardGame, { questionId, subjectCode, isCorrect }: AnswerInput): BoardGame {
  const pending = game.pending
  if (!pending || game.finished) return game

  const tally = game.bySubject[subjectCode] ?? { answered: 0, correct: 0 }
  const counted: BoardGame = {
    ...game,
    answered: game.answered + 1,
    correct: game.correct + (isCorrect ? 1 : 0),
    usedQuestionIds: game.usedQuestionIds.includes(questionId) ? game.usedQuestionIds : [...game.usedQuestionIds, questionId],
    bySubject: { ...game.bySubject, [subjectCode]: { answered: tally.answered + 1, correct: tally.correct + (isCorrect ? 1 : 0) } },
  }

  switch (pending.kind) {
    case 'move':
      return isCorrect ? arriveAt(counted, moveBy(game.position, pending.roll)) : { ...counted, pending: null }
    case 'ladder':
      // Wrong: she stays at the foot of the ladder, no penalty.
      return isCorrect ? arriveAt({ ...counted, laddersClimbed: counted.laddersClimbed + 1 }, pending.to) : { ...counted, pending: null }
    case 'snake':
      return isCorrect
        ? { ...counted, snakesEscaped: counted.snakesEscaped + 1, pending: null }
        : { ...counted, snakesSlid: counted.snakesSlid + 1, position: pending.to, pending: null }
  }
}

/** The subject the waiting question comes from (a snake's rescue may override this with her weakest topic). */
export function questionSubject(game: BoardGame): ZoneSubject {
  return zoneOf(game.position)
}

// ---------- Picking questions ----------

/** Need at least this many answers in a topic before calling it her weakest. */
export const WEAK_TOPIC_MIN_ATTEMPTS = 3

export type WeakTopic = { subjectCode: string; topicId: number; topicName: string; accuracy: number }

/**
 * Her weakest topic for a snake's rescue question: the lowest accuracy among topics with enough answers,
 * from any subject (more answers wins a tie). null when no topic has enough answers yet.
 */
export function weakestTopic(summary: readonly SubjectSummary[], minAttempts = WEAK_TOPIC_MIN_ATTEMPTS): WeakTopic | null {
  let best: WeakTopic | null = null
  let bestAttempts = 0
  for (const subject of summary) {
    for (const topic of subject.topics) {
      if (topic.attempts < minAttempts) continue
      const lower = best === null || topic.accuracy < best.accuracy || (topic.accuracy === best.accuracy && topic.attempts > bestAttempts)
      if (lower) {
        best = { subjectCode: subject.code, topicId: topic.topicId, topicName: topic.name, accuracy: topic.accuracy }
        bestAttempts = topic.attempts
      }
    }
  }
  return best
}

/** Leaves out questions already used in this game. If that leaves none, all of them come back (better a repeat than no question). */
export function unusedFirst<Q extends { id: string }>(questions: readonly Q[], usedIds: readonly string[]): Q[] {
  const used = new Set(usedIds)
  const fresh = questions.filter((q) => !used.has(q.id))
  return fresh.length > 0 ? fresh : [...questions]
}

/**
 * The questions to pick a ladder's Challenge from, most wanted first:
 * difficulty 3, else ones she got wrong before, else any. (Few difficulty 3 questions exist in
 * MICRO, HTMLE, CM and BBIS, so the fallbacks matter.)
 */
export function challengePool<Q extends { id: string; difficulty: number | null }>(questions: readonly Q[], mistakeIds: ReadonlySet<string>): Q[] {
  const hard = questions.filter((q) => q.difficulty === 3)
  if (hard.length > 0) return hard
  const missed = questions.filter((q) => mistakeIds.has(q.id))
  if (missed.length > 0) return missed
  return [...questions]
}

/**
 * The questions to pick a snake's Rescue from, most wanted first:
 * her weakest topic (any subject), else her latest mistakes, else the zone's questions.
 */
export function rescuePool<Q extends { id: string; topic_id: number }>(
  allQuestions: readonly Q[],
  zoneQuestions: readonly Q[],
  { weakTopicId, mistakeIds }: { weakTopicId: number | null; mistakeIds: ReadonlySet<string> },
): Q[] {
  if (weakTopicId !== null) {
    const weak = allQuestions.filter((q) => q.topic_id === weakTopicId)
    if (weak.length > 0) return weak
  }
  const missed = allQuestions.filter((q) => mistakeIds.has(q.id))
  if (missed.length > 0) return missed
  return [...zoneQuestions]
}

/** Accuracy from 0 to 1, or null when nothing was answered. */
export function tallyAccuracy(tally: SubjectTally | undefined): number | null {
  return tally && tally.answered > 0 ? tally.correct / tally.answered : null
}
