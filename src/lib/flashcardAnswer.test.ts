import { describe, expect, it } from 'vitest'
import { flashcardAnswer } from './flashcardAnswer'

describe('flashcardAnswer', () => {
  it('a normal answer is shown as it is', () => {
    expect(flashcardAnswer(['Iron', 'B12', 'Folate'], 1)).toEqual({ kind: 'plain', text: 'B12' })
  })

  it('"Both X and Y" is a full answer on its own', () => {
    expect(flashcardAnswer(['Fibrin', 'Fibrinogen', 'Both fibrin and fibrinogen'], 2)).toEqual({ kind: 'plain', text: 'Both fibrin and fibrinogen' })
  })

  it('"All of the above" lists the choices above it', () => {
    expect(flashcardAnswer(['Megaloblasts', 'Hypersegmented neutrophils', 'Pancytopenia', 'All of the above'], 3)).toEqual({
      kind: 'all',
      text: 'All of the above',
      items: ['Megaloblasts', 'Hypersegmented neutrophils', 'Pancytopenia'],
    })
  })

  it('"above" only counts choices before it', () => {
    const r = flashcardAnswer(['A1', 'A2', 'All of the above', 'Later one'], 2)
    expect(r).toEqual({ kind: 'all', text: 'All of the above', items: ['A1', 'A2'] })
  })

  it('"All of these" lists every other choice, wherever it is', () => {
    const r = flashcardAnswer(['All of these', 'X', 'Y', 'Z'], 0)
    expect(r).toEqual({ kind: 'all', text: 'All of these', items: ['X', 'Y', 'Z'] })
  })

  it('"None of the above" lists the choices it rules out', () => {
    const r = flashcardAnswer(['Hormones', 'Neurotransmitters', 'None of the above accurately describes catecholamines'], 2)
    expect(r.kind).toBe('none')
    if (r.kind === 'none') expect(r.items).toEqual(['Hormones', 'Neurotransmitters'])
  })

  it('leaves out choices that only point at other choices', () => {
    const r = flashcardAnswer(['P', 'Q', 'Both A and B', 'None of the above', 'All of the above'], 4)
    expect(r).toEqual({ kind: 'all', text: 'All of the above', items: ['P', 'Q'] })
  })

  it('is case-insensitive and trims spaces', () => {
    expect(flashcardAnswer([' p ', 'q', '  ALL OF THE ABOVE '], 2)).toEqual({ kind: 'all', text: 'ALL OF THE ABOVE', items: ['p', 'q'] })
  })

  it('fewer than 2 items to list: shown as it is', () => {
    expect(flashcardAnswer(['All of the above', 'X'], 0)).toEqual({ kind: 'plain', text: 'All of the above' })
  })

  it('a missing answer gives empty text, never a crash', () => {
    expect(flashcardAnswer([], 3)).toEqual({ kind: 'plain', text: '' })
  })
})
