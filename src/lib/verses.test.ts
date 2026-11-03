import { describe, expect, it } from 'vitest'
import { VERSES, verseOfTheDay } from './verses'

describe('verseOfTheDay', () => {
  it('shows the same verse all day long', () => {
    const morning = verseOfTheDay(new Date(2026, 10, 3, 0, 5))
    const night = verseOfTheDay(new Date(2026, 10, 3, 23, 55))
    expect(night).toBe(morning)
  })

  it('moves to the next verse the next day, and wraps around at the end of the list', () => {
    const list = [
      { text: 'a', reference: 'A' },
      { text: 'b', reference: 'B' },
    ]
    const today = verseOfTheDay(new Date(2026, 10, 3), list)
    const tomorrow = verseOfTheDay(new Date(2026, 10, 4), list)
    const dayAfter = verseOfTheDay(new Date(2026, 10, 5), list)
    expect(tomorrow).not.toBe(today)
    expect(dayAfter).toBe(today)
  })

  it('every verse in the list has text and a reference', () => {
    expect(VERSES.length).toBeGreaterThan(0)
    for (const v of VERSES) {
      expect(v.text.trim()).not.toBe('')
      expect(v.reference.trim()).not.toBe('')
    }
  })
})
