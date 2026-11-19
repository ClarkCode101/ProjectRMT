import { describe, expect, it } from 'vitest'
import { localDateKey } from './activity'
import { canRest, DEFAULT_STUDY_DAYS, modeFor, otherRestDay, parseStudyDays, setDayMode, weekOf, type DayMode, type StudyDays } from './studyDays'

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

describe('canRest: one rest day a week', () => {
  it('a free week: any day can rest', () => {
    expect(canRest(DEFAULT_STUDY_DAYS, day(21), false)).toBe(true)
  })

  it('another rest day this week: not this one too', () => {
    const days: StudyDays = { weekly: weekly('rest'), dates: {} }
    expect(otherRestDay(days, day(21))?.getDate()).toBe(22)
    expect(canRest(days, day(21), false)).toBe(false)
    expect(canRest(days, day(22), false)).toBe(true) // Sunday itself
  })

  it('as the new weekly rest day, it can take the place of the old weekly one, not of a one-off one', () => {
    expect(canRest({ weekly: weekly('rest'), dates: {} }, day(21), true)).toBe(true)
    expect(canRest({ weekly: weekly('full'), dates: { '2026-11-20': 'rest' } }, day(21), true)).toBe(false)
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

  it('every week: the weekday changes, and a new weekly rest day replaces the old one', () => {
    const days: StudyDays = { weekly: weekly('rest'), dates: { '2026-11-21': 'light' } }
    expect(setDayMode(days, day(21), 'rest', true, TODAY)).toEqual({ weekly: weekly('full', 'rest'), dates: {} })
  })

  it('drops one-off days that have passed', () => {
    const days: StudyDays = { weekly: weekly('full'), dates: { '2026-11-10': 'rest', '2026-11-30': 'light' } }
    expect(setDayMode(days, day(21), 'light', false, TODAY).dates).toEqual({ '2026-11-21': 'light', '2026-11-30': 'light' })
  })
})
