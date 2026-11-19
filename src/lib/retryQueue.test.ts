import { describe, expect, it } from 'vitest'
import { firstAnswerPerQuestion, fixedCount, lastAnswerPerQuestion, MAX_TRIES, requeueMissed } from './retryQueue'

const copy = (s: string) => `${s}'`

describe('requeueMissed', () => {
  it('puts a missed question back 2 items later', () => {
    expect(requeueMissed(['a', 'b', 'c', 'd', 'e'], 0, 1, copy)).toEqual(['a', 'b', 'c', "a'", 'd', 'e'])
  })

  it('near the end, puts it at the end', () => {
    expect(requeueMissed(['a', 'b', 'c'], 1, 1, copy)).toEqual(['a', 'b', 'c', "b'"])
    expect(requeueMissed(['a', 'b', 'c'], 2, 1, copy)).toEqual(['a', 'b', 'c', "c'"])
  })

  it('stops after the last try', () => {
    expect(requeueMissed(['a', 'b'], 0, MAX_TRIES - 1, copy)).toEqual(['a', 'b', "a'"])
    expect(requeueMissed(['a', 'b'], 0, MAX_TRIES, copy)).toEqual(['a', 'b'])
  })
})

describe('fixedCount / lastAnswerPerQuestion', () => {
  const answer = (id: string, isCorrect: boolean) => ({ question: { id }, isCorrect })
  const answers = [answer('a', false), answer('b', true), answer('c', false), answer('a', true), answer('c', false)]

  it('counts each question fixed once, however many tries it took', () => {
    expect(fixedCount(answers)).toBe(2)
    expect(fixedCount([])).toBe(0)
  })

  it('keeps the last answer per question, in the order they first came up', () => {
    expect(lastAnswerPerQuestion(answers)).toEqual([answer('a', true), answer('b', true), answer('c', false)])
  })

  it('or the first try per question (what is saved and scored)', () => {
    expect(firstAnswerPerQuestion(answers)).toEqual([answer('a', false), answer('b', true), answer('c', false)])
  })
})
