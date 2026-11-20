// The weekly recap ("Your week"): last week, Monday to Sunday, compared with the week before.
// Shown on the Plan page at the start of a new week. Everything comes from her saved answers and study days;
// nothing new is stored on her account. Pure, so it can be tested.
import { currentStreak, localDateKey } from './activity'
import { modeFor, weekOf, type DayMode, type StudyDays } from './studyDays'
import { fixedMistakesBefore, type PlanAttempt } from './studyPlan'

export type RecapDay = { key: string; date: Date; mode: DayMode; answered: number }

export type WeekRecap = {
  /** Monday of the week it's about, "YYYY-MM-DD" (also what "seen" is remembered by) */
  weekStart: string
  /** Monday … Sunday */
  days: RecapDay[]
  /** days she studied, out of the days that weren't rest days (a rest day she studied on anyway counts) */
  studied: number
  studyDays: number
  answered: number
  /** the week before; 0 if she didn't study then */
  prevAnswered: number
  /** share answered right (0–1); null with no answers */
  accuracy: number | null
  prevAccuracy: number | null
  /** past mistakes that passed the 14-day step during the week */
  fixed: number
  /** her streak at the end of the week (rest days don't break it) */
  streak: number
  /** more answers than in any week before (and there was a week before) */
  best: boolean
  /** at least one rest day she kept (no answers) */
  rested: boolean
}

const dayKeyOf = (a: PlanAttempt) => (a.created_at ? localDateKey(new Date(a.created_at)) : null)

/**
 * Last week's recap, as seen on `today`. null for a new member (no answers before this week):
 * there's nothing to look back on yet.
 */
export function weekRecap(attempts: readonly PlanAttempt[], today: Date, studyDays: StudyDays): WeekRecap | null {
  const thisMonday = weekOf(today)[0]
  const lastWeek = weekOf(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7, 12))
  const weekBefore = weekOf(new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 14, 12))
  const thisMondayKey = localDateKey(thisMonday)
  const lastMondayKey = localDateKey(lastWeek[0])

  const before = attempts.filter((a) => {
    const key = dayKeyOf(a)
    return key !== null && key < thisMondayKey
  })
  if (before.length === 0) return null

  // Answers (and right ones) per day, and per week (by its Monday) for "best week so far".
  const perDay = new Map<string, { answered: number; correct: number }>()
  const perWeek = new Map<string, number>()
  for (const a of before) {
    const key = dayKeyOf(a)!
    const day = perDay.get(key) ?? { answered: 0, correct: 0 }
    day.answered++
    if (a.is_correct) day.correct++
    perDay.set(key, day)
    const monday = localDateKey(weekOf(new Date(a.created_at!))[0])
    perWeek.set(monday, (perWeek.get(monday) ?? 0) + 1)
  }

  const days: RecapDay[] = lastWeek.map((date) => {
    const key = localDateKey(date)
    return { key, date, mode: modeFor(studyDays, date), answered: perDay.get(key)?.answered ?? 0 }
  })
  const sum = (week: Date[]) => {
    let answered = 0
    let correct = 0
    for (const d of week) {
      const day = perDay.get(localDateKey(d))
      answered += day?.answered ?? 0
      correct += day?.correct ?? 0
    }
    return { answered, accuracy: answered > 0 ? correct / answered : null }
  }
  const last = sum(lastWeek)
  const prev = sum(weekBefore)

  const earlierWeeks = [...perWeek].filter(([monday, n]) => monday < lastMondayKey && n > 0).map(([, n]) => n)
  const fixedThen = fixedMistakesBefore(attempts, lastMondayKey)
  const fixedNow = fixedMistakesBefore(attempts, thisMondayKey)
  const lastSunday = lastWeek[6]

  return {
    weekStart: lastMondayKey,
    days,
    studied: days.filter((d) => d.answered > 0).length,
    studyDays: days.filter((d) => d.mode !== 'rest' || d.answered > 0).length,
    answered: last.answered,
    prevAnswered: prev.answered,
    accuracy: last.accuracy,
    prevAccuracy: prev.accuracy,
    fixed: [...fixedNow].filter((id) => !fixedThen.has(id)).length,
    streak: currentStreak(before, lastSunday, (key) => modeFor(studyDays, key) === 'rest'),
    best: earlierWeeks.length > 0 && last.answered > Math.max(...earlierWeeks),
    rested: days.some((d) => d.mode === 'rest' && d.answered === 0),
  }
}

/** The one big line: the best true thing about the week. */
export function recapHeadline(r: WeekRecap): string {
  if (r.answered === 0) return 'A quiet week. A fresh one starts today.'
  const base = `${r.studied} of ${r.studyDays} study ${r.studyDays === 1 ? 'day' : 'days'}.`
  if (r.best) return `${base} Your best week so far!`
  if (r.studied === r.studyDays) return `${base} Every one of them!`
  if (r.prevAnswered === 0) return `${base} Back on track!`
  return `${base} Keep it going.`
}

/** One small tip from the week, or null when there's nothing to say. */
export function recapTip(r: WeekRecap): string | null {
  if (r.answered === 0) return 'Start small: a light day is just 10 questions.'
  const empty = r.days.find((d) => d.answered === 0 && d.mode !== 'rest')
  if (empty) {
    const name = empty.date.toLocaleDateString('en-US', { weekday: 'long' })
    return `${name} was empty. If it’s a busy day, make it a light day this week.`
  }
  if (r.studied === 7 && !r.rested) return 'Seven days straight! Rest days are fine too: your streak stays safe.'
  if (r.accuracy !== null && r.prevAccuracy !== null && r.accuracy <= r.prevAccuracy - 0.05) {
    return 'Your score dipped a little. Learn days and past mistakes are how it climbs back.'
  }
  return null
}

/** "+38" / "−12" / "same" (compare only when the week before had answers). */
export function signedDelta(now: number, before: number): string {
  const d = now - before
  if (d === 0) return 'same'
  return d > 0 ? `+${d}` : `−${-d}`
}
