// The results screen of a quiz (or flashcards) started from Today's plan: where she is in the plan,
// and the next task, so the gold button keeps her going instead of sending her out of the plan. Pure, so it can be tested.
import { planTaskLink, taskKey } from '@/lib/planLinks'
import type { PlanProgress } from '@/lib/planProgress'
import type { StudyPlan } from '@/lib/studyPlan'
import { planRows, shortName, taskTitle } from './planText'

export type PlanResultInfo = {
  /** tasks done now, and how many the plan has ("2 of 3 done") */
  done: number
  total: number
  /** one per task: done or not (the plan's dots) */
  dots: boolean[]
  /** what this session was: "Learn Coagulation", "Bacteriology", "Past mistakes"… */
  taskLabel: string
  /** the kind of task, for the words under the score */
  kind: 'learn' | 'subject' | 'mistakes' | 'mixed' | 'flashcards'
  /** a focus task's subject and topic, and its score this morning (for "10% → 43%") */
  focus: { subjectId: number; topicId: number | null; from: number | null } | null
  /** the next task not done yet, with its link; null = all done */
  next: { title: string; to: string } | null
}

/**
 * Where she is in today's plan right after a session of the task saved under `sessionKey`.
 * `progress` must already include this session. null when there's no plan, or the task isn't in it
 * (e.g. the plan was swapped meanwhile): then the results show as a normal Practice.
 */
export function planResultInfo(plan: StudyPlan | null, progress: PlanProgress, lastMockDay: string | null, sessionKey: string): PlanResultInfo | null {
  if (!plan) return null
  const task = plan.tasks.find((t) => t.kind !== 'mock' && taskKey(t) === sessionKey)
  if (!task || task.kind === 'mock') return null

  const rows = planRows(plan, progress, lastMockDay)
  const next = rows.find((r) => !r.complete)
  const focus = task.kind === 'learn' || task.kind === 'subject' ? task : null
  const focusLabel = focus ? (focus.topicName ?? shortName(focus.code, focus.name)) : null
  return {
    done: rows.filter((r) => r.complete).length,
    total: rows.length,
    dots: rows.map((r) => r.complete),
    taskLabel: task.kind === 'learn' ? `Learn ${focusLabel}` : focusLabel ?? (task.kind === 'mistakes' ? 'Past mistakes' : task.kind === 'mixed' ? 'Mixed questions' : 'Flashcards'),
    kind: task.kind,
    focus: focus ? { subjectId: focus.subjectId, topicId: focus.topicId, from: focus.startAccuracy } : null,
    next: next ? { title: taskTitle(next.task, next.items - next.done), to: planTaskLink(next.task, next.items - next.done) } : null,
  }
}

/** The line under the score: what happens to the ones she missed, or (all done) where to see what moved. */
export function planResultMessage(info: PlanResultInfo, correct: number, total: number): string {
  if (!info.next) return 'That’s today’s plan, done. Come see what moved.'
  const missed = total - correct
  const learned = info.kind === 'learn' ? `You learned ${correct} of them. ` : ''
  if (info.kind === 'flashcards') return missed > 0 ? `${missed} come back sooner, the rest when you’re about to forget them.` : 'All remembered. Each one comes back right before you’d forget it.'
  if (missed === 0) return `${learned}Every one right. On to the next task.`
  return `${learned}The ${missed} you missed come back tomorrow in your plan. Read why below first.`
}
