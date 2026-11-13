import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectSummary } from '@/lib/quiz'
import { changedSince, makeSnapshot, readSnapshot, writeSnapshot } from './snapshot'

function subject(code: string, attempts: number, accuracy: number | null): SubjectSummary {
  return { subjectId: 1, code, name: code, attempts, accuracy, belowPassing: accuracy !== null && accuracy < 0.75, belowFloor: accuracy !== null && accuracy < 0.5, topics: [] }
}

describe('changedSince', () => {
  const before = makeSnapshot([subject('CC', 10, 0.3), subject('HEMA', 3, 0)], 0.25)

  it('is empty on the first visit (no snapshot)', () => {
    expect(changedSince(null, [subject('CC', 12, 0.4)])).toEqual({})
  })

  it('lists only subjects with more answers, with their old numbers', () => {
    const now = [subject('CC', 15, 0.4), subject('HEMA', 3, 0)]
    expect(changedSince(before, now)).toEqual({ CC: { attempts: 10, accuracy: 0.3 } })
  })

  it('ignores fewer answers (after a reset) and subjects it never saw', () => {
    expect(changedSince(before, [subject('CC', 0, null), subject('CM', 5, 0.5)])).toEqual({})
  })
})

describe('readSnapshot / writeSnapshot', () => {
  // Tests run in Node (no browser), so give them a tiny in-memory localStorage.
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('round-trips', () => {
    const snap = makeSnapshot([subject('CC', 10, 0.3)], 0.3)
    writeSnapshot(snap)
    expect(readSnapshot()).toEqual(snap)
  })

  it('returns null for missing or broken data, and drops bad entries', () => {
    expect(readSnapshot()).toBeNull()
    localStorage.setItem('projectrmt:home-snapshot', '{not json')
    expect(readSnapshot()).toBeNull()
    localStorage.setItem('projectrmt:home-snapshot', JSON.stringify({ overall: 0.2, subjects: { CC: { attempts: 'x' }, CM: { attempts: 2, accuracy: 0.5 } } }))
    expect(readSnapshot()).toEqual({ overall: 0.2, subjects: { CM: { attempts: 2, accuracy: 0.5 } } })
  })
})
