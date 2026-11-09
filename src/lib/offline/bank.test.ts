import { describe, expect, it, vi } from 'vitest'

// bank.ts imports the Supabase client; these tests only use the pure helpers.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { BANK_MAX_AGE_MS, filterBankQuestions, isBankStale, toBankAttempt } = await import('./bank')
type BankQuestion = import('./bank').BankQuestion
type QuizFilters = import('@/features/quiz/api').QuizFilters

function question(id: string, extra: Partial<BankQuestion> = {}): BankQuestion {
  return {
    id,
    topic_id: 1,
    source: 'builtin',
    stem: `Question ${id}`,
    choices: ['A', 'B', 'C', 'D'],
    correct_index: 0,
    explanation: null,
    choice_notes: null,
    owner_id: null,
    upload_id: null,
    status: 'unverified',
    in_subject: true,
    ...extra,
  }
}

const BANK: BankQuestion[] = [
  question('builtin-t1'),
  question('builtin-t2', { topic_id: 2 }),
  question('builtin-other-subject', { topic_id: 9 }),
  question('builtin-verified', { status: 'verified' }),
  question('mine', { source: 'user', owner_id: 'me' }),
  question('mine-book-only', { source: 'user', owner_id: 'me', in_subject: false }),
  question('upload-x', { source: 'upload', owner_id: 'me', upload_id: 'x' }),
]

const ALL: QuizFilters = { source: 'all', subjectId: null, topicId: null }
const ids = (list: { id: string }[]) => list.map((q) => q.id).sort()

describe('filterBankQuestions', () => {
  it('"All" leaves out book-only questions (same as online)', () => {
    expect(ids(filterBankQuestions(BANK, ALL, []))).not.toContain('mine-book-only')
    expect(filterBankQuestions(BANK, ALL, [])).toHaveLength(6)
  })

  it('narrows to a subject by its topics', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, subjectId: 1 }, [1, 2]))).not.toContain('builtin-other-subject')
  })

  it('narrows to one topic', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, subjectId: 1, topicId: 2 }, [1, 2]))).toEqual(['builtin-t2'])
  })

  it('"Built-in" has only questions nobody owns', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, source: 'builtin' }, []))).toEqual(['builtin-other-subject', 'builtin-t1', 'builtin-t2', 'builtin-verified'])
  })

  it('"Mine" has all of hers, book-only ones too', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, source: 'mine' }, []))).toEqual(['mine', 'mine-book-only', 'upload-x'])
  })

  it('"One upload" has only that file, and nothing until a file is chosen', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, source: 'upload', uploadId: 'x' }, []))).toEqual(['upload-x'])
    expect(filterBankQuestions(BANK, { ...ALL, source: 'upload', uploadId: null }, [])).toEqual([])
  })

  it('"Verified only" keeps verified questions', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, verifiedOnly: true }, []))).toEqual(['builtin-verified'])
  })

  it('exact question ids (Review again) ignore the other filters', () => {
    expect(ids(filterBankQuestions(BANK, { ...ALL, questionIds: ['mine-book-only', 'builtin-t2', 'gone'] }, []))).toEqual(['builtin-t2', 'mine-book-only'])
  })

  it('a book as the source gives nothing offline (books are not saved)', () => {
    expect(filterBankQuestions(BANK, { ...ALL, source: 'book', bookId: 'b1' }, [])).toEqual([])
  })
})

describe('isBankStale', () => {
  const now = Date.parse('2026-11-09T12:00:00Z')

  it('is fresh right after saving', () => {
    expect(isBankStale(now - 60_000, now)).toBe(false)
  })

  it('is stale once older than the limit', () => {
    expect(isBankStale(now - BANK_MAX_AGE_MS - 1, now)).toBe(true)
  })
})

describe('toBankAttempt', () => {
  it('keeps what history and Review again need', () => {
    expect(
      toBankAttempt({ id: 'a1', session_id: 's1', question_id: 'q1', selected_index: 2, is_correct: false, time_ms: 900, created_at: '2026-11-09T10:00:00.000Z' }),
    ).toEqual({ question_id: 'q1', is_correct: false, selected_index: 2, created_at: '2026-11-09T10:00:00.000Z' })
  })
})
