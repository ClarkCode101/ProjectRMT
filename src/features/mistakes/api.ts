import { useQuery } from '@tanstack/react-query'
import { latestMistakes, markGameAnswers, parseChoiceNotes, parseChoices, withoutGameAnswers } from '@/lib/quiz'
import type { QuestionSource } from '@/lib/database.types'
import { allAttempts, fetchGameSessionIds, withOfflineFallback, type OfflineBank } from '@/lib/offline/bank'
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
  /** one note per choice, or null (migration 0008) */
  choiceNotes: string[] | null
  answeredAt: string | null
}

/**
 * Her "Review Again" list: questions whose latest attempt was wrong.
 * Only Practice, Mock exam and Flashcard answers count: a game answer neither adds a mistake nor clears one (GAME_MODES).
 */
export function useMistakes() {
  return useQuery({
    queryKey: ['mistakes'],
    // No internet: worked out from the answers and questions saved on this device.
    queryFn: () => withOfflineFallback(fetchMistakes, offlineMistakes),
  })
}

/** Review again from the saved copy: same rule (latest answer was wrong), answers still waiting to sync included. */
function offlineMistakes(bank: OfflineBank): Mistake[] {
  const byId = new Map(bank.questions.map((q) => [q.id, q]))
  return latestMistakes(withoutGameAnswers(allAttempts(bank))).flatMap((a) => {
    const q = byId.get(a.question_id)
    if (!q) return []
    return [
      {
        questionId: q.id,
        topicId: q.topic_id,
        source: q.source,
        stem: q.stem,
        choices: q.choices,
        correctIndex: q.correct_index,
        selectedIndex: a.selected_index,
        explanation: q.explanation,
        choiceNotes: q.choice_notes,
        answeredAt: a.created_at,
      },
    ]
  })
}

/** Review again from Supabase. */
async function fetchMistakes(): Promise<Mistake[]> {
  // RLS returns only her own attempts and sessions.
  const [{ data: attempts, error }, gameSessionIds] = await Promise.all([
    supabase
      .from('attempts')
      .select('question_id, is_correct, selected_index, created_at, session_id')
      .order('created_at', { ascending: false })
      .limit(5000),
    fetchGameSessionIds(),
  ])
  if (error) throw error

  const wrong = latestMistakes(withoutGameAnswers(markGameAnswers(attempts, gameSessionIds)))
  if (wrong.length === 0) return []

  const { data: questions, error: qError } = await supabase
    .from('my_questions') // with her own fixes to built-in questions (migration 0009)
    // Everything a quiz needs, so "Review again" can start without loading the questions a second time.
    .select('id, topic_id, source, stem, choices, correct_index, explanation, choice_notes')
    .in(
      'id',
      wrong.map((a) => a.question_id),
    )
  if (qError) throw qError

  const byId = new Map(questions.map((q) => [q.id, q]))
  return wrong.flatMap((a) => {
    const q = byId.get(a.question_id)
    if (!q) return [] // question was deleted
    const choices = parseChoices(q.choices)
    return [
      {
        questionId: q.id,
        topicId: q.topic_id,
        source: q.source,
        stem: q.stem,
        choices,
        correctIndex: q.correct_index,
        selectedIndex: a.selected_index,
        explanation: q.explanation,
        choiceNotes: parseChoiceNotes(q.choice_notes, choices.length),
        answeredAt: a.created_at,
      },
    ]
  })
}
