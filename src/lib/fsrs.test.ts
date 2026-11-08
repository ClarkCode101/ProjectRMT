import { describe, expect, it } from 'vitest'
import {
  buildDeck,
  cardToRow,
  countDue,
  dueByTomorrow,
  formatInterval,
  makeScheduler,
  maxIntervalForExam,
  previewIntervals,
  Rating,
  review,
  rowToCard,
  State,
  type ReviewRow,
} from './fsrs'

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

describe('maxIntervalForExam / capped scheduler', () => {
  it('allows at most the day before the exam', () => {
    expect(maxIntervalForExam(40)).toBe(39)
    expect(maxIntervalForExam(2)).toBe(1)
  })

  it('never goes below 1 day, even on the eve or day of the exam', () => {
    expect(maxIntervalForExam(1)).toBe(1)
    expect(maxIntervalForExam(0)).toBe(1)
  })

  it('has no limit without an exam date, or once it has passed', () => {
    expect(maxIntervalForExam(null)).toBeUndefined()
    expect(maxIntervalForExam(-3)).toBeUndefined()
  })

  it('keeps every button within the limit', () => {
    const capped = makeScheduler(false, 3)
    const newCard = previewIntervals(rowToCard(undefined, NOW), NOW, capped)
    const knownCard = previewIntervals(rowToCard(row('q1', 0, { stability: 40, scheduled_days: 40 }), NOW), NOW, capped)
    for (const ms of [...Object.values(newCard), ...Object.values(knownCard)]) expect(ms).toBeLessThanOrEqual(3 * DAY)
  })

  it('leaves the short learning steps alone', () => {
    const capped = previewIntervals(rowToCard(undefined, NOW), NOW, makeScheduler(false, 3))
    const normal = previewIntervals(rowToCard(undefined, NOW), NOW, f)
    expect(capped[Rating.Again]).toBe(normal[Rating.Again])
    expect(capped[Rating.Good]).toBe(normal[Rating.Good])
  })
})

describe('formatInterval', () => {
  it('uses the shortest sensible unit, spelled out', () => {
    expect(formatInterval(30_000)).toBe('<1 min')
    expect(formatInterval(10 * MIN)).toBe('10 min')
    expect(formatInterval(60 * MIN)).toBe('1 hour')
    expect(formatInterval(3 * 60 * MIN)).toBe('3 hours')
    expect(formatInterval(DAY)).toBe('1 day')
    expect(formatInterval(4 * DAY)).toBe('4 days')
    expect(formatInterval(30 * DAY)).toBe('1 month')
    expect(formatInterval(60 * DAY)).toBe('2 months')
    expect(formatInterval(365 * DAY)).toBe('1 year')
    expect(formatInterval(400 * DAY)).toBe('1.1 years')
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

describe('countDue', () => {
  const now = new Date('2026-11-08T12:00:00')
  const states = new Map([
    ['past', { due: '2026-11-07T12:00:00' }],
    ['now', { due: '2026-11-08T12:00:00' }],
    ['later', { due: '2026-11-09T12:00:00' }],
  ])

  it('counts cards due now or earlier, only among the given questions', () => {
    expect(countDue(['past', 'now', 'later', 'never-seen'], states, now)).toBe(2)
    expect(countDue(['later'], states, now)).toBe(0)
  })

  it('is 0 for no questions', () => {
    expect(countDue([], states, now)).toBe(0)
  })
})
