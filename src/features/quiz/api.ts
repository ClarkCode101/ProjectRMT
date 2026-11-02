import type { Json, QuestionSource } from '@/lib/database.types'
import { parseChoices } from '@/lib/quiz'
import { supabase } from '@/lib/supabase'

export type SourceFilter = 'all' | 'builtin' | 'mine'

export type QuizFilters = {
  source: SourceFilter
  subjectId: number | null
  topicId: number | null
  /** when set, only these questions (used by "Review mistakes") */
  questionIds?: string[]
}

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

/**
 * Loads candidate questions. RLS already limits this to built-in + her own questions.
 * `subjectTopicIds` = ids of the topics in the chosen subject (needed because
 * questions only store topic_id, not subject_id).
 */
export async function fetchQuestions(filters: QuizFilters, subjectTopicIds: number[]): Promise<QuizQuestion[]> {
  let query = supabase.from('questions').select(QUESTION_COLUMNS).limit(1000)

  if (filters.questionIds) {
    query = query.in('id', filters.questionIds)
  } else {
    if (filters.topicId !== null) query = query.eq('topic_id', filters.topicId)
    else if (filters.subjectId !== null) query = query.in('topic_id', subjectTopicIds)

    if (filters.source === 'builtin') query = query.is('owner_id', null)
    if (filters.source === 'mine') query = query.not('owner_id', 'is', null)
  }

  const { data, error } = await query
  if (error) throw error
  // Skip broken rows (e.g. choices not saved as a list) instead of crashing the quiz.
  return data.map(toQuizQuestion).filter((q) => q.choices.length >= 2)
}

/** Creates a quiz_sessions row and returns its id. */
export async function startSession(filters: QuizFilters, totalItems: number): Promise<string> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .insert({
      mode: 'practice',
      total_items: totalItems,
      filters: {
        source: filters.source,
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

export async function finishSession(sessionId: string, score: number, durationSec: number) {
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ score, duration_sec: durationSec, finished_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}
