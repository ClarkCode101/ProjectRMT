import { describe, expect, it } from 'vitest'
import type { SubjectSummary } from '@/lib/quiz'
import { correctCount, correctToPass, MIN_ANSWERED, organLook, statusDetail, subjectStatus } from './organs'

function subject(attempts: number, correct: number): SubjectSummary {
  const accuracy = attempts === 0 ? null : correct / attempts
  return { subjectId: 1, code: 'CC', name: 'Clinical Chemistry', attempts, accuracy, belowPassing: accuracy !== null && accuracy < 0.6, topics: [] }
}

describe('subjectStatus', () => {
  it('is "new" when nothing is answered', () => {
    expect(subjectStatus(subject(0, 0))).toBe('new')
  })

  it('is "starting" below the minimum, even at 0%', () => {
    expect(subjectStatus(subject(1, 0))).toBe('starting')
    expect(subjectStatus(subject(MIN_ANSWERED - 1, 9))).toBe('starting')
  })

  it('is "low" or "passing" once there are enough answers', () => {
    expect(subjectStatus(subject(MIN_ANSWERED, 5))).toBe('low')
    expect(subjectStatus(subject(MIN_ANSWERED, 6))).toBe('passing')
  })
})

describe('correctToPass', () => {
  it('counts the right answers in a row needed to reach 60%', () => {
    // 5 of 12: (5 + k) / (12 + k) ≥ 0.6 → k ≥ 5.5 → 6 (10 of 17 = 58.8% is not enough, 11 of 18 = 61.1% is)
    expect(correctToPass(subject(12, 5))).toBe(6)
    // 0 of 10: (0 + k) / (10 + k) ≥ 0.6 → k = 15
    expect(correctToPass(subject(10, 0))).toBe(15)
  })

  it('is 0 exactly at 60% (no rounding up from float error)', () => {
    expect(correctToPass(subject(10, 6))).toBe(0)
  })
})

describe('statusDetail', () => {
  it('says how many more answers a new score needs', () => {
    expect(statusDetail(subject(2, 1))).toBe(`1 of 2 correct · ${MIN_ANSWERED - 2} more for a real score`)
  })

  it('says how to pass when below 60%', () => {
    expect(statusDetail(subject(12, 5))).toBe('5 of 12 correct · 6 right in a row to pass')
  })

  it('invites a first answer when nothing is answered', () => {
    expect(statusDetail(subject(0, 0))).toBe('Answer a few to see your score')
  })
})

describe('correctCount and organLook', () => {
  it('rounds the correct count from the accuracy', () => {
    expect(correctCount(subject(3, 1))).toBe(1)
  })

  it('is grey until she starts, then full color, and glows once passing', () => {
    const looks = [subject(0, 0), subject(3, 1), subject(12, 5), subject(10, 8)].map(organLook)
    expect(looks).toEqual(['grey', 'color', 'color', 'glow'])
  })
})
