import { ChevronLeft, ChevronRight, Flag, LayoutGrid, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

/** The clock, red in the last 5 minutes. */
function Clock({ left, className }: { left: number; className?: string }) {
  const low = left <= LOW_TIME_SEC
  return (
    <p className={cn('flex items-center gap-1.5 font-heading font-bold tabular-nums', low && 'text-wrong', className)} aria-live="off">
      <Timer className={cn('size-[1.1em]', low && 'animate-pulse')} aria-hidden />
      {formatClock(left)}
      <span className="sr-only"> left</span>
    </p>
  )
}

/**
 * The item grid: one square per item. Filled = answered, gold corner = flagged, ring = the one on screen.
 * Tap a square to jump to that item.
 */
function Navigator({ exam, onJump }: { exam: SavedMock; onJump: (index: number) => void }) {
  const answered = exam.answers.filter((a) => a !== null).length
  const flagged = exam.flags.filter(Boolean).length
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-bold text-foreground tabular-nums">{answered}</span> answered ·{' '}
        <span className="font-bold text-foreground tabular-nums">{exam.answers.length - answered}</span> blank ·{' '}
        <span className="font-bold text-foreground tabular-nums">{flagged}</span> flagged
      </p>
      <ol className="grid grid-cols-10 gap-1" aria-label="Items">
        {exam.answers.map((answer, i) => {
          const isCurrent = i === exam.current
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Item ${i + 1}${answer !== null ? ', answered' : ', blank'}${exam.flags[i] ? ', flagged' : ''}`}
                className={cn(
                  'relative flex aspect-square w-full items-center justify-center rounded-[5px] text-[11px] font-bold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  answer !== null ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-primary/15',
                  isCurrent && 'ring-2 ring-foreground ring-offset-1',
                )}
              >
                {i + 1}
                {exam.flags[i] && <span className="absolute top-0 right-0 size-2 rounded-tr-[5px] rounded-bl-[3px] bg-highlight" aria-hidden />}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function MockRunner({ exam, questions, onChange, onSubmit, onLeave }: Props) {
  const subjectOf = useSubjectOfTopic()
  const [now, setNow] = useState(() => Date.now())
  const [confirm, setConfirm] = useState<'none' | 'leave' | 'submit'>('none')
  const [itemsOpen, setItemsOpen] = useState(false)

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
  const blanks = exam.answers.filter((a) => a === null).length
  const flagged = exam.flags.filter(Boolean).length

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
    setItemsOpen(false)
    window.scrollTo({ top: 0 })
  }
  function submitNow() {
    if (submitted.current) return
    submitted.current = true
    setConfirm('none')
    onSubmit(exam, false)
  }

  // Keyboard on a computer: A–D picks, ← → moves, F flags.
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
      const position = LETTERS.indexOf(event.key.toUpperCase())
      if (position !== -1 && position < k.order.length) k.choose(k.order[position])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    // Laptops: the item on the left, the clock + item grid + Submit on the right.
    // Phones and tablets: one column; the item grid opens from the "Items" button.
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-8">
      <div className="min-w-0 space-y-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setConfirm('leave')}
            className="-ml-2 flex h-10 items-center gap-1 rounded-md px-2 font-semibold text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <X className="size-4" aria-hidden />
            Exit
          </button>
          <p className="font-heading font-semibold text-muted-foreground tabular-nums">
            Item <span className="text-foreground">{i + 1}</span> of {questions.length}
          </p>
          <div className="flex items-center gap-2 lg:hidden">
            <Clock left={left} className="text-base" />
            <button
              type="button"
              onClick={() => setItemsOpen(true)}
              aria-haspopup="dialog"
              aria-label="All items"
              className="flex size-10 items-center justify-center rounded-md border bg-card outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <LayoutGrid className="size-4.5" aria-hidden />
            </button>
          </div>
          <span className="hidden w-16 lg:block" aria-hidden />
        </div>

        {/* key: remount per item so it gets a fresh entrance */}
        <article key={i} className="animate-in fade-in space-y-2 duration-200">
          <p className="text-sm text-muted-foreground">
            <span className="font-heading font-bold text-primary">{subject.code ?? '—'}</span>
            {subject.topicName && <> {subject.topicName}</>}
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
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg font-heading text-sm font-bold transition-colors',
                    isSelected ? 'bg-primary text-white' : 'bg-secondary text-foreground',
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
            <Button className="ml-auto h-12 flex-1 rounded-xl font-heading text-base font-bold sm:flex-none sm:px-6" onClick={() => setConfirm('submit')}>
              Review & submit
            </Button>
          ) : (
            <Button className="ml-auto h-12 flex-1 rounded-xl font-heading text-base font-bold sm:flex-none sm:px-6" onClick={() => go(i + 1)}>
              Next
              <ChevronRight className="size-5" aria-hidden />
            </Button>
          )}
        </div>
        <p className="hidden text-center text-xs text-muted-foreground md:block">A–D to answer · ← → to move · F to flag. You can change answers until you submit.</p>
      </div>

      {/* ---------- Laptop side panel ---------- */}
      <aside className="hidden space-y-5 self-start rounded-2xl border bg-card p-4 lg:sticky lg:top-6 lg:block" aria-label="Exam">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Time left</p>
          <Clock left={left} className="text-3xl" />
        </div>
        <Navigator exam={exam} onJump={go} />
        <Button className="h-11 w-full rounded-lg font-heading font-bold" onClick={() => setConfirm('submit')}>
          Submit exam
        </Button>
      </aside>

      {/* ---------- Phones and tablets: the item grid in a sheet ---------- */}
      <Dialog open={itemsOpen} onClose={() => setItemsOpen(false)} labelledBy="items-heading" variant="sheet">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="items-heading" className="font-heading text-lg font-bold">
              All items
            </h2>
            <Clock left={left} />
          </div>
          <Navigator exam={exam} onJump={go} />
          <Button
            className="h-11 w-full rounded-lg font-heading font-bold"
            onClick={() => {
              setItemsOpen(false)
              setConfirm('submit')
            }}
          >
            Submit exam
          </Button>
        </div>
      </Dialog>

      <Dialog open={confirm === 'submit'} onClose={() => setConfirm('none')} labelledBy="submit-heading">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 id="submit-heading" className="text-xl font-bold">
              Submit your exam?
            </h2>
            <p className="text-muted-foreground">
              {blanks > 0 ? (
                <>
                  <span className="font-bold text-wrong">{blanks} blank</span> {blanks === 1 ? 'item counts' : 'items count'} as wrong.{' '}
                </>
              ) : (
                'Every item has an answer. '
              )}
              {flagged > 0 && <>You flagged {flagged} to check again. </>}
              You can’t change answers after this.
            </p>
          </div>
          {/* "Keep answering" first, so the dialog focuses the safe choice. */}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="h-11 rounded-lg text-base sm:order-1" onClick={() => setConfirm('none')}>
              Keep answering
            </Button>
            <Button className="h-11 rounded-lg text-base font-bold sm:order-2" onClick={submitNow}>
              Submit
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={confirm === 'leave'} onClose={() => setConfirm('none')} labelledBy="leave-heading">
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 id="leave-heading" className="text-xl font-bold">
              Leave for now?
            </h2>
            <p className="text-muted-foreground">Your answers are saved on this device, and you can resume from the Mock exam page. The timer keeps running, like the real exam.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-11 rounded-lg text-base font-bold sm:order-2" onClick={() => setConfirm('none')}>
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
