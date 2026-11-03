import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Json, QuestionSource, SessionMode } from '@/lib/database.types'
import { parseChoices } from '@/lib/quiz'
import type { HistoryAttempt } from '@/lib/selection'
import { supabase } from '@/lib/supabase'

/** Question source (PROJECT_PLAN.md §6). 'upload' = one specific file she uploaded, see `uploadId`. */
export type SourceFilter = 'all' | 'builtin' | 'mine' | 'upload'

export type QuizFilters = {
  source: SourceFilter
  /** only used when source is 'upload' */
  uploadId?: string | null
  verifiedOnly?: boolean
  subjectId: number | null
  topicId: number | null
  /** when set, only these questions (used by "Review mistakes") */
  questionIds?: string[]
}

/** What the source picker on every study mode sets. */
export type SourceChoice = { source: SourceFilter; uploadId: string | null; verifiedOnly: boolean }

export const DEFAULT_SOURCE: SourceChoice = { source: 'all', uploadId: null, verifiedOnly: false }

export type QuizQuestion = {
  id: string
  topic_id: number
  source: QuestionSource
  stem: string
  choices: string[]
  correct_index: number
  explanation: string | null
}

const QUESTION_COLUMNS = 'id, topic_id, source, stem, choices, correct_index, explanation'

type QuestionRow = Omit<QuizQuestion, 'choices'> & { choices: Json }

function toQuizQuestion(row: QuestionRow): QuizQuestion {
  return { ...row, choices: parseChoices(row.choices) }
}

// Supabase returns at most 1000 rows per request, so bigger lists are loaded in pages.
const PAGE_SIZE = 1000

/**
 * Loads candidate questions. RLS already limits this to built-in + her own questions.
 * `subjectTopicIds` = ids of the topics in the chosen subject (needed because
 * questions only store topic_id, not subject_id).
 */
export async function fetchQuestions(filters: QuizFilters, subjectTopicIds: number[]): Promise<QuizQuestion[]> {
  if (!filters.questionIds && filters.source === 'upload' && !filters.uploadId) return [] // no file chosen yet
  const all: QuizQuestion[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('questions')
      .select(QUESTION_COLUMNS)
      .order('id') // a fixed order so pages don't overlap
      .range(from, from + PAGE_SIZE - 1)

    if (filters.questionIds) {
      query = query.in('id', filters.questionIds)
    } else {
      if (filters.topicId !== null) query = query.eq('topic_id', filters.topicId)
      else if (filters.subjectId !== null) query = query.in('topic_id', subjectTopicIds)

      if (filters.source === 'builtin') query = query.is('owner_id', null)
      if (filters.source === 'mine') query = query.not('owner_id', 'is', null)
      if (filters.source === 'upload' && filters.uploadId) query = query.eq('upload_id', filters.uploadId)
      if (filters.verifiedOnly) query = query.eq('status', 'verified')
    }

    const { data, error } = await query
    if (error) throw error
    // Skip broken rows (e.g. choices not saved as a list) instead of crashing the quiz.
    all.push(...data.map(toQuizQuestion).filter((q) => q.choices.length >= 2))
    if (data.length < PAGE_SIZE) return all
  }
}

/**
 * The questions that match the filters, shared by the setup screen (to count them)
 * and the Start button (to pick from them), so they are only loaded once.
 */
export function questionPoolOptions(filters: QuizFilters, subjectTopicIds: number[]) {
  const { source, uploadId = null, verifiedOnly = false, subjectId, topicId } = filters
  return queryOptions({
    queryKey: ['question-pool', { source, uploadId, verifiedOnly, subjectId, topicId }],
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
        from_mistakes: Boolean(filters.questionIds),
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
