// Mock exam logic (PROJECT_PLAN.md §3 and §6).
// Pure functions: no Supabase or React here, so it is easy to unit test.
import { PASSING_RATE, shuffle, type RandomFn } from './quiz'

/** Item counts she can choose for a mock on one of her books. 100 = one full subject on the board exam. */
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

/** The run's readings beside the score: things Practice can't tell her (pace, blanks, how her flags went). */
export type RunStats = {
  /** average seconds per item (time used ÷ items) */
  paceSec: number
  blank: number
  flagged: number
  /** flagged items that ended up right */
  flaggedRight: number
}

export function runStats(
  questions: readonly { correct_index: number }[],
  answers: readonly (number | null)[],
  flags: readonly boolean[],
  durationSec: number,
): RunStats {
  let blank = 0
  let flagged = 0
  let flaggedRight = 0
  questions.forEach((q, i) => {
    const answer = answers[i] ?? null
    if (answer === null) blank++
    if (flags[i]) {
      flagged++
      if (answer === q.correct_index) flaggedRight++
    }
  })
  const paceSec = questions.length > 0 ? Math.max(0, durationSec) / questions.length : 0
  return { paceSec, blank, flagged, flaggedRight }
}

// ---------- Trend: this mock vs her last one on the same thing ----------

/** What a mock was on, so only like is compared with like (same subject or book, same question source). */
export type MockScope = { source: string; subjectId: number | null; bookId: string | null }

/** A finished mock as saved in quiz_sessions. */
export type PastMock = { id: string; score: number | null; total_items: number | null; filters: unknown; finished_at: string | null }

function scopeOf(filters: unknown): MockScope | null {
  if (typeof filters !== 'object' || filters === null) return null
  const f = filters as Record<string, unknown>
  if (typeof f.source !== 'string') return null
  return {
    source: f.source,
    subjectId: typeof f.subject_id === 'number' ? f.subject_id : null,
    bookId: typeof f.book_id === 'string' ? f.book_id : null,
  }
}

/** Her score on the latest other finished mock with the same scope (0–1), or null if this is the first. */
export function previousMockRate(rows: readonly PastMock[], scope: MockScope, currentId: string): number | null {
  const same = rows
    .filter((r) => r.id !== currentId && r.finished_at !== null && r.score !== null && (r.total_items ?? 0) > 0)
    .filter((r) => {
      const s = scopeOf(r.filters)
      return s !== null && s.source === scope.source && s.subjectId === scope.subjectId && s.bookId === scope.bookId
    })
    .sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))
  const last = same[0]
  return last ? last.score! / last.total_items! : null
}

export type MockTrend = { kind: 'first' } | { kind: 'change'; previousRate: number; /** whole percentage points, as shown */ points: number }

export function mockTrend(rate: number, previousRate: number | null): MockTrend {
  if (previousRate === null) return { kind: 'first' }
  // From the rounded percents she sees, so "58%" vs "50%" always says 8.
  return { kind: 'change', previousRate, points: Math.round(rate * 100) - Math.round(previousRate * 100) }
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
  /** what it's on, for the trend on the results; missing on exams saved before this was added */
  scope?: MockScope
  /** which paper of a Full Board run this is (lib/boardRun.ts); missing on a book's mock */
  paper?: { runId: string; index: number }
}

function isPaperRef(v: unknown): v is { runId: string; index: number } {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return typeof p.runId === 'string' && Number.isInteger(p.index) && (p.index as number) >= 0
}

function isScope(v: unknown): v is MockScope {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.source === 'string' &&
    (s.subjectId === null || Number.isInteger(s.subjectId)) &&
    (s.bookId === null || typeof s.bookId === 'string')
  )
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
  if (!ok) return null
  // A broken scope only costs the trend (a broken paper, the link to its run), so drop it instead of throwing the exam away.
  const { scope, paper, ...rest } = m
  return { ...rest, ...(isScope(scope) && { scope }), ...(isPaperRef(paper) && { paper }) } as unknown as SavedMock
}

/** Seconds left on the clock (never below 0). */
export function secondsLeft(exam: { startedAt: number; limitSec: number }, now: number): number {
  return Math.max(0, exam.limitSec - Math.floor((now - exam.startedAt) / 1000))
}
