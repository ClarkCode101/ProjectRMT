import { useQuery } from '@tanstack/react-query'
import { latestMistakes, parseChoices } from '@/lib/quiz'
import type { QuestionSource } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

export type Mistake = {
  questionId: string
  topicId: number
  /** built-in or her own (the quiz shows a "Mine" tag) */
  source: QuestionSource
  stem: string
  choices: string[]
  correctIndex: number
  selectedIndex: number | null
  explanation: string | null
  answeredAt: string | null
}

/** Her "Review Again" list: questions whose latest attempt was wrong. */
export function useMistakes() {
  return useQuery({
    queryKey: ['mistakes'],
    queryFn: async (): Promise<Mistake[]> => {
      // RLS returns only her own attempts.
      const { data: attempts, error } = await supabase
        .from('attempts')
        .select('question_id, is_correct, selected_index, created_at')
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) throw error

      const wrong = latestMistakes(attempts)
      if (wrong.length === 0) return []

      const { data: questions, error: qError } = await supabase
        .from('questions')
        // Everything a quiz needs, so "Review again" can start without loading the questions a second time.
        .select('id, topic_id, source, stem, choices, correct_index, explanation')
        .in(
          'id',
          wrong.map((a) => a.question_id),
        )
      if (qError) throw qError

      const byId = new Map(questions.map((q) => [q.id, q]))
      return wrong.flatMap((a) => {
        const q = byId.get(a.question_id)
        if (!q) return [] // question was deleted
        return [
          {
            questionId: q.id,
            topicId: q.topic_id,
            source: q.source,
            stem: q.stem,
            choices: parseChoices(q.choices),
            correctIndex: q.correct_index,
            selectedIndex: a.selected_index,
            explanation: q.explanation,
            answeredAt: a.created_at,
          },
        ]
      })
    },
  })
}
