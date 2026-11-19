import { useQuery } from '@tanstack/react-query'
import { attemptHistoryOptions, fetchQuestions } from '@/features/quiz/api'
import { localDateKey } from '@/lib/activity'
import { shuffle, shuffledChoiceOrder } from '@/lib/quiz'
import { supabase } from '@/lib/supabase'

/** All her answers (which question, right or wrong, when): for today's count, the week and the streak. */
export function useAttemptHistory() {
  return useQuery(attemptHistoryOptions)
}

/**
 * The day she last finished a Mock exam ("YYYY-MM-DD", her time zone), or null if never.
 * Today's plan uses it to space Mock exams in the last weeks, and to tick off today's one.
 * Online only: if it can't load, the plan acts as if there was none.
 */
export function useLastMockDay() {
  return useQuery({
    queryKey: ['last-mock-day'],
    retry: 1,
    queryFn: async () => {
      // RLS returns only her own sessions.
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('finished_at')
        .eq('mode', 'mock')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1)
      if (error) throw error
      const finished = data[0]?.finished_at
      return finished ? localDateKey(new Date(finished)) : null
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
