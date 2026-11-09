import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake Supabase: records every request and answers with whatever the test says.
type Call = { table: string; action: 'upsert' | 'update'; rows: unknown }
const calls: Call[] = []
let respond: (call: Call) => { error: unknown; status: number } = () => ({ error: null, status: 201 })

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: (rows: unknown) => {
        const call: Call = { table, action: 'upsert', rows }
        calls.push(call)
        return Promise.resolve(respond(call))
      },
      update: (rows: unknown) => ({
        eq: () => {
          const call: Call = { table, action: 'update', rows }
          calls.push(call)
          return Promise.resolve(respond(call))
        },
      }),
    }),
  },
}))

const outbox = await import('./outbox')
const { setOfflineUserId } = await import('./storage')

/** A tiny stand-in for the browser's localStorage. */
function fakeLocalStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

let online = true

beforeEach(() => {
  calls.length = 0
  respond = () => ({ error: null, status: 201 })
  online = true
  vi.stubGlobal('localStorage', fakeLocalStorage())
  vi.stubGlobal('navigator', {
    get onLine() {
      return online
    },
  })
  setOfflineUserId('user-1')
})

afterEach(() => {
  vi.unstubAllGlobals()
  setOfflineUserId(null)
})

const answer = (id: string) => ({
  id,
  session_id: 's1',
  question_id: `q-${id}`,
  selected_index: 1,
  is_correct: true,
  time_ms: 800,
  created_at: '2026-11-09T10:00:00.000Z',
})

/** Adds items while offline, so they wait instead of being sent right away. */
function queueOffline(add: () => void) {
  online = false
  add()
  online = true
}

describe('flushOutbox', () => {
  it('sends the session, then its answers together, then the score, in that order', async () => {
    queueOffline(() => {
      outbox.queueSession({ id: 's1', mode: 'practice', total_items: 2, filters: null, started_at: '2026-11-09T10:00:00.000Z' })
      outbox.queueAttempt(answer('a'))
      outbox.queueAttempt(answer('b'))
      outbox.queueFinish('s1', 2, 30)
    })
    expect(outbox.pendingAttempts()).toHaveLength(2)

    await outbox.flushOutbox()

    expect(calls.map((c) => `${c.table}:${c.action}`)).toEqual(['quiz_sessions:upsert', 'attempts:upsert', 'quiz_sessions:update'])
    expect(calls[1].rows).toHaveLength(2) // both answers in one request
    expect(outbox.pendingAttempts()).toEqual([])
  })

  it('sends nothing while offline, and keeps everything', async () => {
    queueOffline(() => outbox.queueAttempt(answer('a')))
    online = false
    await outbox.flushOutbox()
    expect(calls).toEqual([])
    expect(outbox.pendingAttempts()).toHaveLength(1)
  })

  it('keeps answers for later when the connection drops mid-send', async () => {
    queueOffline(() => outbox.queueAttempt(answer('a')))
    respond = () => ({ error: { message: 'Failed to fetch' }, status: 0 })
    await outbox.flushOutbox()
    expect(outbox.pendingAttempts()).toHaveLength(1)

    // Back online: it goes through on the next try.
    respond = () => ({ error: null, status: 201 })
    await outbox.flushOutbox()
    expect(outbox.pendingAttempts()).toEqual([])
  })

  it('drops only the answer the server refuses, and still sends the good ones', async () => {
    queueOffline(() => {
      outbox.queueAttempt(answer('good-1'))
      outbox.queueAttempt(answer('deleted-question'))
      outbox.queueAttempt(answer('good-2'))
    })
    // The server refuses any request that has the answer to a deleted question.
    respond = (call) => {
      const rows = call.rows as { id: string }[]
      return rows.some((r) => r.id === 'deleted-question') ? { error: { code: '23503' }, status: 409 } : { error: null, status: 201 }
    }

    const synced: string[] = []
    const stop = outbox.onSynced((sent) => synced.push(...sent.map((a) => a.id)))
    await outbox.flushOutbox()
    stop()

    expect(outbox.pendingAttempts()).toEqual([])
    expect(synced).toEqual(['good-1', 'good-2'])
  })

  it('tells listeners which answers reached the server', async () => {
    const synced: string[] = []
    const stop = outbox.onSynced((sent) => synced.push(...sent.map((a) => a.id)))
    outbox.queueAttempt(answer('a')) // online: sent right away
    await outbox.flushOutbox()
    stop()
    expect(synced).toEqual(['a'])
  })

  it('keeps each account’s waiting answers apart', async () => {
    queueOffline(() => outbox.queueAttempt(answer('from-user-1')))
    setOfflineUserId('user-2')
    expect(outbox.pendingAttempts()).toEqual([])
    await outbox.flushOutbox()
    expect(calls).toEqual([]) // user 2 must not send user 1's answers

    setOfflineUserId('user-1')
    expect(outbox.pendingAttempts()).toHaveLength(1)
  })
})
