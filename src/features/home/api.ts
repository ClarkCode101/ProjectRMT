import { useQuery } from '@tanstack/react-query'
import { fetchQuestions } from '@/features/quiz/api'
import { activityStart } from '@/lib/activity'
import { shuffle, shuffledChoiceOrder } from '@/lib/quiz'
import { supabase } from '@/lib/supabase'

/** Her answers from the last 7 days (date + right/wrong only), for the small charts. */
export function useRecentActivity(today: Date) {
  return useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attempts')
        .select('created_at, is_correct')
        .gte('created_at', activityStart(today).toISOString())
        .limit(5000)
      if (error) throw error
      return data
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
