import { describe, expect, it } from 'vitest'
import { DEFAULT_STUDY_DAYS, type StudyDays } from './studyDays'
import type { PlanAttempt } from './studyPlan'
import { recapHeadline, recapTip, signedDelta, weekRecap, type WeekRecap } from './weeklyRecap'

// Monday, Nov 23 2026. Last week = Mon Nov 16 – Sun Nov 22; the week before = Nov 9 – 15.
const today = new Date(2026, 10, 23, 9)
let n = 0
/** `count` answers on Nov `day`, the first `right` of them right. */
const on = (day: number, count: number, right = count, question?: string): PlanAttempt[] =>
  Array.from({ length: count }, (_, i) => ({
    question_id: question ?? `q${n++}`,
    is_correct: i < right,
    created_at: new Date(2026, 10, day, 10).toISOString(),
  }))
const sundayRest: StudyDays = { weekly: ['rest', 'full', 'full', 'full', 'full', 'full', 'full'], dates: {} }

describe('weekRecap', () => {
  it('a new member (no answers before this week): no recap', () => {
    expect(weekRecap([], today, DEFAULT_STUDY_DAYS)).toBeNull()
    expect(weekRecap(on(23, 5), today, DEFAULT_STUDY_DAYS)).toBeNull()
  })

  it('counts last week’s days, answers and score, and compares with the week before', () => {
    const attempts = [...on(10, 20, 10), ...on(16, 30, 21), ...on(17, 12, 6), ...on(19, 40, 30), ...on(20, 20, 12), ...on(21, 10, 5)]
    const r = weekRecap(attempts, today, sundayRest)!
    expect(r.weekStart).toBe('2026-11-16')
    expect(r.days.map((d) => d.answered)).toEqual([30, 12, 0, 40, 20, 10, 0])
    expect(r).toMatchObject({ studied: 5, studyDays: 6, answered: 112, prevAnswered: 20, best: true, rested: true })
    expect(r.accuracy).toBeCloseTo(74 / 112)
    expect(r.prevAccuracy).toBeCloseTo(0.5)
    expect(recapHeadline(r)).toBe('5 of 6 study days. Your best week so far!')
    expect(recapTip(r)).toBe('Wednesday was empty. If it’s a busy day, make it a light day this week.')
  })

  it('streak at the end of the week: the rest day doesn’t break it', () => {
    const attempts = [...on(19, 5), ...on(20, 5), ...on(21, 5)]
    expect(weekRecap(attempts, today, sundayRest)!.streak).toBe(3)
  })

  it('past mistakes fixed during the week (right at the 14-day step)', () => {
    // Missed Oct 20; right Oct 21 (1 day), Oct 24 (3), Oct 31 (7), then Nov 18 (14 days): fixed last week.
    const at = (m: number, d: number, ok: boolean): PlanAttempt => ({ question_id: 'x', is_correct: ok, created_at: new Date(2026, m, d, 10).toISOString() })
    const attempts = [at(9, 20, false), at(9, 21, true), at(9, 24, true), at(9, 31, true), at(10, 18, true)]
    expect(weekRecap(attempts, today, DEFAULT_STUDY_DAYS)!.fixed).toBe(1)
  })

  it('a quiet week, and a week back after a quiet one', () => {
    const quiet = weekRecap(on(10, 15), today, DEFAULT_STUDY_DAYS)!
    expect(quiet.answered).toBe(0)
    expect(recapHeadline(quiet)).toBe('A quiet week. A fresh one starts today.')
    const back = weekRecap([...on(2, 50), ...on(18, 10)], today, DEFAULT_STUDY_DAYS)!
    expect(recapHeadline(back)).toBe('1 of 7 study days. Back on track!')
  })
})

describe('recapHeadline / recapTip', () => {
  const base: WeekRecap = {
    weekStart: '2026-11-16',
    days: [],
    studied: 6,
    studyDays: 6,
    answered: 100,
    prevAnswered: 120,
    accuracy: 0.6,
    prevAccuracy: 0.7,
    fixed: 0,
    streak: 6,
    best: false,
    rested: true,
  }
  it('every study day', () => {
    expect(recapHeadline(base)).toBe('6 of 6 study days. Every one of them!')
  })
  it('a dip in the score', () => {
    expect(recapTip(base)).toMatch(/dipped/)
  })
  it('seven days straight with no rest', () => {
    expect(recapTip({ ...base, studied: 7, studyDays: 7, rested: false, accuracy: 0.7 })).toMatch(/^Seven days straight/)
  })
  it('signed numbers', () => {
    expect(signedDelta(142, 104)).toBe('+38')
    expect(signedDelta(90, 102)).toBe('−12')
    expect(signedDelta(5, 5)).toBe('same')
  })
})
