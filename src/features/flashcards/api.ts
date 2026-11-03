import { queryOptions } from '@tanstack/react-query'
import type { ReviewRow } from '@/lib/fsrs'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000
const COLUMNS = 'question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review'

/** Her flashcard progress: one row per card she has studied (RLS returns only her own). */
export const reviewStatesOptions = queryOptions({
  queryKey: ['review-states'],
  queryFn: async (): Promise<ReviewRow[]> => {
    const all: ReviewRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from('review_states')
        .select(COLUMNS)
        .order('question_id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      all.push(...data)
      if (data.length < PAGE_SIZE) return all
    }
  },
})

/** Saves one card after she rates it (insert the first time, update after that). user_id is filled in by the database. */
export async function saveReview(row: ReviewRow) {
  const { error } = await supabase.from('review_states').upsert(row, { onConflict: 'user_id,question_id' })
  if (error) throw error
}
