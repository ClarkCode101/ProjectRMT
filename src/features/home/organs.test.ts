import { describe, expect, it } from 'vitest'
import type { SubjectSummary } from '@/lib/quiz'
import { correctCount, correctToPass, MIN_ANSWERED, nextMilestone, organLook, readinessGoal, scoreCaption, subjectStatus } from './organs'

function subject(attempts: number, correct: number): SubjectSummary {
  const accuracy = attempts === 0 ? null : correct / attempts
  return { subjectId: 1, code: 'CC', name: 'Clinical Chemistry', attempts, accuracy, belowPassing: accuracy !== null && accuracy < 0.75, belowFloor: accuracy !== null && accuracy < 0.5, topics: [] }
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
    expect(subjectStatus(subject(MIN_ANSWERED, 7))).toBe('low')
    expect(subjectStatus(subject(MIN_ANSWERED, 8))).toBe('passing')
  })
})

describe('correctToPass', () => {
  it('counts the right answers in a row needed to reach 75%', () => {
    // 5 of 12: (5 + k) / (12 + k) ≥ 0.75 → k ≥ 16 (20 of 27 = 74.1% is not enough, 21 of 28 = 75% is)
    expect(correctToPass(subject(12, 5))).toBe(16)
    // 0 of 10: (0 + k) / (10 + k) ≥ 0.75 → k = 30
    expect(correctToPass(subject(10, 0))).toBe(30)
  })

  it('is 0 exactly at 75% (no rounding up from float error)', () => {
    expect(correctToPass(subject(12, 9))).toBe(0)
  })
})

describe('scoreCaption', () => {
  it('says "Not started" before any answer', () => {
    expect(scoreCaption(subject(0, 0))).toBe('Not started')
  })

  it('says "answered" while getting started (it follows "2/10")', () => {
    expect(scoreCaption(subject(2, 0))).toBe('answered')
  })

  it('names the status once the score is real', () => {
    expect(scoreCaption(subject(12, 7))).toBe('Below 75%')
    expect(scoreCaption(subject(10, 8))).toBe('Passing')
  })

  it('says "Below 50%" when the subject alone would fail the exam', () => {
    expect(scoreCaption(subject(12, 4))).toBe('Below 50%')
  })
})

describe('readinessGoal', () => {
  it('says how far to 75%, then cheers once there', () => {
    expect(readinessGoal(0.28)).toBe('47% to go to passing')
    expect(readinessGoal(0.744)).toBe('1% to go to passing')
    expect(readinessGoal(0.75)).toBe('Passing · keep it above 75%')
    expect(readinessGoal(0.85)).toBe('Passing · keep it above 75%')
  })

  it('names subjects below 50% even when the average is high enough', () => {
    expect(readinessGoal(0.8, ['HTMLE'])).toBe('Get HTMLE above 50%')
    expect(readinessGoal(0.8, ['CM', 'HTMLE'])).toBe('Get CM, HTMLE above 50%')
  })
})

describe('nextMilestone', () => {
  it('names the next small win for each stage', () => {
    expect(nextMilestone(subject(0, 0))).toBe('Not started yet')
    expect(nextMilestone(subject(3, 1))).toBe(`${MIN_ANSWERED - 3} more for a real score`)
    expect(nextMilestone(subject(12, 5))).toBe('16 right in a row to pass')
    expect(nextMilestone(subject(10, 8))).toBe('Passing · keep it up')
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
