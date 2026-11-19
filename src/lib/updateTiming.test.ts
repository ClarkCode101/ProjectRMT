import { describe, expect, it } from 'vitest'
import { AWAY_MS, cameBackAfterAWhile, shouldSwitchQuietly } from './updateTiming'

const now = Date.parse('2026-11-19T12:00:00Z')
const fresh = { ready: true, busy: false, typing: false, now, freshUntil: now + 5_000 }

describe('shouldSwitchQuietly', () => {
  it('switches right after the app opens when a new version is waiting', () => {
    expect(shouldSwitchQuietly(fresh)).toBe(true)
  })

  it('does nothing when there is no new version', () => {
    expect(shouldSwitchQuietly({ ...fresh, ready: false })).toBe(false)
  })

  it('never interrupts a quiz, exam, game or the editor', () => {
    expect(shouldSwitchQuietly({ ...fresh, busy: true })).toBe(false)
  })

  it('waits while she is typing (e.g. her email on the login screen)', () => {
    expect(shouldSwitchQuietly({ ...fresh, typing: true })).toBe(false)
  })

  it('waits once the app has been open for a while (the banner shows instead)', () => {
    expect(shouldSwitchQuietly({ ...fresh, freshUntil: now - 1 })).toBe(false)
  })
})

describe('cameBackAfterAWhile', () => {
  it('counts coming back after a long time away as a fresh open', () => {
    expect(cameBackAfterAWhile(now - AWAY_MS, now)).toBe(true)
  })

  it('ignores a quick switch to another app and back', () => {
    expect(cameBackAfterAWhile(now - 5 * 60 * 1000, now)).toBe(false)
  })

  it('ignores it when the app was never hidden', () => {
    expect(cameBackAfterAWhile(null, now)).toBe(false)
  })
})
