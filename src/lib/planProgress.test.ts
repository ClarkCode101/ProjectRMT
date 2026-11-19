import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addProgress, addResult, addStudied, parseSavedPlan, progressFor, readPlanProgress, readSavedPlan, recordPlanProgress, recordStudied, saveTodaysPlan } from './planProgress'
import type { StudyPlan } from './studyPlan'

const today = new Date(2026, 10, 19, 20, 0)
const tomorrow = new Date(2026, 10, 20, 8, 0)

const plan: StudyPlan = {
  mode: 'full',
  date: '2026-11-19',
  phase: 'strengthen',
  daysLeft: 54,
  comeback: false,
  tasks: [{ kind: 'flashcards', count: 18, later: 0 }, { kind: 'mixed', count: 10 }, { kind: 'mock' }],
}

describe('parseSavedPlan', () => {
  it('returns today’s plan for the same member', () => {
    expect(parseSavedPlan({ userId: 'u1', plan }, 'u1', today)).toEqual(plan)
  })

  it('makes a new one for another day or another member on this device', () => {
    expect(parseSavedPlan({ userId: 'u1', plan }, 'u1', tomorrow)).toBeNull()
    expect(parseSavedPlan({ userId: 'u1', plan }, 'u2', today)).toBeNull()
  })

  it('ignores broken or empty data', () => {
    for (const stored of [null, 'x', {}, { userId: 'u1' }, { userId: 'u1', plan: { ...plan, tasks: [] } }, { userId: 'u1', plan: { ...plan, tasks: 'no' } }]) {
      expect(parseSavedPlan(stored, 'u1', today)).toBeNull()
    }
    const badTask = { ...plan, tasks: [{ kind: 'dance', count: 3 }] }
    const noCount = { ...plan, tasks: [{ kind: 'mixed' }] }
    expect(parseSavedPlan({ userId: 'u1', plan: badTask }, 'u1', today)).toBeNull()
    expect(parseSavedPlan({ userId: 'u1', plan: noCount }, 'u1', today)).toBeNull()
  })

  it('makes a new plan when a saved focus task has no topic fields (saved before topics existed)', () => {
    const oldSubject = { kind: 'subject', subjectId: 4, code: 'BBIS', name: 'BBIS', count: 20, reason: { kind: 'not-tried' } }
    expect(parseSavedPlan({ userId: 'u1', plan: { ...plan, tasks: [oldSubject] } }, 'u1', today)).toBeNull()
    const withTopic = { ...oldSubject, topicId: 42, topicName: 'Antibody screening', startAccuracy: null }
    expect(parseSavedPlan({ userId: 'u1', plan: { ...plan, tasks: [withTopic] } }, 'u1', today)).not.toBeNull()
  })

  it('a plan saved before study days was a full day; a rest day has no tasks', () => {
    const old = { ...plan, mode: undefined }
    expect(parseSavedPlan({ userId: 'u1', plan: old }, 'u1', today)?.mode).toBe('full')
    expect(parseSavedPlan({ userId: 'u1', plan: { ...plan, mode: 'rest', tasks: [] } }, 'u1', today)?.mode).toBe('rest')
    expect(parseSavedPlan({ userId: 'u1', plan: { ...plan, mode: 'nap' } }, 'u1', today)).toBeNull()
  })
})

describe('progressFor', () => {
  it('starts from nothing when there is nothing stored, or it is broken', () => {
    for (const stored of [null, undefined, 'text', 42, {}, { date: '2026-11-19' }, { date: '2026-11-19', done: null }]) {
      expect(progressFor(stored, today)).toEqual({ date: '2026-11-19', done: {}, studied: {}, results: {} })
    }
  })

  it('keeps only lists of question ids as studied', () => {
    const stored = { date: '2026-11-19', done: { 'learn:3': 1 }, studied: { 'learn:3': ['q1', 'q2'], 'learn:4': [], 'learn:5': [1, 2], 'learn:6': 'q1' } }
    expect(progressFor(stored, today).studied).toEqual({ 'learn:3': ['q1', 'q2'] })
    // saved before "studied" existed: still fine
    expect(progressFor({ date: '2026-11-19', done: { mixed: 2 } }, today)).toEqual({ date: '2026-11-19', done: { mixed: 2 }, studied: {}, results: {} })
  })

  it('a new day starts from zero', () => {
    expect(progressFor({ date: '2026-11-18', done: { mixed: 10 } }, today).done).toEqual({})
  })

  it('keeps only whole positive counts', () => {
    const stored = { date: '2026-11-19', done: { mixed: 10, 'subject:4': -2, mistakes: 1.5, flashcards: 'x' } }
    expect(progressFor(stored, today).done).toEqual({ mixed: 10 })
  })
})

describe('addProgress', () => {
  it('adds up, per task', () => {
    let p = progressFor(null, today)
    p = addProgress(p, 'subject:4', 12)
    p = addProgress(p, 'subject:4', 8)
    p = addProgress(p, 'mixed', 3)
    expect(p.done).toEqual({ 'subject:4': 20, mixed: 3 })
  })

  it('studying is one step, however many times (only the test can finish a "Learn" task)', () => {
    let p = progressFor(null, today)
    p = addStudied(p, 'learn:3', ['q1', 'q2'])
    p = addStudied(p, 'learn:3', ['q3'])
    expect(p.done['learn:3']).toBe(1)
    expect(p.studied['learn:3']).toEqual(['q3'])
    p = addProgress(p, 'learn:3', 1) // the test
    expect(p.done['learn:3']).toBe(2)
    expect(addStudied(p, 'learn:3', ['q4']).done['learn:3']).toBe(2) // studying again after the test doesn't undo it
    expect(addStudied(p, 'learn:9', [])).toBe(p) // nothing studied: nothing changes
  })

  it('adds up each session’s result, per task, and drops broken ones', () => {
    let p = progressFor(null, today)
    p = addResult(p, 'subject:4', { correct: 5, total: 8, fixed: 5 })
    p = addResult(p, 'subject:4', { correct: 9, total: 12, fixed: 9 })
    expect(p.results['subject:4']).toEqual({ correct: 14, total: 20, fixed: 14 })
    expect(addResult(p, 'mixed', { correct: 0, total: 0, fixed: 0 })).toBe(p) // nothing answered
    expect(addResult(p, 'mixed', { correct: 3, total: 2, fixed: 0 })).toBe(p) // can't be
    const stored = { date: '2026-11-19', done: {}, results: { mixed: { correct: 3, total: 5, fixed: 3 }, bad: { correct: 'x' } } }
    expect(progressFor(stored, today).results).toEqual({ mixed: { correct: 3, total: 5, fixed: 3 } })
  })

  it('ignores zero or bad counts', () => {
    const p = progressFor(null, today)
    expect(addProgress(p, 'mixed', 0)).toBe(p)
    expect(addProgress(p, 'mixed', -1)).toBe(p)
  })
})

describe('on this device', () => {
  // Tests run in Node (no browser), so give them a tiny in-memory localStorage.
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('remembers today’s progress and forgets it tomorrow', () => {
    recordPlanProgress('mistakes', 5, today)
    recordPlanProgress('mistakes', 3, today)
    expect(readPlanProgress(today).done).toEqual({ mistakes: 8 })
    expect(readPlanProgress(tomorrow).done).toEqual({})
  })

  it('remembers what she studied for the test, today only', () => {
    recordStudied('learn:3', ['q1', 'q2'], today)
    expect(readPlanProgress(today)).toMatchObject({ done: { 'learn:3': 1 }, studied: { 'learn:3': ['q1', 'q2'] } })
    expect(readPlanProgress(tomorrow).studied).toEqual({})
  })

  it('keeps the plan for the day', () => {
    expect(readSavedPlan('u1', today)).toBeNull()
    saveTodaysPlan('u1', plan)
    expect(readSavedPlan('u1', today)).toEqual(plan)
    expect(readSavedPlan('u1', tomorrow)).toBeNull()
  })

  it('survives broken stored data', () => {
    localStorage.setItem('projectrmt:plan-progress', '{not json')
    expect(readPlanProgress(today).done).toEqual({})
    recordPlanProgress('mixed', 2, today)
    expect(readPlanProgress(today).done).toEqual({ mixed: 2 })
  })
})
