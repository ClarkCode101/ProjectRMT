import { Check, CloudOff, Microscope, X } from 'lucide-react'
import { ExitButton } from '@/components/ExitButton'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuizQuestion } from '@/features/quiz/api'
import { cardToRow, formatInterval, GRADES, LEARN_AHEAD_MS, makeScheduler, previewIntervals, Rating, review, rowToCard, State, type Card, type Grade, type ReviewRow } from '@/lib/fsrs'
import { flashcardAnswer } from '@/lib/flashcardAnswer'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { saveReview } from './api'

export type SessionStats = { reviewed: number; again: number; newStudied: number }

type Props = {
  /** today's deck: due cards first, then new ones */
  deck: QuizQuestion[]
  /** her saved progress for these cards (none = new card) */
  states: ReadonlyMap<string, ReviewRow>
  onNewStudied: () => void
  onDone: (stats: SessionStats) => void
  onExit: (stats: SessionStats) => void
  /** the longest a card may be put away, so nothing comes back after the board exam (see maxIntervalForExam) */
  maxIntervalDays?: number
}

// Quiet rating buttons: neutral, except Again (light red: it comes right back) and Good (the usual choice, light blue).
const GRADE_LOOK: Record<Grade, { label: string; key: string; className: string }> = {
  [Rating.Again]: { label: 'Again', key: '1', className: 'border-wrong/35 bg-card text-wrong hover:border-wrong hover:bg-wrong-soft' },
  [Rating.Hard]: { label: 'Hard', key: '2', className: 'border-border bg-card text-foreground hover:border-primary/50' },
  [Rating.Good]: { label: 'Good', key: '3', className: 'border-primary/40 bg-primary/[0.06] text-primary hover:border-primary' },
  [Rating.Easy]: { label: 'Easy', key: '4', className: 'border-border bg-card text-foreground hover:border-primary/50' },
}

/** The current time. Only called from click / key handlers and the first setup, never while drawing. */
const currentTime = () => new Date()

function stateGroup(card: Card | undefined) {
  if (!card || card.state === State.New) return 'new'
  return card.state === State.Review ? 'review' : 'learning'
}

export function FlashcardSession({ deck, states, onNewStudied, onDone, onExit, maxIntervalDays }: Props) {
  const subjectOf = useSubjectOfTopic()
  const scheduler = useMemo(() => makeScheduler(true, maxIntervalDays), [maxIntervalDays])
  const [queue, setQueue] = useState(deck)
  const [revealed, setRevealed] = useState(false)
  const online = useOnline()
  // The card each question is at right now (starts from what's saved, updates as she rates).
  const [cards, setCards] = useState(() => new Map(deck.map((q) => [q.id, rowToCard(states.get(q.id), currentTime())])))
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, again: 0, newStudied: 0 })
  // A fresh "now" each time a card is shown, for the interval labels under the buttons.
  const [shownAt, setShownAt] = useState(currentTime)

  const question = queue[0]
  const card = question ? cards.get(question.id) : undefined
  const intervals = card ? previewIntervals(card, shownAt, scheduler) : null
  const subject = question ? subjectOf(question.topic_id) : undefined

  function rate(grade: Grade) {
    if (!question || !card || !revealed) return
    const now = currentTime()
    const next = review(card, grade, now, scheduler)
    const wasNew = card.state === State.New

    // Saved on the device right away, then sent in the background (waits there while offline).
    saveReview(cardToRow(question.id, next))
    if (wasNew) onNewStudied()

    const newStats = { reviewed: stats.reviewed + 1, again: stats.again + (grade === Rating.Again ? 1 : 0), newStudied: stats.newStudied + (wasNew ? 1 : 0) }
    setStats(newStats)
    setCards((m) => new Map(m).set(question.id, next))

    // Coming back within ~20 minutes (e.g. after Again)? Show it again later in this session.
    const rest = queue.slice(1)
    const again = next.due.getTime() - now.getTime() <= LEARN_AHEAD_MS
    const nextQueue = again ? [...rest, question] : rest
    setQueue(nextQueue)
    setRevealed(false)
    setShownAt(currentTime())
    if (nextQueue.length === 0) onDone(newStats)
  }

  // Keyboard: Space / Enter shows the answer, 1–4 rates.
  const keys = useRef({ rate, revealed, reveal: () => setRevealed(true) })
  useEffect(() => {
    keys.current = { rate, revealed, reveal: () => setRevealed(true) }
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const k = keys.current
      if (!k.revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault()
        k.reveal()
        return
      }
      const grade = GRADES[Number(event.key) - 1]
      if (k.revealed && grade !== undefined) k.rate(grade)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!question || !card || !intervals) return null

  const done = stats.reviewed
  const progress = done / (done + queue.length)
  // "All of the above" spelled out as the choices it covers (flashcards don't show the choices)
  const answer = flashcardAnswer(question.choices, question.correct_index)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Exit, and simply how many are left (cards rated "Again" come back, so the count can go up again). */}
      <div className="flex items-center gap-3 text-sm">
        <ExitButton onClick={() => onExit(stats)} />
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label="Cards done"
          aria-valuemin={0}
          aria-valuemax={done + queue.length}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="shrink-0 font-semibold tabular-nums">
          {queue.length} <span className="font-normal text-muted-foreground">left</span>
        </p>
      </div>

      {/* ---------- The slide under the microscope ----------
          The answer is on the slide from the start but out of focus (blurred). "Focus" brings it into focus.
          key: each card mounts out of focus, so the next answer never shows sharp for a moment. */}
      <article
        key={`${question.id}-${stats.reviewed}`}
        className="animate-in fade-in overflow-hidden rounded-2xl border bg-card shadow-[0_18px_40px_-28px_rgb(7_71_94/0.55)] duration-200"
      >
        {/* the slide's frosted label end */}
        <p className="flex items-center gap-2 border-b border-primary/10 bg-secondary/70 px-5 py-2.5 text-sm text-muted-foreground sm:px-7">
          <span aria-hidden className="h-3.5 w-5 shrink-0 rounded-[3px] border border-primary/25 bg-card" />
          <span className="font-heading font-bold text-primary">{subject?.code ?? '—'}</span>
          {subject?.topicName && <span className="truncate">· {subject.topicName}</span>}
          {stateGroup(card) === 'new' && <span className="ml-auto shrink-0 rounded-[4px] bg-primary/10 px-1.5 text-xs font-bold text-primary">NEW</span>}
        </p>

        <div className="space-y-5 px-5 py-6 sm:px-7 sm:py-8">
          <p className="text-center text-xl leading-snug font-bold text-balance sm:text-2xl">{question.stem}</p>

          {/* the answer: blurred until focused (hidden from screen readers until then) */}
          <div className="relative">
            <div
              aria-hidden={!revealed}
              className={cn('space-y-3 transition-[filter,opacity] duration-500 ease-out', !revealed && 'pointer-events-none opacity-60 blur-[10px] select-none')}
            >
              <div className="rounded-xl bg-correct-soft px-4 py-3">
                <p className="text-xs font-bold tracking-wide text-correct uppercase">Answer</p>
                {answer.kind === 'plain' ? (
                  <p className="font-heading text-xl font-bold text-correct sm:text-2xl">{answer.text}</p>
                ) : (
                  // "All of the above" means nothing without the choices, so the card lists them
                  <>
                    <p className="font-heading text-xl font-bold text-correct sm:text-2xl">{answer.kind === 'all' ? 'All of these:' : 'None of these:'}</p>
                    <ul className="mt-2 space-y-1.5">
                      {answer.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-lg leading-snug font-semibold">
                          {answer.kind === 'all' ? (
                            <Check className="mt-1 size-4.5 shrink-0 text-correct" aria-hidden />
                          ) : (
                            <X className="mt-1 size-4.5 shrink-0 text-wrong" aria-hidden />
                          )}
                          <span className={cn(answer.kind === 'none' && 'text-muted-foreground')}>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              {question.explanation && <p className="leading-relaxed text-foreground/90">{question.explanation}</p>}
            </div>
            {!revealed && (
              <p className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-card/90 px-3 py-1 text-xs font-semibold text-muted-foreground shadow-sm">Out of focus. Think of the answer first.</span>
              </p>
            )}
          </div>
        </div>
      </article>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          autoFocus
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary font-heading text-lg font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Microscope className="size-5" aria-hidden />
          Focus
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-center text-sm font-semibold text-muted-foreground">How well did you know it?</p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Rate this card">
            {GRADES.map((g) => {
              const look = GRADE_LOOK[g]
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => rate(g)}
                  autoFocus={g === Rating.Good}
                  aria-keyshortcuts={look.key}
                  aria-label={`${look.label}, comes back in ${formatInterval(intervals[g])}`}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center rounded-xl border-2 font-heading outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
                    look.className,
                  )}
                >
                  <span className="text-base font-bold">{look.label}</span>
                  <span className="text-xs font-semibold opacity-80 tabular-nums">{formatInterval(intervals[g])}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <p className="hidden text-center text-xs text-muted-foreground md:block">Space to focus · 1–4 to rate</p>

      {!online && (
        <p role="status" className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Offline. Your ratings are saved on this device and sync when you’re back online.
        </p>
      )}
    </div>
  )
}
