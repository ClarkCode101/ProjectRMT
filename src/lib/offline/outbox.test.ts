import { describe, expect, it, vi } from 'vitest'

// outbox.ts imports the Supabase client; these tests only use the pure helpers.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { attemptRows, failureAction, parseOutbox, takeBatch } = await import('./outbox')
type OutboxItem = import('./outbox').OutboxItem

const session: OutboxItem = {
  kind: 'session',
  row: { id: 's1', mode: 'practice', total_items: 3, filters: null, started_at: '2026-11-09T10:00:00.000Z' },
}
const attempt = (id: string): OutboxItem => ({
  kind: 'attempt',
  row: { id, session_id: 's1', question_id: `q-${id}`, selected_index: 0, is_correct: true, time_ms: 1000, created_at: '2026-11-09T10:01:00.000Z' },
})
const finish: OutboxItem = { kind: 'finish', sessionId: 's1', score: 2, durationSec: 60, finishedAt: '2026-11-09T10:05:00.000Z' }

describe('attemptRows', () => {
  it('leaves out the assisted column when no answer was helped (works before migration 0032)', () => {
    const rows = attemptRows([attempt('a1'), attempt('a2')])
    expect(rows.every((row) => !('assisted' in row))).toBe(true)
  })

  it('sends assisted on every row once one answer was helped', () => {
    const helped = attempt('a2')
    if (helped.kind === 'attempt') helped.row.assisted = true
    const rows = attemptRows([attempt('a1'), helped])
    expect(rows.map((row) => row.assisted)).toEqual([false, true])
  })

  it('never sends from_game (it is only for Review again on the device)', () => {
    const game = attempt('a1')
    if (game.kind === 'attempt') game.row.from_game = true
    expect(attemptRows([game]).every((row) => !('from_game' in row))).toBe(true)
  })
})

describe('takeBatch', () => {
  it('is empty when there is nothing to send', () => {
    expect(takeBatch([])).toEqual([])
  })

  it('sends a session on its own, before its answers', () => {
    expect(takeBatch([session, attempt('a'), attempt('b')])).toEqual([session])
  })

  it('groups answers in a row, stopping at the next session or finish', () => {
    expect(takeBatch([attempt('a'), attempt('b'), finish, attempt('c')])).toEqual([attempt('a'), attempt('b')])
  })

  it('takes all answers when only answers are left', () => {
    expect(takeBatch([attempt('a'), attempt('b')])).toHaveLength(2)
  })

  it('sends a finish on its own', () => {
    expect(takeBatch([finish, session])).toEqual([finish])
  })
})

describe('failureAction', () => {
  it('keeps it for later when there was no connection', () => {
    expect(failureAction(0)).toBe('retry')
  })

  it('keeps it when the login expired (fixed once the login refreshes)', () => {
    expect(failureAction(401)).toBe('retry')
  })

  it('keeps it when the server is busy or down', () => {
    expect(failureAction(429)).toBe('retry')
    expect(failureAction(500)).toBe('retry')
    expect(failureAction(503)).toBe('retry')
  })

  it('drops what the server will never accept, so it does not block the rest', () => {
    expect(failureAction(400)).toBe('drop')
    expect(failureAction(403)).toBe('drop')
    expect(failureAction(409)).toBe('drop') // e.g. the question was deleted
  })
})

describe('parseOutbox', () => {
  it('reads a saved list back', () => {
    const items = [session, attempt('a'), finish]
    expect(parseOutbox(JSON.stringify(items))).toEqual(items)
  })

  it('is empty when nothing was saved', () => {
    expect(parseOutbox(null)).toEqual([])
    expect(parseOutbox('')).toEqual([])
  })

  it('does not crash on broken data', () => {
    expect(parseOutbox('{not json')).toEqual([])
    expect(parseOutbox('{"kind":"attempt"}')).toEqual([])
  })

  it('skips items it does not recognize', () => {
    expect(parseOutbox(JSON.stringify([attempt('a'), { kind: 'mystery' }, 42, null]))).toEqual([attempt('a')])
  })
})

const { latestPerCard } = await import('./outbox')

const rating = (questionId: string, due: string): OutboxItem => ({
  kind: 'review',
  row: { question_id: questionId, due, stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, reps: 1, lapses: 0, state: 1, last_review: null },
})

describe('takeBatch with flashcard ratings', () => {
  it('groups ratings in a row, apart from answers', () => {
    expect(takeBatch([rating('q1', 'd1'), rating('q2', 'd2'), attempt('a')])).toEqual([rating('q1', 'd1'), rating('q2', 'd2')])
  })
})

describe('latestPerCard', () => {
  it('keeps only the latest schedule of a card rated twice', () => {
    const rows = [rating('q1', 'first'), rating('q2', 'x'), rating('q1', 'second')].map((item) => (item.kind === 'review' ? item.row : null)!)
    expect(latestPerCard(rows).map((r) => `${r.question_id}:${r.due}`)).toEqual(['q2:x', 'q1:second'])
  })
})
