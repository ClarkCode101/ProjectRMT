import { describe, expect, it } from 'vitest'
import { buildMockExam, formatClock, mockTrend, parseSavedMock, previousMockRate, runStats, scoreMock, secondsLeft, timeLimitSec, type SavedMock } from './mockExam'

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
    expect(score).toMatchObject({ total: 5, answered: 4, correct: 3, rate: 0.6, passed: false })
    expect(score.byTopic).toEqual([
      { topicId: 2, correct: 1, total: 3 },
      { topicId: 1, correct: 2, total: 2 },
    ])
  })

  it('passes at exactly 75%', () => {
    const four = questions.slice(0, 4)
    expect(scoreMock(four, [0, 1, 2, null])).toMatchObject({ rate: 0.75, passed: true })
  })

  it('fails below 75% and handles an empty exam', () => {
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

describe('runStats', () => {
  const qs = [{ correct_index: 0 }, { correct_index: 1 }, { correct_index: 2 }, { correct_index: 3 }]

  it('counts blanks, flags and the flags that ended up right', () => {
    const s = runStats(qs, [0, null, 1, 3], [true, true, true, false], 200)
    expect(s).toEqual({ paceSec: 50, blank: 1, flagged: 3, flaggedRight: 1 })
  })

  it('a flagged blank is flagged but not right', () => {
    expect(runStats(qs, [null, null, null, null], [true, false, false, false], 0)).toMatchObject({ blank: 4, flagged: 1, flaggedRight: 0 })
  })

  it('handles no questions and odd durations', () => {
    expect(runStats([], [], [], 100)).toEqual({ paceSec: 0, blank: 0, flagged: 0, flaggedRight: 0 })
    expect(runStats(qs, [0, 1, 2, 3], [false, false, false, false], -5).paceSec).toBe(0)
  })
})

describe('previousMockRate / mockTrend', () => {
  const micro = { source: 'all', subjectId: 3, bookId: null }
  const row = (id: string, score: number | null, total: number | null, finished_at: string | null, filters: unknown = { source: 'all', subject_id: 3, book_id: null }) => ({
    id,
    score,
    total_items: total,
    finished_at,
    filters,
  })

  it('takes the latest other finished mock on the same thing', () => {
    const rows = [
      row('old', 40, 100, '2026-01-01T00:00:00Z'),
      row('last', 50, 100, '2026-02-01T00:00:00Z'),
      row('now', 58, 100, '2026-03-01T00:00:00Z'), // this exam, already synced
    ]
    expect(previousMockRate(rows, micro, 'now')).toBe(0.5)
  })

  it('skips other subjects, sources, books, and unfinished or empty runs', () => {
    const rows = [
      row('other-subject', 90, 100, '2026-02-05T00:00:00Z', { source: 'all', subject_id: 4, book_id: null }),
      row('other-source', 90, 100, '2026-02-04T00:00:00Z', { source: 'mine', subject_id: 3, book_id: null }),
      row('a-book', 90, 100, '2026-02-03T00:00:00Z', { source: 'all', subject_id: 3, book_id: 'b1' }),
      row('unfinished', null, 100, null),
      row('empty', 0, 0, '2026-02-02T00:00:00Z'),
      row('broken', 90, 100, '2026-02-06T00:00:00Z', null),
    ]
    expect(previousMockRate(rows, micro, 'now')).toBeNull()
  })

  it('matches All subjects (subject null) only with All subjects', () => {
    const all = { source: 'all', subjectId: null, bookId: null }
    const rows = [row('micro', 50, 100, '2026-02-01T00:00:00Z'), row('full', 30, 50, '2026-01-01T00:00:00Z', { source: 'all', subject_id: null, book_id: null })]
    expect(previousMockRate(rows, all, 'now')).toBe(0.6)
  })

  it('reports first, up, down, and same in whole points', () => {
    expect(mockTrend(0.58, null)).toEqual({ kind: 'first' })
    expect(mockTrend(0.58, 0.5)).toEqual({ kind: 'change', previousRate: 0.5, points: 8 })
    expect(mockTrend(0.5, 0.58)).toMatchObject({ points: -8 })
    expect(mockTrend(0.584, 0.576)).toMatchObject({ points: 0 }) // both show as 58%
  })
})

describe('parseSavedMock scope', () => {
  const base = {
    version: 1,
    sessionId: 's',
    label: 'MICRO',
    questionIds: ['a'],
    orders: [[0, 1]],
    answers: [null],
    flags: [false],
    current: 0,
    startedAt: 1,
    limitSec: 72,
  }

  it('keeps a valid scope', () => {
    const scope = { source: 'all', subjectId: 3, bookId: null }
    expect(parseSavedMock({ ...base, scope })?.scope).toEqual(scope)
  })

  it('drops a broken scope but keeps the exam', () => {
    const parsed = parseSavedMock({ ...base, scope: { source: 5 } })
    expect(parsed).not.toBeNull()
    expect(parsed && 'scope' in parsed).toBe(false)
  })
})
