import { useQuery } from '@tanstack/react-query'
import { previousMockRate, type MockScope, type PastMock } from '@/lib/mockExam'
import { supabase } from '@/lib/supabase'

/** How many of her latest mocks to look through for the last one on the same subject. */
const RECENT_MOCKS = 200

/**
 * Her score on the last mock on the same subject (or book), for the trend on the results.
 * null = this is her first one there. Online only: if it can't load, the trend is simply not shown.
 */
export function usePreviousMockRate(scope: MockScope | undefined, sessionId: string) {
  return useQuery({
    queryKey: ['previous-mock', sessionId],
    enabled: scope !== undefined,
    staleTime: Infinity, // the past doesn't change while she reads the results
    retry: 1,
    queryFn: async () => {
      // RLS returns only her own sessions.
      const { data, error } = await supabase
        .from('quiz_sessions')
        .select('id, score, total_items, filters, finished_at')
        .eq('mode', 'mock')
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(RECENT_MOCKS)
      if (error) throw error
      return previousMockRate(data as PastMock[], scope!, sessionId)
    },
  })
}
