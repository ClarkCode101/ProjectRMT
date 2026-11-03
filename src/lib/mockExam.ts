// Mock exam logic (PROJECT_PLAN.md §3 and §6).
// Pure functions: no Supabase or React here, so it is easy to unit test.
import { PASSING_RATE, shuffle, type RandomFn } from './quiz'

/** Item counts she can choose. 100 = one full subject on the board exam. */
export const MOCK_ITEM_COUNTS = [25, 50, 100] as const

/**
 * Time per item: 72 seconds, so 100 items take 2 hours.
 * Check this against the latest PRC / Board of Medical Technology exam program and change it here if needed.
 */
export const SECONDS_PER_ITEM = 72

/** Last few minutes: the timer turns red. */
export const LOW_TIME_SEC = 5 * 60

export function timeLimitSec(itemCount: number): number {
  return Math.max(0, itemCount) * SECONDS_PER_ITEM
}

/** 7265 → "2:01:05", 125 → "2:05", negative → "0:00". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = String(s % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * Picks the exam's questions, spread evenly across topics (PROJECT_PLAN.md §6),
 * so one big topic or one big upload can't fill the whole exam.
 * Takes one question from each topic in turn (in a random topic order), then the result is shuffled.
 */
export function buildMockExam<Q extends { id: string; topic_id: number }>(candidates: readonly Q[], count: number, random: RandomFn = Math.random): Q[] {
  const byTopic = new Map<number, Q[]>()
  for (const q of new Map(candidates.map((c) => [c.id, c])).values()) {
    const list = byTopic.get(q.topic_id) ?? []
    list.push(q)
    byTopic.set(q.topic_id, list)
  }
  const queues = shuffle([...byTopic.values()], random).map((list) => shuffle(list, random))

  const picked: Q[] = []
  const wanted = Math.max(0, count)
  while (picked.length < wanted && queues.some((q) => q.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next) picked.push(next)
      if (picked.length === wanted) break
    }
  }
  return shuffle(picked, random)
}

export type TopicScore = { topicId: number; correct: number; total: number }

export type MockScore = {
  total: number
  answered: number
  correct: number
  /** correct ÷ total; unanswered items count as wrong, like the real exam */
  rate: number
  passed: boolean
  /** weakest topic first */
  byTopic: TopicScore[]
}

/** `answers[i]` = the ORIGINAL index of the choice picked for questions[i], or null if left blank. */
export function scoreMock(questions: readonly { topic_id: number; correct_index: number }[], answers: readonly (number | null)[]): MockScore {
  const topics = new Map<number, TopicScore>()
  let correct = 0
  let answered = 0
  questions.forEach((q, i) => {
    const answer = answers[i] ?? null
    const isCorrect = answer !== null && answer === q.correct_index
    if (answer !== null) answered++
    if (isCorrect) correct++
    const topic = topics.get(q.topic_id) ?? { topicId: q.topic_id, correct: 0, total: 0 }
    topic.total++
    if (isCorrect) topic.correct++
    topics.set(q.topic_id, topic)
  })
  const total = questions.length
  const rate = total > 0 ? correct / total : 0
  return {
    total,
    answered,
    correct,
    rate,
    passed: total > 0 && rate >= PASSING_RATE,
    byTopic: [...topics.values()].sort((a, b) => a.correct / a.total - b.correct / b.total),
  }
}

// ---------- Saving an exam in progress (on this device), so a refresh or a closed tab doesn't lose it ----------

export const SAVED_MOCK_KEY = 'projectrmt:mock-exam'

export type SavedMock = {
  version: 1
  sessionId: string
  /** e.g. "MICRO" or "All subjects", shown on the Resume card */
  label: string
  questionIds: string[]
  /** orders[i][displayPosition] = original choice index */
  orders: number[][]
  answers: (number | null)[]
  flags: boolean[]
  current: number
  /** ms since 1970 */
  startedAt: number
  limitSec: number
}

const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n))

/** Reads a saved exam back. Anything missing or broken → null (start fresh instead of crashing). */
export function parseSavedMock(raw: unknown): SavedMock | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  const n = Array.isArray(m.questionIds) ? m.questionIds.length : -1
  const ok =
    m.version === 1 &&
    typeof m.sessionId === 'string' &&
    typeof m.label === 'string' &&
    n > 0 &&
    (m.questionIds as unknown[]).every((id) => typeof id === 'string') &&
    Array.isArray(m.orders) &&
    m.orders.length === n &&
    m.orders.every(isIntArray) &&
    Array.isArray(m.answers) &&
    m.answers.length === n &&
    m.answers.every((a) => a === null || Number.isInteger(a)) &&
    Array.isArray(m.flags) &&
    m.flags.length === n &&
    m.flags.every((f) => typeof f === 'boolean') &&
    Number.isInteger(m.current) &&
    (m.current as number) >= 0 &&
    (m.current as number) < n &&
    typeof m.startedAt === 'number' &&
    typeof m.limitSec === 'number' &&
    m.limitSec > 0
  return ok ? (m as unknown as SavedMock) : null
}

/** Seconds left on the clock (never below 0). */
export function secondsLeft(exam: { startedAt: number; limitSec: number }, now: number): number {
  return Math.max(0, exam.limitSec - Math.floor((now - exam.startedAt) / 1000))
}
