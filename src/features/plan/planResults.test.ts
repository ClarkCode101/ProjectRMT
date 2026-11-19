import { describe, expect, it } from 'vitest'
import type { PlanProgress } from '@/lib/planProgress'
import type { FocusTask, StudyPlan } from '@/lib/studyPlan'
import { planResultInfo, planResultMessage } from './planResults'

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
  phase: null,
  daysLeft: null,
  comeback: false,
  tasks: [{ kind: 'flashcards', count: 2, later: 0 }, learn, { kind: 'mistakes', count: 5, questionIds: [] }],
}
const progress = (done: Record<string, number>): PlanProgress => ({ date: '2026-11-19', done, studied: {}, results: {} })

describe('planResultInfo', () => {
  it('says where she is, and links the next task', () => {
    const info = planResultInfo(plan, progress({ flashcards: 2, 'learn:3': 2 }), null, 'learn:3')
    expect(info).toEqual({
      done: 2,
      total: 3,
      dots: [true, true, false],
      taskLabel: 'Learn Coagulation',
      kind: 'learn',
      focus: { subjectId: 3, topicId: 31, from: 0.1 },
      next: { title: 'Fix 5 past mistakes', to: '/practice?plan=mistakes&count=5' },
    })
  })

  it('the next task is the first one not done, even if it comes before this one', () => {
    const info = planResultInfo(plan, progress({ 'learn:3': 2, mistakes: 5 }), null, 'mistakes')
    expect(info?.taskLabel).toBe('Past mistakes')
    expect(info?.next).toEqual({ title: 'Review 2 flashcards', to: '/flashcards?plan=cards&count=2' })
  })

  it('all done: no next task', () => {
    const info = planResultInfo(plan, progress({ flashcards: 2, 'learn:3': 2, mistakes: 5 }), null, 'mistakes')
    expect(info).toMatchObject({ done: 3, total: 3, next: null })
  })

  it('no plan, or the task isn’t in it (swapped meanwhile): a normal results screen', () => {
    expect(planResultInfo(null, progress({}), null, 'learn:3')).toBeNull()
    expect(planResultInfo(plan, progress({}), null, 'subject:9')).toBeNull()
  })
})

describe('planResultMessage', () => {
  const info = planResultInfo(plan, progress({ flashcards: 2, 'learn:3': 2 }), null, 'learn:3')!

  it('after "Learn": what she learned, and when the missed ones come back', () => {
    expect(planResultMessage(info, 7, 10)).toBe('You learned 7 of them. The 3 you missed come back tomorrow in your plan. Read why below first.')
    expect(planResultMessage(info, 10, 10)).toBe('You learned 10 of them. Every one right. On to the next task.')
  })

  it('the last task: where to see what moved', () => {
    expect(planResultMessage({ ...info, next: null }, 4, 5)).toBe('That’s today’s plan, done. Come see what moved.')
  })

  it('flashcards: the ones pressed "Again" come back sooner', () => {
    expect(planResultMessage({ ...info, kind: 'flashcards' }, 1, 2)).toMatch(/^1 come back sooner/)
  })
})
