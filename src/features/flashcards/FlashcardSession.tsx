import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { QuizQuestion } from '@/features/quiz/api'
import { cardToRow, formatInterval, GRADES, LEARN_AHEAD_MS, previewIntervals, Rating, review, rowToCard, State, type Card, type Grade, type ReviewRow } from '@/lib/fsrs'
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
}

const GRADE_LOOK: Record<Grade, { label: string; key: string; className: string }> = {
  [Rating.Again]: { label: 'Again', key: '1', className: 'border-wrong/40 bg-wrong-soft text-wrong hover:border-wrong' },
  [Rating.Hard]: { label: 'Hard', key: '2', className: 'border-highlight/60 bg-highlight-soft text-[#8A5200] hover:border-highlight' },
  [Rating.Good]: { label: 'Good', key: '3', className: 'border-primary/40 bg-primary/[0.08] text-primary hover:border-primary' },
  [Rating.Easy]: { label: 'Easy', key: '4', className: 'border-correct/40 bg-correct-soft text-correct hover:border-correct' },
}

/** The current time. Only called from click / key handlers and the first setup, never while drawing. */
const currentTime = () => new Date()

function stateGroup(card: Card | undefined) {
  if (!card || card.state === State.New) return 'new'
  return card.state === State.Review ? 'review' : 'learning'
}

export function FlashcardSession({ deck, states, onNewStudied, onDone, onExit }: Props) {
  const subjectOf = useSubjectOfTopic()
  const [queue, setQueue] = useState(deck)
  const [revealed, setRevealed] = useState(false)
  const [saveError, setSaveError] = useState(false)
  // The card each question is at right now (starts from what's saved, updates as she rates).
  const [cards, setCards] = useState(() => new Map(deck.map((q) => [q.id, rowToCard(states.get(q.id), currentTime())])))
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, again: 0, newStudied: 0 })
  // A fresh "now" each time a card is shown, for the interval labels under the buttons.
  const [shownAt, setShownAt] = useState(currentTime)

  const question = queue[0]
  const card = question ? cards.get(question.id) : undefined
  const intervals = card ? previewIntervals(card, shownAt) : null
  const subject = question ? subjectOf(question.topic_id) : undefined

  const left = { new: 0, learning: 0, review: 0 }
  for (const q of queue) left[stateGroup(cards.get(q.id))]++

  function rate(grade: Grade) {
    if (!question || !card || !revealed) return
    const now = currentTime()
    const next = review(card, grade, now)
    const wasNew = card.state === State.New

    saveReview(cardToRow(question.id, next)).catch(() => setSaveError(true))
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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={() => onExit(stats)}
          className="-ml-2 flex h-10 items-center gap-1 rounded-md px-2 font-semibold text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <X className="size-4" aria-hidden />
          Exit
        </button>
        {/* What's left, by kind (like Anki's three numbers). */}
        <p className="flex items-center gap-3 font-semibold tabular-nums" aria-label={`${left.new} new, ${left.learning} learning, ${left.review} review left`}>
          <span className="text-primary">{left.new} new</span>
          <span className="text-[#8A5200]">{left.learning} learning</span>
          <span className="text-correct">{left.review} review</span>
        </p>
      </div>

      {/* The card flips over to show the answer. key: each card mounts face-up, so the next answer never shows mid-flip. */}
      <div key={`${question.id}-${stats.reviewed}`} className="animate-in fade-in [perspective:1400px] duration-200">
        <div className={cn('grid transition-transform duration-500 [transform-style:preserve-3d]', revealed && '[transform:rotateY(180deg)]')}>
          {/* ---------- front: the question ---------- */}
          <section
            aria-hidden={revealed}
            className="flex min-h-72 flex-col rounded-2xl border bg-card p-6 shadow-[0_18px_40px_-28px_rgb(7_71_94/0.55)] [grid-area:1/1] [backface-visibility:hidden] sm:min-h-80 sm:p-8"
          >
            <p className="text-sm text-muted-foreground">
              <span className="font-heading font-bold text-primary">{subject?.code ?? '—'}</span>
              {subject?.topicName && <> {subject.topicName}</>}
              {stateGroup(card) === 'new' && <span className="ml-2 rounded-[4px] bg-primary/10 px-1.5 text-xs font-bold text-primary">NEW</span>}
            </p>
            <p className="my-auto py-6 text-center text-xl leading-snug font-bold text-balance sm:text-2xl">{question.stem}</p>
            <p className="text-center text-xs text-muted-foreground">Think of the answer, then flip the card.</p>
          </section>

          {/* ---------- back: the answer ---------- */}
          <section
            aria-hidden={!revealed}
            className="flex min-h-72 flex-col gap-4 rounded-2xl border bg-card p-6 shadow-[0_18px_40px_-28px_rgb(7_71_94/0.55)] [grid-area:1/1] [transform:rotateY(180deg)] [backface-visibility:hidden] sm:min-h-80 sm:p-8"
          >
            <p className="text-sm leading-snug text-muted-foreground">{question.stem}</p>
            <div className="rounded-xl bg-correct-soft px-4 py-3">
              <p className="text-xs font-bold tracking-wide text-correct uppercase">Answer</p>
              <p className="font-heading text-xl font-bold text-correct sm:text-2xl">{question.choices[question.correct_index]}</p>
            </div>
            {question.explanation && <p className="leading-relaxed text-foreground/90">{question.explanation}</p>}
          </section>
        </div>
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          autoFocus
          className="h-13 w-full rounded-xl bg-primary font-heading text-lg font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Show answer
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
      <p className="hidden text-center text-xs text-muted-foreground md:block">Space to flip · 1–4 to rate</p>

      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          Some cards weren’t saved. Check your internet connection; you can keep going.
        </p>
      )}
    </div>
  )
}
