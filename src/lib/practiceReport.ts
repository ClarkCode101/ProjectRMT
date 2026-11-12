// What a Practice session taught her, for the results screen.
// Pure functions: no Supabase or React here, so it is easy to unit test.
import type { HistoryAttempt } from './selection'

/** Practice = a normal session. Review = "Review again", where every item is an old mistake. */
export type PracticeMode = 'practice' | 'review'

/** What she had done before the session started (taken when it starts, so this session's answers don't count). */
export type PriorHistory = {
  /** questions she had answered at least once */
  seen: ReadonlySet<string>
  /** questions whose latest answer was wrong (her Review again list) */
  mistakes: ReadonlySet<string>
}

export function priorHistory(attempts: readonly HistoryAttempt[]): PriorHistory {
  const seen = new Set<string>()
  // The latest attempt per question decides if it is still a mistake.
  const latest = new Map<string, HistoryAttempt>()
  for (const a of attempts) {
    seen.add(a.question_id)
    const prev = latest.get(a.question_id)
    if (!prev || (a.created_at ?? '') >= (prev.created_at ?? '')) latest.set(a.question_id, a)
  }
  const mistakes = new Set([...latest.values()].filter((a) => !a.is_correct).map((a) => a.question_id))
  return { seen, mistakes }
}

export type PracticeReport = {
  correct: number
  total: number
  /** first time she saw these; null when her history couldn't be loaded */
  fresh: number | null
  /** old mistakes she got right this time; null when her history couldn't be loaded */
  cleared: number | null
  /** wrong this time, so they are in Review again now */
  toReview: number
  /** most correct answers in a row */
  bestStreak: number
}

export function practiceReport(
  answers: readonly { questionId: string; isCorrect: boolean }[],
  prior: PriorHistory | null,
  mode: PracticeMode,
): PracticeReport {
  let correct = 0
  let streak = 0
  let bestStreak = 0
  for (const a of answers) {
    if (a.isCorrect) {
      correct++
      streak++
      bestStreak = Math.max(bestStreak, streak)
    } else {
      streak = 0
    }
  }
  const total = answers.length
  // In Review again every item is an old mistake, so every correct answer clears one (no history needed).
  const cleared =
    mode === 'review' ? correct : prior ? answers.filter((a) => a.isCorrect && prior.mistakes.has(a.questionId)).length : null
  const fresh = mode === 'review' ? 0 : prior ? answers.filter((a) => !prior.seen.has(a.questionId)).length : null
  return { correct, total, fresh, cleared, toReview: total - correct, bestStreak }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One short line under the score: names the win first, never a pass/fail verdict. */
export function practiceMessage(report: PracticeReport, mode: PracticeMode): string {
  const { correct, total, fresh, cleared, toReview } = report
  if (total === 0) return 'No answers this time.'
  if (mode === 'review') {
    if (toReview === 0) return 'Your list is clear. Nice work.'
    if (correct === 0) return 'None cleared this time, and that’s okay. Read the explanations below, then try again.'
    return `${correct} off your list. Only ${toReview} left to go.`
  }
  if (toReview === 0) return 'Perfect session. Every answer right.'
  if (cleared !== null && cleared > 0) return `You fixed ${plural(cleared, 'old mistake')}. That’s how scores go up.`
  if (fresh !== null && fresh > 0) return `${plural(fresh, 'new question')} done. The ones you missed come back in Review again.`
  return 'The ones you missed come back in Review again.'
}
