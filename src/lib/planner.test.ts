import { describe, expect, it } from 'vitest'
import { countdownLabel, daysUntil, isValidDate, milestoneKey, milestoneReached, pickNote, shouldShowRandomNote, type Note } from './planner'

const today = new Date(2026, 10, 3, 21, 30) // Tue, Nov 3 2026, 9:30 PM local

describe('daysUntil / countdownLabel', () => {
  it('counts whole days in her own time zone', () => {
    expect(daysUntil('2026-11-03', today)).toBe(0)
    expect(daysUntil('2026-11-04', today)).toBe(1)
    expect(daysUntil('2027-02-23', today)).toBe(112)
    expect(daysUntil('2026-11-01', today)).toBe(-2)
  })

  it('crosses month and year ends correctly', () => {
    expect(daysUntil('2026-12-01', today)).toBe(28)
    expect(daysUntil('2027-01-01', today)).toBe(59)
  })

  it('says something friendly for today and tomorrow, and nothing once the exam has passed', () => {
    expect(countdownLabel(112)).toBe('112 days to the board exam')
    expect(countdownLabel(1)).toBe('Exam is tomorrow')
    expect(countdownLabel(0)).toMatch(/Exam day/)
    expect(countdownLabel(-1)).toBeNull()
  })
})

describe('isValidDate', () => {
  it('accepts real dates only', () => {
    expect(isValidDate('2027-02-23')).toBe(true)
    expect(isValidDate('2027-02-30')).toBe(false)
    expect(isValidDate('')).toBe(false)
    expect(isValidDate('23/02/2027')).toBe(false)
  })
})

describe('milestoneReached', () => {
  it('celebrates only exact milestones, and only if she studied today', () => {
    expect(milestoneReached(7, true)).toBe(7)
    expect(milestoneReached(8, true)).toBeNull()
    expect(milestoneReached(7, false)).toBeNull()
    expect(milestoneReached(0, true)).toBeNull()
  })

  it('makes a per-day key so each milestone shows once', () => {
    expect(milestoneKey(7, today)).toBe('7:2026-11-03')
  })
})

describe('pickNote / shouldShowRandomNote', () => {
  const notes: Note[] = [
    { trigger: 'mock_done', message: 'mock A' },
    { trigger: 'mock_done', message: 'mock B' },
    { trigger: 'random', message: 'any' },
  ]

  it('picks a note for the trigger, the same one for the same seed', () => {
    const first = pickNote(notes, 'mock_done', 'session-1')
    expect(['mock A', 'mock B']).toContain(first)
    expect(pickNote(notes, 'mock_done', 'session-1')).toBe(first)
  })

  it('falls back to a random note, or nothing when there are no notes', () => {
    expect(pickNote(notes, 'streak', 'x')).toBe('any')
    expect(pickNote([], 'streak', 'x')).toBeNull()
  })

  it('shows random notes after only some sessions', () => {
    const shown = Array.from({ length: 300 }, (_, i) => shouldShowRandomNote(`s${i}`)).filter(Boolean).length
    expect(shown).toBeGreaterThan(60)
    expect(shown).toBeLessThan(140)
  })
})
