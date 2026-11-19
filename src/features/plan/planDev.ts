// DEV ONLY (npm run dev): test shortcuts for Today's plan, the Plan page and the Home plan bar.
// A pretend date and pretend situations, kept on this device. Nothing here touches the database or her answers:
// it only changes what the plan is made FROM. In `npm run build`, import.meta.env.DEV is false, so readPlanDev()
// always gives "no changes" and the DEV button isn't shown.
import { localDateKey } from '@/lib/activity'
import type { SubjectSummary } from '@/lib/quiz'
import type { DayMode } from '@/lib/studyDays'
import { addDays, type PlanInput } from '@/lib/studyPlan'

const KEY = 'projectrmt:plan-dev'

export type PlanDev = {
  /** days added to the real date (the pretend "today") */
  dayOffset: number
  /** today as a full, light or rest day, whatever her saved study days say (not saved to her account) */
  mode: DayMode | null
  /** comeback = no answers in the last 3 days; simulate = exam in 15 days; new = no answers at all */
  scenario: 'comeback' | 'simulate' | 'new' | null
  /** pretend she finished a Mock exam today (ticks off a Mock exam task) */
  mockDone: boolean
}

export const NO_DEV: PlanDev = { dayOffset: 0, mode: null, scenario: null, mockDone: false }

export function readPlanDev(): PlanDev {
  if (!import.meta.env.DEV) return NO_DEV
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<PlanDev> | null
    return raw ? { ...NO_DEV, ...raw } : NO_DEV
  } catch {
    return NO_DEV
  }
}

export function writePlanDev(dev: PlanDev): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(dev))
  } catch {
    // storage blocked: nothing to remember
  }
}

export function isDevActive(dev: PlanDev): boolean {
  return dev.dayOffset !== 0 || dev.mode !== null || dev.scenario !== null || dev.mockDone
}

/** The pretend "now": the real time of day, `dayOffset` days away. */
export function devNow(dev: PlanDev = readPlanDev()): Date {
  const now = new Date()
  return dev.dayOffset === 0 ? now : new Date(now.getFullYear(), now.getMonth(), now.getDate() + dev.dayOffset, now.getHours(), now.getMinutes())
}

/** What the plan is made from, with the pretend situations applied. */
export function applyPlanDev(input: PlanInput, dev: PlanDev): PlanInput {
  if (!isDevActive(dev)) return input
  const todayKey = localDateKey(input.today)
  let next: PlanInput = input
  if (dev.mode) {
    next = { ...next, studyDays: { ...next.studyDays, dates: { ...next.studyDays.dates, [todayKey]: dev.mode } } }
  }
  if (dev.scenario === 'simulate') next = { ...next, examDate: addDays(todayKey, 15), lastMockDay: null }
  if (dev.scenario === 'comeback') {
    // Away for the last 3 days (today included): her last study day is 4 days ago or earlier.
    const from = addDays(todayKey, -3)
    next = { ...next, attempts: next.attempts.filter((a) => a.created_at !== null && localDateKey(new Date(a.created_at)) < from) }
  }
  if (dev.scenario === 'new') {
    const fresh = (s: SubjectSummary): SubjectSummary => ({ ...s, attempts: 0, accuracy: null, belowPassing: false, belowFloor: false, topics: [] })
    next = { ...next, attempts: [], summary: next.summary.map(fresh), flashcardsDue: 0 }
  }
  if (dev.mockDone) next = { ...next, lastMockDay: todayKey }
  return next
}

/** A short line on what is pretend right now, for the DEV panel's title. */
export function devSummary(dev: PlanDev, now: Date): string {
  const parts = [now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })]
  if (dev.dayOffset !== 0) parts.push(`${dev.dayOffset > 0 ? '+' : ''}${dev.dayOffset} days`)
  if (dev.mode) parts.push(`today ${dev.mode}`)
  if (dev.scenario) parts.push(dev.scenario)
  if (dev.mockDone) parts.push('mock done')
  return parts.join(' · ')
}
