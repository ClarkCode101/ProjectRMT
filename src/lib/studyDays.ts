// Study days: how much she wants to study on each day of the week (the Plan page's "This week").
// The app still picks WHAT to study; she picks WHEN: a full day, a light day or a rest day.
// Saved on her account (study_settings.study_days), so every device plans the same week.
import { localDateKey } from './activity'

/** full = the usual 3 tasks; light = 1 small task (about 10 minutes); rest = no plan, and the streak stays safe. */
export type DayMode = 'full' | 'light' | 'rest'

export type StudyDays = {
  /** by weekday, Sunday first (like Date.getDay()): 7 entries */
  weekly: DayMode[]
  /** one-off days, "YYYY-MM-DD" → mode; they win over `weekly` */
  dates: Record<string, DayMode>
}

const MODES = new Set<string>(['full', 'light', 'rest'])
const isMode = (m: unknown): m is DayMode => typeof m === 'string' && MODES.has(m)
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/** Every day a full day (what she has until she changes a day). */
export const DEFAULT_STUDY_DAYS: StudyDays = { weekly: Array<DayMode>(7).fill('full'), dates: {} }

/** Her study days from the database. Anything missing or broken counts as a full day, so it never breaks the plan. */
export function parseStudyDays(raw: unknown): StudyDays {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return DEFAULT_STUDY_DAYS
  const { weekly, dates } = raw as { weekly?: unknown; dates?: unknown }
  const week = Array.isArray(weekly) && weekly.length === 7 ? weekly.map((m) => (isMode(m) ? m : 'full')) : DEFAULT_STUDY_DAYS.weekly
  const oneOff: Record<string, DayMode> = {}
  if (typeof dates === 'object' && dates !== null && !Array.isArray(dates)) {
    for (const [key, m] of Object.entries(dates)) if (DATE_KEY.test(key) && isMode(m)) oneOff[key] = m
  }
  return { weekly: week, dates: oneOff }
}

/** Noon on a "YYYY-MM-DD" day (noon, so a daylight-saving change can't move it to another day). */
export function dateFromKey(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), 12)
}

/** How much she studies on this day. */
export function modeFor(days: StudyDays, day: Date | string): DayMode {
  const date = typeof day === 'string' ? dateFromKey(day) : day
  return days.dates[localDateKey(date)] ?? days.weekly[date.getDay()] ?? 'full'
}

/** The 7 days of the week `day` is in, Monday first (noon on each day). */
export function weekOf(day: Date): Date[] {
  const back = (day.getDay() + 6) % 7 // days since Monday
  return Array.from({ length: 7 }, (_, i) => new Date(day.getFullYear(), day.getMonth(), day.getDate() - back + i, 12))
}

/** At most this many rest days in a week (Monday to Sunday): enough for a long weekend, but "rest" can't turn into "stop". */
export const MAX_REST_DAYS = 3

/** The other rest days in `day`'s week (Monday to Sunday), Monday first. */
export function otherRestDays(days: StudyDays, day: Date): Date[] {
  const key = localDateKey(day)
  return weekOf(day).filter((d) => localDateKey(d) !== key && modeFor(days, d) === 'rest')
}

/** How many rest days the week of `day` has. */
function restDaysInWeek(days: StudyDays, day: Date): number {
  return weekOf(day).filter((d) => modeFor(days, d) === 'rest').length
}

/**
 * Can this day be a rest day? Up to MAX_REST_DAYS a week keep the streak safe.
 * `every`: as a weekly rest day, so every week must stay within the limit: a usual week (weekly choices only),
 * this week, and each week that has a one-off day.
 */
export function canRest(days: StudyDays, day: Date, every: boolean): boolean {
  const key = localDateKey(day)
  if (!every) {
    const next: StudyDays = { weekly: days.weekly, dates: { ...days.dates, [key]: 'rest' } }
    return restDaysInWeek(next, day) <= MAX_REST_DAYS
  }
  const weekly = [...days.weekly]
  weekly[day.getDay()] = 'rest'
  const dates = { ...days.dates }
  delete dates[key]
  const next: StudyDays = { weekly, dates }
  if (weekly.filter((m) => m === 'rest').length > MAX_REST_DAYS) return false
  return [day, ...Object.keys(dates).map(dateFromKey)].every((d) => restDaysInWeek(next, d) <= MAX_REST_DAYS)
}

/**
 * Her study days with one day changed. `every`: every week on that weekday (else just that date).
 * - Weekly: the weekday changes, and a one-off on that date is dropped (so it shows the new weekly choice).
 * - One-off dates before `today` are dropped, so the list doesn't grow forever.
 * (Check canRest first: this doesn't enforce the rest-day limit.)
 */
export function setDayMode(days: StudyDays, day: Date, mode: DayMode, every: boolean, today: Date): StudyDays {
  const key = localDateKey(day)
  const todayKey = localDateKey(today)
  const dates: Record<string, DayMode> = {}
  for (const [k, m] of Object.entries(days.dates)) if (k >= todayKey && k !== key) dates[k] = m

  if (!every) {
    if (days.weekly[day.getDay()] !== mode) dates[key] = mode
    return { weekly: [...days.weekly], dates }
  }
  const weekly = [...days.weekly]
  weekly[day.getDay()] = mode
  return { weekly, dates }
}

/** Was (or is) this day a rest day? For the streak: a rest day neither adds to it nor breaks it. */
export function isRestDay(days: StudyDays, key: string): boolean {
  return modeFor(days, key) === 'rest'
}
