import { Check, CloudOff, Flag, Flame } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ChoiceList } from '@/components/ChoiceList'
import { keyToPosition } from '@/lib/choiceKeys'
import { Dialog } from '@/components/Dialog'
import { SampleRun, type SampleState } from '@/components/report'
import { Slime } from '@/components/Slime'
import { Button } from '@/components/ui/button'
import { ExitButton } from '@/components/ExitButton'
import { shuffledChoiceOrder } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { fixedCount, MAX_TRIES, requeueMissed } from '@/lib/retryQueue'
import { cn } from '@/lib/utils'
import { setQuestionStatus, useRefreshBank } from '@/features/questions/api'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { queueAnswer, type QuizQuestion } from './api'

export type AnswerResult = { question: QuizQuestion; selectedIndex: number; isCorrect: boolean }

type Props = {
  sessionId: string
  questions: QuizQuestion[]
  onFinish: (answers: AnswerResult[]) => void
  /** She chose to leave before the end. */
  onExit: (answers: AnswerResult[]) => void
  /**
   * "Fix until right" (past mistakes in Today's plan): a question she misses comes back a couple of questions later,
   * up to MAX_TRIES times. Only the first try is saved as her answer, so a retry right after reading why
   * doesn't make her scores look better than they are. `answers` then has one entry per try.
   */
  retryMissed?: boolean
}

/** One item in the quiz: which question (index into `questions`), with its choices in their shuffled order. */
type Item = { q: number; order: number[] }

// Rotated so a correct answer doesn't always get the same words.
const PRAISE = ['Correct! Nice work.', 'Correct! Keep it up.', 'Correct! You got this.', 'Correct! Spot on.', 'Correct! Future RMT right there.']
const ENCOURAGE = ['Not quite, and that’s okay.', 'Not quite. Now you know.', 'Not quite. We’ll come back to this one.']

/**
 * Under a wrong answer: when it comes back. A normal quiz: in Review again. Fix until right: a couple of
 * questions later (`comesBackAt` = its next position, -1 = not put back), or tomorrow after the last try.
 */
function comesBackLine(retryMissed: boolean, comesBackAt: number, current: number, tries: number): string {
  if (!retryMissed) return 'It comes back in Review again.'
  if (tries >= MAX_TRIES || comesBackAt === -1) return 'That was the last try for today. It comes back tomorrow.'
  const n = comesBackAt - current - 1
  return n === 0 ? 'Read why below. It comes back next.' : `Read why below. It comes back after ${n} more ${n === 1 ? 'question' : 'questions'}.`
}

/** How many answers in a row (counting back from the latest) were correct. */
function currentStreak(answers: AnswerResult[]) {
  let streak = 0
  for (let i = answers.length - 1; i >= 0 && answers[i].isCorrect; i--) streak++
  return streak
}

export function QuizRunner({ sessionId, questions, onFinish, onExit, retryMissed = false }: Props) {
  const [confirmExit, setConfirmExit] = useState(false)
  const subjectOf = useSubjectOfTopic()
  const refreshBank = useRefreshBank()
  // The quiz in order, each question's choices shuffled once when the quiz starts (order[displayPosition] = original index).
  // With retryMissed, a missed question is put back in later as a new item (its choices shuffled again).
  const [items, setItems] = useState<Item[]>(() => questions.map((q, i) => ({ q: i, order: shuffledChoiceOrder(q.choices.length) })))
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<AnswerResult[]>([])
  const online = useOnline()
  // Questions she flagged as wrong or unclear in this quiz ("Report a problem"); 'error' = couldn't save the flag.
  const [reported, setReported] = useState<Record<string, 'saving' | 'done' | 'error'>>({})
  // When the current question appeared on screen (for time_ms).
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = Date.now()
  }, [current])

  const item = items[current]
  const question = questions[item.q]
  const order = item.order
  const answer = answers[current] as AnswerResult | undefined
  const isLast = current === items.length - 1
  const subject = subjectOf(question.topic_id)
  // Fix until right: tries of this question before this one, and how soon it comes back (null = it doesn't).
  const earlierTries = items.slice(0, current).filter((it) => it.q === item.q).length
  const comesBackAt = items.findIndex((it, i) => i > current && it.q === item.q)
  const fixed = fixedCount(answers)

  /** Marks the question as "needs a look" (shown as Reported on the Questions page), to fix later. */
  function report(id: string) {
    setReported((r) => ({ ...r, [id]: 'saving' }))
    // On a built-in question the flag is saved for her account only (migration 0009).
    const builtin = questions.find((q) => q.id === id)?.source === 'builtin'
    setQuestionStatus(id, 'unverified', builtin)
      .then(() => {
        setReported((r) => ({ ...r, [id]: 'done' }))
        refreshBank() // so the Questions page shows it as Reported
      })
      .catch(() => setReported((r) => ({ ...r, [id]: 'error' })))
  }

  function choose(originalIndex: number) {
    if (answer) return // already answered
    const result: AnswerResult = {
      question,
      selectedIndex: originalIndex,
      isCorrect: originalIndex === question.correct_index,
    }
    setAnswers((prev) => [...prev, result])

    // Fix until right: missed (and tries left) = it comes back a couple of questions later.
    if (retryMissed && !result.isCorrect) {
      setItems((prev) => requeueMissed(prev, current, earlierTries + 1, (it) => ({ q: it.q, order: shuffledChoiceOrder(question.choices.length) })))
    }

    // Saved on the device right away, then sent in the background (waits there while offline).
    // A retry isn't saved: only her first try counts toward her scores.
    if (earlierTries > 0) return
    queueAnswer({
      sessionId,
      questionId: question.id,
      selectedIndex: originalIndex,
      isCorrect: result.isCorrect,
      timeMs: Date.now() - shownAt.current,
    })
  }

  function next() {
    if (isLast) {
      onFinish(answers)
      return
    }
    setCurrent((c) => c + 1)
    window.scrollTo({ top: 0 })
  }

  // Keyboard shortcuts on a computer: A–D or 1–4 picks a choice.
  // (Enter already works for "Next" because that button gets focus.)
  // The listener reads choose() through a ref so it always sees the current question.
  const chooseRef = useRef(choose)
  useEffect(() => {
    chooseRef.current = choose
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (document.querySelector('dialog[open]')) return // the exit dialog is showing
      const position = keyToPosition(event.key)
      if (position === -1 || position >= order.length) return
      chooseRef.current(order[position])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [order])

  const samples = items.map((_, i): SampleState =>
    answers[i] ? (answers[i].isCorrect ? 'correct' : 'wrong') : i === current ? 'current' : 'pending',
  )
  const streak = currentStreak(answers)

  function askToExit() {
    // Nothing answered yet means nothing to lose, so skip the question.
    if (answers.length === 0) onExit(answers)
    else setConfirmExit(true)
  }

  return (
    // One centered column on every screen size: the question is the only thing to look at.
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-sm tabular-nums">
          <ExitButton onClick={askToExit} />
          <p className="font-heading font-semibold text-muted-foreground">
            {retryMissed ? (
              <>
                Fixed <span className="text-foreground">{fixed}</span> of {questions.length}
              </>
            ) : (
              <>
                <span className="text-foreground">{current + 1}</span> of {questions.length}
              </>
            )}
          </p>
          {/* Only shows up when there is a streak worth celebrating. */}
          <span className="flex min-w-16 justify-end">
            {streak >= 3 && (
              <span className="flex items-center gap-1 rounded-full border-2 border-ink bg-highlight-soft px-2.5 py-0.5 font-heading font-bold">
                <Flame className="size-4 text-highlight" aria-hidden />
                {streak}
                <span className="sr-only"> correct in a row</span>
              </span>
            )}
          </span>
        </div>
        <SampleRun samples={samples} />
      </div>

      {/* key={current} remounts the question per item so it gets a fresh entrance. */}
      <article key={current} className="animate-in fade-in space-y-2 duration-200">
        <p className="text-sm text-muted-foreground">
          <span className="mr-1 rounded-md border-2 border-ink bg-card px-1.5 font-heading text-xs font-bold text-foreground">{subject.code ?? '—'}</span>
          {subject.topicName && <> {subject.topicName}</>}
          {question.source !== 'builtin' && <span className="ml-2 rounded-md border-[1.5px] border-ink/40 bg-secondary px-1.5 text-xs font-semibold text-foreground">Mine</span>}
        </p>
        <p className="text-xl leading-snug font-bold sm:text-2xl">{question.stem}</p>
      </article>

      <div className="space-y-2">
        <ChoiceList
          choices={question.choices}
          correctIndex={question.correct_index}
          choiceNotes={question.choice_notes}
          order={order}
          selectedIndex={answer?.selectedIndex}
          onChoose={choose}
          keyPrefix={current}
        />
        {!answer && (
          <p className="hidden pt-1 text-center text-xs text-muted-foreground md:block">Press A–D to answer, then Enter for the next item.</p>
        )}
      </div>

      {answer && (
        <div
          role="status"
          className={cn(
            'animate-in fade-in slide-in-from-bottom-1 rounded-2xl border-[2.5px] border-ink px-4 py-3.5 duration-200',
            answer.isCorrect ? 'bg-correct-soft' : 'bg-wrong-soft',
          )}
        >
          {/* The slime reacts: cheering when she's right, a kind "oops" when she's not. */}
          <div className="flex items-center gap-3">
            <Slime mood={answer.isCorrect ? 'cheer' : 'oops'} className="w-16 sm:w-18" />
            <div className="min-w-0">
              <p className={cn('font-heading text-lg font-bold', answer.isCorrect ? 'text-correct' : 'text-wrong')}>
                {answer.isCorrect
                  ? retryMissed && earlierTries > 0
                    ? 'Fixed! Now you know this one.'
                    : PRAISE[current % PRAISE.length]
                  : ENCOURAGE[current % ENCOURAGE.length]}
              </p>
              {!answer.isCorrect && <p className="text-sm text-muted-foreground">{comesBackLine(retryMissed, comesBackAt, current, earlierTries + 1)}</p>}
            </div>
          </div>
          {question.explanation && <p className="mt-2 leading-relaxed">{question.explanation}</p>}
          {/* If something looks wrong (answer, explanation, wording), one tap flags it to fix later. Quiet on purpose. */}
          <div className="mt-2.5 flex justify-end">
            {reported[question.id] === 'done' ? (
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Check className="size-3.5" aria-hidden />
                Reported. Fix it later in Questions.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => report(question.id)}
                disabled={reported[question.id] === 'saving'}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground outline-none hover:bg-black/5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
              >
                <Flag className="size-3.5" aria-hidden />
                {reported[question.id] === 'error' ? 'Couldn’t save. Try again' : 'Report a problem'}
              </button>
            )}
          </div>
        </div>
      )}

      {!online && (
        <p role="status" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Offline. Your answers are saved on this device and sync when you’re back online.
        </p>
      )}

      {answer && (
        <Button className="h-13 w-full rounded-2xl border-[2.5px] font-heading text-lg font-semibold shadow-toon active:not-aria-[haspopup]:translate-y-1" onClick={next} autoFocus>
          {isLast ? 'See results' : 'Next item'}
        </Button>
      )}

      <Dialog open={confirmExit} onClose={() => setConfirmExit(false)} labelledBy="exit-heading">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 id="exit-heading" className="text-xl font-bold">
              Leave this quiz?
            </h2>
            <p className="text-muted-foreground">
              Your {answers.length} {answers.length === 1 ? 'answer' : 'answers'} so far are saved and count toward your progress.
            </p>
          </div>
          {/* "Keep going" comes first so the dialog focuses the safe choice. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-11 rounded-lg text-base font-bold sm:order-2" onClick={() => setConfirmExit(false)}>
              Keep going
            </Button>
            <Button variant="outline" className="h-11 rounded-lg text-base sm:order-1" onClick={() => onExit(answers)}>
              Leave quiz
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
