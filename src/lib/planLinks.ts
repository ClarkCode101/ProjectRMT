// Links from Today's plan straight into a task (no setup screen), and reading them back on each page.
//
//   /practice?plan=subject&subject=3&topic=31&count=20   → 20 questions on one topic of Hematology
//   /practice?plan=learn&subject=3&topic=31&count=10     → study 10 (answers shown), then a test on the same 10
//   /practice?plan=learn&…&step=test                     → straight to the test (she already studied them)
//   /practice?plan=mistakes&count=8                      → 8 past mistakes that are due
//   /practice?plan=mixed&count=10                        → 10 questions from all subjects
//   /flashcards?plan=cards&count=10                      → 10 due flashcards (no new ones)
//   /mock                                                → the Mock exam, as usual
import type { PlanTask } from './studyPlan'

/** Most items one plan link can ask for (a bad or hand-typed link can't start a 5,000-question quiz). */
export const PLAN_LINK_MAX = 150

/** One practice task from the plan, as read from the address. topicId null = the whole subject. */
export type PracticePlanLink =
  | { kind: 'subject'; subjectId: number; topicId: number | null; count: number }
  | { kind: 'learn'; subjectId: number; topicId: number | null; count: number; step: 'study' | 'test' }
  | { kind: 'mistakes'; count: number }
  | { kind: 'mixed'; count: number }

/**
 * The key a task's progress is saved under (planProgress.ts). Two focus tasks can be in one plan,
 * so each subject has its own key.
 */
export function taskKey(task: PlanTask | PracticePlanLink | { kind: 'flashcards' }): string {
  if (task.kind === 'subject' || task.kind === 'learn') return `${task.kind}:${task.subjectId}`
  return task.kind
}

/**
 * The page that starts a task, asking for `remaining` items (what's left of it today).
 * A "Learn" task has two steps (study, test): with one left, it goes straight to the test.
 */
export function planTaskLink(task: PlanTask, remaining: number): string {
  const count = Math.max(1, Math.min(PLAN_LINK_MAX, Math.round(remaining)))
  switch (task.kind) {
    case 'flashcards':
      return `/flashcards?plan=cards&count=${count}`
    case 'subject':
      return `/practice?plan=subject&subject=${task.subjectId}${topicPart(task.topicId)}&count=${count}`
    case 'learn':
      return `/practice?plan=learn&subject=${task.subjectId}${topicPart(task.topicId)}&count=${task.count}${remaining <= 1 ? '&step=test' : ''}`
    case 'mistakes':
      return `/practice?plan=mistakes&count=${count}`
    case 'mixed':
      return `/practice?plan=mixed&count=${count}`
    case 'mock':
      return '/mock'
  }
}

/**
 * Started from the Plan page: put this on the link's router state (`<Link state={FROM_PLAN_PAGE}>`), so leaving
 * the task goes back to the Plan page instead of Home. It isn't in the address, so it can't end up in a bookmark.
 */
export const FROM_PLAN_PAGE = { from: 'plan' } as const

/** Where leaving a plan task goes: the Plan page if she started it there, else Home (where the plan bar is). */
export function planBackTo(state: unknown): '/plan' | '/' {
  return typeof state === 'object' && state !== null && (state as { from?: unknown }).from === 'plan' ? '/plan' : '/'
}

const topicPart = (topicId: number | null) => (topicId === null ? '' : `&topic=${topicId}`)

/** A whole number of at least 1, or null. */
function readId(value: string | null): number | null {
  const n = Number(value)
  return value !== null && Number.isInteger(n) && n >= 1 ? n : null
}

/** A whole number from 1 to PLAN_LINK_MAX, or null. */
function readCount(params: URLSearchParams): number | null {
  const n = readId(params.get('count'))
  return n === null ? null : Math.min(n, PLAN_LINK_MAX)
}

/** The practice task in this address, or null when it isn't a (valid) plan link. */
export function readPracticePlanLink(params: URLSearchParams): PracticePlanLink | null {
  const count = readCount(params)
  if (count === null) return null
  const plan = params.get('plan')
  if (plan === 'subject' || plan === 'learn') {
    const subjectId = readId(params.get('subject'))
    if (subjectId === null) return null
    const topicId = readId(params.get('topic'))
    return plan === 'subject'
      ? { kind: 'subject', subjectId, topicId, count }
      : { kind: 'learn', subjectId, topicId, count, step: params.get('step') === 'test' ? 'test' : 'study' }
  }
  if (plan === 'mistakes') return { kind: 'mistakes', count }
  if (plan === 'mixed') return { kind: 'mixed', count }
  return null
}

/** How many due flashcards a plan link asks for, or null when it isn't one. */
export function readFlashcardPlanLink(params: URLSearchParams): number | null {
  return params.get('plan') === 'cards' ? readCount(params) : null
}
