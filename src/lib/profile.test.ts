import { describe, expect, it, vi } from 'vitest'

// profile.ts imports the Supabase client; the tests here don't need it.
vi.mock('./supabase', () => ({ supabase: {} }))

const { firstName } = await import('./profile')

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
