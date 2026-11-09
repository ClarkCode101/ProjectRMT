import { queryOptions } from '@tanstack/react-query'
import type { ReviewRow } from '@/lib/fsrs'
import { allReviewStates, withOfflineFallback } from '@/lib/offline/bank'
import { queueReview } from '@/lib/offline/outbox'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 1000
const COLUMNS = 'question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review'

/** Her flashcard progress: one row per card she has studied (RLS returns only her own). */
export const reviewStatesOptions = queryOptions({
  queryKey: ['review-states'],
  // No internet: the schedule saved on this device, with ratings still waiting to sync on top.
  queryFn: () => withOfflineFallback(fetchReviewStates, allReviewStates),
})

async function fetchReviewStates(): Promise<ReviewRow[]> {
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
}

/**
 * Saves one card after she rates it. It goes into the outbox on the device and is sent in the background,
 * so it works offline too (lib/offline/outbox.ts).
 */
export function saveReview(row: ReviewRow) {
  queueReview(row)
}
