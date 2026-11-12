import { describe, expect, it } from 'vitest'
import { practiceMessage, practiceReport, priorHistory } from './practiceReport'

const at = (question_id: string, is_correct: boolean, created_at: string) => ({ question_id, is_correct, created_at })
const ans = (questionId: string, isCorrect: boolean) => ({ questionId, isCorrect })

describe('priorHistory', () => {
  it('is empty with no attempts', () => {
    const p = priorHistory([])
    expect(p.seen.size).toBe(0)
    expect(p.mistakes.size).toBe(0)
  })

  it('counts a question as a mistake only when its latest answer was wrong', () => {
    const p = priorHistory([
      at('a', false, '2026-01-01'),
      at('a', true, '2026-01-02'), // fixed later
      at('b', true, '2026-01-01'),
      at('b', false, '2026-01-03'), // wrong later
      at('c', false, '2026-01-05'),
    ])
    expect([...p.seen].sort()).toEqual(['a', 'b', 'c'])
    expect([...p.mistakes].sort()).toEqual(['b', 'c'])
  })

  it('does not depend on the order the attempts come in', () => {
    const p = priorHistory([at('a', true, '2026-01-02'), at('a', false, '2026-01-01')])
    expect(p.mistakes.has('a')).toBe(false)
  })
})

describe('practiceReport', () => {
  const prior = priorHistory([at('old-right', true, '2026-01-01'), at('old-wrong', false, '2026-01-01'), at('old-wrong-2', false, '2026-01-01')])

  it('counts new, cleared, to review and the best streak', () => {
    const r = practiceReport(
      [ans('new-1', true), ans('old-wrong', true), ans('old-right', true), ans('new-2', false), ans('old-wrong-2', false), ans('new-3', true)],
      prior,
      'practice',
    )
    expect(r).toEqual({ correct: 4, total: 6, fresh: 3, cleared: 1, toReview: 2, bestStreak: 3 })
  })

  it('gives null for new and cleared when her history is unknown', () => {
    const r = practiceReport([ans('x', true), ans('y', false)], null, 'practice')
    expect(r.fresh).toBeNull()
    expect(r.cleared).toBeNull()
    expect(r.toReview).toBe(1)
  })

  it('in Review again, every correct answer clears a mistake, even without history', () => {
    const r = practiceReport([ans('a', true), ans('b', false), ans('c', true)], null, 'review')
    expect(r).toEqual({ correct: 2, total: 3, fresh: 0, cleared: 2, toReview: 1, bestStreak: 1 })
  })

  it('handles an empty session', () => {
    expect(practiceReport([], prior, 'practice')).toEqual({ correct: 0, total: 0, fresh: 0, cleared: 0, toReview: 0, bestStreak: 0 })
  })

  it('handles all wrong', () => {
    const r = practiceReport([ans('old-wrong', false), ans('n', false)], prior, 'practice')
    expect(r).toMatchObject({ correct: 0, cleared: 0, toReview: 2, bestStreak: 0 })
  })
})

describe('practiceMessage', () => {
  const base = { correct: 5, total: 10, fresh: 4, cleared: 2, toReview: 5, bestStreak: 3 }

  it('names cleared mistakes first', () => {
    expect(practiceMessage(base, 'practice')).toBe('You fixed 2 old mistakes. That’s how scores go up.')
    expect(practiceMessage({ ...base, cleared: 1 }, 'practice')).toBe('You fixed 1 old mistake. That’s how scores go up.')
  })

  it('then new questions', () => {
    expect(practiceMessage({ ...base, cleared: 0 }, 'practice')).toMatch(/^4 new questions done/)
    expect(practiceMessage({ ...base, cleared: null, fresh: 1 }, 'practice')).toMatch(/^1 new question done/)
  })

  it('celebrates a perfect session', () => {
    expect(practiceMessage({ ...base, correct: 10, toReview: 0 }, 'practice')).toBe('Perfect session. Every answer right.')
  })

  it('falls back when there is nothing else to name', () => {
    expect(practiceMessage({ ...base, cleared: 0, fresh: 0 }, 'practice')).toBe('The ones you missed come back in Review again.')
  })

  it('has its own lines for Review again', () => {
    expect(practiceMessage({ ...base, correct: 4, total: 6, toReview: 2 }, 'review')).toBe('4 off your list. Only 2 left to go.')
    expect(practiceMessage({ ...base, correct: 6, total: 6, toReview: 0 }, 'review')).toBe('Your list is clear. Nice work.')
    expect(practiceMessage({ ...base, correct: 0, total: 3, toReview: 3 }, 'review')).toMatch(/^None cleared/)
  })

  it('handles an empty session', () => {
    expect(practiceMessage({ ...base, correct: 0, total: 0, toReview: 0 }, 'practice')).toBe('No answers this time.')
  })
})
