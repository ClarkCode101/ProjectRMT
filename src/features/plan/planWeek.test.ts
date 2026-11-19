import { describe, expect, it } from 'vitest'
import { DEFAULT_STUDY_DAYS, type DayMode, type StudyDays } from '@/lib/studyDays'
import { weekSoFar, weekTiles, type WeekInput } from './planWeek'

// Thursday, Nov 19 2026: the week is Mon Nov 16 – Sun Nov 22.
const today = new Date(2026, 10, 19, 20)
const on = (d: number, n: number) => Array.from({ length: n }, () => ({ created_at: new Date(2026, 10, d, 10).toISOString() }))
const days = (sat: DayMode, sun: DayMode): StudyDays => ({ weekly: [sun, 'full', 'full', 'full', 'full', 'full', sat], dates: {} })

function input(extra: Partial<WeekInput> = {}): WeekInput {
  return {
    today,
    studyDays: DEFAULT_STUDY_DAYS,
    attempts: [...on(16, 30), ...on(17, 12), ...on(19, 4)],
    dailyTarget: 25,
    examDate: null,
    todayLabel: 'Learn MICRO',
    tomorrow: { mode: 'full', task: null, mistakes: 10, mock: false },
    ...extra,
  }
}

describe('weekTiles', () => {
  it('past days from her answers, today, tomorrow’s likely plan, then her choices', () => {
    const tiles = weekTiles(input({ studyDays: days('light', 'rest') }))
    expect(tiles.map((t) => [t.key.slice(8), t.state, t.label, t.editable])).toEqual([
      ['16', 'done', '30 answered', false],
      ['17', 'some', '12 answered', false],
      ['18', 'none', 'No study', false],
      ['19', 'today', 'Learn MICRO', true],
      ['20', 'planned', 'Past mistakes', true],
      ['21', 'planned', 'Light day', true],
      ['22', 'planned', 'Rest', true],
    ])
  })

  it('a rest day that passed says Rest, not "No study"', () => {
    const sunday = new Date(2026, 10, 22, 20)
    const tiles = weekTiles(input({ today: sunday, studyDays: { weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-18': 'rest' } } }))
    expect(tiles[2]).toMatchObject({ state: 'rest', label: 'Rest' })
  })

  it('a light day’s goal is 10 answers', () => {
    const tiles = weekTiles(input({ studyDays: { weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-17': 'light' } } }))
    expect(tiles[1].state).toBe('done')
  })

  it('exam day is marked and can’t be changed', () => {
    expect(weekTiles(input({ examDate: '2026-11-21' }))[5]).toMatchObject({ state: 'exam', label: 'Exam day', editable: false })
  })
})

describe('weekSoFar', () => {
  it('counts the days she studied, out of the ones that weren’t rest days', () => {
    const attempts = [...on(16, 30), ...on(17, 12), ...on(19, 4)]
    const tiles = weekTiles(input({ attempts, studyDays: { weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-18': 'rest' } } }))
    expect(weekSoFar(tiles, attempts, today)).toEqual({ studied: 3, days: 3 })
    expect(weekSoFar(weekTiles(input({ attempts })), attempts, today)).toEqual({ studied: 3, days: 4 })
  })
})
