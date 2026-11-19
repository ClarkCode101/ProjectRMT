import { describe, expect, it } from 'vitest'
import type { PlanProgress, TaskResult } from '@/lib/planProgress'
import type { SubjectSummary } from '@/lib/quiz'
import type { FocusTask, PlanAttempt, StudyPlan } from '@/lib/studyPlan'
import { learnedToday, missedToday } from './planRecap'

const today = new Date(2026, 10, 19, 20, 0)
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).toISOString()
const answer = (id: string, isCorrect: boolean, created_at: string, from_game = false): PlanAttempt => ({ question_id: id, is_correct: isCorrect, created_at, from_game })

const learn: FocusTask = {
  kind: 'learn',
  count: 10,
  subjectId: 3,
  code: 'HEMA',
  name: 'Hematology',
  reason: { kind: 'below-floor', accuracy: 0.14 },
  topicId: 31,
  topicName: 'Coagulation',
  startAccuracy: 0.1,
}
const plan: StudyPlan = {
  mode: 'full',
  date: '2026-11-19',
  phase: 'strengthen',
  daysLeft: 54,
  comeback: false,
  tasks: [{ kind: 'flashcards', count: 2, later: 0 }, learn, { kind: 'mistakes', count: 5, questionIds: [] }],
}
const summary: SubjectSummary[] = [
  {
    subjectId: 3,
    code: 'HEMA',
    name: 'Hematology',
    attempts: 40,
    accuracy: 0.2,
    belowPassing: true,
    belowFloor: true,
    topics: [{ topicId: 31, name: 'Coagulation', attempts: 20, accuracy: 0.43, belowPassing: true }],
  },
]
const progress = (results: Record<string, TaskResult>): PlanProgress => ({ date: '2026-11-19', done: {}, studied: {}, results })

describe('missedToday', () => {
  it('counts different questions missed today, games left out', () => {
    const attempts = [
      answer('a', false, at(19)),
      answer('a', false, at(19, 11)), // same question twice: once
      answer('b', false, at(18)), // yesterday
      answer('c', true, at(19)),
      answer('d', false, at(19), true), // a game
      answer('e', false, at(19)),
    ]
    expect(missedToday(attempts, today)).toBe(2)
  })
})

describe('learnedToday', () => {
  it('shows what moved: the topic first, then mistakes fixed, cards, and what comes back tomorrow', () => {
    const results = {
      'learn:3': { correct: 7, total: 10, fixed: 7 },
      mistakes: { correct: 3, total: 5, fixed: 4 },
      flashcards: { correct: 2, total: 2, fixed: 2 },
    }
    const attempts = [answer('x1', false, at(19)), answer('x2', false, at(19)), answer('x3', false, at(19)), answer('m1', false, at(19))]
    expect(learnedToday(plan, progress(results), summary, attempts, today)).toEqual([
      { kind: 'topic', title: 'Coagulation', detail: 'Studied 10, then got 7 of 10 on the test', from: 0.1, to: 0.43 },
      {
        kind: 'fixed',
        title: '4 past mistakes fixed',
        detail: '3 right on the first try come back in 3 days, 1 fixed after a retry come back tomorrow, to make sure.',
        score: '4 / 5',
      },
      { kind: 'cards', title: '2 flashcards remembered', detail: 'Each one comes back right before you’d forget it.' },
      { kind: 'retry', title: '4 to try again tomorrow', detail: 'The ones you missed today come back first.' },
    ])
  })

  it('a task done without a result (e.g. nothing was left to do) still shows, without numbers', () => {
    const rows = learnedToday(plan, progress({}), summary, [], today)
    expect(rows[0]).toEqual({ kind: 'topic', title: 'Coagulation', detail: 'Done', from: 0.1, to: null })
    expect(rows[1]).toMatchObject({ kind: 'other', title: 'Past mistakes done' })
    expect(rows[2]).toMatchObject({ kind: 'cards', title: 'Flashcards done' })
    expect(rows).toHaveLength(3) // nothing missed today: no "try again" line
  })

  it('a whole-subject task uses the subject’s score now', () => {
    const wholeSubject: FocusTask = { ...learn, kind: 'subject', count: 20, topicId: null, topicName: null, startAccuracy: 0.14 }
    const rows = learnedToday({ ...plan, tasks: [wholeSubject] }, progress({ 'subject:3': { correct: 9, total: 20, fixed: 9 } }), summary, [], today)
    expect(rows).toEqual([{ kind: 'topic', title: 'Hematology', detail: '9 of 20 right', from: 0.14, to: 0.2 }])
  })
})
