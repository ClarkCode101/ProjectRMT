import { describe, expect, it, vi } from 'vitest'

// access.ts imports the Supabase client; the tests here don't need it.
vi.mock('./supabase', () => ({ supabase: {} }))

const { initials, oauthErrorFrom, parseAccess } = await import('./access')

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
