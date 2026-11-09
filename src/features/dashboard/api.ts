import { useQuery } from '@tanstack/react-query'
import { withOfflineFallback } from '@/lib/offline/bank'
import { supabase } from '@/lib/supabase'

/** Per-topic attempts + accuracy from the topic_performance view (RLS = her rows only). */
export function useTopicPerformance() {
  return useQuery({
    queryKey: ['topic-performance'],
    // No internet: the scores saved on this device the last time it was online.
    queryFn: () =>
      withOfflineFallback(
        async () => {
          const { data, error } = await supabase.from('topic_performance').select('subject_id, topic_id, attempts, accuracy')
          if (error) throw error
          // Postgres numeric/bigint can arrive as strings; make sure they are numbers.
          return data.map((r) => ({ ...r, attempts: Number(r.attempts), accuracy: Number(r.accuracy) }))
        },
        (bank) => bank.topicPerformance,
      ),
  })
}
