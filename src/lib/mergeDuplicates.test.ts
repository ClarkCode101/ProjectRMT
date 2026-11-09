import { describe, expect, it } from 'vitest'
import { findMergeDuplicates, SIMILAR_AT, similarity } from './mergeDuplicates'

describe('similarity', () => {
  it('is 1 for the same text, ignoring capitals, punctuation and spaces', () => {
    expect(similarity('Which factor is the STABLE factor?', '  which factor is the stable factor ')).toBe(1)
  })

  it('is high for a small change and low for a different question', () => {
    const a = 'Which anticoagulant is preferred for a complete blood count?'
    expect(similarity(a, 'Which anticoagulant is preferred for a complete blood count (CBC)?')).toBeGreaterThanOrEqual(SIMILAR_AT)
    expect(similarity(a, 'In the Gram stain, which reagent serves as the decolorizer?')).toBeLessThan(SIMILAR_AT)
  })

  it('is 0 when a text has no letters or numbers', () => {
    expect(similarity('???', 'Which factor?')).toBe(0)
  })
})

describe('findMergeDuplicates', () => {
  const existing = [
    { id: 'e1', stem: 'Which anticoagulant is preferred for a complete blood count (CBC)?' },
    { id: 'e2', stem: 'What is the predominant hemoglobin in normal adults?' },
  ]

  it('finds the same question, and a question that is only alike', () => {
    const incoming = [
      { id: 'i1', stem: 'what is the predominant hemoglobin in normal adults' }, // same
      { id: 'i2', stem: 'Which anticoagulant is preferred for a complete blood count?' }, // alike
      { id: 'i3', stem: 'In the Gram stain, which reagent serves as the decolorizer?' }, // new
    ]
    const found = findMergeDuplicates(incoming, existing)
    expect(found.map((d) => [d.incomingId, d.existingId, d.exact])).toEqual([
      ['i1', 'e2', true],
      ['i2', 'e1', false],
    ])
  })

  it('does not list a question that is already in both books', () => {
    expect(findMergeDuplicates([{ id: 'e2', stem: existing[1].stem }], existing)).toEqual([])
  })

  it('is empty when nothing matches, or a book is empty', () => {
    expect(findMergeDuplicates([{ id: 'x', stem: 'Name the stain for acid-fast bacilli.' }], existing)).toEqual([])
    expect(findMergeDuplicates([], existing)).toEqual([])
    expect(findMergeDuplicates([{ id: 'x', stem: 'Anything' }], [])).toEqual([])
  })
})
