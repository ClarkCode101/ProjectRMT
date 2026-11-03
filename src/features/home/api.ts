import { useQuery } from '@tanstack/react-query'
import { attemptHistoryOptions, fetchQuestions } from '@/features/quiz/api'
import { shuffle, shuffledChoiceOrder } from '@/lib/quiz'
import { supabase } from '@/lib/supabase'

/** Used until she sets her own target (the planner comes in Step 14). Same default as the database. */
export const DEFAULT_DAILY_TARGET = 50

/** All her answers (which question, right or wrong, when): for today's count, the week and the streak. */
export function useAttemptHistory() {
  return useQuery(attemptHistoryOptions)
}

/** How many questions she wants to answer per day. */
export function useDailyTarget() {
  return useQuery({
    queryKey: ['study-settings'],
    queryFn: async (): Promise<number> => {
      // RLS returns only her own row; there is none until she saves settings.
      const { data, error } = await supabase.from('study_settings').select('daily_target').maybeSingle()
      if (error) throw error
      return data?.daily_target && data.daily_target > 0 ? data.daily_target : DEFAULT_DAILY_TARGET
    },
  })
}

/**
 * Questions for the warm-up card on Home, one subject at a time.
 * Shuffled once when loaded, each with its own shuffled choice order (order[displayPosition] = original index).
 */
export function useWarmupQuestions(subjectId: number | null, subjectTopicIds: number[]) {
  return useQuery({
    queryKey: ['warmup', subjectId],
    enabled: subjectId !== null && subjectTopicIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const questions = await fetchQuestions({ source: 'all', subjectId, topicId: null }, subjectTopicIds)
      return shuffle(questions).map((q) => ({ ...q, order: shuffledChoiceOrder(q.choices.length) }))
    },
  })
}
