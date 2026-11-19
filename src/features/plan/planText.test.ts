import { describe, expect, it } from 'vitest'
import type { FocusTask, PlanTask, StudyPlan } from '@/lib/studyPlan'
import { doneOf, itemsOf, minutesFor, planRows, progressText, reasonNote, shortName, taskNote, taskTitle, taskWhy, tomorrowLine } from './planText'

const focusFields = { subjectId: 4, code: 'BBIS', name: 'Blood Banking & Immunoserology', reason: { kind: 'below-floor', accuracy: 0.46 } as const }
/** Questions on the whole subject (no topic). */
const subjectTask: FocusTask = { kind: 'subject', count: 20, ...focusFields, topicId: null, topicName: null, startAccuracy: 0.46 }
/** Questions on one topic. */
const topicTask: FocusTask = { ...subjectTask, topicId: 42, topicName: 'Antibody screening', startAccuracy: 0.3 }
/** Study, then test. */
const learnTask: FocusTask = { kind: 'learn', count: 10, ...focusFields, reason: { kind: 'below-floor', accuracy: 0.14 }, topicId: 31, topicName: 'Coagulation', startAccuracy: 0.1 }
const plan = (tasks: PlanTask[], comeback = false): StudyPlan => ({ date: '2026-11-19', mode: 'full', phase: 'strengthen', daysLeft: 54, comeback, tasks })
const progress = (done: Record<string, number>) => ({ date: '2026-11-19', done, studied: {}, results: {} })

describe('taskTitle', () => {
  it('names each kind of task, with short subject names', () => {
    expect(taskTitle({ kind: 'flashcards', count: 18, later: 0 })).toBe('Review 18 flashcards')
    expect(taskTitle(subjectTask)).toBe('20 Blood Banking questions')
    expect(taskTitle(subjectTask, 1)).toBe('1 Blood Banking question')
    expect(taskTitle({ kind: 'mistakes', count: 1, questionIds: ['a'] })).toBe('Fix 1 past mistake')
    expect(taskTitle({ kind: 'mixed', count: 10 })).toBe('10 mixed questions')
    expect(taskTitle({ kind: 'mock' })).toBe('Mock exam')
  })

  it('names the topic when there is one; "Learn" has no number', () => {
    expect(taskTitle(topicTask)).toBe('20 Antibody screening questions')
    expect(taskTitle(learnTask)).toBe('Learn Coagulation')
    expect(taskTitle(learnTask, 1)).toBe('Learn Coagulation')
  })

  it('falls back to the full name for an unknown subject code', () => {
    expect(shortName('XYZ', 'Something New')).toBe('Something New')
  })
})

describe('reasonNote', () => {
  it('says how far from the line, rounding down so 49.6% never reads as 50%', () => {
    expect(reasonNote({ kind: 'below-floor', accuracy: 0.496 })).toEqual({ text: '49% · below the 50% line', tone: 'red' })
    expect(reasonNote({ kind: 'below-passing', accuracy: 0.72 })).toEqual({ text: '72% · close to 75%', tone: 'red' })
    expect(reasonNote({ kind: 'below-passing', accuracy: 0.6 })).toEqual({ text: '60% · below 75%', tone: 'red' })
    expect(reasonNote({ kind: 'not-tried' })).toEqual({ text: 'Not tried yet', tone: 'blue' })
    // Under 10 answers: no percent (1 wrong answer is not "0% · below the 50% line").
    expect(reasonNote({ kind: 'getting-started', attempts: 1 })).toEqual({ text: '1/10 answered · getting started', tone: 'blue' })
    expect(reasonNote({ kind: 'keep-sharp', accuracy: 0.88 }).text).toBe('88% · keep it sharp')
  })
})

describe('taskNote', () => {
  it('on a comeback day, says the extra cards are spread out and the oldest mistakes go first', () => {
    const back = plan([], true)
    expect(taskNote({ kind: 'flashcards', count: 10, later: 32 }, back).text).toBe('32 more spread over 4 days')
    expect(taskNote({ kind: 'mistakes', count: 5, questionIds: [] }, back)).toEqual({ text: 'The oldest ones first', tone: 'gold' })
    expect(taskNote({ kind: 'flashcards', count: 18, later: 0 }, plan([])).text).toBe('Due today')
  })

  it('a topic task names its subject in the tag (the title has the topic)', () => {
    expect(taskNote(subjectTask, plan([])).text).toBe('46% · below the 50% line')
    expect(taskNote(topicTask, plan([])).text).toBe('Blood Banking 46% · below the 50% line')
    expect(taskNote({ ...topicTask, reason: { kind: 'not-tried' } }, plan([])).text).toBe('Blood Banking · not tried yet')
    expect(taskNote({ ...topicTask, reason: { kind: 'getting-started', attempts: 3 } }, plan([])).text).toBe('Blood Banking · 3/10 answered')
  })
})

describe('doneOf / itemsOf / progressText', () => {
  it('counts what she did today, never more than the task has', () => {
    expect(doneOf(subjectTask, progress({ 'subject:4': 12 }), null)).toBe(12)
    expect(doneOf(subjectTask, progress({ 'subject:4': 50 }), null)).toBe(20)
    expect(doneOf(subjectTask, progress({ 'subject:2': 20 }), null)).toBe(0)
  })

  it('the Mock exam is done once she finished one today', () => {
    expect(itemsOf({ kind: 'mock' })).toBe(1)
    expect(doneOf({ kind: 'mock' }, progress({}), '2026-11-19')).toBe(1)
    expect(doneOf({ kind: 'mock' }, progress({}), '2026-11-16')).toBe(0)
    expect(doneOf({ kind: 'mock' }, progress({}), null)).toBe(0)
  })

  it('a "Learn" task has two steps: study, then test', () => {
    expect(itemsOf(learnTask)).toBe(2)
    expect(doneOf(learnTask, progress({ 'learn:4': 10 }), null)).toBe(2)
    const [half] = planRows(plan([learnTask]), progress({ 'learn:4': 1 }), null)
    expect(progressText(half)).toBe('Studied. Next: the test.')
    const [some] = planRows(plan([subjectTask]), progress({ 'subject:4': 5 }), null)
    expect(progressText(some)).toBe('5 of 20 done')
  })
})

describe('taskWhy', () => {
  it('explains each task in one line', () => {
    expect(taskWhy(subjectTask)).toMatch(/below 50% fails the whole exam/)
    expect(taskWhy({ ...subjectTask, reason: { kind: 'not-tried' } })).toMatch(/haven’t tried/)
    expect(taskWhy({ ...subjectTask, reason: { kind: 'getting-started', attempts: 3 } })).toMatch(/^Only a few answers here so far\. 10 give it a real score/)
    expect(taskWhy({ kind: 'flashcards', count: 10, later: 32 })).toBe('Only 10 today after your days away. The other 32 come over the next few days.')
    expect(taskWhy({ kind: 'mock' })).toMatch(/every 3 days/)
  })

  it('says why "Learn", and names today’s topic', () => {
    expect(taskWhy(learnTask)).toBe('Below 35% is close to guessing, so you see the answers with the why first, then try the same 10. Today’s topic: Coagulation (10%).')
    expect(taskWhy({ ...learnTask, reason: { kind: 'not-tried' }, startAccuracy: null })).toMatch(/^New to you, .* Today’s topic: Coagulation, new to you\.$/)
    expect(taskWhy({ ...learnTask, reason: { kind: 'below-passing', accuracy: 0.6 } })).toMatch(/^Only a few answers here so far/)
    expect(taskWhy({ ...learnTask, reason: { kind: 'getting-started', attempts: 1 } })).toMatch(/^Only a few answers here so far, so you see the answers/)
    expect(taskWhy(topicTask)).toMatch(/Today’s topic: Antibody screening \(30%\)\.$/)
  })
})

describe('planRows', () => {
  it('pairs each task with how much of it is done', () => {
    const rows = planRows(plan([{ kind: 'flashcards', count: 18, later: 0 }, subjectTask, { kind: 'mock' }]), progress({ flashcards: 18, 'subject:4': 5 }), null)
    expect(rows.map((r) => [r.items, r.done, r.complete])).toEqual([
      [18, 18, true],
      [20, 5, false],
      [1, 0, false],
    ])
  })
})

describe('minutesFor', () => {
  it('estimates about 45 s a question and 25 s a flashcard', () => {
    expect(minutesFor(subjectTask)).toBe(15)
    expect(minutesFor({ kind: 'flashcards', count: 18, later: 0 })).toBe(8)
    expect(minutesFor(subjectTask, 1)).toBe(1)
    expect(minutesFor({ kind: 'mock' })).toBeNull()
  })

  it('"Learn": studying and testing 10, or only the test once studied', () => {
    expect(minutesFor(learnTask)).toBe(13)
    expect(minutesFor(learnTask, 1)).toBe(8)
  })
})

describe('tomorrowLine', () => {
  it('names the focus task, the past mistakes, and a Mock exam day', () => {
    expect(tomorrowLine({ mode: 'full', task: { ...topicTask, reason: { kind: 'below-passing', accuracy: 0.72 } }, mistakes: 5, mock: false })).toBe(
      'Antibody screening (Blood Banking) · 72% · close to 75% · 5 past mistakes',
    )
    expect(tomorrowLine({ mode: 'full', task: learnTask, mistakes: 0, mock: false })).toBe('Learn Coagulation (Blood Banking)')
    expect(tomorrowLine({ mode: 'full', task: null, mistakes: 0, mock: true })).toBe('Mock exam day')
    expect(tomorrowLine({ mode: 'full', task: null, mistakes: 0, mock: false })).toMatch(/fresh plan/)
  })
})
