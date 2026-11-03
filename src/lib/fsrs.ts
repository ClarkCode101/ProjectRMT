// Flashcards: a small wrapper around ts-fsrs (FSRS spaced repetition, MIT license).
// FSRS decides when each card comes back: right before she would likely forget it.
// Pure logic, no Supabase or React, so it is easy to unit test.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs'
import { shuffle, type RandomFn } from './quiz'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export { Rating, State }
export type { Card, Grade }

/** The four buttons, in order. */
export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]

/** One row of the review_states table (without user_id). */
export type ReviewRow = {
  question_id: string
  due: string
  stability: number | null
  difficulty: number | null
  elapsed_days: number | null
  scheduled_days: number | null
  reps: number | null
  lapses: number | null
  state: number | null
  last_review: string | null
}

/** The FSRS scheduler plus our own hard limit on how far away a card may be put. */
export type Scheduler = { fsrs: FSRS; maxIntervalDays?: number }

/**
 * fuzz = a little randomness in long intervals so cards don't all bunch up on one day (off in tests).
 * maxIntervalDays = the longest a card may be put away (see maxIntervalForExam); none = no limit of ours.
 */
export function makeScheduler(fuzz = true, maxIntervalDays?: number): Scheduler {
  return {
    fsrs: fsrs(generatorParameters({ enable_fuzz: fuzz, ...(maxIntervalDays !== undefined && { maximum_interval: maxIntervalDays }) })),
    maxIntervalDays,
  }
}

/**
 * Keeps a card within the limit. Needed on top of FSRS's own maximum_interval, because FSRS also keeps
 * Hard < Good < Easy at least a day apart and may push Good / Easy a day or two past the maximum.
 */
function withinLimit(card: Card, now: Date, s: Scheduler): Card {
  if (s.maxIntervalDays === undefined) return card
  const latest = now.getTime() + s.maxIntervalDays * DAY
  return card.due.getTime() > latest ? { ...card, due: new Date(latest), scheduled_days: s.maxIntervalDays } : card
}

/**
 * The longest interval allowed so no card comes back AFTER the board exam: at most the day before it.
 * Far from the exam this changes nothing (intervals are shorter anyway); close to it, every card is
 * brought back before exam day. No exam date, or it has passed → no limit (undefined).
 * daysToExam: 0 = today, 1 = tomorrow (from planner.daysUntil).
 */
export function maxIntervalForExam(daysToExam: number | null): number | undefined {
  if (daysToExam === null || daysToExam < 0) return undefined
  return Math.max(1, daysToExam - 1)
}

const scheduler = makeScheduler()

/**
 * A database row → a ts-fsrs card. No row yet = a brand-new card.
 * Note: the table has no learning_steps column, so a card still in its first learning steps
 * starts those short steps again (a few minutes). Everything else is kept.
 */
export function rowToCard(row: ReviewRow | undefined, now: Date): Card {
  if (!row) return createEmptyCard(now)
  const state = row.state ?? State.New
  return {
    due: new Date(row.due),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: row.elapsed_days ?? 0,
    scheduled_days: row.scheduled_days ?? 0,
    learning_steps: 0,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    state: state in State ? (state as State) : State.New,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  }
}

/** A ts-fsrs card → the columns to save. */
export function cardToRow(questionId: string, card: Card): ReviewRow {
  return {
    question_id: questionId,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}

/** The card after she presses Again / Hard / Good / Easy. */
export function review(card: Card, grade: Grade, now: Date, s: Scheduler = scheduler): Card {
  return withinLimit(s.fsrs.next(card, now, grade).card, now, s)
}

/** How long until the card comes back for each button (ms), for the labels under the buttons. */
export function previewIntervals(card: Card, now: Date, s: Scheduler = scheduler): Record<Grade, number> {
  const preview = s.fsrs.repeat(card, now)
  return Object.fromEntries(GRADES.map((g) => [g, withinLimit(preview[g].card, now, s).due.getTime() - now.getTime()])) as Record<Grade, number>
}

/** "1 day" / "9 days" */
const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`

/**
 * Spelled out so "1m" can't be read as a month:
 * 30 s → "<1 min", 10 min → "10 min", 3 h → "3 hours", 4 days → "4 days", 2 months → "2 months", 400 days → "1.1 years".
 */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1 min'
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`
  if (ms < DAY) return count(Math.round(ms / HOUR), 'hour')
  if (ms < 30 * DAY) return count(Math.round(ms / DAY), 'day')
  if (ms < 365 * DAY) return count(Math.round(ms / (30 * DAY)), 'month')
  const years = (ms / (365 * DAY)).toFixed(1).replace(/\.0$/, '')
  return `${years} ${years === '1' ? 'year' : 'years'}`
}

/**
 * Today's deck:
 * - due: cards she has seen whose due time has come, the most overdue first
 * - fresh: up to `newLimit` cards she has never studied, mixed up
 */
export function buildDeck<Q extends { id: string }>(
  questions: readonly Q[],
  states: ReadonlyMap<string, ReviewRow>,
  now: Date,
  newLimit: number,
  random: RandomFn = Math.random,
): { due: Q[]; fresh: Q[] } {
  const unique = [...new Map(questions.map((q) => [q.id, q])).values()]
  const due = unique
    .filter((q) => {
      const row = states.get(q.id)
      return row !== undefined && new Date(row.due).getTime() <= now.getTime()
    })
    .sort((a, b) => new Date(states.get(a.id)!.due).getTime() - new Date(states.get(b.id)!.due).getTime())
  const fresh = shuffle(
    unique.filter((q) => !states.has(q.id)),
    random,
  ).slice(0, Math.max(0, newLimit))
  return { due, fresh }
}

/** Cards that come back within this time during a session are shown again before it ends (e.g. after "Again"). */
export const LEARN_AHEAD_MS = 20 * MINUTE

/** How many of these saved cards come due between now and the end of tomorrow (for the "done" screen). */
export function dueByTomorrow(states: Iterable<ReviewRow>, now: Date): number {
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime()
  let count = 0
  for (const row of states) if (new Date(row.due).getTime() < endOfTomorrow) count++
  return count
}
