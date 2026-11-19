// "This week" on the Plan page: one tile per day, Monday to Sunday. Pure, so it can be tested.
// Days that passed show what she did (from her answers); today shows the next task; days ahead show her choice
// (full, light or rest) and, for tomorrow, what the plan will likely pick.
import { localDateKey } from '@/lib/activity'
import { modeFor, weekOf, type DayMode, type StudyDays } from '@/lib/studyDays'
import { LIGHT_COUNT, type TomorrowPreview } from '@/lib/studyPlan'
import { dayTileLabel } from './planText'

/**
 * done = reached the day's goal · some = studied, less than the goal · none = no study · rest = a rest day she kept
 * today · planned = a day ahead · exam = exam day
 */
export type TileState = 'done' | 'some' | 'none' | 'rest' | 'today' | 'planned' | 'exam'

export type WeekTile = {
  /** "YYYY-MM-DD" */
  key: string
  date: Date
  mode: DayMode
  state: TileState
  /** a few words under the date: "25 answered", "Learn MICRO", "Rest" */
  label: string
  /** today and the days ahead can be changed */
  editable: boolean
}

export type WeekInput = {
  today: Date
  studyDays: StudyDays
  attempts: readonly { created_at: string | null }[]
  /** her daily goal (a full day's goal; a light day's is LIGHT_COUNT) */
  dailyTarget: number
  examDate: string | null
  /** what today's tile says (the next task, "Done" or "Rest") */
  todayLabel: string
  /** tomorrow's likely plan, or null if it couldn't be made */
  tomorrow: TomorrowPreview | null
}

const MODE_LABEL: Record<DayMode, string> = { full: 'Full day', light: 'Light day', rest: 'Rest' }

export function weekTiles({ today, studyDays, attempts, dailyTarget, examDate, todayLabel, tomorrow }: WeekInput): WeekTile[] {
  const todayKey = localDateKey(today)
  const tomorrowKey = localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12))
  const answered = new Map<string, number>()
  for (const a of attempts) {
    if (!a.created_at) continue
    const key = localDateKey(new Date(a.created_at))
    answered.set(key, (answered.get(key) ?? 0) + 1)
  }

  return weekOf(today).map((date): WeekTile => {
    const key = localDateKey(date)
    const mode = modeFor(studyDays, date)
    const tile = { key, date, mode }
    if (key < todayKey) {
      const n = answered.get(key) ?? 0
      const goal = mode === 'light' ? LIGHT_COUNT : dailyTarget
      if (n === 0) return { ...tile, state: mode === 'rest' ? 'rest' : 'none', label: mode === 'rest' ? 'Rest' : 'No study', editable: false }
      return { ...tile, state: n >= goal ? 'done' : 'some', label: `${n} answered`, editable: false }
    }
    if (key === todayKey) return { ...tile, state: 'today', label: todayLabel, editable: true }
    if (examDate !== null && key === examDate) return { ...tile, state: 'exam', label: 'Exam day', editable: false }
    const label = key === tomorrowKey && tomorrow ? dayTileLabel(tomorrow) : MODE_LABEL[mode]
    return { ...tile, state: 'planned', label, editable: true }
  })
}

/** "Studied 3 of 4 days so far": days up to today she studied, out of those that weren't rest days. */
export function weekSoFar(tiles: readonly WeekTile[], attempts: readonly { created_at: string | null }[], today: Date): { studied: number; days: number } {
  const todayKey = localDateKey(today)
  const studiedDays = new Set(attempts.flatMap((a) => (a.created_at ? [localDateKey(new Date(a.created_at))] : [])))
  const sofar = tiles.filter((t) => t.key <= todayKey)
  // A rest day she studied on anyway still counts as studied.
  return {
    studied: sofar.filter((t) => studiedDays.has(t.key)).length,
    days: sofar.filter((t) => t.mode !== 'rest' || studiedDays.has(t.key)).length,
  }
}
