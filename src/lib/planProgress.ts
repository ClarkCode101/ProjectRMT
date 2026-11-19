// Today's plan on this device: the plan itself (made once a day, so it doesn't change while she works through it)
// and how much of each task she has done.
// Practice and Flashcards add to the progress when a session started from the plan ends (finished or left early);
// Home reads both. A new day starts fresh.
import { localDateKey } from './activity'
import type { StudyPlan } from './studyPlan'

// ---------- The plan, kept for the day ----------

const PLAN_KEY = 'projectrmt:todays-plan'
/** Progress for the plan's tasks (counts, studied questions, results). */
const STORAGE_KEY = 'projectrmt:plan-progress'
/** Everything Today's plan keeps on this device. Reset progress clears these, so a fresh plan is made from zero. */
export const PLAN_STORAGE_KEYS = [PLAN_KEY, STORAGE_KEY] as const
const TASK_KINDS = new Set(['flashcards', 'subject', 'learn', 'mistakes', 'mixed', 'mock'])

/**
 * Today's saved plan for this member, or null (none yet, another day, another member on this device, or broken data).
 * Only a light check: the plan was written by this app, this just keeps old or damaged data from crashing Home.
 */
export function parseSavedPlan(stored: unknown, userId: string, today: Date): StudyPlan | null {
  if (typeof stored !== 'object' || stored === null) return null
  const s = stored as { userId?: unknown; plan?: Partial<StudyPlan> }
  const plan = s.plan
  if (s.userId !== userId || !plan || plan.date !== localDateKey(today) || !Array.isArray(plan.tasks)) return null
  // Plans saved before study days had no mode: they were full days.
  const mode = plan.mode ?? 'full'
  if (mode !== 'full' && mode !== 'light' && mode !== 'rest') return null
  // A rest day has no tasks; any other day needs some.
  const ok = mode === 'rest' ? plan.tasks.length === 0 : plan.tasks.length > 0 && plan.tasks.every(isTask)
  return ok ? ({ ...plan, mode } as StudyPlan) : null
}

/**
 * A known kind of task, with a whole count (the Mock exam has none). A focus task must have its topic fields:
 * a plan saved before topics existed is made again instead (else it would say "Today's topic: undefined").
 */
function isTask(t: unknown): boolean {
  if (typeof t !== 'object' || t === null) return false
  const { kind, count } = t as { kind?: unknown; count?: unknown }
  if (typeof kind !== 'string' || !TASK_KINDS.has(kind)) return false
  if ((kind === 'subject' || kind === 'learn') && !('topicId' in t && 'topicName' in t && 'startAccuracy' in t)) return false
  return kind === 'mock' || Number.isInteger(count)
}

export function readSavedPlan(userId: string, today: Date = new Date()): StudyPlan | null {
  try {
    return parseSavedPlan(JSON.parse(localStorage.getItem(PLAN_KEY) ?? 'null'), userId, today)
  } catch {
    return null
  }
}

export function saveTodaysPlan(userId: string, plan: StudyPlan): void {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify({ userId, plan }))
  } catch {
    // storage blocked: the plan is just made again on the next visit
  }
}

// ---------- Progress ----------

export type PlanProgress = {
  /** "YYYY-MM-DD": the day these counts are for */
  date: string
  /** items done per task key (see taskKey in planLinks.ts); a "Learn" task counts steps: 1 = studied, 2 = tested */
  done: Record<string, number>
  /** a "Learn" task's studied questions (ids), so its test asks exactly those, even after a break */
  studied: Record<string, string[]>
  /** how each task went (first tries), added up over its sessions: for "What you learned today" */
  results: Record<string, TaskResult>
}

/**
 * correct / total: first tries (what was saved and scored). fixed: past mistakes answered right by the end
 * (fix until right). For flashcards: correct = remembered (not "Again"), total = cards.
 */
export type TaskResult = { correct: number; total: number; fixed: number }

/** Progress for `today` from what was stored: anything from another day, or anything broken, counts as nothing done. */
export function progressFor(stored: unknown, today: Date): PlanProgress {
  const date = localDateKey(today)
  const empty: PlanProgress = { date, done: {}, studied: {}, results: {} }
  if (typeof stored !== 'object' || stored === null) return empty
  const s = stored as Partial<PlanProgress>
  if (s.date !== date || typeof s.done !== 'object' || s.done === null) return empty
  const done: Record<string, number> = {}
  for (const [key, n] of Object.entries(s.done)) if (Number.isInteger(n) && n > 0) done[key] = n
  const studied: Record<string, string[]> = {}
  if (typeof s.studied === 'object' && s.studied !== null) {
    for (const [key, ids] of Object.entries(s.studied)) {
      if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === 'string')) studied[key] = ids
    }
  }
  const results: Record<string, TaskResult> = {}
  if (typeof s.results === 'object' && s.results !== null) {
    for (const [key, r] of Object.entries(s.results)) if (isResult(r)) results[key] = r
  }
  return { date, done, studied, results }
}

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0

function isResult(r: unknown): r is TaskResult {
  if (typeof r !== 'object' || r === null) return false
  const { correct, total, fixed } = r as Partial<TaskResult>
  return isCount(correct) && isCount(total) && isCount(fixed) && correct <= total
}

/** The same progress with one more session's result added to a task's. */
export function addResult(progress: PlanProgress, key: string, result: TaskResult): PlanProgress {
  if (!isResult(result) || result.total === 0) return progress
  const before = progress.results[key] ?? { correct: 0, total: 0, fixed: 0 }
  const sum = { correct: before.correct + result.correct, total: before.total + result.total, fixed: before.fixed + result.fixed }
  return { ...progress, results: { ...progress.results, [key]: sum } }
}

/** The same progress with `count` more items done on one task. */
export function addProgress(progress: PlanProgress, key: string, count: number): PlanProgress {
  if (!Number.isInteger(count) || count <= 0) return progress
  return { ...progress, done: { ...progress.done, [key]: (progress.done[key] ?? 0) + count } }
}

/**
 * The same progress with a "Learn" task's study step done: these questions are kept for its test.
 * Studying again doesn't count twice (it's still one step), so only the test can finish the task.
 */
export function addStudied(progress: PlanProgress, key: string, questionIds: string[]): PlanProgress {
  if (questionIds.length === 0) return progress
  return {
    ...progress,
    done: { ...progress.done, [key]: Math.max(progress.done[key] ?? 0, 1) },
    studied: { ...progress.studied, [key]: questionIds },
  }
}

/** Today's progress, from this device. */
export function readPlanProgress(today: Date = new Date()): PlanProgress {
  try {
    return progressFor(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'), today)
  } catch {
    return progressFor(null, today)
  }
}

/** Adds `count` items done on one task today (e.g. 12 questions answered in the focus subject). */
export function recordPlanProgress(key: string, count: number, today: Date = new Date()): void {
  writeProgress(addProgress(readPlanProgress(today), key, count))
}

/** How a session of a plan task went (added to the task's result for today). */
export function recordPlanResult(key: string, result: TaskResult, today: Date = new Date()): void {
  writeProgress(addResult(readPlanProgress(today), key, result))
}

/** A "Learn" task's study step is done, with the questions she studied (its test asks exactly these). */
export function recordStudied(key: string, questionIds: string[], today: Date = new Date()): void {
  writeProgress(addStudied(readPlanProgress(today), key, questionIds))
}

function writeProgress(progress: PlanProgress): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // storage blocked: the task just won't tick off, the answers themselves are saved as usual
  }
}
