import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Json, QuestionSource, SessionMode } from '@/lib/database.types'
import { parseChoiceNotes, parseChoices } from '@/lib/quiz'
import type { HistoryAttempt } from '@/lib/selection'
import { supabase } from '@/lib/supabase'

/**
 * Question source (PROJECT_PLAN.md §6). 'upload' = one specific file she uploaded, see `uploadId`.
 * 'book' = the questions in one of her books (migration 0004), see `bookId`.
 */
export type SourceFilter = 'all' | 'builtin' | 'mine' | 'upload' | 'book'

export type QuizFilters = {
  source: SourceFilter
  /** only used when source is 'upload' */
  uploadId?: string | null
  verifiedOnly?: boolean
  subjectId: number | null
  topicId: number | null
  /** when set, only these questions (used by "Review mistakes" and "Practice this book") */
  questionIds?: string[]
  /**
   * One of her books: with questionIds, the book they came from ("Practice this book"); with source 'book',
   * the book to take questions from (then narrowed by subject/topic). Saved with the session.
   */
  bookId?: string | null
}

/** What the source picker on every study mode sets. */
export type SourceChoice = { source: SourceFilter; uploadId: string | null; bookId: string | null; verifiedOnly: boolean }

export const DEFAULT_SOURCE: SourceChoice = { source: 'all', uploadId: null, bookId: null, verifiedOnly: false }

export type QuizQuestion = {
  id: string
  topic_id: number
  source: QuestionSource
  stem: string
  choices: string[]
  correct_index: number
  explanation: string | null
  /** One short note per choice (same order as `choices`), or null when the question has none. */
  choice_notes: string[] | null
}

const QUESTION_COLUMNS = 'id, topic_id, source, stem, choices, correct_index, explanation, choice_notes'

type QuestionRow = Omit<QuizQuestion, 'choices' | 'choice_notes'> & { choices: Json; choice_notes: Json | null }

function toQuizQuestion(row: QuestionRow): QuizQuestion {
  const choices = parseChoices(row.choices)
  return { ...row, choices, choice_notes: parseChoiceNotes(row.choice_notes, choices.length) }
}

// Supabase returns at most 1000 rows per request, so bigger lists are loaded in pages.
const PAGE_SIZE = 1000
/** How many question ids go in one request (each id is 36 letters of the request's address). */
const ID_BATCH = 100

/**
 * Loads candidate questions. RLS already limits this to built-in + her own questions.
 * Reads the my_questions view (migration 0009), so built-in questions come with her own fixes and status.
 * `subjectTopicIds` = ids of the topics in the chosen subject (needed because
 * questions only store topic_id, not subject_id).
 */
export async function fetchQuestions(filters: QuizFilters, subjectTopicIds: number[]): Promise<QuizQuestion[]> {
  if (!filters.questionIds && filters.source === 'upload' && !filters.uploadId) return [] // no file chosen yet

  // Exact questions (a book, her mistakes, a saved mock).
  if (filters.questionIds) return fetchByIds(filters.questionIds, false)

  // One of her books as the source: its questions, narrowed to the chosen subject or topic.
  if (filters.source === 'book') {
    if (!filters.bookId) return [] // no book chosen yet
    const { data, error } = await supabase.from('book_questions').select('question_id').eq('book_id', filters.bookId)
    if (error) throw error
    const inBook = await fetchByIds(
      data.map((r) => r.question_id),
      Boolean(filters.verifiedOnly),
    )
    if (filters.topicId !== null) return inBook.filter((q) => q.topic_id === filters.topicId)
    if (filters.subjectId !== null) return inBook.filter((q) => subjectTopicIds.includes(q.topic_id))
    return inBook
  }

  const all: QuizQuestion[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('my_questions')
      .select(QUESTION_COLUMNS)
      .order('id') // a fixed order so pages don't overlap
      .range(from, from + PAGE_SIZE - 1)

    // Questions that live only in her books (migration 0006) come up only through her books, or "Mine" (all of hers).
    if (filters.source !== 'mine') query = query.eq('in_subject', true)
    if (filters.topicId !== null) query = query.eq('topic_id', filters.topicId)
    else if (filters.subjectId !== null) query = query.in('topic_id', subjectTopicIds)

    if (filters.source === 'builtin') query = query.is('owner_id', null)
    if (filters.source === 'mine') query = query.not('owner_id', 'is', null)
    if (filters.source === 'upload' && filters.uploadId) query = query.eq('upload_id', filters.uploadId)
    if (filters.verifiedOnly) query = query.eq('status', 'verified')

    const { data, error } = await query
    if (error) throw error
    // Skip broken rows (e.g. choices not saved as a list) instead of crashing the quiz.
    all.push(...data.map(toQuizQuestion).filter((q) => q.choices.length >= 2))
    if (data.length < PAGE_SIZE) return all
  }
}

/**
 * These exact questions, asked for in batches: every id goes into the request's address, and a long list
 * (a big book) would make it too long for the server.
 */
async function fetchByIds(ids: readonly string[], verifiedOnly: boolean): Promise<QuizQuestion[]> {
  const all: QuizQuestion[] = []
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    let query = supabase.from('my_questions').select(QUESTION_COLUMNS).in('id', ids.slice(i, i + ID_BATCH))
    if (verifiedOnly) query = query.eq('status', 'verified')
    const { data, error } = await query
    if (error) throw error
    all.push(...data.map(toQuizQuestion).filter((q) => q.choices.length >= 2))
  }
  return all
}

/** How many questions each fixed source has (for the Question source covers). RLS limits "all" to built-in + hers. */
export function useSourceCounts() {
  return useQuery({
    queryKey: ['source-counts'],
    queryFn: async () => {
      const [builtin, mine, mineInSubjects] = await Promise.all([
        supabase.from('questions').select('id', { count: 'exact', head: true }).eq('in_subject', true).is('owner_id', null),
        // "Mine" = every question she added, the book-only ones too
        supabase.from('questions').select('id', { count: 'exact', head: true }).not('owner_id', 'is', null),
        supabase.from('questions').select('id', { count: 'exact', head: true }).eq('in_subject', true).not('owner_id', 'is', null),
      ])
      if (builtin.error) throw builtin.error
      if (mine.error) throw mine.error
      if (mineInSubjects.error) throw mineInSubjects.error
      return { builtin: builtin.count ?? 0, mine: mine.count ?? 0, mineInSubjects: mineInSubjects.count ?? 0 }
    },
  })
}

/**
 * The questions that match the filters, shared by the setup screen (to count them)
 * and the Start button (to pick from them), so they are only loaded once.
 */
export function questionPoolOptions(filters: QuizFilters, subjectTopicIds: number[]) {
  const { source, uploadId = null, verifiedOnly = false, subjectId, topicId, bookId = null } = filters
  return queryOptions({
    // bookId: a book's pool (its questionIds) must not share a cache entry with "all subjects"
    queryKey: ['question-pool', { source, uploadId, verifiedOnly, subjectId, topicId, bookId }],
    queryFn: () => fetchQuestions(filters, subjectTopicIds),
  })
}

/** Every answer she has given (which question, right or wrong, when). Used by smart selection. */
export const attemptHistoryOptions = queryOptions({
  queryKey: ['attempt-history'],
  queryFn: async (): Promise<HistoryAttempt[]> => {
    const all: HistoryAttempt[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      // RLS returns only her own attempts.
      const { data, error } = await supabase
        .from('attempts')
        .select('question_id, is_correct, created_at')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      all.push(...data)
      if (data.length < PAGE_SIZE) return all
    }
  },
})

export type UploadSummary = { id: string; file_name: string; question_count: number | null; created_at: string | null }

/** Her uploaded files that added questions, newest first, for the "Specific upload" source. */
export function useUploads() {
  return useQuery({
    queryKey: ['uploads'],
    queryFn: async (): Promise<UploadSummary[]> => {
      const { data, error } = await supabase
        .from('uploads')
        .select('id, file_name, question_count, created_at')
        .gt('question_count', 0)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** Creates a quiz_sessions row and returns its id. */
export async function startSession(filters: QuizFilters, totalItems: number, mode: SessionMode = 'practice'): Promise<string> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .insert({
      mode,
      total_items: totalItems,
      filters: {
        source: filters.source,
        upload_id: filters.source === 'upload' ? (filters.uploadId ?? null) : null,
        verified_only: Boolean(filters.verifiedOnly),
        subject_id: filters.subjectId,
        topic_id: filters.topicId,
        from_mistakes: Boolean(filters.questionIds) && !filters.bookId,
        book_id: filters.bookId ?? null,
      },
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function recordAttempt(attempt: {
  sessionId: string
  questionId: string
  /** index in the ORIGINAL choices order, not the shuffled display order */
  selectedIndex: number
  isCorrect: boolean
  timeMs: number
}) {
  const { error } = await supabase.from('attempts').insert({
    session_id: attempt.sessionId,
    question_id: attempt.questionId,
    selected_index: attempt.selectedIndex,
    is_correct: attempt.isCorrect,
    time_ms: attempt.timeMs,
  })
  if (error) throw error
}

/** Saves many answers at once (the mock exam saves them all when she submits). */
export async function recordAttempts(
  sessionId: string,
  attempts: { questionId: string; selectedIndex: number; isCorrect: boolean }[],
) {
  if (attempts.length === 0) return
  const { error } = await supabase.from('attempts').insert(
    attempts.map((a) => ({ session_id: sessionId, question_id: a.questionId, selected_index: a.selectedIndex, is_correct: a.isCorrect })),
  )
  if (error) throw error
}

export async function finishSession(sessionId: string, score: number, durationSec: number) {
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ score, duration_sec: durationSec, finished_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}
