import { describe, expect, it } from 'vitest'
import { buildMockExam, formatClock, parseSavedMock, scoreMock, secondsLeft, timeLimitSec, type SavedMock } from './mockExam'

/** Simple seeded random number generator so picks are repeatable in tests. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('timeLimitSec / formatClock', () => {
  it('gives 72 seconds per item (100 items = 2 hours)', () => {
    expect(timeLimitSec(100)).toBe(7200)
    expect(timeLimitSec(25)).toBe(1800)
    expect(timeLimitSec(0)).toBe(0)
  })

  it('formats with hours only when needed and never shows a negative time', () => {
    expect(formatClock(7265)).toBe('2:01:05')
    expect(formatClock(125)).toBe('2:05')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('buildMockExam', () => {
  // Topic 1 has 20 questions, topics 2 and 3 have 2 each.
  const pool = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, topic_id: 1 })),
    { id: 'b0', topic_id: 2 },
    { id: 'b1', topic_id: 2 },
    { id: 'c0', topic_id: 3 },
    { id: 'c1', topic_id: 3 },
  ]

  it('spreads items across topics so a big topic cannot take over', () => {
    const exam = buildMockExam(pool, 6, seeded(1))
    const perTopic = (t: number) => exam.filter((q) => q.topic_id === t).length
    expect(exam).toHaveLength(6)
    expect(perTopic(1)).toBe(2)
    expect(perTopic(2)).toBe(2)
    expect(perTopic(3)).toBe(2)
  })

  it('fills the rest from topics that still have questions, with no repeats', () => {
    const exam = buildMockExam([...pool, { id: 'a0', topic_id: 1 }], 10, seeded(2))
    expect(exam).toHaveLength(10)
    expect(new Set(exam.map((q) => q.id)).size).toBe(10)
    expect(exam.filter((q) => q.topic_id !== 1)).toHaveLength(4) // all of topics 2 and 3
  })

  it('returns everything when there are fewer questions than asked, and nothing for 0 or an empty pool', () => {
    expect(buildMockExam(pool, 100, seeded(3))).toHaveLength(pool.length)
    expect(buildMockExam(pool, 0)).toEqual([])
    expect(buildMockExam([], 25)).toEqual([])
  })
})

describe('scoreMock', () => {
  const questions = [
    { topic_id: 1, correct_index: 0 },
    { topic_id: 1, correct_index: 1 },
    { topic_id: 2, correct_index: 2 },
    { topic_id: 2, correct_index: 3 },
    { topic_id: 2, correct_index: 0 },
  ]

  it('counts blanks as wrong and lists the weakest topic first', () => {
    const score = scoreMock(questions, [0, 1, 2, null, 1])
    expect(score).toMatchObject({ total: 5, answered: 4, correct: 3, rate: 0.6, passed: true })
    expect(score.byTopic).toEqual([
      { topicId: 2, correct: 1, total: 3 },
      { topicId: 1, correct: 2, total: 2 },
    ])
  })

  it('fails below 60% and handles an empty exam', () => {
    expect(scoreMock(questions, [0, null, null, null, null]).passed).toBe(false)
    expect(scoreMock([], [])).toMatchObject({ total: 0, correct: 0, rate: 0, passed: false, byTopic: [] })
  })
})

describe('parseSavedMock / secondsLeft', () => {
  const good: SavedMock = {
    version: 1,
    sessionId: 's1',
    label: 'MICRO',
    questionIds: ['q1', 'q2'],
    orders: [
      [1, 0, 2, 3],
      [3, 2, 1, 0],
    ],
    answers: [2, null],
    flags: [false, true],
    current: 1,
    startedAt: 1_000_000,
    limitSec: 144,
  }

  it('accepts a well-formed saved exam', () => {
    expect(parseSavedMock(JSON.parse(JSON.stringify(good)))).toEqual(good)
  })

  it('rejects missing, broken or mismatched data instead of crashing', () => {
    expect(parseSavedMock(null)).toBeNull()
    expect(parseSavedMock('nope')).toBeNull()
    expect(parseSavedMock({ ...good, version: 2 })).toBeNull()
    expect(parseSavedMock({ ...good, answers: [2] })).toBeNull() // wrong length
    expect(parseSavedMock({ ...good, current: 5 })).toBeNull() // out of range
    expect(parseSavedMock({ ...good, flags: ['yes', false] })).toBeNull()
    expect(parseSavedMock({ ...good, questionIds: [] })).toBeNull()
  })

  it('counts the time left from when the exam started, never below 0', () => {
    expect(secondsLeft(good, good.startedAt)).toBe(144)
    expect(secondsLeft(good, good.startedAt + 44_500)).toBe(100)
    expect(secondsLeft(good, good.startedAt + 999_000)).toBe(0)
  })
})
