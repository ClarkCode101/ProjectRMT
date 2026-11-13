import { describe, expect, it } from 'vitest'
import { SUBJECT_COLOR } from '@/lib/books'
import { liquidBackground, liquidColors, MIX_CODE, tubeStatus } from './tube'

describe('tubeStatus', () => {
  it('is new, low or passing', () => {
    expect(tubeStatus(null, false)).toBe('new')
    expect(tubeStatus(0.33, true)).toBe('low')
    expect(tubeStatus(0.7, false)).toBe('passing')
  })
})

describe('liquid colors', () => {
  it('a subject tube is the same color as its book and Last Card suit', () => {
    expect(liquidColors('MICRO')).toEqual([SUBJECT_COLOR.MICRO])
    expect(liquidBackground('MICRO')).toContain(SUBJECT_COLOR.MICRO)
  })

  it('the Mix tube has one layer per subject, in the card order', () => {
    expect(liquidColors(MIX_CODE)).toEqual(['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE'].map((s) => SUBJECT_COLOR[s]))
    // hard edges: each layer takes one sixth
    const mix = liquidBackground(MIX_CODE, 'right')
    expect(mix.startsWith(`linear-gradient(to right, ${SUBJECT_COLOR.CC} 0% 16.66`)).toBe(true)
    expect(mix).toContain(`${SUBJECT_COLOR.HTMLE} 83.33`)
  })

  it('an unknown subject falls back to the app blue', () => {
    expect(liquidColors('XYZ')).toEqual(['var(--primary)'])
  })
})
