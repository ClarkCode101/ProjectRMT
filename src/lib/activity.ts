// Day-by-day activity for the small charts on Home.

export type DayActivity = {
  /** local date, YYYY-MM-DD */
  date: string
  /** short weekday, e.g. "Mon" */
  label: string
  answered: number
  correct: number
  /** 0–1, or null on a day with no answers */
  accuracy: number | null
}

/** YYYY-MM-DD in her own time zone (not UTC), so late-night answers count for the right day. */
export function localDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** Midnight at the start of the first day shown, `days` days ending today. */
export function activityStart(today: Date, days = 7): Date {
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1))
}

/** Counts answers per day for the last `days` days (oldest first, today last). Days with no answers are included. */
export function dailyActivity(
  attempts: readonly { created_at: string | null; is_correct: boolean }[],
  today: Date,
  days = 7,
): DayActivity[] {
  const start = activityStart(today, days)
  const result: DayActivity[] = []
  const byKey = new Map<string, DayActivity>()
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const entry: DayActivity = {
      date: localDateKey(day),
      label: day.toLocaleDateString('en-US', { weekday: 'short' }),
      answered: 0,
      correct: 0,
      accuracy: null,
    }
    result.push(entry)
    byKey.set(entry.date, entry)
  }

  for (const a of attempts) {
    if (!a.created_at) continue
    const entry = byKey.get(localDateKey(new Date(a.created_at)))
    if (!entry) continue // outside the range
    entry.answered += 1
    if (a.is_correct) entry.correct += 1
  }
  for (const entry of result) entry.accuracy = entry.answered > 0 ? entry.correct / entry.answered : null
  return result
}
