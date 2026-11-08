// Pure quiz logic: no Supabase or React here, so it is easy to unit test.
import type { Json } from './database.types'

/** She must get at least 60% in EVERY subject (PROJECT_PLAN.md §2). */
export const PASSING_RATE = 0.6

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
  belowPassing: boolean
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
        topics: topicSummaries,
      }
    })
}

export type OverallStats = {
  /** all answers across subjects, weighted by attempts; null when nothing answered yet */
  accuracy: number | null
  answered: number
  /** subjects with answers that are at 60% or higher */
  passingSubjects: number
  totalSubjects: number
  /** the lowest-scoring subject below 60%, if any */
  weakest: SubjectSummary | null
}

/**
 * The subject below 60% that is nearest to passing, and how many percentage points it still needs
 * (at least 1, rounded up). Home shows it as "Closest to passing", so she sees the nearest win, not every miss.
 * null when no answered subject is below 60%.
 */
export function closestToPassing(summary: readonly SubjectSummary[]): { subject: SubjectSummary; pointsToGo: number } | null {
  const low = summary.filter((s) => s.accuracy !== null && s.belowPassing)
  if (low.length === 0) return null
  const subject = low.reduce((best, s) => (s.accuracy! > best.accuracy! ? s : best))
  // The small epsilon keeps float noise (e.g. 0.6 - 0.57 = 0.030000000000000027) from rounding 3 up to 4.
  const pointsToGo = Math.max(1, Math.ceil((PASSING_RATE - subject.accuracy!) * 100 - 1e-9))
  return { subject, pointsToGo }
}

/** Totals for the stat tiles on Home and the header on Practice. */
export function overallStats(summary: readonly SubjectSummary[]): OverallStats {
  const answered = summary.reduce((sum, s) => sum + s.attempts, 0)
  const correct = summary.reduce((sum, s) => sum + (s.accuracy ?? 0) * s.attempts, 0)
  const low = summary.filter((s) => s.belowPassing).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
  return {
    accuracy: answered > 0 ? correct / answered : null,
    answered,
    passingSubjects: summary.filter((s) => s.accuracy !== null && !s.belowPassing).length,
    totalSubjects: summary.length,
    weakest: low[0] ?? null,
  }
}

export type SmartPick =
  | { kind: 'topic'; subjectId: number; subjectCode: string; topicId: number; topicName: string; accuracy: number }
  | { kind: 'subject'; subjectId: number; subjectCode: string }

/**
 * "Smart pick" on Practice: the single best thing to study next.
 * 1. The weakest topic below 60% in any subject (more answers wins a tie, since that score is surer).
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
