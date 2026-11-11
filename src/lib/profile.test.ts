import { describe, expect, it, vi } from 'vitest'

// profile.ts imports the Supabase client; the tests here don't need it.
vi.mock('./supabase', () => ({ supabase: {} }))

const { firstName, needsWelcome, passwordProblem, suggestedFirstName } = await import('./profile')

describe('needsWelcome', () => {
  it('shows for a new member with no name and no exam date', () => {
    expect(needsWelcome({ user_metadata: {} }, null)).toBe(true)
  })

  it('does not show once she saved or skipped it', () => {
    expect(needsWelcome({ user_metadata: { welcome_done: true } }, null)).toBe(false)
  })

  it('does not show when she already set a name or an exam date', () => {
    expect(needsWelcome({ user_metadata: { first_name: 'Bea' } }, null)).toBe(false)
    expect(needsWelcome({ user_metadata: {} }, '2027-03-15')).toBe(false)
  })

  it('does not show without a user', () => {
    expect(needsWelcome(null, null)).toBe(false)
  })
})

describe('suggestedFirstName', () => {
  it('takes the first word of the name Google sent', () => {
    expect(suggestedFirstName({ user_metadata: { full_name: 'Maria Bea Santos' } })).toBe('Maria')
    expect(suggestedFirstName({ user_metadata: { given_name: ' Bea ', full_name: 'Maria Bea Santos' } })).toBe('Bea')
  })

  it('is empty for email sign-ups', () => {
    expect(suggestedFirstName({ user_metadata: {} })).toBe('')
    expect(suggestedFirstName(null)).toBe('')
  })
})

describe('passwordProblem', () => {
  it('is null when everything is filled in right', () => {
    expect(passwordProblem('oldpass1', 'newpass12', 'newpass12')).toBeNull()
  })

  it('asks for the current password first', () => {
    expect(passwordProblem('', 'newpass12', 'newpass12')).toMatch(/current password/)
  })

  it('needs at least 8 characters', () => {
    expect(passwordProblem('oldpass1', 'short', 'short')).toMatch(/at least 8/)
    expect(passwordProblem('oldpass1', '12345678', '12345678')).toBeNull()
  })

  it('rejects the same password', () => {
    expect(passwordProblem('samepass1', 'samepass1', 'samepass1')).toMatch(/different/)
  })

  it('catches a typo in the confirm box', () => {
    expect(passwordProblem('oldpass1', 'newpass12', 'newpass13')).toMatch(/don’t match/)
  })
})

describe('firstName', () => {
  it('reads the trimmed name from the account', () => {
    expect(firstName({ user_metadata: { first_name: '  Bea ' } })).toBe('Bea')
  })

  it('is null when missing, blank, or not text', () => {
    expect(firstName(null)).toBeNull()
    expect(firstName({ user_metadata: {} })).toBeNull()
    expect(firstName({ user_metadata: { first_name: '   ' } })).toBeNull()
    expect(firstName({ user_metadata: { first_name: 42 } })).toBeNull()
  })

  it('keeps it short', () => {
    expect(firstName({ user_metadata: { first_name: 'x'.repeat(60) } })).toHaveLength(40)
  })
})
