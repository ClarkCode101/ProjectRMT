import { Check, CloudOff, Flag, Flame, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { SampleRun, type SampleState } from '@/components/report'
import { Button } from '@/components/ui/button'
import { ExitButton } from '@/components/ExitButton'
import { shuffledChoiceOrder } from '@/lib/quiz'
import { useSubjectOfTopic } from '@/lib/referenceData'
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
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// Rotated so a correct answer doesn't always get the same words.
const PRAISE = ['Correct! Nice work.', 'Correct! Keep it up.', 'Correct! You got this.', 'Correct! Spot on.', 'Correct! Future RMT right there.']
const ENCOURAGE = ['Not quite, and that’s okay.', 'Not quite. Now you know.', 'Not quite. We’ll come back to this one.']

/** How many answers in a row (counting back from the latest) were correct. */
function currentStreak(answers: AnswerResult[]) {
  let streak = 0
  for (let i = answers.length - 1; i >= 0 && answers[i].isCorrect; i--) streak++
  return streak
}

/** Which display position a key picks: A–F or 1–6. Returns -1 for any other key. */
function keyToPosition(key: string) {
  const letter = LETTERS.indexOf(key.toUpperCase())
  if (letter !== -1) return letter
  const digit = Number(key)
  return Number.isInteger(digit) && digit >= 1 && digit <= LETTERS.length ? digit - 1 : -1
}

export function QuizRunner({ sessionId, questions, onFinish, onExit }: Props) {
  const [confirmExit, setConfirmExit] = useState(false)
  const subjectOf = useSubjectOfTopic()
  const refreshBank = useRefreshBank()
  // Shuffle each question's choices once, when the quiz starts.
  // choiceOrders[q][displayPosition] = original choice index.
  const [choiceOrders] = useState(() => questions.map((q) => shuffledChoiceOrder(q.choices.length)))
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

  const question = questions[current]
  const order = choiceOrders[current]
  const answer = answers[current] as AnswerResult | undefined
  const isLast = current === questions.length - 1
  const subject = subjectOf(question.topic_id)

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

    // Saved on the device right away, then sent in the background (waits there while offline).
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

  const samples = questions.map((_, i): SampleState =>
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
            <span className="text-foreground">{current + 1}</span> of {questions.length}
          </p>
          {/* Only shows up when there is a streak worth celebrating. */}
          <span className="flex min-w-16 justify-end">
            {streak >= 3 && (
              <span className="flex items-center gap-1 rounded-full bg-highlight-soft px-2.5 py-0.5 font-bold">
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
          <span className="font-heading font-bold text-primary">{subject.code ?? '—'}</span>
          {subject.topicName && <> {subject.topicName}</>}
          {question.source !== 'builtin' && <span className="ml-2 rounded-[4px] bg-secondary px-1.5 text-xs font-semibold text-foreground">Mine</span>}
        </p>
        <p className="text-xl leading-snug font-bold sm:text-2xl">{question.stem}</p>
      </article>

      <div className="space-y-2" role="group" aria-label="Choices">
        {order.map((originalIndex, displayPos) => {
          const isCorrectChoice = originalIndex === question.correct_index
          const isSelected = answer?.selectedIndex === originalIndex
          const showCorrect = answer && isCorrectChoice
          const showWrong = answer && isSelected && !isCorrectChoice
          // The other two choices: quieter, but their text stays readable (it may carry a note to learn from).
          const isOther = answer && !isSelected && !isCorrectChoice
          // Shown only after she answers, right under its own choice (so the "why" sits next to the "what").
          const note = answer ? question.choice_notes?.[originalIndex] : undefined
          return (
            <button
              key={`${current}-${originalIndex}`}
              type="button"
              disabled={Boolean(answer)}
              onClick={() => choose(originalIndex)}
              aria-keyshortcuts={LETTERS[displayPos]}
              className={cn(
                'group flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                note && 'items-start',
                !answer && 'hover:border-primary active:bg-secondary',
                showCorrect && 'border-correct bg-correct-soft ring-1 ring-correct',
                showWrong && 'border-wrong bg-wrong-soft ring-1 ring-wrong',
                isOther && 'border-border/60 bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg font-heading text-sm font-bold transition-colors',
                  showCorrect
                    ? 'bg-correct text-white'
                    : showWrong
                      ? 'bg-wrong text-white'
                      : isOther
                        ? 'bg-secondary text-muted-foreground'
                        : 'bg-secondary text-foreground group-hover:bg-primary group-hover:text-primary-foreground group-disabled:group-hover:bg-secondary group-disabled:group-hover:text-foreground',
                )}
              >
                {showCorrect ? <Check className="size-4" aria-label="Correct answer" /> : showWrong ? <X className="size-4" aria-label="Your answer, incorrect" /> : LETTERS[displayPos]}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block', note && 'pt-1', isOther && 'text-muted-foreground')}>{question.choices[originalIndex]}</span>
                {note && (
                  <span className={cn('mt-1 block text-sm leading-snug', isOther ? 'text-muted-foreground' : 'text-foreground/85')}>{note}</span>
                )}
              </span>
              {(showCorrect || showWrong) && (
                <span
                  aria-hidden // the icon's label already says this to screen readers
                  className={cn(
                    'shrink-0',
                    note && 'pt-1.5',
                    'font-heading text-[11px] font-bold tracking-wide uppercase',
                    showCorrect ? 'text-correct' : 'text-wrong',
                  )}
                >
                  {showCorrect ? (isSelected ? 'Your answer' : 'Correct') : 'Your answer'}
                </span>
              )}
            </button>
          )
        })}
        {!answer && (
          <p className="hidden pt-1 text-center text-xs text-muted-foreground md:block">Press A–D to answer, then Enter for the next item.</p>
        )}
      </div>

      {answer && (
        <div
          role="status"
          className={cn(
            'animate-in fade-in slide-in-from-bottom-1 rounded-xl px-4 py-3.5 duration-200',
            answer.isCorrect ? 'bg-correct-soft' : 'bg-wrong-soft',
          )}
        >
          <p className={cn('font-heading text-lg font-bold', answer.isCorrect ? 'text-correct' : 'text-wrong')}>
            {answer.isCorrect ? PRAISE[current % PRAISE.length] : ENCOURAGE[current % ENCOURAGE.length]}
          </p>
          {!answer.isCorrect && <p className="text-sm text-muted-foreground">It comes back in Review again.</p>}
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
        <Button className="h-13 w-full rounded-xl font-heading text-lg font-bold" onClick={next} autoFocus>
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
