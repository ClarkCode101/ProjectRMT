import { describe, expect, it } from 'vitest'
import { localDateKey } from './activity'
import { canRest, DEFAULT_STUDY_DAYS, MAX_REST_DAYS, modeFor, otherRestDays, parseStudyDays, setDayMode, weekOf, type DayMode, type StudyDays } from './studyDays'

// Thursday, Nov 19 2026 (the week is Mon Nov 16 – Sun Nov 22).
const TODAY = new Date(2026, 10, 19, 9)
const day = (d: number) => new Date(2026, 10, d, 12)
const weekly = (sunday: DayMode, saturday: DayMode = 'full'): DayMode[] => [sunday, 'full', 'full', 'full', 'full', 'full', saturday]

describe('parseStudyDays', () => {
  it('reads her saved days', () => {
    const raw = { weekly: weekly('rest', 'light'), dates: { '2026-11-25': 'light' } }
    expect(parseStudyDays(raw)).toEqual(raw)
  })

  it('anything missing or broken counts as a full day', () => {
    expect(parseStudyDays({})).toEqual(DEFAULT_STUDY_DAYS)
    expect(parseStudyDays(null)).toEqual(DEFAULT_STUDY_DAYS)
    expect(parseStudyDays('rest')).toEqual(DEFAULT_STUDY_DAYS)
    expect(parseStudyDays({ weekly: ['rest'], dates: [] })).toEqual(DEFAULT_STUDY_DAYS)
    expect(parseStudyDays({ weekly: ['nap', 'full', 'full', 'full', 'full', 'full', 'rest'], dates: { tomorrow: 'rest', '2026-11-25': 'off' } })).toEqual({
      weekly: weekly('full', 'rest'),
      dates: {},
    })
  })
})

describe('modeFor / weekOf', () => {
  it('a one-off day wins over the weekly choice', () => {
    const days: StudyDays = { weekly: weekly('rest'), dates: { '2026-11-22': 'light' } }
    expect(modeFor(days, day(22))).toBe('light') // a Sunday, made light just this once
    expect(modeFor(days, day(29))).toBe('rest') // the next Sunday rests as usual
    expect(modeFor(days, '2026-11-19')).toBe('full')
  })

  it('a week runs Monday to Sunday', () => {
    expect(weekOf(TODAY).map(localDateKey)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(weekOf(day(22)).map(localDateKey)[0]).toBe('2026-11-16') // Sunday ends the week
  })
})

describe('canRest: up to 3 rest days a week', () => {
  it('is 3', () => {
    expect(MAX_REST_DAYS).toBe(3)
  })

  it('a free week: any day can rest', () => {
    expect(canRest(DEFAULT_STUDY_DAYS, day(21), false)).toBe(true)
  })

  it('a second and a third rest day are fine', () => {
    const sunday: StudyDays = { weekly: weekly('rest'), dates: {} }
    expect(otherRestDays(sunday, day(21)).map((d) => d.getDate())).toEqual([22])
    expect(canRest(sunday, day(21), false)).toBe(true) // Saturday too: 2
    const weekend: StudyDays = { weekly: weekly('rest', 'rest'), dates: {} }
    expect(canRest(weekend, day(18), false)).toBe(true) // and Wednesday: 3
    expect(canRest(weekend, day(18), true)).toBe(true) // every Wednesday too
  })

  it('a fourth rest day is not', () => {
    const three: StudyDays = { weekly: weekly('rest', 'rest'), dates: { '2026-11-18': 'rest' } }
    expect(otherRestDays(three, day(17)).map((d) => d.getDate())).toEqual([18, 21, 22])
    expect(canRest(three, day(17), false)).toBe(false)
    expect(canRest(three, day(22), false)).toBe(true) // a day that already rests
  })

  it('every week: no week may go over, counting one-off rest days in other weeks', () => {
    const weekendPlusOne: StudyDays = { weekly: weekly('rest', 'rest'), dates: { '2026-11-25': 'rest' } } // + Wed of next week
    expect(canRest(weekendPlusOne, day(17), false)).toBe(true) // this Tuesday only: 3 this week
    expect(canRest(weekendPlusOne, day(17), true)).toBe(false) // every Tuesday: next week would have 4
    const threeWeekly: StudyDays = { weekly: ['rest', 'rest', 'full', 'full', 'full', 'full', 'rest'], dates: {} }
    expect(canRest(threeWeekly, day(17), true)).toBe(false) // a 4th weekly rest day
  })
})

describe('setDayMode', () => {
  it('just this date', () => {
    expect(setDayMode(DEFAULT_STUDY_DAYS, day(21), 'light', false, TODAY)).toEqual({ weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-21': 'light' } })
  })

  it('back to the weekly choice: the one-off is dropped', () => {
    const days: StudyDays = { weekly: weekly('rest'), dates: { '2026-11-22': 'full' } }
    expect(setDayMode(days, day(22), 'rest', false, TODAY).dates).toEqual({})
  })

  it('every week: the weekday changes and the other weekly rest days stay', () => {
    const days: StudyDays = { weekly: weekly('rest'), dates: { '2026-11-21': 'light' } }
    expect(setDayMode(days, day(21), 'rest', true, TODAY)).toEqual({ weekly: weekly('rest', 'rest'), dates: {} })
  })

  it('drops one-off days that have passed', () => {
    const days: StudyDays = { weekly: weekly('full'), dates: { '2026-11-10': 'rest', '2026-11-30': 'light' } }
    expect(setDayMode(days, day(21), 'light', false, TODAY).dates).toEqual({ '2026-11-21': 'light', '2026-11-30': 'light' })
  })
})
