import { describe, expect, it } from 'vitest'
import { PLAN_LINK_MAX, planTaskLink, readFlashcardPlanLink, readPracticePlanLink, taskKey } from './planLinks'
import type { PlanTask } from './studyPlan'

const params = (link: string) => new URLSearchParams(link.split('?')[1] ?? '')

const focus = { subjectId: 4, code: 'BBIS', name: 'Blood Banking', reason: { kind: 'below-floor', accuracy: 0.46 } as const, startAccuracy: 0.3 }
const subjectTask: PlanTask = { kind: 'subject', count: 20, ...focus, topicId: 42, topicName: 'Antibody screening' }
const wholeSubject: PlanTask = { ...subjectTask, topicId: null, topicName: null }
const learnTask: PlanTask = { kind: 'learn', count: 10, ...focus, topicId: 42, topicName: 'Antibody screening' }

describe('planTaskLink + read back', () => {
  it('round-trips every practice task', () => {
    expect(readPracticePlanLink(params(planTaskLink(subjectTask, 12)))).toEqual({ kind: 'subject', subjectId: 4, topicId: 42, count: 12 })
    expect(readPracticePlanLink(params(planTaskLink(wholeSubject, 12)))).toEqual({ kind: 'subject', subjectId: 4, topicId: null, count: 12 })
    expect(readPracticePlanLink(params(planTaskLink({ kind: 'mistakes', count: 8, questionIds: [] }, 8)))).toEqual({ kind: 'mistakes', count: 8 })
    expect(readPracticePlanLink(params(planTaskLink({ kind: 'mixed', count: 10 }, 10)))).toEqual({ kind: 'mixed', count: 10 })
  })

  it('"Learn" starts with the study step; with one step left, straight to the test on the same count', () => {
    expect(readPracticePlanLink(params(planTaskLink(learnTask, 2)))).toEqual({ kind: 'learn', subjectId: 4, topicId: 42, count: 10, step: 'study' })
    expect(readPracticePlanLink(params(planTaskLink(learnTask, 1)))).toEqual({ kind: 'learn', subjectId: 4, topicId: 42, count: 10, step: 'test' })
  })

  it('flashcards go to Flashcards, the Mock exam to its own page', () => {
    const cards = planTaskLink({ kind: 'flashcards', count: 18, later: 0 }, 18)
    expect(cards).toBe('/flashcards?plan=cards&count=18')
    expect(readFlashcardPlanLink(params(cards))).toBe(18)
    expect(planTaskLink({ kind: 'mock' }, 1)).toBe('/mock')
  })

  it('keeps the count between 1 and the max', () => {
    expect(planTaskLink(subjectTask, 0)).toContain('count=1')
    expect(planTaskLink(subjectTask, 9999)).toContain(`count=${PLAN_LINK_MAX}`)
    expect(readPracticePlanLink(new URLSearchParams('plan=mixed&count=9999'))).toEqual({ kind: 'mixed', count: PLAN_LINK_MAX })
  })
})

describe('reading a bad or missing link', () => {
  it('is not a plan link', () => {
    expect(readPracticePlanLink(new URLSearchParams(''))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('subject=4'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=mixed'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=mixed&count=-3'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=mixed&count=2.5'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=subject&count=5'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=subject&subject=abc&count=5'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=games&count=5'))).toBeNull()
    expect(readPracticePlanLink(new URLSearchParams('plan=learn&count=10'))).toBeNull()
    // a bad topic is ignored (the whole subject), not a reason to drop the link
    expect(readPracticePlanLink(new URLSearchParams('plan=subject&subject=4&topic=x&count=5'))).toEqual({ kind: 'subject', subjectId: 4, topicId: null, count: 5 })
    expect(readFlashcardPlanLink(new URLSearchParams('subject=4'))).toBeNull()
    expect(readFlashcardPlanLink(new URLSearchParams('plan=cards'))).toBeNull()
  })
})

describe('taskKey', () => {
  it('gives each subject its own key, the same for the plan task and its link', () => {
    expect(taskKey(subjectTask)).toBe('subject:4')
    expect(taskKey({ kind: 'subject', subjectId: 4, topicId: 42, count: 3 })).toBe('subject:4')
    expect(taskKey(learnTask)).toBe('learn:4')
    expect(taskKey({ kind: 'learn', subjectId: 4, topicId: null, count: 10, step: 'test' })).toBe('learn:4')
    expect(taskKey({ kind: 'mistakes', count: 3 })).toBe('mistakes')
    expect(taskKey({ kind: 'flashcards' })).toBe('flashcards')
  })
})
