import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database, Json, QuestionSource, VerifyStatus } from '@/lib/database.types'
import { markBankStale } from '@/lib/offline/bank'
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
  /** her own topic for it inside its subject, e.g. "Ewan" after merging that book into a subject (migration 0019) */
  subject_topic: string | null
}

const COLUMNS = 'id, owner_id, source, topic_id, stem, choices, correct_index, explanation, choice_notes, difficulty, status, in_subject'
/** Postgres's "this column doesn't exist" error: migration 0019 (subject_topic) hasn't been run yet. */
const UNDEFINED_COLUMN = '42703'
// Supabase returns at most 1000 rows per request, so load the bank in pages.
const PAGE_SIZE = 1000

/**
 * Every question she can see (built-in + her own), newest first. RLS does the "her own" part.
 * Read from the my_questions view (migration 0009) so built-in questions show her own fixes.
 */
export function useQuestionBank() {
  return useQuery({
    queryKey: ['question-bank'],
    queryFn: async (): Promise<BankQuestion[]> => {
      try {
        return await loadBank(true)
      } catch (error) {
        // Her topics in subjects not set up yet (migration 0019): still load everything, just without them.
        if ((error as { code?: string }).code !== UNDEFINED_COLUMN) throw error
        return loadBank(false)
      }
    },
  })
}

/** The question bank in pages. `withSubjectTopic` = false before migration 0019 (every subject_topic is then null). */
async function loadBank(withSubjectTopic: boolean): Promise<BankQuestion[]> {
  const all: BankQuestion[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('my_questions')
      .select(withSubjectTopic ? `${COLUMNS}, subject_topic` : COLUMNS)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data as unknown as (Omit<BankQuestion, 'choices' | 'choice_notes' | 'subject_topic'> & {
      choices: Json
      choice_notes: Json | null
      subject_topic?: string | null
    })[]
    all.push(
      ...rows.map((row) => {
        const choices = parseChoices(row.choices)
        return { ...row, choices, choice_notes: parseChoiceNotes(row.choice_notes, choices.length), subject_topic: row.subject_topic ?? null }
      }),
    )
    if (rows.length < PAGE_SIZE) return all
  }
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
    // the copy saved for offline Practice is now out of date: get a new one at the next chance
    markBankStale()
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

/**
 * Built-in questions are shared by every account, so her changes to one are saved in question_overrides
 * under her own id (migration 0009). Other accounts keep seeing the original.
 * "upsert" = add her row the first time, change it after that.
 */
export async function saveOverride(changes: Omit<Database['public']['Tables']['question_overrides']['Insert'], 'user_id'>) {
  const { error } = await supabase
    .from('question_overrides')
    .upsert({ ...changes, updated_at: new Date().toISOString() }, { onConflict: 'user_id,question_id' })
  if (error) throw error
}

/**
 * Saves changes to a question: one of hers (changed in place), or a built-in one she is fixing
 * (`builtin` true: saved for her only). `inSubject` only for her own questions.
 */
export async function updateQuestion(id: string, draft: QuestionDraft, options: { builtin?: boolean; inSubject?: boolean } = {}) {
  if (options.builtin) return saveOverride({ question_id: id, ...draftToRow(draft) })
  const { inSubject } = options
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
export async function setQuestionPlace(id: string, topicId: number, inSubject: boolean, withSubjectTopic = true): Promise<void> {
  // Picking a board topic (or "Book only") takes it out of her own topic in the subject (migration 0019).
  const changes = { topic_id: topicId, in_subject: inSubject, ...(withSubjectTopic && { subject_topic: null }) }
  const { error } = await supabase.from('questions').update(changes).eq('id', id)
  // Before migration 0019 there's no subject_topic: save the rest without it.
  if (error?.code === UNDEFINED_COLUMN && withSubjectTopic) return setQuestionPlace(id, topicId, inSubject, false)
  if (error) throw error
}

/** Verified / reported. On a built-in question (`builtin` true) it is saved for her only. */
export async function setQuestionStatus(id: string, status: VerifyStatus, builtin: boolean) {
  if (builtin) return saveOverride({ question_id: id, status })
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
