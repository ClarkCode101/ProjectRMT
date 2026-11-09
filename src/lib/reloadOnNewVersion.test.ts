import { describe, expect, it } from 'vitest'
import { RELOAD_COOLDOWN_MS, shouldReload } from './reloadOnNewVersion'

const now = Date.parse('2026-11-09T12:00:00Z')

describe('shouldReload', () => {
  it('reloads to get the new version', () => {
    expect(shouldReload(null, now, true)).toBe(true)
  })

  it('does not reload while offline (the new version cannot be downloaded)', () => {
    expect(shouldReload(null, now, false)).toBe(false)
  })

  it('does not reload again right after a reload (no reload loop)', () => {
    expect(shouldReload(now - 5_000, now, true)).toBe(false)
  })

  it('may reload again once the cooldown has passed', () => {
    expect(shouldReload(now - RELOAD_COOLDOWN_MS - 1, now, true)).toBe(true)
  })
})
