// Smart anti-repeat selection (PROJECT_PLAN.md §6).
// Pure logic: no Supabase or React here, so it is easy to unit test.
import { shuffle, type RandomFn } from './quiz'

/** from_game: answered in Board Review or Last Card (left out of Review again, see GAME_MODES in quiz.ts) */
export type HistoryAttempt = { question_id: string; is_correct: boolean; created_at: string | null; from_game?: boolean }

/** What she has done with one question so far. Times are in milliseconds. */
export type QuestionHistory = {
  seen: number
  wrong: number
  lastSeenAt: number
  /** null when she has never gotten it wrong */
  lastWrongAt: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Random extra points so questions with similar scores come out in a different order each time. */
const JITTER = 10

function timeOf(createdAt: string | null): number {
  const time = createdAt ? Date.parse(createdAt) : NaN
  return Number.isNaN(time) ? 0 : time // unknown date: treat as very old
}

/** Groups her attempts by question. */
export function buildHistory(attempts: readonly HistoryAttempt[]): Map<string, QuestionHistory> {
  const history = new Map<string, QuestionHistory>()
  for (const attempt of attempts) {
    const time = timeOf(attempt.created_at)
    const entry = history.get(attempt.question_id) ?? { seen: 0, wrong: 0, lastSeenAt: 0, lastWrongAt: null }
    entry.seen++
    entry.lastSeenAt = Math.max(entry.lastSeenAt, time)
    if (!attempt.is_correct) {
      entry.wrong++
      entry.lastWrongAt = Math.max(entry.lastWrongAt ?? 0, time)
    }
    history.set(attempt.question_id, entry)
  }
  return history
}

/**
 * How much a question should be shown next. Higher = sooner.
 * - Never seen: 100
 * - Got it wrong before: 40–90. A bigger share of wrong answers and a more recent mistake push it up.
 * - Always correct: 5–15. It slowly climbs the longer she hasn't seen it, so old ones come back eventually.
 */
export function priorityScore(history: QuestionHistory | undefined, now: number): number {
  if (!history || history.seen === 0) return 100

  if (history.lastWrongAt !== null) {
    const wrongShare = history.wrong / history.seen
    const daysSinceWrong = Math.max(0, (now - history.lastWrongAt) / DAY_MS)
    const recency = 1 / (1 + daysSinceWrong / 7) // 1 today, 0.5 after a week, 0.25 after three weeks
    return 40 + 30 * wrongShare + 20 * recency
  }

  const daysSinceSeen = Math.max(0, (now - history.lastSeenAt) / DAY_MS)
  return 5 + Math.min(10, daysSinceSeen / 3)
}

/**
 * Picks `count` questions for a session:
 * the highest priority ones first, never the same question twice,
 * then shuffled so the new ones and the old mistakes are mixed together.
 */
export function pickQuestions<Q extends { id: string }>(
  candidates: readonly Q[],
  history: ReadonlyMap<string, QuestionHistory>,
  count: number,
  { now = Date.now(), random = Math.random }: { now?: number; random?: RandomFn } = {},
): Q[] {
  const unique = [...new Map(candidates.map((q) => [q.id, q])).values()]
  const ranked = unique
    .map((question) => ({ question, score: priorityScore(history.get(question.id), now) + random() * JITTER }))
    .sort((a, b) => b.score - a.score)
  return shuffle(
    ranked.slice(0, Math.max(0, count)).map((r) => r.question),
    random,
  )
}

export type SessionMix = { fresh: number; review: number; repeat: number }

/**
 * What a session of `count` items will contain, following the same order pickQuestions uses:
 * new questions first, then ones she got wrong before, then ones she always got right.
 */
export function sessionMix(candidates: readonly { id: string }[], history: ReadonlyMap<string, QuestionHistory>, count: number): SessionMix {
  const ids = new Set(candidates.map((q) => q.id))
  let unseen = 0
  let wrongBefore = 0
  for (const id of ids) {
    const h = history.get(id)
    if (!h || h.seen === 0) unseen++
    else if (h.lastWrongAt !== null) wrongBefore++
  }
  const total = Math.min(Math.max(0, count), ids.size)
  const fresh = Math.min(unseen, total)
  const review = Math.min(wrongBefore, total - fresh)
  return { fresh, review, repeat: total - fresh - review }
}

/** How many of these questions she has never answered. */
export function countUnseen(candidates: readonly { id: string }[], history: ReadonlyMap<string, QuestionHistory>): number {
  return new Set(candidates.map((q) => q.id).filter((id) => !history.has(id))).size
}
