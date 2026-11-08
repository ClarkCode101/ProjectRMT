import { describe, expect, it } from 'vitest'
import type { ParsedQuestion } from './parsers/questionParser'
import { itemStatus, plannedWrites, summarize, toReviewItems, withMatches, type Match } from './uploadReview'

function parsed(stem: string, overrides: Partial<ParsedQuestion> = {}): ParsedQuestion {
  return { number: 1, stem, choices: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', problems: [], ...overrides }
}
const match: Match = { id: 'old-1', stem: 'Same question?', score: 1, exact: true }

describe('toReviewItems', () => {
  it('starts good questions as "save" and broken ones as "skip"', () => {
    const items = toReviewItems([parsed('Good?'), parsed('No answer?', { correctIndex: null })])
    expect(items.map((i) => i.decision)).toEqual(['save', 'skip'])
    expect(items.map(itemStatus)).toEqual(['checking', 'fix'])
  })

  it('marks a question repeated in the same file and skips the repeat', () => {
    const items = toReviewItems([parsed('Which is it?'), parsed('which is IT ?!')])
    expect(items[1].repeatOf).toBe(0)
    expect(items[1].decision).toBe('skip')
    expect(itemStatus(items[1])).toBe('repeat')
  })

  it('needs exactly four choices', () => {
    const [item] = toReviewItems([parsed('Five?', { choices: ['a', 'b', 'c', 'd', 'e'] })])
    expect(itemStatus(item)).toBe('fix')
  })
})

describe('withMatches', () => {
  it('switches a look-alike to "skip" and points Replace at the closest match', () => {
    const [item] = toReviewItems([parsed('Same question?')])
    const checked = withMatches(item, [match])
    expect(checked.decision).toBe('skip')
    expect(checked.replaceId).toBe('old-1')
    expect(itemStatus(checked)).toBe('duplicate')
  })

  it('leaves a question with no look-alikes as "save" and ready', () => {
    const [item] = toReviewItems([parsed('New one?')])
    const checked = withMatches(item, [])
    expect(checked.decision).toBe('save')
    expect(itemStatus(checked)).toBe('ready')
  })
})

describe('summarize and plannedWrites', () => {
  const items = [
    withMatches(toReviewItems([parsed('New?')])[0], []),
    { ...withMatches(toReviewItems([parsed('Same question?')])[0], [match]), key: 1, decision: 'replace' as const },
    { ...toReviewItems([parsed('Broken?', { correctIndex: null })])[0], key: 2, decision: 'save' as const },
  ]

  it('counts what will happen', () => {
    expect(summarize(items)).toMatchObject({ total: 3, ready: 1, fix: 1, duplicates: 1, toAdd: 1, toReplace: 1 })
  })

  it('writes only valid choices, using the upload topic unless one was picked', () => {
    const custom = [{ ...items[0], draft: { ...items[0].draft, topicId: 9 } }, items[1], items[2]]
    const writes = plannedWrites(custom, 4)
    expect(writes.inserts).toHaveLength(1)
    expect(writes.inserts[0].topicId).toBe(9)
    expect(writes.replacements).toEqual([{ id: 'old-1', draft: expect.objectContaining({ topicId: 4, stem: 'Same question?' }), chapter: null }])
  })
})

describe('plannedWrites into her own book', () => {
  const [first, second] = toReviewItems([parsed('One?'), parsed('Two?')]).map((i) => withMatches(i, []))

  it('gives each new question the topic chosen for the upload, unless it has its own', () => {
    const writes = plannedWrites([first, { ...second, chapter: 'Week 2' }], 7, 'Week 1')
    expect(writes.inserts.map((d) => d.topicId)).toEqual([7, 7])
    expect(writes.insertChapters).toEqual(['Week 1', 'Week 2'])
  })

  it('leaves the chapter empty when none is chosen', () => {
    expect(plannedWrites([first], 7).insertChapters).toEqual([null])
  })
})
