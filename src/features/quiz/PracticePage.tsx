import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { Button } from '@/components/ui/button'
import { useMistakes } from '@/features/mistakes/api'
import { shuffle } from '@/lib/quiz'
import { useTopics } from '@/lib/referenceData'
import { fetchQuestions, finishSession, startSession, type QuizFilters, type QuizQuestion } from './api'
import { PracticeSetup } from './PracticeSetup'
import { QuizResults } from './QuizResults'
import { QuizRunner, type AnswerResult } from './QuizRunner'

type Stage =
  | { name: 'setup' }
  | { name: 'quiz'; sessionId: string; questions: QuizQuestion[]; startedAt: number }
  | { name: 'results'; answers: AnswerResult[] }

// /practice                 → choose filters, then quiz
// /practice?from=mistakes   → one tap to quiz on the "Review Again" list
export default function PracticePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fromMistakes = searchParams.get('from') === 'mistakes'
  const topics = useTopics()
  const mistakes = useMistakes()
  const queryClient = useQueryClient()

  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function start(filters: QuizFilters, itemCount: number) {
    setStarting(true)
    setMessage(null)
    try {
      const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === filters.subjectId).map((t) => t.id)
      const candidates = await fetchQuestions(filters, subjectTopicIds)
      if (candidates.length === 0) {
        setMessage('Wala pang tanong para sa filter na ito. Subukan ang ibang subject/topic o source.')
        return
      }
      // Phase 1: random pick. Smart anti-repeat selection comes in Phase 3.
      const picked = shuffle(candidates).slice(0, itemCount)
      const sessionId = await startSession(filters, picked.length)
      setStage({ name: 'quiz', sessionId, questions: picked, startedAt: Date.now() })
    } catch {
      setMessage('May problema sa pag-load ng tanong. Check your internet and try again.')
    } finally {
      setStarting(false)
    }
  }

  function startMistakes(questionIds: string[]) {
    void start({ source: 'all', subjectId: null, topicId: null, questionIds }, questionIds.length)
  }

  async function finish(answers: AnswerResult[]) {
    if (stage.name !== 'quiz') return
    const score = answers.filter((a) => a.isCorrect).length
    setStage({ name: 'results', answers })
    finishSession(stage.sessionId, score, Math.round((Date.now() - stage.startedAt) / 1000)).catch(() => {
      // Not critical: attempts are already saved; only the session summary is missing.
    })
    // Dashboard and mistakes changed, so refetch them next time they are shown.
    void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
    void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
  }

  function restart() {
    setSearchParams({}) // leave mistakes mode
    setMessage(null)
    setStage({ name: 'setup' })
  }

  if (stage.name === 'quiz') {
    return <QuizRunner sessionId={stage.sessionId} questions={stage.questions} onFinish={finish} />
  }
  if (stage.name === 'results') {
    return <QuizResults answers={stage.answers} onRestart={restart} />
  }

  if (fromMistakes) {
    if (mistakes.isPending) return <FullPageMessage>Loading your mistakes…</FullPageMessage>
    const ids = (mistakes.data ?? []).map((m) => m.questionId)
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold">Review Again</h1>
        {message && <p role="status">{message}</p>}
        {ids.length === 0 ? (
          <p className="text-muted-foreground">Wala nang kailangang balikan. Lahat ng huling sagot mo ay tama.</p>
        ) : (
          <>
            <p>
              {ids.length} tanong na mali ang huling sagot mo. Kapag nasagot mo nang tama, aalis na sila sa listahan.
            </p>
            <Button className="h-12 w-full rounded-lg text-base font-bold" disabled={starting} onClick={() => startMistakes(ids)}>
              {starting ? 'Kinukuha ang mga tanong…' : `Start ${ids.length} items`}
            </Button>
          </>
        )}
        <Button variant="ghost" className="h-11 w-full" onClick={restart}>
          Pumili ng ibang subject
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="rounded-lg border-l-4 border-primary bg-card p-3">
          {message}
        </p>
      )}
      <PracticeSetup onStart={start} starting={starting} />
    </div>
  )
}
