// Pure quiz logic: no Supabase or React here, so it is easy to unit test.
import type { Json } from './database.types'

// ---------- The board's passing rule (RA 5527, Sec. 19 "Rating in the Examination"; PROJECT_PLAN.md §2) ----------
// To pass the MTLE she needs ALL three:
//   1. a general average of at least 75%, with each subject weighted (SUBJECT_WEIGHTS),
//   2. no subject below 50%,
//   3. the subjects she "failed" (below 75%) must weigh less than 60% of the exam.

/** A subject counts as passed at 75%, and the general average must reach 75% too. */
export const PASSING_RATE = 0.75
/** Below 50% in ANY subject fails the whole exam, whatever the average. */
export const SUBJECT_FLOOR = 0.5
/** Failed subjects (below 75%) must weigh less than this share of the exam. */
export const FAILED_WEIGHT_LIMIT = 0.6
/** How much each subject counts in the general average (by subject code). */
export const SUBJECT_WEIGHTS: Readonly<Record<string, number>> = { CC: 0.2, MICRO: 0.2, HEMA: 0.2, BBIS: 0.2, CM: 0.1, HTMLE: 0.1 }
/** "75%", for text on the screen. */
export const PASSING_LABEL = `${Math.round(PASSING_RATE * 100)}%`
/** "50%", for text on the screen. */
export const FLOOR_LABEL = `${Math.round(SUBJECT_FLOOR * 100)}%`

export type RandomFn = () => number

/** Returns a shuffled copy (Fisher–Yates). Pass `random` in tests for repeatable results. */
export function shuffle<T>(items: readonly T[], random: RandomFn = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Shuffles the order choices are DISPLAYED in.
 * Returns `order`, where order[displayPosition] = original index.
 * We always save the original index to the database (PROJECT_PLAN.md §13).
 */
export function shuffledChoiceOrder(choiceCount: number, random: RandomFn = Math.random): number[] {
  return shuffle(
    Array.from({ length: choiceCount }, (_, i) => i),
    random,
  )
}

/** The `choices` column is jsonb, so check it really is a list of strings. */
export function parseChoices(value: Json): string[] {
  if (Array.isArray(value) && value.every((c) => typeof c === 'string')) return value as string[]
  return []
}

/**
 * The `choice_notes` column (migration 0008): one note per choice, same order as the choices.
 * Returns null when there are no usable notes, so the answer screen shows no notes at all
 * (wrong type, wrong length, or every note empty).
 */
export function parseChoiceNotes(value: Json | null | undefined, choiceCount: number): string[] | null {
  if (!Array.isArray(value) || value.length !== choiceCount) return null
  if (!value.every((n) => typeof n === 'string')) return null
  const notes = (value as string[]).map((n) => n.trim())
  return notes.some((n) => n !== '') ? notes : null
}

export type AttemptLike = {
  question_id: string
  is_correct: boolean
  selected_index: number | null
  created_at: string | null
}

/**
 * The "Review Again" list: questions whose MOST RECENT attempt was wrong.
 * Answering a question correctly later removes it from the list.
 * Result is newest mistake first.
 */
export function latestMistakes<A extends AttemptLike>(attempts: readonly A[]): A[] {
  const newestFirst = [...attempts].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const seen = new Set<string>()
  const mistakes: A[] = []
  for (const attempt of newestFirst) {
    if (seen.has(attempt.question_id)) continue
    seen.add(attempt.question_id)
    if (!attempt.is_correct) mistakes.push(attempt)
  }
  return mistakes
}

/**
 * The games (Board Review, Last Card). Their answers still count in her scores and streak,
 * but they don't add to Review again or take anything out of it: game answers are rushed and often guesses.
 */
export const GAME_MODES = ['board', 'cards'] as const

/** Sets `from_game` on each answer whose session is one of her games (and drops session_id, which isn't needed after). */
export function markGameAnswers<A extends { session_id: string | null }>(
  attempts: readonly A[],
  gameSessionIds: ReadonlySet<string>,
): (Omit<A, 'session_id'> & { from_game: boolean })[] {
  return attempts.map(({ session_id, ...rest }) => ({ ...rest, from_game: session_id !== null && gameSessionIds.has(session_id) }))
}

/** Only the answers from Practice, Mock exam and Flashcards: what Review again is made from. */
export function withoutGameAnswers<A extends { from_game?: boolean }>(attempts: readonly A[]): A[] {
  return attempts.filter((a) => a.from_game !== true)
}

export type TopicPerformanceRow = { subject_id: number; topic_id: number; attempts: number; accuracy: number }
export type SubjectInfo = { id: number; code: string; name: string; sort_order: number | null }
export type TopicInfo = { id: number; subject_id: number; name: string }

export type TopicSummary = { topicId: number; name: string; attempts: number; accuracy: number; belowPassing: boolean }
export type SubjectSummary = {
  subjectId: number
  code: string
  name: string
  attempts: number
  /** null when she has not answered anything in this subject yet */
  accuracy: number | null
  /** below 75%: not passed yet */
  belowPassing: boolean
  /** below 50%: this subject alone would fail the whole exam */
  belowFloor: boolean
  topics: TopicSummary[]
}

/**
 * Combines topic_performance rows into per-subject scores.
 * Subject accuracy is weighted by attempts (a topic with 50 answers counts more than one with 2).
 * Every subject is included, even with no attempts, so nothing is hidden.
 */
export function summarizePerformance(
  rows: readonly TopicPerformanceRow[],
  subjects: readonly SubjectInfo[],
  topics: readonly TopicInfo[],
): SubjectSummary[] {
  const topicName = new Map(topics.map((t) => [t.id, t.name]))

  return [...subjects]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((subject) => {
      const subjectRows = rows.filter((r) => r.subject_id === subject.id && r.attempts > 0)
      const attempts = subjectRows.reduce((sum, r) => sum + r.attempts, 0)
      const correct = subjectRows.reduce((sum, r) => sum + r.accuracy * r.attempts, 0)
      const accuracy = attempts > 0 ? correct / attempts : null

      const topicSummaries = subjectRows
        .map((r) => ({
          topicId: r.topic_id,
          name: topicName.get(r.topic_id) ?? `Topic #${r.topic_id}`,
          attempts: r.attempts,
          accuracy: r.accuracy,
          belowPassing: r.accuracy < PASSING_RATE,
        }))
        .sort((a, b) => a.accuracy - b.accuracy) // weakest topic first

      return {
        subjectId: subject.id,
        code: subject.code,
        name: subject.name,
        attempts,
        accuracy,
        belowPassing: accuracy !== null && accuracy < PASSING_RATE,
        belowFloor: accuracy !== null && accuracy < SUBJECT_FLOOR,
        topics: topicSummaries,
      }
    })
}

export type OverallStats = {
  /**
   * Her general average, like the board computes it: each subject's score times its weight.
   * Only subjects she has answered count (their weights are scaled up to 100%), so one untouched subject
   * doesn't pull it down to 0. null when nothing answered yet.
   */
  accuracy: number | null
  answered: number
  /** subjects with answers that are at 75% or higher */
  passingSubjects: number
  totalSubjects: number
  /** the lowest-scoring subject below 75%, if any */
  weakest: SubjectSummary | null
  /** answered subjects below 50% (each one alone fails the exam) */
  belowFloor: SubjectSummary[]
  /** Would these scores pass the board (all three rules)? null when nothing answered yet. */
  passes: boolean | null
}

/** A subject's weight in the general average (0 for a code the board doesn't list). */
export function subjectWeight(code: string): number {
  return SUBJECT_WEIGHTS[code] ?? 0
}

/**
 * The general average of the subjects she has answered, weighted like the board (see OverallStats.accuracy).
 * If none of them has a board weight (e.g. made-up codes in tests), every answer counts the same instead.
 */
export function generalAverage(summary: readonly SubjectSummary[]): number | null {
  const answered = summary.filter((s) => s.accuracy !== null && s.attempts > 0)
  if (answered.length === 0) return null
  const totalWeight = answered.reduce((sum, s) => sum + subjectWeight(s.code), 0)
  if (totalWeight === 0) {
    const attempts = answered.reduce((sum, s) => sum + s.attempts, 0)
    return answered.reduce((sum, s) => sum + s.accuracy! * s.attempts, 0) / attempts
  }
  return answered.reduce((sum, s) => sum + s.accuracy! * subjectWeight(s.code), 0) / totalWeight
}

/**
 * Would these scores pass the board? All three rules (top of this file), over the subjects she has answered.
 * null when nothing is answered yet.
 */
export function passesBoard(summary: readonly SubjectSummary[]): boolean | null {
  const average = generalAverage(summary)
  if (average === null) return null
  const answered = summary.filter((s) => s.accuracy !== null && s.attempts > 0)
  const totalWeight = answered.reduce((sum, s) => sum + subjectWeight(s.code), 0)
  // Without board weights, count each subject the same for the "failed subjects" rule.
  const weightOf = (s: SubjectSummary) => (totalWeight === 0 ? 1 / answered.length : subjectWeight(s.code) / totalWeight)
  const failedWeight = answered.filter((s) => s.belowPassing).reduce((sum, s) => sum + weightOf(s), 0)
  // The small epsilon keeps float noise (0.75 stored as 0.7499999…) from failing an exact 75%.
  return average >= PASSING_RATE - 1e-9 && !answered.some((s) => s.belowFloor) && failedWeight < FAILED_WEIGHT_LIMIT - 1e-9
}

/**
 * The subject below 75% that is nearest to passing, and how many percentage points it still needs
 * (at least 1, rounded up). Home shows it as "Closest to passing", so she sees the nearest win, not every miss.
 * null when no answered subject is below 75%.
 */
export function closestToPassing(summary: readonly SubjectSummary[]): { subject: SubjectSummary; pointsToGo: number } | null {
  const low = summary.filter((s) => s.accuracy !== null && s.belowPassing)
  if (low.length === 0) return null
  const subject = low.reduce((best, s) => (s.accuracy! > best.accuracy! ? s : best))
  // The small epsilon keeps float noise (e.g. 0.75 - 0.72 = 0.030000000000000027) from rounding 3 up to 4.
  const pointsToGo = Math.max(1, Math.ceil((PASSING_RATE - subject.accuracy!) * 100 - 1e-9))
  return { subject, pointsToGo }
}

/** Totals for the stat tiles on Home and the header on Practice. */
export function overallStats(summary: readonly SubjectSummary[]): OverallStats {
  const answered = summary.reduce((sum, s) => sum + s.attempts, 0)
  const low = summary.filter((s) => s.belowPassing).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
  return {
    accuracy: generalAverage(summary),
    answered,
    passingSubjects: summary.filter((s) => s.accuracy !== null && !s.belowPassing).length,
    totalSubjects: summary.length,
    weakest: low[0] ?? null,
    belowFloor: summary.filter((s) => s.belowFloor),
    passes: passesBoard(summary),
  }
}

export type SmartPick =
  | { kind: 'topic'; subjectId: number; subjectCode: string; topicId: number; topicName: string; accuracy: number }
  | { kind: 'subject'; subjectId: number; subjectCode: string }

/**
 * "Smart pick" on Practice: the single best thing to study next.
 * 1. The weakest topic below 75% in any subject (more answers wins a tie, since that score is surer).
 * 2. Otherwise a subject she hasn't started yet.
 * 3. Otherwise nothing: everything is passing, so she can choose.
 */
export function smartPick(summary: readonly SubjectSummary[]): SmartPick | null {
  const weakTopics = summary.flatMap((s) => s.topics.filter((t) => t.belowPassing).map((t) => ({ subject: s, topic: t })))
  weakTopics.sort((a, b) => a.topic.accuracy - b.topic.accuracy || b.topic.attempts - a.topic.attempts)
  const weakest = weakTopics[0]
  if (weakest) {
    return {
      kind: 'topic',
      subjectId: weakest.subject.subjectId,
      subjectCode: weakest.subject.code,
      topicId: weakest.topic.topicId,
      topicName: weakest.topic.name,
      accuracy: weakest.topic.accuracy,
    }
  }
  const notStarted = summary.find((s) => s.accuracy === null)
  return notStarted ? { kind: 'subject', subjectId: notStarted.subjectId, subjectCode: notStarted.code } : null
}

/** 0.756 -> "76%" */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
