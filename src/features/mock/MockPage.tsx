import { useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { useBooks } from '@/features/questions/booksApi'
import {
  DEFAULT_SOURCE,
  fetchQuestions,
  queueAnswer,
  queueSessionFinish,
  queueSessionStart,
  questionPoolOptions,
  type QuizFilters,
  type QuizQuestion,
  type SourceChoice,
} from '@/features/quiz/api'
import { BOARD_RUN_KEY, boardVerdict, newBoardRun, nextPaperIndex, parseBoardRun, recordPaper, type BoardRun } from '@/lib/boardRun'
import { buildMockExam, parseSavedMock, SAVED_MOCK_KEY, scoreMock, secondsLeft, timeLimitSec, type MockScore, type SavedMock } from '@/lib/mockExam'
import { NOTES } from '@/data/encouragements'
import { pickNote } from '@/lib/planner'
import { shuffledChoiceOrder, type SubjectSummary } from '@/lib/quiz'
import { useTopics } from '@/lib/referenceData'
import { BoardResults } from './BoardResults'
import { BoardSetup } from './BoardSetup'
import { MockResults } from './MockResults'
import { MockRunner } from './MockRunner'
import { MockSetup } from './MockSetup'

// ---------- Kept on this device (localStorage): the exam in progress, and the Full Board run ----------
// So a refresh or a closed tab doesn't lose them. Broken data → start fresh instead of crashing.

function readStored<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? parse(JSON.parse(raw)) : null
  } catch {
    return null
  }
}
function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: it still works, it just can't be picked up after a refresh.
  }
}
function clearStored(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // nothing to do
  }
}

type Stage =
  | { name: 'setup' }
  | { name: 'exam'; exam: SavedMock; questions: QuizQuestion[] }
  | {
      name: 'results'
      exam: SavedMock
      questions: QuizQuestion[]
      score: MockScore
      durationSec: number
      timedOut: boolean
    }
  | { name: 'board' }

// /mock → the Full Board (BoardSetup): six papers, one at a time → each paper's results → the board's result
// /mock?book=ID → a timed mock on one of her books instead (MockSetup), from "Study → Mock exam" inside a book
export default function MockPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const bookParam = searchParams.get('book')
  const books = useBooks({ enabled: bookParam !== null })
  const book = bookParam === null ? null : (books.data?.find((b) => b.id === bookParam) ?? null)
  const queryClient = useQueryClient()
  const topics = useTopics()
  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [saved, setSaved] = useState<SavedMock | null>(() => readStored(SAVED_MOCK_KEY, parseSavedMock))
  const [run, setRun] = useState<BoardRun | null>(() => readStored(BOARD_RUN_KEY, parseBoardRun))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // No nav bar or sidebar while the exam is running.
  useFocusMode(stage.name === 'exam')

  function saveRun(next: BoardRun | null) {
    if (next) writeStored(BOARD_RUN_KEY, next)
    else clearStored(BOARD_RUN_KEY)
    setRun(next)
  }

  async function start(filters: QuizFilters, itemCount: number, label: string, paper?: SavedMock['paper']) {
    setBusy(true)
    setMessage(null)
    try {
      const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === filters.subjectId).map((t) => t.id)
      const pool = await queryClient.fetchQuery(questionPoolOptions(filters, subjectTopicIds))
      const questions = buildMockExam(pool, itemCount)
      if (questions.length === 0) {
        setMessage(paper ? `No questions in ${label} yet. Add some on Questions, then start this paper again.` : 'No questions match yet.')
        return
      }
      // Saved on the device first and sent in the background, so this works offline too.
      const sessionId = queueSessionStart(filters, questions.length, 'mock')
      const exam: SavedMock = {
        version: 1,
        sessionId,
        label,
        questionIds: questions.map((q) => q.id),
        orders: questions.map((q) => shuffledChoiceOrder(q.choices.length)),
        answers: questions.map(() => null),
        flags: questions.map(() => false),
        current: 0,
        startedAt: Date.now(),
        limitSec: timeLimitSec(questions.length),
        scope: { source: filters.source, subjectId: filters.subjectId, bookId: filters.bookId ?? null },
        ...(paper && { paper }),
      }
      writeStored(SAVED_MOCK_KEY, exam)
      setSaved(exam)
      setStage({ name: 'exam', exam, questions })
    } catch {
      setMessage(
        navigator.onLine
          ? 'Couldn’t prepare the exam. Check your internet connection and try again.'
          : 'You’re offline, and no questions are saved on this device yet. Open the app once with internet to save them.',
      )
    } finally {
      setBusy(false)
    }
  }

  /** Paper `index` of the run (any one she hasn't taken: she chooses the order): its subject, from the run's source, the run's number of items. */
  function startPaper(current: BoardRun, index: number) {
    const paper = current.papers[index]
    if (!paper || paper.result !== null) return
    const { source, uploadId, bookId, verifiedOnly } = current.source
    const filters: QuizFilters = { source: source as SourceChoice['source'], uploadId, bookId, verifiedOnly, subjectId: paper.subjectId, topicId: null }
    void start(filters, current.perSubject, paper.code, { runId: current.id, index })
  }

  /** A new run always uses all questions (no ⚙ on the Full Board: her own books rarely cover all six subjects). */
  function startRun(subjects: SubjectSummary[], perSubject: number, first: number) {
    const fresh = newBoardRun(subjects, perSubject, DEFAULT_SOURCE, crypto.randomUUID(), Date.now())
    saveRun(fresh)
    startPaper(fresh, first)
  }

  /** Picks up the saved exam. Questions deleted since then are dropped. Time already up → straight to results. */
  async function resume() {
    if (!saved) return
    setBusy(true)
    setMessage(null)
    try {
      const fetched = await fetchQuestions({ source: 'all', subjectId: null, topicId: null, questionIds: saved.questionIds }, [])
      const byId = new Map(fetched.map((q) => [q.id, q]))
      const keep = saved.questionIds.map((id, i) => ({ q: byId.get(id), i })).filter((x): x is { q: QuizQuestion; i: number } => Boolean(x.q))
      if (keep.length === 0) {
        discard()
        setMessage('The questions in that exam are no longer available, so it was discarded.')
        return
      }
      const exam: SavedMock = {
        ...saved,
        questionIds: keep.map((k) => k.q.id),
        orders: keep.map((k) => saved.orders[k.i]),
        answers: keep.map((k) => saved.answers[k.i]),
        flags: keep.map((k) => saved.flags[k.i]),
        current: Math.min(saved.current, keep.length - 1),
      }
      const questions = keep.map((k) => k.q)
      if (secondsLeft(exam, Date.now()) === 0) submit(exam, questions, true)
      else setStage({ name: 'exam', exam, questions })
    } catch {
      setMessage('Couldn’t load the exam. Check your internet connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  /** Throws away the paused exam. A board paper stays not taken, so she can take it again. */
  function discard() {
    clearStored(SAVED_MOCK_KEY)
    setSaved(null)
  }

  function endRun() {
    // A paused paper of this run goes too (it can't count anywhere any more).
    if (saved?.paper && saved.paper.runId === run?.id) discard()
    saveRun(null)
    setMessage(null)
  }

  function onChange(exam: SavedMock) {
    writeStored(SAVED_MOCK_KEY, exam)
    setSaved(exam)
    setStage((s) => (s.name === 'exam' ? { ...s, exam } : s))
  }

  /**
   * Saves every answered item as an attempt, plus the session's score. They go into the outbox on the device
   * and are sent in the background, so nothing is lost without internet (lib/offline/outbox.ts).
   */
  function saveResults(exam: SavedMock, questions: QuizQuestion[], score: MockScore, durationSec: number) {
    questions.forEach((q, i) => {
      const answer = exam.answers[i]
      if (answer === null) return
      queueAnswer({ sessionId: exam.sessionId, questionId: q.id, selectedIndex: answer, isCorrect: answer === q.correct_index, timeMs: null })
    })
    queueSessionFinish(exam.sessionId, score.correct, durationSec)
    // Progress, mistakes and "new to you" counts changed.
    void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
    void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
    void queryClient.invalidateQueries({ queryKey: ['attempt-history'] })
  }

  function submit(exam: SavedMock, questions: QuizQuestion[], timedOut: boolean) {
    const score = scoreMock(questions, exam.answers)
    const durationSec = Math.min(exam.limitSec, Math.round((Date.now() - exam.startedAt) / 1000))
    clearStored(SAVED_MOCK_KEY)
    setSaved(null)
    // A board paper: its score goes into the run.
    if (exam.paper && run && exam.paper.runId === run.id && score.total > 0) {
      saveRun(recordPaper(run, exam.paper.index, { sessionId: exam.sessionId, correct: score.correct, total: score.total, finishedAt: Date.now() }))
    }
    setStage({ name: 'results', exam, questions, score, durationSec, timedOut })
    saveResults(exam, questions, score, durationSec)
  }

  function backToSetup() {
    setMessage(null)
    setStage({ name: 'setup' })
    window.scrollTo({ top: 0 })
  }

  if (stage.name === 'exam') {
    return (
      <MockRunner
        exam={stage.exam}
        questions={stage.questions}
        onChange={onChange}
        onSubmit={(exam, timedOut) => submit(exam, stage.questions, timedOut)}
        onLeave={() => setStage({ name: 'setup' })}
      />
    )
  }

  if (stage.name === 'results') {
    // A board paper: the gold button leads on to the next paper, or to the board's result after the last one.
    const isPaper = stage.exam.paper !== undefined && run !== null && stage.exam.paper.runId === run.id
    const next = isPaper ? nextPaperIndex(run) : null
    const nextLabel = !isPaper ? undefined : next === null ? 'See board result' : `Next paper · ${run.papers[next].code}`
    return (
      <MockResults
        label={stage.exam.label}
        sessionId={stage.exam.sessionId}
        scope={stage.exam.scope}
        questions={stage.questions}
        answers={stage.exam.answers}
        flags={stage.exam.flags}
        score={stage.score}
        durationSec={stage.durationSec}
        timedOut={stage.timedOut}
        note={isPaper ? null : pickNote(NOTES, stage.score.passed ? 'mock_passed' : 'mock_done', stage.exam.sessionId)}
        nextLabel={nextLabel}
        onNewExam={() => {
          if (isPaper && next === null) {
            setStage({ name: 'board' })
            window.scrollTo({ top: 0 })
          } else backToSetup()
        }}
      />
    )
  }

  if (stage.name === 'board' && run) {
    return (
      <BoardResults
        run={run}
        note={pickNote(NOTES, boardVerdict(run).passed ? 'mock_passed' : 'mock_done', run.id)}
        onNewRun={() => {
          saveRun(null)
          backToSetup()
        }}
      />
    )
  }

  if (topics.isPending || (bookParam !== null && books.isPending)) return <FullPageMessage>Loading…</FullPageMessage>

  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className="mx-auto flex max-w-5xl items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </p>
      )}
      {book ? (
        <MockSetup
          // key: a different book in the address starts the setup fresh
          key={book.id}
          book={book}
          onStart={(f, n, label) => void start(f, n, label)}
          starting={busy}
          saved={saved}
          onResume={() => void resume()}
          onDiscard={discard}
          onLeaveBook={() => setSearchParams({})}
        />
      ) : (
        <BoardSetup
          run={run}
          saved={saved}
          starting={busy}
          onStartRun={startRun}
          onStartPaper={(index) => run && startPaper(run, index)}
          onResume={() => void resume()}
          onDiscard={discard}
          onEndRun={endRun}
          onSeeResult={() => setStage({ name: 'board' })}
        />
      )}
    </div>
  )
}
