import { useQueryClient } from '@tanstack/react-query'
import { Info, Play } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/authContext'
import { useMistakes } from '@/features/mistakes/api'
import { planResultInfo, type PlanResultInfo } from '@/features/plan/planResults'
import { useBooks } from '@/features/questions/booksApi'
import { planBackTo, readPracticePlanLink, taskKey, type PracticePlanLink } from '@/lib/planLinks'
import { readPlanProgress, readSavedPlan, recordPlanProgress, recordPlanResult, recordStudied, type TaskResult } from '@/lib/planProgress'
import { shuffle } from '@/lib/quiz'
import { firstAnswerPerQuestion, fixedCount, lastAnswerPerQuestion } from '@/lib/retryQueue'
import { dueMistakes } from '@/lib/studyPlan'
import { useTopics } from '@/lib/referenceData'
import { priorHistory, type PracticeMode, type PriorHistory } from '@/lib/practiceReport'
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
import { StudyDone } from './StudyDone'
import { StudyRunner } from './StudyRunner'

/**
 * How a plan session went, for "What you learned today": first tries (what was saved and scored),
 * and the questions answered right by the end (fix until right; the same as correct without retries).
 */
function planResult(answers: AnswerResult[]): TaskResult {
  const firstTries = firstAnswerPerQuestion(answers)
  return { correct: firstTries.filter((a) => a.isCorrect).length, total: firstTries.length, fixed: fixedCount(answers) }
}

/** A message about the last action, e.g. no questions matched the filters. */
function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}

/** What the results screen needs to know about the session besides the answers. */
type SessionInfo = { mode: PracticeMode; prior: PriorHistory | null }

/**
 * A session started from Today's plan: which task (its key) and how many items the task asked for.
 * Finished = the whole task counts as done (even if fewer questions were there to ask);
 * left early = only the ones she answered (see lib/planProgress.ts), when `partial` (a "Learn" task counts steps, not answers).
 * retry: "fix until right" (past mistakes): a question she misses comes back later in the same quiz.
 */
type PlanSession = { key: string; count: number; partial: boolean; retry?: boolean }

type Stage =
  | { name: 'setup' }
  // A "Learn" task from Today's plan: studying (answers shown), then the screen before its test on the same questions.
  | { name: 'study'; questions: QuizQuestion[]; key: string }
  | { name: 'study-done'; questions: QuizQuestion[]; key: string }
  | ({ name: 'quiz'; sessionId: string; questions: QuizQuestion[]; startedAt: number; plan: PlanSession | null } & SessionInfo)
  // planInfo: the quiz was a task in Today's plan (the results then lead to the next task)
  | ({ name: 'results'; answers: AnswerResult[]; planInfo: PlanResultInfo | null } & SessionInfo)

/** "Practice this book" quizzes the whole book, up to this many (mixed up), so a huge book stays a doable session. */
const BOOK_SESSION_MAX = 50

// /practice                 → choose filters, then quiz
// /practice?subject=2&topic=7 → setup with that subject (and topic) already chosen
// /practice?from=mistakes   → straight into a quiz of her mistakes (no start screen)
// /practice?book=ID         → straight into a quiz of one of her books ("Practice this book" on Questions)
// /practice?plan=…&count=N  → straight into a task from Today's plan on Home (see lib/planLinks.ts)
export default function PracticePage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Leaving a plan task: back to the Plan page if she started it there, else Home.
  const planBack = planBackTo(useLocation().state)
  const planLink = readPracticePlanLink(searchParams)
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
  const userId = useAuth().session?.user?.id ?? null

  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // No nav bar or sidebar while a quiz is running (or she is studying for one).
  useFocusMode(stage.name === 'quiz' || stage.name === 'study')

  /**
   * Starts a quiz. `ready` = the questions are already in memory (Review again), so only the session
   * still has to be saved: one request instead of two before the first question shows.
   */
  async function start(filters: QuizFilters, itemCount: number, ready?: QuizQuestion[], mode: PracticeMode = 'practice', plan: PlanSession | null = null) {
    setStarting(true)
    setMessage(null)
    try {
      let picked: QuizQuestion[]
      // Her answers before this session, so the results can say which were new and which old mistakes she fixed.
      // Not needed in Review again (every item there is an old mistake). If it can't load, the quiz still starts.
      let prior: PriorHistory | null = null
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
        prior = priorHistory(attempts)
      }
      if (prior === null && mode === 'practice') {
        prior = await queryClient
          .fetchQuery(attemptHistoryOptions)
          .then(priorHistory)
          .catch(() => null)
      }
      if (picked.length === 0) {
        setMessage('No questions match these filters yet. Try a different subject, topic, or source.')
        return
      }
      // Saved on the device first and sent in the background, so this works offline too.
      const sessionId = queueSessionStart(filters, picked.length)
      setStage({ name: 'quiz', sessionId, questions: picked, startedAt: Date.now(), mode, prior, plan })
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
    void start({ source: 'all', subjectId: null, topicId: null, questionIds }, questionIds.length, mistakeQuestions, 'review')
  }

  /** "Review the N left" on the results: straight into the ones she just missed (the mistakes list may not have caught up yet). */
  function reviewLeft(missed: QuizQuestion[]) {
    const questionIds = missed.map((q) => q.id)
    void start({ source: 'all', subjectId: null, topicId: null, questionIds }, questionIds.length, missed, 'review')
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
    // isFetching: right after a session the list is being refreshed (her new answers), so wait for the fresh one.
    if (autoStarted.current || !mistakes.isSuccess || mistakes.isFetching || mistakeIds.length === 0 || stage.name !== 'setup') return
    autoStarted.current = true
    startMistakes(mistakeIds)
  })

  /**
   * A task from Today's plan: her focus subject, a mixed set from all subjects, or the past mistakes due today
   * (worked out here from her answers, so a second visit gets only the ones still due).
   */
  async function startPlan(link: PracticePlanLink) {
    const plan: PlanSession = { key: taskKey(link), count: link.count, partial: true }
    if (link.kind === 'subject') return start({ source: 'all', subjectId: link.subjectId, topicId: link.topicId }, link.count, undefined, 'practice', plan)
    if (link.kind === 'learn') return startLearn(link)
    if (link.kind === 'mixed') return start({ source: 'all', subjectId: null, topicId: null }, link.count, undefined, 'practice', plan)
    setMessage(null)
    try {
      const attempts = await queryClient.fetchQuery(attemptHistoryOptions)
      const questionIds = dueMistakes(attempts, new Date())
        .slice(0, link.count)
        .map((m) => m.questionId)
      if (questionIds.length === 0) {
        // Nothing left to fix today (she answered them somewhere else): the task is done.
        recordPlanProgress(plan.key, plan.count)
        setMessage('No past mistakes are due right now, so this task is done. They come back 1, 3, 7 and 14 days after you miss them.')
        return
      }
      await start({ source: 'all', subjectId: null, topicId: null, questionIds }, questionIds.length, undefined, 'practice', { ...plan, retry: true })
    } catch {
      setMessage('Couldn’t load your past answers. Check your internet connection and try again.')
    }
  }

  /**
   * A "Learn" task: step 1, study (answers shown, nothing saved as an answer), then step 2, a test on the same questions.
   * The studied questions are kept on the device, so a test link after a break asks exactly those.
   * Studied on another device (or the list is gone): she studies again first.
   */
  async function startLearn(link: Extract<PracticePlanLink, { kind: 'learn' }>) {
    const key = taskKey(link)
    setStarting(true)
    setMessage(null)
    try {
      const studiedIds = readPlanProgress().studied[key]
      if (link.step === 'test' && studiedIds) {
        const studied = await fetchQuestions({ source: 'all', subjectId: null, topicId: null, questionIds: studiedIds }, [])
        if (studied.length > 0) return setStage({ name: 'study-done', questions: studied, key })
      }
      const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === link.subjectId).map((t) => t.id)
      const [subjectPool, attempts] = await Promise.all([
        queryClient.fetchQuery(questionPoolOptions({ source: 'all', subjectId: link.subjectId, topicId: null }, subjectTopicIds)),
        queryClient.fetchQuery(attemptHistoryOptions),
      ])
      const candidates = link.topicId === null ? subjectPool : subjectPool.filter((q) => q.topic_id === link.topicId)
      // Same smart selection as Practice: the ones she hasn't seen first, then her old mistakes.
      const picked = pickQuestions(candidates, buildHistory(attempts), link.count)
      if (picked.length === 0) setMessage('No questions on this topic yet. Swap the task on the Plan page, or add questions on the Questions page.')
      else setStage({ name: 'study', questions: picked, key })
    } catch {
      setMessage(navigator.onLine ? 'Couldn’t load the questions. Check your internet connection and try again.' : 'You’re offline, and these questions aren’t saved on this device yet.')
    } finally {
      setStarting(false)
    }
  }

  /** Step 2 of "Learn": the same questions as a normal quiz (mixed up; these answers count). Finishing it finishes the task. */
  function startLearnTest(questions: QuizQuestion[], key: string) {
    void start({ source: 'all', subjectId: null, topicId: null, questionIds: questions.map((q) => q.id) }, questions.length, questions, 'practice', {
      key,
      count: 1, // the second of its two steps
      partial: false,
    })
  }

  // A plan task starts right away too (she already saw what it is on Home), once the topics have loaded.
  const planStarted = useRef(false)
  useEffect(() => {
    if (!planLink) {
      planStarted.current = false
      return
    }
    if (planStarted.current || !topics.isSuccess || stage.name !== 'setup') return
    planStarted.current = true
    void startPlan(planLink)
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
    // Fix until right gives one answer per TRY: the results show one per question (the last try, so a fixed one
    // counts as right), and the saved score counts first tries only (the same answers that were saved).
    const score = firstAnswerPerQuestion(answers).filter((a) => a.isCorrect).length
    queueSessionFinish(stage.sessionId, score, Math.round((Date.now() - stage.startedAt) / 1000))
    // Finished: the whole task (or, for a "Learn" test, its last step) is done.
    let planInfo: PlanResultInfo | null = null
    if (stage.plan) {
      recordPlanProgress(stage.plan.key, stage.plan.partial ? Math.max(stage.plan.count, answers.length) : stage.plan.count)
      recordPlanResult(stage.plan.key, planResult(answers))
      // Where she is in the plan now (this session counted), for the results' "Next" button.
      const lastMockDay = queryClient.getQueryData<string | null>(['last-mock-day']) ?? null
      planInfo = planResultInfo(userId ? readSavedPlan(userId) : null, readPlanProgress(), lastMockDay, stage.plan.key)
    }
    setStage({ name: 'results', answers: lastAnswerPerQuestion(answers), mode: stage.mode, prior: stage.prior, planInfo })
    refreshAfterAnswers()
  }

  /** Dashboard, mistakes and "new to you" counts changed, so refetch them next time they are shown. */
  function refreshAfterAnswers() {
    void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
    void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
    void queryClient.invalidateQueries({ queryKey: ['attempt-history'] })
  }

  /**
   * She left before the last item. Answers so far are already saved, so just record the partial score
   * and go back: for a plan task, to where she started it (Plan page or Home), else to the Practice rack.
   */
  function exit(answers: AnswerResult[]) {
    if (stage.name !== 'quiz') return
    if (answers.length > 0) {
      const firstTries = firstAnswerPerQuestion(answers)
      const score = firstTries.filter((a) => a.isCorrect).length
      queueSessionFinish(stage.sessionId, score, Math.round((Date.now() - stage.startedAt) / 1000))
      // One per question, not per try (a retried question isn't counted twice).
      if (stage.plan?.partial) recordPlanProgress(stage.plan.key, firstTries.length)
      if (stage.plan) recordPlanResult(stage.plan.key, planResult(answers))
      refreshAfterAnswers()
    }
    if (stage.plan) return void navigate(planBack)
    restart()
  }

  /**
   * "Review again" on the results. A plain link to /practice?from=mistakes only changed the address
   * (this page stays on the results), so also go back to setup: the effect above then starts the quiz.
   */
  function reviewMistakes() {
    autoStarted.current = false
    setMessage(null)
    setStage({ name: 'setup' })
    setSearchParams({ from: 'mistakes' })
  }

  function restart() {
    setSearchParams({}) // leave mistakes mode
    setMessage(null)
    setStage({ name: 'setup' })
  }

  if (stage.name === 'quiz') {
    return <QuizRunner sessionId={stage.sessionId} questions={stage.questions} onFinish={finish} onExit={exit} retryMissed={stage.plan?.retry === true} />
  }
  if (stage.name === 'study') {
    return (
      <StudyRunner
        questions={stage.questions}
        onDone={() => {
          recordStudied(stage.key, stage.questions.map((q) => q.id))
          setStage({ name: 'study-done', questions: stage.questions, key: stage.key })
        }}
        onExit={() => void navigate(planBack)}
      />
    )
  }
  if (stage.name === 'study-done') {
    return <StudyDone count={stage.questions.length} starting={starting} message={message} onStart={() => startLearnTest(stage.questions, stage.key)} onLater={() => void navigate(planBack)} />
  }
  if (stage.name === 'results') {
    return (
      <QuizResults
        answers={stage.answers}
        mode={stage.mode}
        prior={stage.prior}
        label={book?.title}
        onRestart={restart}
        onReviewLeft={reviewLeft}
        onReviewMistakes={reviewMistakes}
        starting={starting}
        plan={stage.planInfo}
      />
    )
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

  if (planLink) {
    // About to jump straight into the task (see the effect above).
    if (!message) return <FullPageMessage>Getting today’s task ready…</FullPageMessage>
    // Only shown when the task couldn't start, or there is nothing to do (then the button tries again).
    return (
      <div className="mx-auto max-w-xl space-y-4 sm:pt-6">
        <Notice>{message}</Notice>
        <HeroPanel labelledBy="plan-start-heading" className="space-y-4">
          <h1 id="plan-start-heading" className="font-heading text-3xl leading-tight font-bold">
            Today’s plan
          </h1>
          <button type="button" className={heroButtonClass} disabled={starting} onClick={() => void startPlan(planLink)}>
            <Play className="size-5 fill-current" aria-hidden />
            {starting ? 'Loading questions…' : 'Try again'}
          </button>
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
    if (mistakes.isPending || mistakes.isFetching || (ids.length > 0 && !message)) return <FullPageMessage>Loading your mistakes…</FullPageMessage>
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
