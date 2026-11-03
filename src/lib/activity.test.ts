import { describe, expect, it } from 'vitest'
import { activityStart, currentStreak, dailyActivity, localDateKey } from './activity'

// Local-time dates, so the tests pass in any time zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()
const today = new Date(2026, 10, 2, 21, 30) // Mon, Nov 2 2026, 9:30 PM

describe('localDateKey', () => {
  it('pads month and day', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('activityStart', () => {
  it('is midnight six days before today for a 7-day range', () => {
    expect(activityStart(today)).toEqual(new Date(2026, 9, 27))
  })
})

describe('dailyActivity', () => {
  it('returns every day, oldest first, even with no answers', () => {
    const days = dailyActivity([], today)
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ])
    expect(days.at(-1)?.label).toBe('Mon')
    expect(days.every((d) => d.answered === 0 && d.accuracy === null)).toBe(true)
  })

  it('counts answers and accuracy per day', () => {
    const days = dailyActivity(
      [
        { created_at: at(2026, 11, 2, 8), is_correct: true },
        { created_at: at(2026, 11, 2, 23), is_correct: false },
        { created_at: at(2026, 11, 2, 0), is_correct: true },
        { created_at: at(2026, 10, 30), is_correct: false },
      ],
      today,
    )
    expect(days.at(-1)).toMatchObject({ answered: 3, correct: 2 })
    expect(days.at(-1)?.accuracy).toBeCloseTo(2 / 3)
    expect(days[3]).toMatchObject({ date: '2026-10-30', answered: 1, correct: 0, accuracy: 0 })
  })

  it('ignores answers outside the range and rows without a date', () => {
    const days = dailyActivity(
      [
        { created_at: at(2026, 10, 26), is_correct: true },
        { created_at: null, is_correct: true },
      ],
      today,
    )
    expect(days.reduce((sum, d) => sum + d.answered, 0)).toBe(0)
  })
})

/** An answer given at noon on that local date. */
const on = (y: number, m: number, d: number, h = 12) => ({ created_at: at(y, m, d, h) })

describe('currentStreak', () => {
  it('counts days in a row ending today', () => {
    const attempts = [on(2026, 11, 2), on(2026, 11, 2, 8), on(2026, 11, 1), on(2026, 10, 31), on(2026, 10, 29)]
    expect(currentStreak(attempts, today)).toBe(3) // Nov 2, Nov 1, Oct 31 (Oct 30 missing)
  })

  it('keeps the streak alive when nothing is answered yet today', () => {
    expect(currentStreak([on(2026, 11, 1), on(2026, 10, 31)], today)).toBe(2)
  })

  it('is 0 when the last answer was two or more days ago, or there are none', () => {
    expect(currentStreak([on(2026, 10, 31)], today)).toBe(0)
    expect(currentStreak([], today)).toBe(0)
    expect(currentStreak([{ created_at: null }], today)).toBe(0)
  })

  it('crosses month boundaries', () => {
    const attempts = [on(2026, 11, 2), on(2026, 11, 1), on(2026, 10, 31), on(2026, 10, 30)]
    expect(currentStreak(attempts, today)).toBe(4)
  })
})
