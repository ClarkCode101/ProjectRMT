import { describe, expect, it, vi } from 'vitest'

// notices.ts imports the Supabase client; the tests here don't need it.
vi.mock('./supabase', () => ({ supabase: {} }))

const { isNoticeHidden, NOTICE_MAX_LENGTH, noticeDate, noticeProblem } = await import('./notices')

describe('noticeProblem', () => {
  it('is null for a normal message', () => {
    expect(noticeProblem('More Micro questions this week.')).toBeNull()
  })

  it('needs some text', () => {
    expect(noticeProblem('')).toMatch(/Write a message/)
    expect(noticeProblem('   ')).toMatch(/Write a message/)
  })

  it('keeps it short', () => {
    expect(noticeProblem('x'.repeat(NOTICE_MAX_LENGTH))).toBeNull()
    expect(noticeProblem('x'.repeat(NOTICE_MAX_LENGTH + 1))).toMatch(/280/)
  })
})

describe('isNoticeHidden', () => {
  const notice = { body: 'Hi', postedAt: '2026-11-11T06:00:00Z' }

  it('is hidden only when she hid this same notice', () => {
    expect(isNoticeHidden(notice, '2026-11-11T06:00:00Z')).toBe(true)
  })

  it('shows a new or changed notice again', () => {
    expect(isNoticeHidden(notice, '2026-11-01T06:00:00Z')).toBe(false)
    expect(isNoticeHidden(notice, null)).toBe(false)
  })
})

describe('noticeDate', () => {
  const now = new Date('2026-11-11T12:00:00')

  it('leaves out this year', () => {
    expect(noticeDate('2026-11-11T12:00:00', now)).toBe('Nov 11')
  })

  it('adds an earlier year', () => {
    expect(noticeDate('2025-03-02T12:00:00', now)).toBe('Mar 2, 2025')
  })

  it('is empty for a bad date', () => {
    expect(noticeDate('not a date', now)).toBe('')
  })
})
