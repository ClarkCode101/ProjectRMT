import { describe, expect, it } from 'vitest'
import { buildDeck, cardToRow, dueByTomorrow, formatInterval, makeScheduler, previewIntervals, Rating, review, rowToCard, State, type ReviewRow } from './fsrs'

const f = makeScheduler(false) // no fuzz, so results are repeatable
const NOW = new Date('2026-11-03T08:00:00Z')
const MIN = 60_000
const DAY = 24 * 60 * MIN

/** Simple seeded random number generator so shuffles are repeatable in tests. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const row = (question_id: string, dueOffsetMs: number, extra: Partial<ReviewRow> = {}): ReviewRow => ({
  question_id,
  due: new Date(NOW.getTime() + dueOffsetMs).toISOString(),
  stability: 5,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: 5,
  reps: 3,
  lapses: 0,
  state: State.Review,
  last_review: new Date(NOW.getTime() - 5 * DAY).toISOString(),
  ...extra,
})

describe('rowToCard / cardToRow', () => {
  it('turns "no row yet" into a brand-new card due now', () => {
    const card = rowToCard(undefined, NOW)
    expect(card.state).toBe(State.New)
    expect(card.reps).toBe(0)
    expect(card.due.getTime()).toBe(NOW.getTime())
  })

  it('round-trips a saved card without losing anything the table stores', () => {
    const saved = row('q1', DAY)
    expect(cardToRow('q1', rowToCard(saved, NOW))).toEqual(saved)
  })

  it('fills gaps in a half-empty row with safe defaults instead of crashing', () => {
    const card = rowToCard({ ...row('q1', 0), stability: null, reps: null, state: 99, last_review: null }, NOW)
    expect(card).toMatchObject({ stability: 0, reps: 0, state: State.New, last_review: undefined })
  })
})

describe('review / previewIntervals', () => {
  it('a new card rated Good starts learning and comes back later', () => {
    const next = review(rowToCard(undefined, NOW), Rating.Good, NOW, f)
    expect(next.reps).toBe(1)
    expect(next.state).not.toBe(State.New)
    expect(next.due.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it('Again < Hard < Good < Easy for a card she already knows', () => {
    const intervals = previewIntervals(rowToCard(row('q1', 0), NOW), NOW, f)
    expect(intervals[Rating.Again]).toBeLessThan(intervals[Rating.Hard])
    expect(intervals[Rating.Hard]).toBeLessThan(intervals[Rating.Good])
    expect(intervals[Rating.Good]).toBeLessThan(intervals[Rating.Easy])
  })

  it('Again on a known card counts a lapse and brings it back soon', () => {
    const next = review(rowToCard(row('q1', 0), NOW), Rating.Again, NOW, f)
    expect(next.lapses).toBe(1)
    expect(next.due.getTime() - NOW.getTime()).toBeLessThan(DAY)
  })
})

describe('formatInterval', () => {
  it('uses the shortest sensible unit', () => {
    expect(formatInterval(30_000)).toBe('<1m')
    expect(formatInterval(10 * MIN)).toBe('10m')
    expect(formatInterval(3 * 60 * MIN)).toBe('3h')
    expect(formatInterval(4 * DAY)).toBe('4d')
    expect(formatInterval(60 * DAY)).toBe('2mo')
    expect(formatInterval(365 * DAY)).toBe('1y')
    expect(formatInterval(400 * DAY)).toBe('1.1y')
  })
})

describe('buildDeck', () => {
  const questions = ['due-late', 'due-early', 'later', 'new1', 'new2', 'new3'].map((id) => ({ id }))
  const states = new Map(
    [row('due-late', -1 * DAY), row('due-early', -3 * DAY), row('later', 2 * DAY)].map((r) => [r.question_id, r]),
  )

  it('takes due cards (most overdue first) and up to the daily limit of new ones', () => {
    const deck = buildDeck(questions, states, NOW, 2, seeded(1))
    expect(deck.due.map((q) => q.id)).toEqual(['due-early', 'due-late'])
    expect(deck.fresh).toHaveLength(2)
    expect(deck.fresh.every((q) => q.id.startsWith('new'))).toBe(true)
  })

  it('leaves out cards not due yet, and handles a 0 limit and duplicates', () => {
    const deck = buildDeck([...questions, { id: 'new1' }], states, NOW, 0)
    expect(deck.due.map((q) => q.id)).not.toContain('later')
    expect(deck.fresh).toEqual([])
    expect(buildDeck([...questions, { id: 'new1' }], states, NOW, 10).fresh).toHaveLength(3)
  })
})

describe('dueByTomorrow', () => {
  it('counts cards due before the end of tomorrow', () => {
    expect(dueByTomorrow([row('a', MIN), row('b', 10 * DAY), row('c', -DAY)], NOW)).toBe(2)
    expect(dueByTomorrow([], NOW)).toBe(0)
  })
})
