// Study planner + streak milestones + picking an encouragement note.
// Pure logic: no Supabase or React here, so it is easy to unit test.
import { localDateKey } from './activity'

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days from today to the exam date ("YYYY-MM-DD", her time zone). 0 = today, negative = already passed. */
export function daysUntil(examDate: string, today: Date): number {
  const [y, m, d] = examDate.split('-').map(Number)
  const exam = Date.UTC(y, m - 1, d)
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((exam - now) / DAY_MS)
}

/** "112 days to the board exam", "Exam is tomorrow", "Exam day!", or null once it has passed. */
export function countdownLabel(days: number): string | null {
  if (days < 0) return null
  if (days === 0) return 'Exam day! You’ve got this.'
  if (days === 1) return 'Exam is tomorrow'
  return `${days} days to the board exam`
}

/** "YYYY-MM-DD" or empty → is it a real date? (the date input can be cleared) */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** Streak lengths worth celebrating. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const

/** The milestone reached today, if her streak landed exactly on one (and she studied today). */
export function milestoneReached(streak: number, studiedToday: boolean): number | null {
  if (!studiedToday) return null
  return (STREAK_MILESTONES as readonly number[]).includes(streak) ? streak : null
}

export type Trigger = 'mock_done' | 'mock_passed' | 'streak' | 'random'
export type Note = { trigger: Trigger; message: string }

/** A small, stable number from a string (same text → same number), for picking notes. */
function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/**
 * One note for this moment. `seed` (e.g. the session id or today's date) keeps the pick stable,
 * so the same screen shows the same note if she comes back to it. Falls back to 'random' notes.
 */
export function pickNote(notes: readonly Note[], trigger: Trigger, seed: string): string | null {
  const matching = notes.filter((n) => n.trigger === trigger)
  const pool = matching.length > 0 ? matching : notes.filter((n) => n.trigger === 'random')
  if (pool.length === 0) return null
  return pool[hash(`${trigger}:${seed}`) % pool.length].message
}

/** Show a "random" note after only some practice sessions (about 1 in `every`), so it stays special. */
export function shouldShowRandomNote(seed: string, every = 3): boolean {
  return hash(seed) % every === 0
}

/** Today's key, for "seen this milestone today" on this device. */
export function milestoneKey(milestone: number, today: Date): string {
  return `${milestone}:${localDateKey(today)}`
}
