import { useQueryClient } from '@tanstack/react-query'
import { Info, Play } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { useMistakes } from '@/features/mistakes/api'
import { useBooks } from '@/features/questions/booksApi'
import { shuffle } from '@/lib/quiz'
import { useTopics } from '@/lib/referenceData'
import { buildHistory, pickQuestions } from '@/lib/selection'
import {
  attemptHistoryOptions,
  fetchQuestions,
  queueSessionFinish,
  queueSessionStart,
  questionPoolOptions,
  type QuizFilters,
  type QuizQuestion,
} from './api'
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

/** "Practice this book" quizzes the whole book, up to this many (mixed up), so a huge book stays a doable session. */
const BOOK_SESSION_MAX = 50

// /practice                 → choose filters, then quiz
// /practice?subject=2&topic=7 → setup with that subject (and topic) already chosen
// /practice?from=mistakes   → straight into a quiz of her mistakes (no start screen)
// /practice?book=ID         → straight into a quiz of one of her books ("Practice this book" on Questions)
export default function PracticePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fromMistakes = searchParams.get('from') === 'mistakes'
  const bookParam = searchParams.get('book')
  const books = useBooks({ enabled: bookParam !== null })
  const book = books.data?.find((b) => b.id === bookParam)
  const bookIds = book ? [...book.questionIds] : []
  const subjectParam = Number(searchParams.get('subject'))
  const initialSubjectId = Number.isInteger(subjectParam) && subjectParam > 0 ? subjectParam : null
  const topicParam = Number(searchParams.get('topic'))
  const initialTopicId = initialSubjectId !== null && Number.isInteger(topicParam) && topicParam > 0 ? topicParam : null
  const topics = useTopics()
  const mistakes = useMistakes()
  const queryClient = useQueryClient()

  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // No nav bar or sidebar while a quiz is running.
  useFocusMode(stage.name === 'quiz')

  /**
   * Starts a quiz. `ready` = the questions are already in memory (Review again), so only the session
   * still has to be saved: one request instead of two before the first question shows.
   */
  async function start(filters: QuizFilters, itemCount: number, ready?: QuizQuestion[]) {
    setStarting(true)
    setMessage(null)
    try {
      let picked: QuizQuestion[]
      if (ready) {
        picked = shuffle(ready).slice(0, itemCount)
      } else if (filters.questionIds) {
        // She chose exactly these questions, so use them all, mixed up.
        picked = shuffle(await fetchQuestions(filters, [])).slice(0, itemCount)
      } else {
        const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === filters.subjectId).map((t) => t.id)
        // The setup screen already loaded the whole subject (all topics), so these usually come straight from the cache.
        const [subjectPool, attempts] = await Promise.all([
          queryClient.fetchQuery(questionPoolOptions({ ...filters, topicId: null }, subjectTopicIds)),
          queryClient.fetchQuery(attemptHistoryOptions),
        ])
        const candidates = filters.topicId === null ? subjectPool : subjectPool.filter((q) => q.topic_id === filters.topicId)
        // Smart selection (PROJECT_PLAN.md §6): new questions first, then old mistakes, then ones she got right.
        picked = pickQuestions(candidates, buildHistory(attempts), itemCount)
      }
      if (picked.length === 0) {
        setMessage('No questions match these filters yet. Try a different subject, topic, or source.')
        return
      }
      // Saved on the device first and sent in the background, so this works offline too.
      const sessionId = queueSessionStart(filters, picked.length)
      setStage({ name: 'quiz', sessionId, questions: picked, startedAt: Date.now() })
    } catch {
      setMessage(
        navigator.onLine
          ? 'Couldn’t load the questions. Check your internet connection and try again.'
          : 'You’re offline, and no questions are saved on this device yet. Open the app once with internet to save them.',
      )
    } finally {
      setStarting(false)
    }
  }

  // Her mistakes already come with everything a quiz needs (see mistakes/api.ts), so they're used as they are.
  const mistakeQuestions: QuizQuestion[] = (mistakes.data ?? [])
    .map((m) => ({ id: m.questionId, topic_id: m.topicId, source: m.source, stem: m.stem, choices: m.choices, correct_index: m.correctIndex, explanation: m.explanation, choice_notes: m.choiceNotes }))
    .filter((q) => q.choices.length >= 2) // same rule as fetchQuestions: skip broken rows
  const mistakeIds = mistakeQuestions.map((q) => q.id)

  function startMistakes(questionIds: string[]) {
    void start({ source: 'all', subjectId: null, topicId: null, questionIds }, questionIds.length, mistakeQuestions)
  }

  function startBook() {
    if (!book) return
    void start({ source: 'all', subjectId: null, topicId: null, questionIds: bookIds, bookId: book.id }, Math.min(bookIds.length, BOOK_SESSION_MAX))
  }

  // Review again starts the quiz right away (the button she tapped already showed how many there are).
  // Only once per visit, so a failed start shows the "Try again" screen instead of retrying in a loop.
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!fromMistakes) {
      autoStarted.current = false
      return
    }
    if (autoStarted.current || !mistakes.isSuccess || mistakeIds.length === 0 || stage.name !== 'setup') return
    autoStarted.current = true
    startMistakes(mistakeIds)
  })

  // Practice this book does the same, once its book has loaded.
  const bookAutoStarted = useRef(false)
  useEffect(() => {
    if (bookParam === null) {
      bookAutoStarted.current = false
      return
    }
    if (bookAutoStarted.current || !book || bookIds.length === 0 || stage.name !== 'setup') return
    bookAutoStarted.current = true
    startBook()
  })

  async function finish(answers: AnswerResult[]) {
    if (stage.name !== 'quiz') return
    const score = answers.filter((a) => a.isCorrect).length
    setStage({ name: 'results', answers })
    queueSessionFinish(stage.sessionId, score, Math.round((Date.now() - stage.startedAt) / 1000))
    refreshAfterAnswers()
  }

  /** Dashboard, mistakes and "new to you" counts changed, so refetch them next time they are shown. */
  function refreshAfterAnswers() {
    void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
    void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
    void queryClient.invalidateQueries({ queryKey: ['attempt-history'] })
  }

  /** She left before the last item. Answers so far are already saved, so just record the partial score and go back to the Practice rack. */
  function exit(answers: AnswerResult[]) {
    if (stage.name !== 'quiz') return
    if (answers.length > 0) {
      const score = answers.filter((a) => a.isCorrect).length
      queueSessionFinish(stage.sessionId, score, Math.round((Date.now() - stage.startedAt) / 1000))
      refreshAfterAnswers()
    }
    restart()
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

  if (bookParam !== null) {
    // Loading, or about to jump straight into the quiz (see the effect above).
    if (books.isPending || (bookIds.length > 0 && !message)) return <FullPageMessage>Opening your book…</FullPageMessage>
    // Only shown when the book is gone or empty, or the quiz couldn't start (then the button tries again).
    return (
      <div className="mx-auto max-w-xl space-y-4 sm:pt-6">
        {message && <Notice>{message}</Notice>}
        <HeroPanel labelledBy="book-start-heading" className="space-y-4">
          <div>
            <h1 id="book-start-heading" className="text-sm font-semibold text-white/75">
              Practice this book
            </h1>
            <p className="font-heading text-3xl leading-tight font-bold">{book?.title ?? 'Book not found'}</p>
            <p className="mt-1 text-white/85">
              {books.isError
                ? 'Couldn’t load your books. Check your internet connection and try again.'
                : !book
                  ? 'This book isn’t on your shelf anymore.'
                  : bookIds.length === 0
                    ? 'This book is empty. Add questions to it on the Questions page first.'
                    : `${bookIds.length} questions${bookIds.length > BOOK_SESSION_MAX ? `, ${BOOK_SESSION_MAX} at a time` : ''}.`}
            </p>
          </div>
          {book && bookIds.length > 0 && (
            <button type="button" className={heroButtonClass} disabled={starting} onClick={startBook}>
              <Play className="size-5 fill-current" aria-hidden />
              {starting ? 'Loading questions…' : 'Try again'}
            </button>
          )}
        </HeroPanel>
        <Button variant="ghost" className="h-12 w-full rounded-lg text-base" onClick={restart}>
          Choose a subject instead
        </Button>
      </div>
    )
  }

  if (fromMistakes) {
    const ids = mistakeIds
    // Loading, or about to jump straight into the quiz (see the effect above).
    if (mistakes.isPending || (ids.length > 0 && !message)) return <FullPageMessage>Loading your mistakes…</FullPageMessage>
    // Only shown when there's nothing to review, or the quiz couldn't start (then the button tries again).
    return (
      <div className="mx-auto max-w-xl space-y-4 sm:pt-6">
        {message && <Notice>{message}</Notice>}
        <HeroPanel labelledBy="review-start-heading" className="space-y-4">
          <div>
            <h1 id="review-start-heading" className="text-sm font-semibold text-white/75">
              Review again
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
              {starting ? 'Loading questions…' : 'Try again'}
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
      <PracticeSetup onStart={start} starting={starting} initialSubjectId={initialSubjectId} initialTopicId={initialTopicId} />
    </div>
  )
}
