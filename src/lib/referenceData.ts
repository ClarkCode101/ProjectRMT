import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

// Subjects and topics rarely change, so cache them for a long time.
const ONE_HOUR = 60 * 60 * 1000

export function useSubjects() {
  return useQuery({
    queryKey: ['subjects'],
    staleTime: ONE_HOUR,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, code, name, sort_order')
        .order('sort_order')
      if (error) throw error
      return data
    },
  })
}

/** Returns a function that finds the subject (code + name) a topic belongs to. */
export function useSubjectOfTopic() {
  const subjects = useSubjects()
  const topics = useTopics()
  const subjectById = new Map((subjects.data ?? []).map((s) => [s.id, s]))
  const topicById = new Map((topics.data ?? []).map((t) => [t.id, t]))
  return (topicId: number) => {
    const topic = topicById.get(topicId)
    const subject = topic ? subjectById.get(topic.subject_id) : undefined
    return { code: subject?.code, subjectName: subject?.name, topicName: topic?.name }
  }
}

export function useTopics() {
  return useQuery({
    queryKey: ['topics'],
    staleTime: ONE_HOUR,
    queryFn: async () => {
      const { data, error } = await supabase.from('topics').select('id, subject_id, name').order('name')
      if (error) throw error
      return data
    },
  })
}
