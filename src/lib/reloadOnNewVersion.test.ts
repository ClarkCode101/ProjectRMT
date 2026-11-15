import { describe, expect, it } from 'vitest'
import { isMissingFileError, RELOAD_COOLDOWN_MS, shouldReload } from './reloadOnNewVersion'

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

describe('isMissingFileError', () => {
  it('spots a missing screen file in Chrome, Safari and Firefox wording', () => {
    expect(isMissingFileError(new TypeError('Failed to fetch dynamically imported module: https://projectrmt.pages.dev/assets/LoginPage-Dg2H0Q8t.js'))).toBe(true)
    expect(isMissingFileError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isMissingFileError(new TypeError('error loading dynamically imported module: https://x/assets/a.js'))).toBe(true)
    expect(isMissingFileError(new Error('Unable to preload CSS for /assets/a.css'))).toBe(true)
  })

  it('leaves other errors alone', () => {
    expect(isMissingFileError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isMissingFileError(null)).toBe(false)
    expect(isMissingFileError({ status: 404 })).toBe(false)
  })
})
