import { useQuery } from '@tanstack/react-query'
import { attemptHistoryOptions, fetchQuestions } from '@/features/quiz/api'
import { shuffle, shuffledChoiceOrder } from '@/lib/quiz'

/** All her answers (which question, right or wrong, when): for today's count, the week and the streak. */
export function useAttemptHistory() {
  return useQuery(attemptHistoryOptions)
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
