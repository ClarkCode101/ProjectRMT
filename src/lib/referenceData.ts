import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

// Subjects and topics rarely change, so cache them for a long time.
const ONE_HOUR = 60 * 60 * 1000

/**
 * The hidden subject for questions written inside her own books (migration 0007). It's never shown as a subject;
 * it only gives those questions a topic, and labels them "BOOK" while she answers them.
 */
export const BOOK_SUBJECT_CODE = 'BOOK'

type SubjectRow = { id: number; code: string; name: string; sort_order: number | null }

const subjectsQuery = {
  queryKey: ['subjects'],
  staleTime: ONE_HOUR,
  queryFn: async (): Promise<SubjectRow[]> => {
    const { data, error } = await supabase.from('subjects').select('id, code, name, sort_order').order('sort_order')
    if (error) throw error
    return data
  },
}

/** The six board subjects (everything that lists, picks or scores subjects uses this). */
export function useSubjects() {
  // select: same request and cache as below, just without the hidden "BOOK" subject.
  return useQuery({ ...subjectsQuery, select: (rows) => rows.filter((s) => s.code !== BOOK_SUBJECT_CODE) })
}

/** Every subject, the hidden one too: only for naming a question's subject. */
function useAllSubjects() {
  return useQuery(subjectsQuery)
}

/** Returns a function that finds the subject (code + name) a topic belongs to. */
export function useSubjectOfTopic() {
  const subjects = useAllSubjects()
  const topics = useTopics()
  const subjectById = new Map((subjects.data ?? []).map((s) => [s.id, s]))
  const topicById = new Map((topics.data ?? []).map((t) => [t.id, t]))
  return (topicId: number) => {
    const topic = topicById.get(topicId)
    const subject = topic ? subjectById.get(topic.subject_id) : undefined
    return { code: subject?.code, subjectName: subject?.name, topicName: topic?.name }
  }
}

/** The topic that questions written in her own books go under (null until migration 0007 has been run). */
export function useBookTopicId(): number | null {
  const subjects = useAllSubjects()
  const topics = useTopics()
  const bookSubject = subjects.data?.find((s) => s.code === BOOK_SUBJECT_CODE)
  return topics.data?.find((t) => t.subject_id === bookSubject?.id)?.id ?? null
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
