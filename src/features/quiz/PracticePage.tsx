import { useQueryClient } from '@tanstack/react-query'
import { Info, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { useMistakes } from '@/features/mistakes/api'
import { shuffle } from '@/lib/quiz'
import { useTopics } from '@/lib/referenceData'
import { fetchQuestions, finishSession, startSession, type QuizFilters, type QuizQuestion } from './api'
import { PracticeSetup } from './PracticeSetup'
import { QuizResults } from './QuizResults'
import { QuizRunner, type AnswerResult } from './QuizRunner'

/** A message about the last action, e.g. no questions matched the filters. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

type Stage =
  | { name: 'setup' }
  | { name: 'quiz'; sessionId: string; questions: QuizQuestion[]; startedAt: number }
  | { name: 'results'; answers: AnswerResult[] }

// /practice                 → choose filters, then quiz
// /practice?from=mistakes   → one tap to quiz on the "Review Again" list
export default function PracticePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fromMistakes = searchParams.get('from') === 'mistakes'
  const subjectParam = Number(searchParams.get('subject'))
  const initialSubjectId = Number.isInteger(subjectParam) && subjectParam > 0 ? subjectParam : null
  const topics = useTopics()
  const mistakes = useMistakes()
  const queryClient = useQueryClient()

  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const navigate = useNavigate()
  // No nav bar or sidebar while a quiz is running.
  useFocusMode(stage.name === 'quiz')

  async function start(filters: QuizFilters, itemCount: number) {
    setStarting(true)
    setMessage(null)
    try {
      const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === filters.subjectId).map((t) => t.id)
      const candidates = await fetchQuestions(filters, subjectTopicIds)
      if (candidates.length === 0) {
        setMessage('No questions match these filters yet. Try a different subject, topic, or source.')
        return
      }
      // Phase 1: random pick. Smart anti-repeat selection comes in Phase 3.
      const picked = shuffle(candidates).slice(0, itemCount)
      const sessionId = await startSession(filters, picked.length)
      setStage({ name: 'quiz', sessionId, questions: picked, startedAt: Date.now() })
    } catch {
      setMessage('Couldn’t load the questions. Check your internet connection and try again.')
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
    void queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  /** She left before the last item. Answers so far are already saved, so just record the partial score and go Home. */
  function exit(answers: AnswerResult[]) {
    if (stage.name !== 'quiz') return
    if (answers.length > 0) {
      const score = answers.filter((a) => a.isCorrect).length
      finishSession(stage.sessionId, score, Math.round((Date.now() - stage.startedAt) / 1000)).catch(() => {})
      void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
      void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
      void queryClient.invalidateQueries({ queryKey: ['activity'] })
    }
    navigate('/')
  }

  function restart() {
    setSearchParams({}) // leave mistakes mode
    setMessage(null)
    setStage({ name: 'setup' })
  }

  if (stage.name === 'quiz') {
    return <QuizRunner sessionId={stage.sessionId} questions={stage.questions} onFinish={finish} onExit={exit} />
  }
  if (stage.name === 'results') {
    return <QuizResults answers={stage.answers} onRestart={restart} />
  }

  if (fromMistakes) {
    if (mistakes.isPending) return <FullPageMessage>Loading your mistakes…</FullPageMessage>
    const ids = (mistakes.data ?? []).map((m) => m.questionId)
    return (
      <div className="mx-auto max-w-xl space-y-4 sm:pt-6">
        {message && <Notice>{message}</Notice>}
        <HeroPanel labelledBy="review-start-heading" className="space-y-4">
          <div>
            <h1 id="review-start-heading" className="text-sm font-semibold text-white/75">
              Review Again
            </h1>
            <p className="font-heading text-6xl leading-none font-bold tabular-nums">{ids.length}</p>
            <p className="mt-1 text-white/85">
              {ids.length === 0
                ? 'Nothing to review. Your latest answers are all correct.'
                : 'questions you got wrong last time. Answer one correctly and it leaves the list.'}
            </p>
          </div>
          {ids.length > 0 && (
            <button type="button" className={heroButtonClass} disabled={starting} onClick={() => startMistakes(ids)}>
              <Play className="size-5 fill-current" aria-hidden />
              {starting ? 'Loading questions…' : `Start ${ids.length} items`}
            </button>
          )}
        </HeroPanel>
        <Button variant="ghost" className="h-12 w-full rounded-lg text-base" onClick={restart}>
          Choose a subject instead
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {message && <Notice>{message}</Notice>}
      <PracticeSetup onStart={start} starting={starting} initialSubjectId={initialSubjectId} />
    </div>
  )
}
