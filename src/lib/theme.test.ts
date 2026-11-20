import { describe, expect, it } from 'vitest'
import { parseTheme } from './theme'

describe('parseTheme', () => {
  it('keeps a known theme', () => {
    expect(parseTheme('cartoon')).toBe('cartoon')
    expect(parseTheme('pastel')).toBe('pastel')
    expect(parseTheme('modern')).toBe('modern')
  })

  it('falls back to modern (the default) for nothing saved or a broken value', () => {
    expect(parseTheme(null)).toBe('modern')
    expect(parseTheme('')).toBe('modern')
    expect(parseTheme('neon')).toBe('modern')
    expect(parseTheme(42)).toBe('modern')
  })
})
