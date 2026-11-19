// "What you learned today": once today's plan is done, what moved, instead of three green "Done" boxes.
// Learning she can see is what brings her back tomorrow. Pure, so it can be tested.
import { localDateKey } from '@/lib/activity'
import { taskKey } from '@/lib/planLinks'
import type { PlanProgress } from '@/lib/planProgress'
import type { SubjectSummary } from '@/lib/quiz'
import { MISTAKE_STEPS, type FocusTask, type PlanAttempt, type PlanTask, type StudyPlan } from '@/lib/studyPlan'
import { shortName } from './planText'

export type RecapRow =
  /** a topic she worked on: its score this morning → now (null = not tried) */
  | { kind: 'topic'; title: string; detail: string; from: number | null; to: number | null }
  /** past mistakes fixed, "4 / 5" */
  | { kind: 'fixed'; title: string; detail: string; score: string }
  | { kind: 'cards'; title: string; detail: string }
  | { kind: 'other'; title: string; detail: string }
  /** the ones to try again tomorrow */
  | { kind: 'retry'; title: string; detail: string }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Different questions she missed today (first tries, games left out): each one comes back tomorrow. */
export function missedToday(attempts: readonly PlanAttempt[], today: Date): number {
  const day = localDateKey(today)
  const missed = new Set<string>()
  for (const a of attempts) {
    if (!a.is_correct && a.from_game !== true && a.created_at && localDateKey(new Date(a.created_at)) === day) missed.add(a.question_id)
  }
  return missed.size
}

/** A focus task's score now: its topic's (or, without a topic, its subject's). null = not answered yet. */
function scoreNow(task: FocusTask, summary: readonly SubjectSummary[]): number | null {
  const subject = summary.find((s) => s.subjectId === task.subjectId)
  if (!subject) return null
  if (task.topicId === null) return subject.attempts > 0 ? subject.accuracy : null
  return subject.topics.find((t) => t.topicId === task.topicId)?.accuracy ?? null
}

/** One line per task (in the order that matters: the learning first), then the ones to try again tomorrow. */
export function learnedToday(plan: StudyPlan, progress: PlanProgress, summary: readonly SubjectSummary[], attempts: readonly PlanAttempt[], today: Date): RecapRow[] {
  const rows: RecapRow[] = []
  const order: PlanTask['kind'][] = ['learn', 'subject', 'mistakes', 'flashcards', 'mixed', 'mock']
  const tasks = [...plan.tasks].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))

  for (const task of tasks) {
    const result = task.kind === 'mock' ? undefined : progress.results[taskKey(task)]
    switch (task.kind) {
      case 'learn':
      case 'subject': {
        const title = task.topicName ?? shortName(task.code, task.name)
        const detail = !result
          ? 'Done'
          : task.kind === 'learn'
            ? `Studied ${task.count}, then got ${result.correct} of ${result.total} on the test`
            : `${result.correct} of ${result.total} right`
        rows.push({ kind: 'topic', title, detail, from: task.startAccuracy, to: result ? scoreNow(task, summary) : null })
        break
      }
      case 'mistakes':
        if (!result) rows.push({ kind: 'other', title: 'Past mistakes done', detail: 'None were left to fix.' })
        else {
          const later = result.fixed - result.correct
          const parts = [
            result.correct > 0 ? `${result.correct} right on the first try come back in ${MISTAKE_STEPS[1]} days` : '',
            later > 0 ? `${later} fixed after a retry come back tomorrow` : '',
          ].filter(Boolean)
          rows.push({
            kind: 'fixed',
            title: `${plural(result.fixed, 'past mistake')} fixed`,
            detail: parts.length > 0 ? `${parts.join(', ')}, to make sure.` : 'They come back tomorrow, after you’ve slept on them.',
            score: `${result.fixed} / ${result.total}`,
          })
        }
        break
      case 'flashcards':
        rows.push(
          result
            ? {
                kind: 'cards',
                title: `${plural(result.correct, 'flashcard')} remembered`,
                detail: result.total > result.correct ? `${result.total - result.correct} come back sooner.` : 'Each one comes back right before you’d forget it.',
              }
            : { kind: 'cards', title: 'Flashcards done', detail: 'Nothing was left to review.' },
        )
        break
      case 'mixed':
        rows.push({
          kind: 'other',
          title: result ? `${result.correct} of ${result.total} mixed questions right` : 'Mixed questions done',
          detail: 'Every subject, so the strong ones stay strong.',
        })
        break
      case 'mock':
        rows.push({ kind: 'other', title: 'Mock exam done', detail: 'Your score and review are on the Mock exam page.' })
        break
    }
  }

  const missed = missedToday(attempts, today)
  if (missed > 0) rows.push({ kind: 'retry', title: `${missed} to try again tomorrow`, detail: 'The ones you missed today come back first.' })
  return rows
}
