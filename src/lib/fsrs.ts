// Flashcards: a small wrapper around ts-fsrs (FSRS spaced repetition, MIT license).
// FSRS decides when each card comes back: right before she would likely forget it.
// Pure logic, no Supabase or React, so it is easy to unit test.
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs'
import { shuffle, type RandomFn } from './quiz'

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

/** fuzz = a little randomness in long intervals so cards don't all bunch up on one day (off in tests). */
export function makeScheduler(fuzz = true): FSRS {
  return fsrs(generatorParameters({ enable_fuzz: fuzz }))
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
export function review(card: Card, grade: Grade, now: Date, f: FSRS = scheduler): Card {
  return f.next(card, now, grade).card
}

/** How long until the card comes back for each button (ms), for the labels under the buttons. */
export function previewIntervals(card: Card, now: Date, f: FSRS = scheduler): Record<Grade, number> {
  const preview = f.repeat(card, now)
  return Object.fromEntries(GRADES.map((g) => [g, preview[g].card.due.getTime() - now.getTime()])) as Record<Grade, number>
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 30 s → "<1m", 10 min → "10m", 3 h → "3h", 4 days → "4d", 2 months → "2mo", 400 days → "1.1y". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '<1m'
  if (ms < HOUR) return `${Math.round(ms / MINUTE)}m`
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`
  if (ms < 30 * DAY) return `${Math.round(ms / DAY)}d`
  if (ms < 365 * DAY) return `${Math.round(ms / (30 * DAY))}mo`
  return `${(ms / (365 * DAY)).toFixed(1).replace(/\.0$/, '')}y`
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
