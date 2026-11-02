import { describe, expect, it } from 'vitest'
import {
  formatPercent,
  latestMistakes,
  parseChoices,
  shuffle,
  shuffledChoiceOrder,
  summarizePerformance,
} from './quiz'

/** Simple seeded random number generator so shuffles are repeatable in tests. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('shuffle', () => {
  it('keeps every item exactly once and does not change the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const result = shuffle(input, seeded(42))
    expect([...result].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['a'])).toEqual(['a'])
  })
})

describe('shuffledChoiceOrder', () => {
  it('maps every display position back to a unique original index', () => {
    const order = shuffledChoiceOrder(4, seeded(7))
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('parseChoices', () => {
  it('accepts a list of strings', () => {
    expect(parseChoices(['A', 'B', 'C', 'D'])).toEqual(['A', 'B', 'C', 'D'])
  })
  it('returns [] for anything else', () => {
    expect(parseChoices({ a: 1 })).toEqual([])
    expect(parseChoices(['A', 2])).toEqual([])
    expect(parseChoices(null)).toEqual([])
  })
})

describe('latestMistakes', () => {
  const attempt = (question_id: string, is_correct: boolean, created_at: string) => ({
    question_id,
    is_correct,
    selected_index: 0,
    created_at,
  })

  it('keeps questions whose latest attempt was wrong', () => {
    const result = latestMistakes([
      attempt('q1', false, '2026-01-01T00:00:00Z'),
      attempt('q2', false, '2026-01-02T00:00:00Z'),
    ])
    expect(result.map((a) => a.question_id)).toEqual(['q2', 'q1']) // newest first
  })

  it('drops a question once it is answered correctly later', () => {
    const result = latestMistakes([
      attempt('q1', false, '2026-01-01T00:00:00Z'),
      attempt('q1', true, '2026-01-03T00:00:00Z'),
    ])
    expect(result).toEqual([])
  })

  it('puts a question back if she gets it wrong again', () => {
    const result = latestMistakes([
      attempt('q1', false, '2026-01-01T00:00:00Z'),
      attempt('q1', true, '2026-01-02T00:00:00Z'),
      attempt('q1', false, '2026-01-03T00:00:00Z'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].created_at).toBe('2026-01-03T00:00:00Z')
  })

  it('works with no attempts', () => {
    expect(latestMistakes([])).toEqual([])
  })
})

describe('summarizePerformance', () => {
  const subjects = [
    { id: 2, code: 'HEMA', name: 'Hematology', sort_order: 3 },
    { id: 1, code: 'CC', name: 'Clinical Chemistry', sort_order: 1 },
  ]
  const topics = [
    { id: 10, subject_id: 1, name: 'Enzymes' },
    { id: 11, subject_id: 1, name: 'Lipids' },
  ]

  it('weights subject accuracy by number of attempts', () => {
    const [cc] = summarizePerformance(
      [
        { subject_id: 1, topic_id: 10, attempts: 8, accuracy: 1 }, // 8 correct
        { subject_id: 1, topic_id: 11, attempts: 2, accuracy: 0 }, // 0 correct
      ],
      subjects,
      topics,
    )
    expect(cc.code).toBe('CC')
    expect(cc.attempts).toBe(10)
    expect(cc.accuracy).toBeCloseTo(0.8)
    expect(cc.belowPassing).toBe(false)
  })

  it('flags subjects and topics below 60%, weakest topic first', () => {
    const [cc] = summarizePerformance(
      [
        { subject_id: 1, topic_id: 10, attempts: 5, accuracy: 0.6 },
        { subject_id: 1, topic_id: 11, attempts: 5, accuracy: 0.4 },
      ],
      subjects,
      topics,
    )
    expect(cc.accuracy).toBeCloseTo(0.5)
    expect(cc.belowPassing).toBe(true)
    expect(cc.topics.map((t) => [t.name, t.belowPassing])).toEqual([
      ['Lipids', true],
      ['Enzymes', false], // exactly 60% passes
    ])
  })

  it('includes subjects with no attempts as null accuracy, sorted by sort_order', () => {
    const result = summarizePerformance([], subjects, topics)
    expect(result.map((s) => s.code)).toEqual(['CC', 'HEMA'])
    expect(result[1]).toMatchObject({ attempts: 0, accuracy: null, belowPassing: false, topics: [] })
  })
})

describe('formatPercent', () => {
  it('rounds to a whole percent', () => {
    expect(formatPercent(0.756)).toBe('76%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })
})
