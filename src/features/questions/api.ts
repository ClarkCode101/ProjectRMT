import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { VerifyStatus } from '@/lib/database.types'
import { parseChoices } from '@/lib/quiz'
import { draftToRow, type QuestionDraft } from '@/lib/questions'
import { supabase } from '@/lib/supabase'

export type BankQuestion = {
  id: string
  owner_id: string | null // null = built-in
  topic_id: number
  stem: string
  choices: string[]
  correct_index: number
  explanation: string | null
  difficulty: number | null
  status: VerifyStatus
}

const COLUMNS = 'id, owner_id, topic_id, stem, choices, correct_index, explanation, difficulty, status'
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
        all.push(...data.map((row) => ({ ...row, choices: parseChoices(row.choices) })))
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
  }
}

/** Adds one of her own questions. She wrote it herself, so it starts as verified. */
export async function addQuestion(draft: QuestionDraft) {
  const { error } = await supabase.from('questions').insert({ ...draftToRow(draft), source: 'user', status: 'verified' })
  if (error) throw error
}

/** Saves changes to a question (hers, or a built-in one she is fixing). */
export async function updateQuestion(id: string, draft: QuestionDraft) {
  const { error } = await supabase.from('questions').update(draftToRow(draft)).eq('id', id)
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
