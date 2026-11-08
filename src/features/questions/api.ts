import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuestionSource, VerifyStatus } from '@/lib/database.types'
import { parseChoiceNotes, parseChoices } from '@/lib/quiz'
import { draftToRow, type QuestionDraft } from '@/lib/questions'
import { supabase } from '@/lib/supabase'

export type BankQuestion = {
  id: string
  owner_id: string | null // null = built-in
  /** builtin, typed by her (user), or from an uploaded file (upload) */
  source: QuestionSource
  topic_id: number
  stem: string
  choices: string[]
  correct_index: number
  explanation: string | null
  /** one note per choice, or null when it has none (migration 0008) */
  choice_notes: string[] | null
  difficulty: number | null
  status: VerifyStatus
  /** false = lives only in her book (migration 0006) */
  in_subject: boolean
}

const COLUMNS = 'id, owner_id, source, topic_id, stem, choices, correct_index, explanation, choice_notes, difficulty, status, in_subject'
// Supabase returns at most 1000 rows per request, so load the bank in pages.
const PAGE_SIZE = 1000

/** Every question she can see (built-in + her own), newest first. RLS does the "her own" part. */
export function useQuestionBank() {
  return useQuery({
    queryKey: ['question-bank'],
    queryFn: async (): Promise<BankQuestion[]> => {
      const all: BankQuestion[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('questions')
          .select(COLUMNS)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, from + PAGE_SIZE - 1)
        if (error) throw error
        all.push(
          ...data.map((row) => {
            const choices = parseChoices(row.choices)
            return { ...row, choices, choice_notes: parseChoiceNotes(row.choice_notes, choices.length) }
          }),
        )
        if (data.length < PAGE_SIZE) return all
      }
    },
  })
}

/** After any change, refresh the bank (and anything that shows question text). */
export function useRefreshBank() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['question-bank'] })
    void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
    void queryClient.invalidateQueries({ queryKey: ['warmup'] })
    void queryClient.invalidateQueries({ queryKey: ['question-pool'] })
    void queryClient.invalidateQueries({ queryKey: ['source-counts'] })
    // a question moved in or out of its subject (in_subject) changes that subject's score
    void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
  }
}

/**
 * Adds one of her own questions and returns its id. She wrote it herself, so it starts as verified.
 * `inSubject` false = it lives only in her book (migration 0006).
 */
export async function addQuestion(draft: QuestionDraft, inSubject = true): Promise<string> {
  const { data, error } = await supabase
    .from('questions')
    .insert({ ...draftToRow(draft), source: 'user', status: 'verified', in_subject: inSubject })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Saves changes to a question (hers, or a built-in one she is fixing). `inSubject` only for her own questions. */
export async function updateQuestion(id: string, draft: QuestionDraft, inSubject?: boolean) {
  const { error } = await supabase
    .from('questions')
    .update({ ...draftToRow(draft), ...(inSubject !== undefined && { in_subject: inSubject }) })
    .eq('id', id)
  if (error) throw error
}

/**
 * Where one of her questions lives: in a subject's book under `topicId` (inSubject true), or only in her books
 * (inSubject false, under the hidden "Your books" topic, migration 0007).
 */
export async function setQuestionPlace(id: string, topicId: number, inSubject: boolean) {
  const { error } = await supabase.from('questions').update({ topic_id: topicId, in_subject: inSubject }).eq('id', id)
  if (error) throw error
}

export async function setQuestionStatus(id: string, status: VerifyStatus) {
  const { error } = await supabase.from('questions').update({ status }).eq('id', id)
  if (error) throw error
}

/** Deletes one of her own questions (RLS blocks deleting built-in ones). Its past answers go with it. */
export async function deleteQuestion(id: string) {
  const { error } = await supabase.from('questions').delete().eq('id', id)
  if (error) throw error
}

export type SimilarQuestion = { id: string; stem: string; score: number; exact: boolean }

/** Questions that look like this one (PROJECT_PLAN.md §5). `exceptId` skips the question being edited. */
export async function findSimilar(stem: string, exceptId?: string): Promise<SimilarQuestion[]> {
  const { data, error } = await supabase.rpc('find_similar_questions', { p_stem: stem })
  if (error) throw error
  return data.filter((q) => q.id !== exceptId)
}
