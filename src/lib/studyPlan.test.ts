import { describe, expect, it } from 'vitest'
import type { SubjectSummary, TopicInfo, TopicSummary } from './quiz'
import { DEFAULT_STUDY_DAYS } from './studyDays'
import {
  addDays,
  buildPlan,
  daysAway,
  daysBetween,
  dueMistakes,
  isFocusTask,
  mistakeLadder,
  needsLearning,
  phaseFor,
  pickFocus,
  pickTopic,
  previewTomorrow,
  reasonFor,
  roundToFive,
  swapSubject,
  type PlanAttempt,
  type PlanInput,
} from './studyPlan'

const today = new Date(2026, 10, 19, 20, 0) // Thu, Nov 19 2026, 8 PM local

/** An answer on a local day ("2026-11-18"), at 10 AM. */
function answer(questionId: string, isCorrect: boolean, day: string, extra: Partial<PlanAttempt> = {}): PlanAttempt {
  const [y, m, d] = day.split('-').map(Number)
  return { question_id: questionId, is_correct: isCorrect, created_at: new Date(y, m - 1, d, 10).toISOString(), ...extra }
}

/** A topic's score inside a subject summary. */
function topicScore(topicId: number, name: string, accuracy: number, attempts: number): TopicSummary {
  return { topicId, name, attempts, accuracy, belowPassing: accuracy < 0.75 }
}

/** A subject's summary; accuracy null = not tried yet. */
function subject(id: number, code: string, accuracy: number | null, attempts = 20, topics: TopicSummary[] = []): SubjectSummary {
  const tried = accuracy !== null
  return {
    subjectId: id,
    code,
    name: code,
    attempts: tried ? attempts : 0,
    accuracy,
    belowPassing: tried && accuracy < 0.75,
    belowFloor: tried && accuracy < 0.5,
    topics,
  }
}

// Blood Banking has two topics with scores; every other subject has one topic, not scored yet.
const SUMMARY = [
  subject(1, 'CC', 0.68),
  subject(2, 'MICRO', 0.72),
  subject(3, 'HEMA', 0.81),
  subject(4, 'BBIS', 0.46, 20, [topicScore(41, 'ABO system', 0.6, 10), topicScore(42, 'Antibody screening', 0.3, 10)]),
  subject(5, 'CM', 0.77),
  subject(6, 'HTMLE', null),
]
const TOPICS: TopicInfo[] = [
  ...[1, 2, 3, 5, 6].map((id) => ({ id: id * 10, subject_id: id, name: `Topic ${id}` })),
  { id: 41, subject_id: 4, name: 'ABO system' },
  { id: 42, subject_id: 4, name: 'Antibody screening' },
]

function input(extra: Partial<PlanInput> = {}): PlanInput {
  return {
    today,
    examDate: '2027-01-12', // 54 days away: Strengthen
    dailyTarget: 30,
    summary: SUMMARY,
    topics: TOPICS,
    attempts: [answer('x', true, '2026-11-18')], // studied yesterday
    flashcardsDue: 18,
    lastMockDay: null,
    studyDays: DEFAULT_STUDY_DAYS,
    ...extra,
  }
}

describe('addDays / daysBetween', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-11-19', '2027-01-12')).toBe(54)
    expect(daysBetween('2026-11-19', '2026-11-15')).toBe(-4)
  })
})

describe('phaseFor', () => {
  it('splits the days before the exam into three phases', () => {
    expect(phaseFor(120)).toBe('build')
    expect(phaseFor(61)).toBe('build')
    expect(phaseFor(60)).toBe('strengthen')
    expect(phaseFor(22)).toBe('strengthen')
    expect(phaseFor(21)).toBe('simulate')
    expect(phaseFor(0)).toBe('simulate')
  })

  it('has no phase without an exam date, or once it has passed', () => {
    expect(phaseFor(null)).toBeNull()
    expect(phaseFor(-1)).toBeNull()
  })
})

describe('dueMistakes', () => {
  it('brings a mistake back 1 day later', () => {
    expect(dueMistakes([answer('q1', false, '2026-11-19')], today)).toEqual([])
    expect(dueMistakes([answer('q1', false, '2026-11-18')], today)).toEqual([{ questionId: 'q1', due: '2026-11-19', step: 0 }])
  })

  it('moves up the steps (1, 3, 7, 14 days) with each right answer on or after its due day', () => {
    const history = [answer('q1', false, '2026-10-01'), answer('q1', true, '2026-10-02'), answer('q1', true, '2026-10-05')]
    // Now at step 2: due 7 days after Oct 5
    expect(dueMistakes(history, new Date(2026, 9, 11))).toEqual([])
    expect(dueMistakes(history, new Date(2026, 9, 12))).toEqual([{ questionId: 'q1', due: '2026-10-12', step: 2 }])
  })

  it('is fixed (gone) after the right answer at the 14-day step', () => {
    const history = [
      answer('q1', false, '2026-10-01'),
      answer('q1', true, '2026-10-02'),
      answer('q1', true, '2026-10-05'),
      answer('q1', true, '2026-10-12'),
      answer('q1', true, '2026-10-26'),
    ]
    expect(dueMistakes(history, today)).toEqual([])
  })

  it('does not skip the wait when answered right early (e.g. Review again the same day)', () => {
    const history = [answer('q1', false, '2026-11-17'), answer('q1', true, '2026-11-17')]
    expect(dueMistakes(history, today)).toEqual([{ questionId: 'q1', due: '2026-11-18', step: 0 }])
  })

  it('goes back to 1 day when missed again', () => {
    const history = [answer('q1', false, '2026-11-01'), answer('q1', true, '2026-11-02'), answer('q1', false, '2026-11-18')]
    expect(dueMistakes(history, today)).toEqual([{ questionId: 'q1', due: '2026-11-19', step: 0 }])
  })

  it('ignores game answers and questions she never missed', () => {
    const history = [answer('q1', false, '2026-11-10', { from_game: true }), answer('q2', true, '2026-11-10')]
    expect(dueMistakes(history, today)).toEqual([])
  })

  it('lists the oldest due first, in any input order', () => {
    const history = [answer('new', false, '2026-11-18'), answer('old', false, '2026-11-01')]
    expect(dueMistakes(history, today).map((m) => m.questionId)).toEqual(['old', 'new'])
  })
})

describe('mistakeLadder', () => {
  it('counts the mistakes waiting at each step, and the fixed ones', () => {
    const history = [
      answer('a', false, '2026-11-18'), // step 0 (1 day)
      answer('b', false, '2026-11-01'),
      answer('b', true, '2026-11-02'), // step 1 (3 days)
      answer('c', false, '2026-10-01'),
      answer('c', true, '2026-10-02'),
      answer('c', true, '2026-10-05'),
      answer('c', true, '2026-10-12'),
      answer('c', true, '2026-10-26'), // fixed
      answer('d', true, '2026-11-10'), // never missed: not on the ladder
    ]
    expect(mistakeLadder(history)).toEqual({ waiting: [1, 1, 0, 0], fixed: 1 })
  })

  it('a fixed question missed again goes back on the ladder', () => {
    const history = [
      answer('c', false, '2026-10-01'),
      answer('c', true, '2026-10-02'),
      answer('c', true, '2026-10-05'),
      answer('c', true, '2026-10-12'),
      answer('c', true, '2026-10-26'),
      answer('c', false, '2026-11-18'),
    ]
    expect(mistakeLadder(history)).toEqual({ waiting: [1, 0, 0, 0], fixed: 0 })
  })

  it('is empty with no answers', () => {
    expect(mistakeLadder([])).toEqual({ waiting: [0, 0, 0, 0], fixed: 0 })
  })
})

describe('pickFocus', () => {
  it('always picks a subject below 50% first', () => {
    expect(pickFocus(SUMMARY, 'build')?.subject.code).toBe('BBIS')
    expect(pickFocus(SUMMARY, 'build')?.reason).toEqual({ kind: 'below-floor', accuracy: 0.46 })
  })

  it('one wrong answer is not "below 50%": under 10 answers counts as getting started', () => {
    const few = [subject(1, 'CC', 0.6, 16), subject(6, 'HTMLE', 0, 1), subject(3, 'HEMA', 1 / 3, 3)]
    // Strengthen: CC (a real 60%) comes before the new ones.
    expect(pickFocus(few, 'strengthen')?.reason).toEqual({ kind: 'below-passing', accuracy: 0.6 })
    // Build: new ones first, the 20% subject before the 10% one.
    expect(pickFocus(few, 'build')).toMatchObject({ subject: { code: 'HEMA' }, reason: { kind: 'getting-started', attempts: 3 } })
    expect(pickFocus(few, 'build', new Set([3]))).toMatchObject({ subject: { code: 'HTMLE' }, reason: { kind: 'getting-started', attempts: 1 } })
  })

  it('Build: an untried subject before one below 75%; Strengthen: the other way around', () => {
    const noFloor = SUMMARY.filter((s) => s.code !== 'BBIS')
    expect(pickFocus(noFloor, 'build')?.subject.code).toBe('HTMLE')
    expect(pickFocus(noFloor, null)?.subject.code).toBe('HTMLE')
    expect(pickFocus(noFloor, 'strengthen')?.subject.code).toBe('CC')
    expect(pickFocus(noFloor, 'strengthen')?.reason).toEqual({ kind: 'below-passing', accuracy: 0.68 })
  })

  it('on a tie, picks the subject that counts more on the board', () => {
    const tie = [subject(5, 'CM', 0.6), subject(1, 'CC', 0.6)]
    expect(pickFocus(tie, 'strengthen')?.subject.code).toBe('CC')
    const untried = [subject(6, 'HTMLE', null), subject(2, 'MICRO', null)]
    expect(pickFocus(untried, 'build')?.subject.code).toBe('MICRO')
  })

  it('keeps the lowest one sharp when everything is passing', () => {
    const passing = [subject(1, 'CC', 0.9), subject(2, 'MICRO', 0.8)]
    expect(pickFocus(passing, 'strengthen')?.reason).toEqual({ kind: 'keep-sharp', accuracy: 0.8 })
  })

  it('skips subjects already in the plan, and returns null when none are left', () => {
    expect(pickFocus(SUMMARY, 'strengthen', new Set([4]))?.subject.code).toBe('CC')
    expect(pickFocus([], 'build')).toBeNull()
  })
})

describe('daysAway / roundToFive', () => {
  it('counts days since the last day she studied before today', () => {
    expect(daysAway([answer('a', true, '2026-11-15'), answer('b', true, '2026-11-19')], today)).toBe(4)
    expect(daysAway([], today)).toBeNull()
    expect(daysAway([answer('a', true, '2026-11-19')], today)).toBeNull() // only today: a new member
  })

  it('rounds set sizes to fives, never below 5', () => {
    expect(roundToFive(20)).toBe(20)
    expect(roundToFive(33.3)).toBe(35)
    expect(roundToFive(1)).toBe(5)
  })
})

describe('buildPlan', () => {
  it('a normal day: flashcards, the focus subject, then past mistakes that are due', () => {
    const attempts = [
      answer('x', true, '2026-11-18'),
      ...Array.from({ length: 8 }, (_, i) => answer(`m${i}`, false, '2026-11-15')),
    ]
    const plan = buildPlan(input({ attempts }))
    expect(plan).toMatchObject({ date: '2026-11-19', phase: 'strengthen', daysLeft: 54, comeback: false })
    expect(plan.tasks).toEqual([
      { kind: 'flashcards', count: 18, later: 0 },
      {
        kind: 'subject',
        subjectId: 4,
        code: 'BBIS',
        name: 'BBIS',
        count: 20,
        reason: { kind: 'below-floor', accuracy: 0.46 },
        // its weakest topic, with this morning's score
        topicId: 42,
        topicName: 'Antibody screening',
        startAccuracy: 0.3,
      },
      { kind: 'mistakes', count: 8, questionIds: ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'] },
    ])
  })

  it('a subject close to guessing (below 35%) gets "Learn": study 10, then a test on the same 10', () => {
    const weak = SUMMARY.map((s) => (s.code === 'BBIS' ? { ...s, accuracy: 0.14, belowFloor: true } : s))
    expect(buildPlan(input({ summary: weak })).tasks[1]).toMatchObject({ kind: 'learn', code: 'BBIS', count: 10, topicId: 42 })
  })

  it('caps the mistakes at the rest of her daily goal (the others stay due)', () => {
    const attempts = [answer('x', true, '2026-11-18'), ...Array.from({ length: 40 }, (_, i) => answer(`m${i}`, false, '2026-11-01'))]
    const plan = buildPlan(input({ attempts, dailyTarget: 50 }))
    expect(plan.tasks[1]).toMatchObject({ kind: 'subject', count: 35 })
    expect(plan.tasks[2]).toMatchObject({ kind: 'mistakes', count: 15 })
  })

  it('no mistakes due: a mixed set instead', () => {
    expect(buildPlan(input()).tasks[2]).toEqual({ kind: 'mixed', count: 10 })
  })

  it('no flashcards due: two subjects share the subject part', () => {
    const plan = buildPlan(input({ flashcardsDue: 0 }))
    expect(plan.tasks.map((t) => (isFocusTask(t) ? `${t.kind} ${t.code} ${t.count}` : t.kind))).toEqual(['subject BBIS 10', 'subject CC 10', 'mixed'])
  })

  it('a new member (nothing answered): "Learn" for the first two subjects', () => {
    const fresh = [subject(1, 'CC', null), subject(2, 'MICRO', null), subject(6, 'HTMLE', null)]
    const plan = buildPlan(input({ examDate: null, summary: fresh, flashcardsDue: 0, attempts: [] }))
    expect(plan.phase).toBeNull()
    expect(plan.tasks.map((t) => (isFocusTask(t) ? `${t.kind} ${t.code} ${t.count}` : t.kind))).toEqual(['learn CC 10', 'learn MICRO 10', 'mixed'])
  })

  it('comeback after days away: a lighter plan, the rest of the cards wait', () => {
    const attempts = [answer('x', true, '2026-11-15'), ...Array.from({ length: 9 }, (_, i) => answer(`m${i}`, false, '2026-11-10'))]
    const plan = buildPlan(input({ attempts, flashcardsDue: 42 }))
    expect(plan.comeback).toBe(true)
    expect(plan.tasks).toEqual([
      { kind: 'flashcards', count: 10, later: 32 },
      expect.objectContaining({ kind: 'subject', code: 'BBIS', count: 10 }),
      expect.objectContaining({ kind: 'mistakes', count: 5 }),
    ])
  })

  it('missing just one day is not a comeback', () => {
    expect(buildPlan(input({ attempts: [answer('x', true, '2026-11-17')] })).comeback).toBe(false)
  })

  it('Simulate: a Mock exam every 3 days replaces task 3, with a smaller subject set', () => {
    const simulate = input({ examDate: '2026-12-01' }) // 12 days left
    expect(buildPlan(simulate).tasks.map((t) => t.kind)).toEqual(['flashcards', 'subject', 'mock'])
    expect(buildPlan(simulate).tasks[1]).toMatchObject({ count: 10 })
    expect(buildPlan({ ...simulate, lastMockDay: '2026-11-17' }).tasks[2].kind).toBe('mixed')
    expect(buildPlan({ ...simulate, lastMockDay: '2026-11-16' }).tasks[2].kind).toBe('mock')
  })

  it('no Mock exam on exam day or on a comeback day', () => {
    expect(buildPlan(input({ examDate: '2026-11-19' })).tasks.some((t) => t.kind === 'mock')).toBe(false)
    const back = input({ examDate: '2026-12-01', attempts: [answer('x', true, '2026-11-10')] })
    expect(buildPlan(back).tasks.some((t) => t.kind === 'mock')).toBe(false)
  })

  it('rest day (her choice): no tasks', () => {
    const rest = input({ studyDays: { weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-19': 'rest' } } })
    expect(buildPlan(rest)).toMatchObject({ mode: 'rest', tasks: [] })
  })

  it('light day: ONE small task, past mistakes when due, else 10 on her focus (not flashcards: they don’t keep the streak)', () => {
    const light = { weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-19': 'light' as const } }
    const attempts = [answer('x', true, '2026-11-18'), ...Array.from({ length: 30 }, (_, i) => answer(`m${i}`, false, '2026-11-01'))]
    const withMistakes = buildPlan(input({ studyDays: light, attempts }))
    expect(withMistakes.mode).toBe('light')
    expect(withMistakes.tasks).toEqual([expect.objectContaining({ kind: 'mistakes', count: 10 })])
    expect(buildPlan(input({ studyDays: light })).tasks).toEqual([expect.objectContaining({ kind: 'subject', code: 'BBIS', count: 10 })])
  })

  it('tomorrow’s preview follows tomorrow’s choice', () => {
    expect(previewTomorrow(input({ studyDays: { weekly: DEFAULT_STUDY_DAYS.weekly, dates: { '2026-11-20': 'rest' } } }))).toEqual({
      mode: 'rest',
      task: null,
      mistakes: 0,
      mock: false,
    })
  })

  it('no subjects at all: an empty plan', () => {
    expect(buildPlan(input({ summary: [] })).tasks).toEqual([])
  })
})

describe('reasonFor / swapSubject', () => {
  it('says where a subject stands', () => {
    expect(reasonFor(subject(4, 'BBIS', 0.46))).toEqual({ kind: 'below-floor', accuracy: 0.46 })
    expect(reasonFor(subject(1, 'CC', 0.68))).toEqual({ kind: 'below-passing', accuracy: 0.68 })
    expect(reasonFor(subject(6, 'HTMLE', null))).toEqual({ kind: 'not-tried' })
    expect(reasonFor(subject(6, 'HTMLE', 0, 1))).toEqual({ kind: 'getting-started', attempts: 1 })
    expect(reasonFor(subject(3, 'HEMA', 0.81))).toEqual({ kind: 'keep-sharp', accuracy: 0.81 })
  })

  it('switches only that focus task, keeping its size, and picks the new subject’s topic', () => {
    const plan = buildPlan(input())
    const swapped = swapSubject(plan, 1, subject(3, 'HEMA', 0.81), TOPICS)
    expect(swapped.tasks[1]).toEqual({
      kind: 'subject',
      subjectId: 3,
      code: 'HEMA',
      name: 'HEMA',
      count: 20,
      reason: { kind: 'keep-sharp', accuracy: 0.81 },
      topicId: 30,
      topicName: 'Topic 3',
      startAccuracy: null,
    })
    expect(swapped.tasks[0]).toBe(plan.tasks[0])
    expect(swapSubject(plan, 0, subject(3, 'HEMA', 0.81), TOPICS).tasks[0]).toBe(plan.tasks[0]) // not a focus task: unchanged
  })

  it('becomes "Learn" when the new subject is close to guessing, and questions again the other way', () => {
    const plan = buildPlan(input())
    const learn = swapSubject(plan, 1, subject(6, 'HTMLE', null), TOPICS)
    expect(learn.tasks[1]).toMatchObject({ kind: 'learn', code: 'HTMLE', count: 10 })
    expect(swapSubject(learn, 1, subject(3, 'HEMA', 0.81), TOPICS).tasks[1]).toMatchObject({ kind: 'subject', code: 'HEMA', count: 20 })
  })
})

describe('needsLearning / pickTopic', () => {
  it('"Learn" below 35%, or with fewer than 10 answers', () => {
    expect(needsLearning(subject(3, 'HEMA', 0.14))).toBe(true)
    expect(needsLearning(subject(3, 'HEMA', 0.34))).toBe(true)
    expect(needsLearning(subject(3, 'HEMA', 0.35))).toBe(false)
    expect(needsLearning(subject(3, 'HEMA', 0.9, 9))).toBe(true)
    expect(needsLearning(subject(3, 'HEMA', null))).toBe(true)
  })

  it('picks the weakest topic below 75%, counting only topics with a few answers', () => {
    const hema = subject(3, 'HEMA', 0.5, 30, [topicScore(31, 'Coagulation', 0.1, 10), topicScore(32, 'Platelets', 0, 2), topicScore(33, 'Anemias', 0.6, 18)])
    const topics = [31, 32, 33].map((id, i) => ({ id, subject_id: 3, name: ['Coagulation', 'Platelets', 'Anemias'][i] }))
    // Platelets is 0%, but on only 2 answers: not trusted yet
    expect(pickTopic(hema, topics)).toEqual({ topicId: 31, name: 'Coagulation', attempts: 10, accuracy: 0.1 })
  })

  it('no weak topic: the one she has seen least (new first); all passing: the lowest', () => {
    const topics = [31, 32].map((id, i) => ({ id, subject_id: 3, name: ['Coagulation', 'Platelets'][i] }))
    const strongAndNew = subject(3, 'HEMA', 0.9, 20, [topicScore(31, 'Coagulation', 0.9, 20)])
    expect(pickTopic(strongAndNew, topics)?.name).toBe('Platelets')
    const allPassing = subject(3, 'HEMA', 0.85, 40, [topicScore(31, 'Coagulation', 0.9, 20), topicScore(32, 'Platelets', 0.8, 20)])
    expect(pickTopic(allPassing, topics)?.name).toBe('Platelets')
  })

  it('no topics for the subject: null (the task is about the whole subject)', () => {
    expect(pickTopic(subject(9, 'NEW', 0.5), TOPICS)).toBeNull()
  })
})

describe('previewTomorrow', () => {
  it('shows tomorrow’s focus task and the past mistakes in its plan', () => {
    const attempts = [answer('x', true, '2026-11-19'), answer('m1', false, '2026-11-19'), answer('m2', false, '2026-11-01')]
    const preview = previewTomorrow(input({ attempts }))
    expect(preview.task).toMatchObject({ code: 'BBIS', topicName: 'Antibody screening' })
    expect(preview.mistakes).toBe(2)
    expect(preview.mock).toBe(false)
  })

  it('counts only the mistakes tomorrow’s plan takes, not the whole waiting list', () => {
    const attempts = [answer('x', true, '2026-11-19'), ...Array.from({ length: 137 }, (_, i) => answer(`m${i}`, false, '2026-11-01'))]
    expect(previewTomorrow(input({ attempts })).mistakes).toBe(10)
  })

  it('says when tomorrow is a Mock exam day', () => {
    expect(previewTomorrow(input({ examDate: '2026-12-01', lastMockDay: '2026-11-17' })).mock).toBe(true)
  })
})
