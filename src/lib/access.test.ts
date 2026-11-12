import { describe, expect, it, vi } from 'vitest'

// access.ts imports the Supabase client; the tests here don't need it.
vi.mock('./supabase', () => ({ supabase: {} }))

const { initials, lastStudiedLabel, oauthErrorFrom, parseAccess, signInMethod } = await import('./access')

describe('parseAccess', () => {
  it('reads the server answer', () => {
    expect(parseAccess({ status: 'pending', is_admin: false, requested_at: '2026-11-11T06:14:00Z' })).toEqual({
      status: 'pending',
      isAdmin: false,
      requestedAt: '2026-11-11T06:14:00Z',
    })
  })

  it('only an approved account can be the admin', () => {
    expect(parseAccess({ status: 'approved', is_admin: true })?.isAdmin).toBe(true)
    expect(parseAccess({ status: 'declined', is_admin: true })?.isAdmin).toBe(false)
  })

  it('is null for anything it does not know', () => {
    expect(parseAccess(null)).toBeNull()
    expect(parseAccess('approved')).toBeNull()
    expect(parseAccess({ status: 'banned' })).toBeNull()
    expect(parseAccess({})).toBeNull()
  })

  it('a missing request time is fine', () => {
    expect(parseAccess({ status: 'approved' })).toEqual({ status: 'approved', isAdmin: false, requestedAt: null })
  })
})

describe('initials', () => {
  it('uses the first two words of the name', () => {
    expect(initials('Sample Student', 'x@example.com')).toBe('SS')
    expect(initials('  ana maria  cruz ', 'x@example.com')).toBe('AM')
  })

  it('uses two letters of a one-word name', () => {
    expect(initials('Bea', 'x@example.com')).toBe('BE')
  })

  it('falls back to the email', () => {
    expect(initials(null, 'test.reviewer@example.com')).toBe('TE')
    expect(initials('   ', 'q@example.com')).toBe('Q@')
  })
})

describe('signInMethod', () => {
  it('names the sign-in methods', () => {
    expect(signInMethod(['google'])).toBe('Google')
    expect(signInMethod(['email'])).toBe('Email')
    expect(signInMethod(['email', 'google'])).toBe('Email + Google')
  })

  it('says Unknown when there are none', () => {
    expect(signInMethod([])).toBe('Unknown')
  })
})

describe('oauthErrorFrom', () => {
  it('is null on a normal address', () => {
    expect(oauthErrorFrom('', '')).toBeNull()
    expect(oauthErrorFrom('?from=mistakes', '#access_token=abc')).toBeNull()
  })

  it('finds the description in the hash or the query', () => {
    expect(oauthErrorFrom('', '#error=access_denied&error_description=Signups+not+allowed')).toBe('Signups not allowed')
    expect(oauthErrorFrom('?error=server_error&error_description=Something+broke', '')).toBe('Something broke')
  })

  it('falls back to the error code', () => {
    expect(oauthErrorFrom('', '#error=access_denied')).toBe('access_denied')
  })
})

describe('lastStudiedLabel', () => {
  const now = Date.parse('2026-11-12T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const MIN = 60_000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR

  it('shows nothing when the database does not send it yet', () => {
    expect(lastStudiedLabel(undefined, now)).toBeNull()
    expect(lastStudiedLabel('not a date', now)).toBeNull()
  })

  it('says when someone never studied', () => {
    expect(lastStudiedLabel(null, now)).toBe('Not studied yet')
  })

  it('counts minutes, hours, then days', () => {
    expect(lastStudiedLabel(ago(20_000), now)).toBe('Studied just now')
    expect(lastStudiedLabel(ago(12 * MIN), now)).toBe('Studied 12 min ago')
    expect(lastStudiedLabel(ago(3 * HOUR + 50 * MIN), now)).toBe('Studied 3 h ago')
    expect(lastStudiedLabel(ago(DAY), now)).toBe('Studied 1 day ago')
    expect(lastStudiedLabel(ago(5 * DAY + HOUR), now)).toBe('Studied 5 days ago')
    expect(lastStudiedLabel(ago(30 * DAY), now)).toBe('Studied 30 days ago')
  })

  it('gives the date after 30 days', () => {
    expect(lastStudiedLabel(ago(45 * DAY), now)).toMatch(/^Studied on /)
  })

  it('treats a time a little in the future (clock drift) as just now', () => {
    expect(lastStudiedLabel(new Date(now + 5_000).toISOString(), now)).toBe('Studied just now')
  })
})
