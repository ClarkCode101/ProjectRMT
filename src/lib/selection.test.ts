import { describe, expect, it } from 'vitest'
import { buildHistory, countUnseen, pickQuestions, priorityScore, sessionMix, type QuestionHistory } from './selection'

/** Simple seeded random number generator so picks are repeatable in tests. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const NOW = Date.parse('2026-11-03T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString()

describe('buildHistory', () => {
  it('counts tries and mistakes per question and keeps the latest times', () => {
    const history = buildHistory([
      { question_id: 'a', is_correct: false, created_at: daysAgo(5) },
      { question_id: 'a', is_correct: true, created_at: daysAgo(1) },
      { question_id: 'a', is_correct: false, created_at: daysAgo(3) },
      { question_id: 'b', is_correct: true, created_at: daysAgo(2) },
    ])
    expect(history.get('a')).toEqual({ seen: 3, wrong: 2, lastSeenAt: NOW - DAY, lastWrongAt: NOW - 3 * DAY })
    expect(history.get('b')).toEqual({ seen: 1, wrong: 0, lastSeenAt: NOW - 2 * DAY, lastWrongAt: null })
  })

  it('treats a missing or broken date as very old instead of crashing', () => {
    const history = buildHistory([
      { question_id: 'a', is_correct: false, created_at: null },
      { question_id: 'b', is_correct: true, created_at: 'not a date' },
    ])
    expect(history.get('a')).toEqual({ seen: 1, wrong: 1, lastSeenAt: 0, lastWrongAt: 0 })
    expect(history.get('b')?.lastSeenAt).toBe(0)
  })

  it('returns an empty map when there are no attempts', () => {
    expect(buildHistory([]).size).toBe(0)
  })
})

describe('priorityScore', () => {
  const wrongToday: QuestionHistory = { seen: 1, wrong: 1, lastSeenAt: NOW, lastWrongAt: NOW }
  const correctToday: QuestionHistory = { seen: 1, wrong: 0, lastSeenAt: NOW, lastWrongAt: null }

  it('ranks never seen > previously wrong > always correct', () => {
    const neverSeen = priorityScore(undefined, NOW)
    const wrong = priorityScore(wrongToday, NOW)
    const correct = priorityScore(correctToday, NOW)
    expect(neverSeen).toBe(100)
    expect(wrong).toBeLessThan(neverSeen)
    expect(correct).toBeLessThan(wrong)
  })

  it('ranks a recent mistake above an old one', () => {
    const old = { ...wrongToday, lastSeenAt: NOW - 30 * DAY, lastWrongAt: NOW - 30 * DAY }
    expect(priorityScore(wrongToday, NOW)).toBeGreaterThan(priorityScore(old, NOW))
  })

  it('ranks a question she often misses above one she missed once', () => {
    const often: QuestionHistory = { seen: 4, wrong: 4, lastSeenAt: NOW, lastWrongAt: NOW }
    const once: QuestionHistory = { seen: 4, wrong: 1, lastSeenAt: NOW, lastWrongAt: NOW }
    expect(priorityScore(often, NOW)).toBeGreaterThan(priorityScore(once, NOW))
  })

  it('keeps even an old, rare mistake above an always-correct question', () => {
    const oldRare: QuestionHistory = { seen: 10, wrong: 1, lastSeenAt: NOW, lastWrongAt: NOW - 365 * DAY }
    const correctLongAgo = { ...correctToday, lastSeenAt: NOW - 365 * DAY }
    expect(priorityScore(oldRare, NOW)).toBeGreaterThan(priorityScore(correctLongAgo, NOW))
  })

  it('slowly brings back correct questions she has not seen in a while (up to a cap)', () => {
    const lastWeek = { ...correctToday, lastSeenAt: NOW - 7 * DAY }
    expect(priorityScore(lastWeek, NOW)).toBeGreaterThan(priorityScore(correctToday, NOW))
    expect(priorityScore({ ...correctToday, lastSeenAt: 0 }, NOW)).toBe(15)
  })

  it('does not go above the range when the attempt date is in the future (clock differences)', () => {
    const future = { ...wrongToday, lastSeenAt: NOW + DAY, lastWrongAt: NOW + DAY }
    expect(priorityScore(future, NOW)).toBe(priorityScore(wrongToday, NOW))
  })
})

describe('pickQuestions', () => {
  const questions = ['new1', 'new2', 'wrong1', 'right1', 'right2'].map((id) => ({ id }))
  const history = buildHistory([
    { question_id: 'wrong1', is_correct: false, created_at: daysAgo(1) },
    { question_id: 'right1', is_correct: true, created_at: daysAgo(1) },
    { question_id: 'right2', is_correct: true, created_at: daysAgo(1) },
  ])

  it('takes unseen questions first, then mistakes, then correct ones', () => {
    const picked = pickQuestions(questions, history, 3, { now: NOW, random: seeded(1) })
    expect(picked.map((q) => q.id).sort()).toEqual(['new1', 'new2', 'wrong1'])
  })

  it('never repeats a question in one session, even if the list has duplicates', () => {
    const picked = pickQuestions([...questions, { id: 'new1' }], history, 10, { now: NOW, random: seeded(2) })
    expect(picked).toHaveLength(5)
    expect(new Set(picked.map((q) => q.id)).size).toBe(5)
  })

  it('returns everything when asking for more than there is, and nothing for 0 or empty lists', () => {
    expect(pickQuestions(questions, history, 99, { now: NOW })).toHaveLength(5)
    expect(pickQuestions(questions, history, 0, { now: NOW })).toEqual([])
    expect(pickQuestions([], history, 10, { now: NOW })).toEqual([])
  })

  it('mixes the order instead of always putting new questions first', () => {
    const orders = new Set(
      [1, 2, 3, 4, 5, 6].map((seed) =>
        pickQuestions(questions, history, 3, { now: NOW, random: seeded(seed) })
          .map((q) => q.id)
          .join(','),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })

  it('does not change the list it was given', () => {
    const input = [...questions]
    pickQuestions(input, history, 2, { now: NOW, random: seeded(3) })
    expect(input).toEqual(questions)
  })
})

describe('countUnseen', () => {
  it('counts questions with no attempts, once each', () => {
    const history = buildHistory([{ question_id: 'a', is_correct: true, created_at: daysAgo(1) }])
    expect(countUnseen([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'c' }], history)).toBe(2)
    expect(countUnseen([], history)).toBe(0)
  })
})

describe('sessionMix', () => {
  const history = buildHistory([
    { question_id: 'wrong1', is_correct: false, created_at: daysAgo(1) },
    { question_id: 'wrong2', is_correct: true, created_at: daysAgo(1) },
    { question_id: 'wrong2', is_correct: false, created_at: daysAgo(3) },
    { question_id: 'right1', is_correct: true, created_at: daysAgo(1) },
  ])
  const pool = ['new1', 'new2', 'wrong1', 'wrong2', 'right1'].map((id) => ({ id }))

  it('fills the session with new questions first, then mistakes, then the rest', () => {
    expect(sessionMix(pool, history, 1)).toEqual({ fresh: 1, review: 0, repeat: 0 })
    expect(sessionMix(pool, history, 3)).toEqual({ fresh: 2, review: 1, repeat: 0 })
    expect(sessionMix(pool, history, 10)).toEqual({ fresh: 2, review: 2, repeat: 1 })
  })

  it('handles 0 items, empty pools and duplicate ids', () => {
    expect(sessionMix(pool, history, 0)).toEqual({ fresh: 0, review: 0, repeat: 0 })
    expect(sessionMix([], history, 10)).toEqual({ fresh: 0, review: 0, repeat: 0 })
    expect(sessionMix([{ id: 'new1' }, { id: 'new1' }], history, 10)).toEqual({ fresh: 1, review: 0, repeat: 0 })
  })
})
