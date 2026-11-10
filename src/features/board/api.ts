import { useQuery } from '@tanstack/react-query'
import { withOfflineFallback } from '@/lib/offline/bank'
import { queueSession } from '@/lib/offline/outbox'
import { supabase } from '@/lib/supabase'

/**
 * Ids of the difficulty 3 questions she can see, for a ladder's Challenge question.
 * The offline copy doesn't keep difficulty, so offline this is empty and the Challenge falls back to her past mistakes.
 */
export function useHardQuestionIds() {
  return useQuery({
    queryKey: ['hard-question-ids'],
    staleTime: 60 * 60 * 1000,
    queryFn: () =>
      withOfflineFallback(
        async () => {
          const ids = new Set<string>()
          // Pages of 1000 (Supabase's limit per request).
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from('my_questions').select('id').eq('difficulty', 3).eq('in_subject', true).order('id').range(from, from + 999)
            if (error) throw error
            data.forEach((row) => ids.add(row.id))
            if (data.length < 1000) return ids
          }
        },
        () => new Set<string>(),
      ),
  })
}

/** Starts the quiz session (mode 'board', migration 0022) that a new game's answers belong to. Works offline. */
export function queueBoardSession(): string {
  const id = crypto.randomUUID()
  // total_items: a board game has no fixed number of questions, so 0; the score is saved when she finishes.
  queueSession({ id, mode: 'board', total_items: 0, filters: { source: 'all', board: true }, started_at: new Date().toISOString() })
  return id
}
