import { Check, ChevronLeft, ChevronRight, CircleDashed, Flag, ListChecks, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui/button'
import type { QuizQuestion } from '@/features/quiz/api'
import { formatClock, LOW_TIME_SEC, secondsLeft, type SavedMock } from '@/lib/mockExam'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

type Props = {
  exam: SavedMock
  questions: QuizQuestion[]
  /** Called on every change, so the exam can be saved on this device. */
  onChange: (exam: SavedMock) => void
  onSubmit: (exam: SavedMock, timedOut: boolean) => void
  /** She leaves for now; the exam stays saved and the timer keeps running. */
  onLeave: () => void
}

// The exam screen, drawn as the analyzer "running" (it follows the analyzer on the setup screen):
// - a dark run bar on top (status light, subject, item number, the clock, progress), always in view
// - below it, only the item on screen
// - a Review sheet (from the run bar, the R key, or "Review & submit" on the last item) that lists just
//   the flagged and blank items to jump back to, and is also where she submits
// The run bar and the item share one column width, so their edges line up.

// Status light color on the dark bar (same as the setup display): brighter than the brand green so it looks lit.
const LED_ON = 'bg-[#5EE39A]'

/** The clock in the run bar. The whole bar turns red in the last 5 minutes. */
function Clock({ left, className }: { left: number; className?: string }) {
  return (
    <p className={cn('flex items-center gap-1.5 font-mono font-bold tabular-nums', className)} aria-live="off">
      <Timer className="size-[0.9em] opacity-70" aria-hidden />
      {formatClock(left)}
      <span className="sr-only"> left</span>
    </p>
  )
}

/** One group in the Review sheet: a heading and the item numbers to jump to. */
function ItemGroup({
  icon,
  title,
  items,
  kind,
  current,
  onJump,
}: {
  icon: ReactNode
  title: string
  /** item indexes (0-based) */
  items: number[]
  kind: 'flagged' | 'blank'
  current: number
  onJump: (index: number) => void
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        {icon}
        {title} <span className="font-normal text-muted-foreground tabular-nums">({items.length})</span>
      </h3>
      {/* Long lists (e.g. many blanks on a 100-item exam) scroll inside, so the buttons below stay in view. */}
      <ul className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto p-0.5" aria-label={title}>
        {items.map((index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => onJump(index)}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Go to item ${index + 1}`}
              className={cn(
                'flex h-10 min-w-10 items-center justify-center rounded-full border-2 px-2 font-mono text-sm font-bold tabular-nums outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/40',
                kind === 'flagged' ? 'border-highlight bg-highlight-soft' : 'border-transparent bg-secondary shadow-[inset_0_2px_3px_rgb(7_71_94/0.18)]',
                index === current && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
              )}
            >
              {index + 1}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function MockRunner({ exam, questions, onChange, onSubmit, onLeave }: Props) {
  const subjectOf = useSubjectOfTopic()
  const [now, setNow] = useState(() => Date.now())
  const [open, setOpen] = useState<'none' | 'leave' | 'review'>('none')

  // Tick once a second. The time left is always worked out from when the exam started,
  // so it stays right even if the tab was asleep.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const left = secondsLeft(exam, now)

  // Time's up: submit once, by itself.
  const submitted = useRef(false)
  useEffect(() => {
    if (left === 0 && !submitted.current) {
      submitted.current = true
      onSubmit(exam, true)
    }
  }, [left, exam, onSubmit])

  const i = exam.current
  const question = questions[i]
  const order = exam.orders[i]
  const selected = exam.answers[i]
  const subject = subjectOf(question.topic_id)
  const isLast = i === questions.length - 1
  const flaggedItems = exam.flags.flatMap((f, index) => (f ? [index] : []))
  const blankItems = exam.answers.flatMap((a, index) => (a === null ? [index] : []))
  const answered = questions.length - blankItems.length
  const low = left <= LOW_TIME_SEC

  function update(change: Partial<SavedMock>) {
    onChange({ ...exam, ...change })
  }
  function choose(originalIndex: number) {
    const answers = [...exam.answers]
    answers[i] = originalIndex
    update({ answers })
  }
  function toggleFlag() {
    const flags = [...exam.flags]
    flags[i] = !flags[i]
    update({ flags })
  }
  function go(index: number) {
    if (index < 0 || index >= questions.length) return
    update({ current: index })
    setOpen('none')
    window.scrollTo({ top: 0 })
  }
  function submitNow() {
    if (submitted.current) return
    submitted.current = true
    setOpen('none')
    onSubmit(exam, false)
  }

  // Keyboard on a computer: A–D picks, ← → moves, F flags, R opens Review.
  // The listener reads the latest handlers through a ref, so it always acts on the item on screen.
  const keys = useRef({ choose, go, toggleFlag, order, i })
  useEffect(() => {
    keys.current = { choose, go, toggleFlag, order, i }
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (document.querySelector('dialog[open]')) return
      const k = keys.current
      if (event.key === 'ArrowRight') return k.go(k.i + 1)
      if (event.key === 'ArrowLeft') return k.go(k.i - 1)
      if (event.key.toLowerCase() === 'f') return k.toggleFlag()
      if (event.key.toLowerCase() === 'r') return setOpen('review')
      const position = LETTERS.indexOf(event.key.toUpperCase())
      if (position !== -1 && position < k.order.length) k.choose(k.order[position])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    // One column for everything (run bar + item), narrow enough for comfortable reading lines.
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ---------- The run bar: always in view (sticky), the one dark area on this screen ----------
          Last 5 minutes: the whole bar turns red and the light blinks, a stronger warning than a red number. */}
      <header
        className={cn(
          'sticky top-[calc(0.5rem+env(safe-area-inset-top))] z-20 space-y-2.5 rounded-2xl px-3 pt-2.5 pb-3 text-white shadow-[0_16px_32px_-20px_rgb(7_71_94/0.8)] transition-colors duration-500 sm:px-4',
          low ? 'bg-wrong' : 'bg-primary-deep',
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setOpen('leave')}
            className="-ml-1 flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-white/75 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-white/60"
          >
            <X className="size-4" aria-hidden />
            Exit
          </button>
          <p className="flex min-w-0 flex-1 items-center gap-2 text-xs font-bold tracking-widest uppercase">
            <span className={cn('size-2.5 shrink-0 rounded-full shadow-[0_0_10px_2px_rgb(255_255_255/0.25)] ring-2 ring-white/20', low ? 'led-blink bg-white' : LED_ON)} aria-hidden />
            <span className="truncate">
              {low ? 'Low time' : 'Running'}
              <span className="hidden font-semibold text-white/70 md:inline"> · {exam.label}</span>
            </span>
          </p>
          <p className="hidden font-mono text-sm font-bold text-white/80 tabular-nums sm:block">
            Item <span className="text-white">{i + 1}</span>/{questions.length}
          </p>
          <Clock left={left} className="text-xl sm:text-2xl" />
          {/* Review opens only when she asks (also with R), so nothing sits beside the question while she reads.
              The gold badge says there are flagged items to come back to, without opening it. */}
          <button
            type="button"
            onClick={() => setOpen('review')}
            aria-haspopup="dialog"
            aria-keyshortcuts="R"
            aria-label={`Review${flaggedItems.length > 0 ? `, ${flaggedItems.length} flagged` : ''}`}
            className="relative flex h-10 shrink-0 items-center gap-2 rounded-lg bg-white/10 px-2.5 text-sm font-semibold outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/60 sm:px-3"
          >
            <ListChecks className="size-4.5" aria-hidden />
            <span className="hidden sm:inline">Review</span>
            {flaggedItems.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-highlight px-1 text-xs font-bold text-foreground tabular-nums" aria-hidden>
                {flaggedItems.length}
              </span>
            )}
          </button>
        </div>
        {/* progress: how many items have an answer */}
        <div className="flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-label="Answered"
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-valuenow={answered}
          >
            <div className="h-full rounded-full bg-highlight transition-[width] duration-300" style={{ width: `${(answered / questions.length) * 100}%` }} />
          </div>
          <p className="shrink-0 text-xs text-white/75 tabular-nums">
            <span className="font-bold text-white">{answered}</span> of {questions.length} answered
          </p>
        </div>
      </header>

      {/* ---------- The item on screen ---------- */}
      <div className="space-y-5">
        {/* key: remount per item so it gets a fresh entrance */}
        <article key={i} className="animate-in fade-in space-y-2 duration-200">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono font-bold text-foreground tabular-nums sm:hidden">Item {i + 1} · </span>
            <span className="font-heading font-bold text-primary">{subject.code ?? '—'}</span>
            {subject.topicName && <> · {subject.topicName}</>}
          </p>
          <p className="text-xl leading-snug font-bold sm:text-2xl">{question.stem}</p>
        </article>

        {/* No right/wrong colors in a mock exam: just which one she picked. She can change it until she submits. */}
        <div className="space-y-2" role="radiogroup" aria-label="Choices">
          {order.map((originalIndex, displayPos) => {
            const isSelected = selected === originalIndex
            return (
              <button
                key={`${i}-${originalIndex}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => choose(originalIndex)}
                aria-keyshortcuts={LETTERS[displayPos]}
                className={cn(
                  'group flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                  isSelected ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-primary/60',
                )}
              >
                {/* A keycap, so it's clear the letter key picks this choice. */}
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md border border-b-[3px] font-mono text-sm font-bold transition-colors',
                    isSelected ? 'border-primary-deep bg-primary text-white' : 'border-border bg-card text-foreground group-hover:border-primary/50',
                  )}
                >
                  {LETTERS[displayPos]}
                </span>
                <span className="flex-1">{question.choices[originalIndex]}</span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-12 rounded-xl px-4" onClick={() => go(i - 1)} disabled={i === 0}>
            <ChevronLeft className="size-5" aria-hidden />
            <span className="hidden sm:inline">Previous</span>
            <span className="sr-only sm:hidden">Previous item</span>
          </Button>
          <Button
            variant="outline"
            className={cn('h-12 rounded-xl px-4', exam.flags[i] && 'border-highlight bg-highlight-soft hover:bg-highlight-soft')}
            onClick={toggleFlag}
            aria-pressed={exam.flags[i]}
          >
            <Flag className={cn('size-4.5', exam.flags[i] && 'fill-highlight text-[#9A5B00]')} aria-hidden />
            {exam.flags[i] ? 'Flagged' : 'Flag'}
          </Button>
          {isLast ? (
            <Button className="ml-auto h-12 flex-1 rounded-xl font-heading text-base font-bold sm:flex-none sm:px-6" onClick={() => setOpen('review')}>
              Review & submit
            </Button>
          ) : (
            <Button className="ml-auto h-12 flex-1 rounded-xl font-heading text-base font-bold sm:flex-none sm:px-6" onClick={() => go(i + 1)}>
              Next
              <ChevronRight className="size-5" aria-hidden />
            </Button>
          )}
        </div>
        <p className="hidden text-center text-xs text-muted-foreground md:block">
          Keys: A–D answer · ← → move · F flag · R review. Answers can change until you submit.
        </p>
      </div>

      {/* ---------- Review: only the items worth going back to, and Submit (the one place to submit, besides the last item) ---------- */}
      <Dialog open={open === 'review'} onClose={() => setOpen('none')} labelledBy="review-heading" variant="sheet">
        <div className="space-y-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="review-heading" className="font-heading text-xl font-bold">
              Review
            </h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              <span className="font-bold text-foreground">{answered}</span> of {questions.length} answered
            </p>
          </div>

          {flaggedItems.length === 0 && blankItems.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-correct-soft px-3.5 py-3 text-sm font-semibold text-correct">
              <Check className="size-4.5 shrink-0" aria-hidden />
              Every item has an answer, and nothing is flagged.
            </p>
          ) : (
            <div className="space-y-4">
              {flaggedItems.length > 0 && (
                <ItemGroup
                  icon={<Flag className="size-4 fill-highlight text-[#9A5B00]" aria-hidden />}
                  title="Flagged"
                  items={flaggedItems}
                  kind="flagged"
                  current={i}
                  onJump={go}
                />
              )}
              {blankItems.length > 0 && (
                <ItemGroup icon={<CircleDashed className="size-4 text-muted-foreground" aria-hidden />} title="Blank" items={blankItems} kind="blank" current={i} onJump={go} />
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {blankItems.length > 0 && (
              <>
                <span className="font-bold text-wrong">
                  {blankItems.length} blank {blankItems.length === 1 ? 'item counts' : 'items count'} as wrong.
                </span>{' '}
              </>
            )}
            You can’t change answers after you submit.
          </p>

          {/* "Keep answering" first, so the safe choice comes before Submit. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="h-11 rounded-lg text-base" onClick={() => setOpen('none')}>
              Keep answering
            </Button>
            <Button className="h-11 rounded-lg font-heading text-base font-bold" onClick={submitNow}>
              Submit exam
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={open === 'leave'} onClose={() => setOpen('none')} labelledBy="leave-heading">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 id="leave-heading" className="text-xl font-bold">
              Leave for now?
            </h2>
            <p className="text-muted-foreground">Your answers are saved on this device, and you can resume from the Mock exam page. The timer keeps running, like the real exam.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-11 rounded-lg text-base font-bold sm:order-2" onClick={() => setOpen('none')}>
              Keep going
            </Button>
            <Button variant="outline" className="h-11 rounded-lg text-base sm:order-1" onClick={onLeave}>
              Leave for now
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
