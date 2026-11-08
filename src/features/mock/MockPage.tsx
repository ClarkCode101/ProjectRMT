import { useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { useBooks } from '@/features/questions/booksApi'
import { fetchQuestions, finishSession, questionPoolOptions, recordAttempts, startSession, type QuizFilters, type QuizQuestion } from '@/features/quiz/api'
import { buildMockExam, parseSavedMock, SAVED_MOCK_KEY, scoreMock, secondsLeft, timeLimitSec, type MockScore, type SavedMock } from '@/lib/mockExam'
import { NOTES } from '@/data/encouragements'
import { pickNote } from '@/lib/planner'
import { shuffledChoiceOrder } from '@/lib/quiz'
import { useTopics } from '@/lib/referenceData'
import { MockResults } from './MockResults'
import { MockRunner } from './MockRunner'
import { MockSetup } from './MockSetup'

// ---------- The exam in progress is kept on this device (localStorage), so a refresh or closed tab doesn't lose it ----------

function readSaved(): SavedMock | null {
  try {
    const raw = localStorage.getItem(SAVED_MOCK_KEY)
    return raw ? parseSavedMock(JSON.parse(raw)) : null
  } catch {
    return null // broken data: start fresh
  }
}
function writeSaved(exam: SavedMock) {
  try {
    localStorage.setItem(SAVED_MOCK_KEY, JSON.stringify(exam))
  } catch {
    // Storage full or blocked: the exam still works, it just can't be resumed after a refresh.
  }
}
function clearSaved() {
  try {
    localStorage.removeItem(SAVED_MOCK_KEY)
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
      saveFailed: boolean
    }

// /mock → setup (or resume) → timed exam → results + review
// /mock?subject=ID → that subject at the top of the rotor; /mock?book=ID → one of her books loaded instead
// (both from "Study → Mock exam" inside a book on Questions)
export default function MockPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const subjectParam = Number(searchParams.get('subject'))
  const initialSubjectId = Number.isInteger(subjectParam) && subjectParam > 0 ? subjectParam : null
  const bookParam = searchParams.get('book')
  const books = useBooks({ enabled: bookParam !== null })
  const book = bookParam === null ? null : (books.data?.find((b) => b.id === bookParam) ?? null)
  const queryClient = useQueryClient()
  const topics = useTopics()
  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [saved, setSaved] = useState<SavedMock | null>(readSaved)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // No nav bar or sidebar while the exam is running.
  useFocusMode(stage.name === 'exam')

  async function start(filters: QuizFilters, itemCount: number, label: string) {
    setBusy(true)
    setMessage(null)
    try {
      const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === filters.subjectId).map((t) => t.id)
      const pool = await queryClient.fetchQuery(questionPoolOptions(filters, subjectTopicIds))
      const questions = buildMockExam(pool, itemCount)
      if (questions.length === 0) {
        setMessage('No questions match yet. Try another subject or source.')
        return
      }
      const sessionId = await startSession(filters, questions.length, 'mock')
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
      }
      writeSaved(exam)
      setSaved(exam)
      setStage({ name: 'exam', exam, questions })
    } catch {
      setMessage('Couldn’t prepare the exam. Check your internet connection and try again.')
    } finally {
      setBusy(false)
    }
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
      if (secondsLeft(exam, Date.now()) === 0) await submit(exam, questions, true)
      else setStage({ name: 'exam', exam, questions })
    } catch {
      setMessage('Couldn’t load the exam. Check your internet connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  function discard() {
    clearSaved()
    setSaved(null)
  }

  function onChange(exam: SavedMock) {
    writeSaved(exam)
    setSaved(exam)
    setStage((s) => (s.name === 'exam' ? { ...s, exam } : s))
  }

  /** Saves every answered item as an attempt, plus the session's score. Returns false if it couldn't save. */
  async function saveResults(exam: SavedMock, questions: QuizQuestion[], score: MockScore, durationSec: number) {
    try {
      await recordAttempts(
        exam.sessionId,
        questions.flatMap((q, i) => {
          const answer = exam.answers[i]
          return answer === null ? [] : [{ questionId: q.id, selectedIndex: answer, isCorrect: answer === q.correct_index }]
        }),
      )
      await finishSession(exam.sessionId, score.correct, durationSec)
      // Progress, mistakes and "new to you" counts changed.
      void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
      void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
      void queryClient.invalidateQueries({ queryKey: ['attempt-history'] })
      return true
    } catch {
      return false
    }
  }

  async function submit(exam: SavedMock, questions: QuizQuestion[], timedOut: boolean) {
    const score = scoreMock(questions, exam.answers)
    const durationSec = Math.min(exam.limitSec, Math.round((Date.now() - exam.startedAt) / 1000))
    clearSaved()
    setSaved(null)
    setStage({ name: 'results', exam, questions, score, durationSec, timedOut, saveFailed: false })
    const ok = await saveResults(exam, questions, score, durationSec)
    if (!ok) setStage((s) => (s.name === 'results' ? { ...s, saveFailed: true } : s))
  }

  async function retrySave() {
    if (stage.name !== 'results') return
    setBusy(true)
    const ok = await saveResults(stage.exam, stage.questions, stage.score, stage.durationSec)
    setBusy(false)
    if (ok) setStage({ ...stage, saveFailed: false })
  }

  if (stage.name === 'exam') {
    return (
      <MockRunner
        exam={stage.exam}
        questions={stage.questions}
        onChange={onChange}
        onSubmit={(exam, timedOut) => void submit(exam, stage.questions, timedOut)}
        onLeave={() => setStage({ name: 'setup' })}
      />
    )
  }

  if (stage.name === 'results') {
    return (
      <MockResults
        label={stage.exam.label}
        questions={stage.questions}
        answers={stage.exam.answers}
        flags={stage.exam.flags}
        score={stage.score}
        durationSec={stage.durationSec}
        timedOut={stage.timedOut}
        onRetrySave={stage.saveFailed ? () => void retrySave() : null}
        saving={busy}
        note={pickNote(NOTES, stage.score.passed ? 'mock_passed' : 'mock_done', stage.exam.sessionId)}
        onNewExam={() => {
          setMessage(null)
          setStage({ name: 'setup' })
          window.scrollTo({ top: 0 })
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
      <MockSetup
        // key: a different subject or book in the address starts the setup fresh
        key={`${initialSubjectId}-${book?.id ?? ''}`}
        onStart={(f, n, label) => void start(f, n, label)}
        starting={busy}
        saved={saved}
        onResume={() => void resume()}
        onDiscard={discard}
        initialSubjectId={initialSubjectId}
        book={book}
        onLeaveBook={() => setSearchParams({})}
      />
    </div>
  )
}
