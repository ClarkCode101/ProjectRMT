import { Layers } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChoiceList } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import { cardLabel, DRAW2_QUESTIONS, type Card } from '@/lib/cards'
import type { LiveQuestionView, LiveReveal } from '@/lib/cardsLive'
import { cn } from '@/lib/utils'
import type { SeatClock } from './CardTable'
import { CardFace } from './PlayingCard'

// The question popup of a live Last Card game (PROJECT_PLAN.md §15 step 3). Everyone sees it:
// - the person whose turn it is answers it ("mine")
// - the others watch (the choices can't be tapped) and think of their own answer
// Then everyone sees the reveal: the right answer, the explanation, and whether it was right.

/** What the question is for: putting a card down, or one of the questions after a Draw 2. */
export type LivePurpose = { kind: 'play'; card: Card; lastCard: boolean } | { kind: 'draw2'; number: number }

type Props = {
  headingId: string
  /** her own question (she answers), or someone else's (she watches) */
  mine: boolean
  /** the person answering, for the watchers' lines */
  who: string
  purpose: LivePurpose
  question: LiveQuestionView
  /** the answer, once it's in (same question) */
  reveal: LiveReveal | null
  /** order[displayPosition] = original choice index (the same before and after the reveal) */
  order: number[]
  /** e.g. "HEMA · Coagulation" */
  subjectLabel: string
  /** her answer is on its way to the server */
  sending: boolean
  onChoose: (originalIndex: number) => void
  onContinue: () => void
  /** the chat row at the bottom (the newest message, cheers for watchers) */
  footer?: ReactNode
  /** the turn's clock while the question is up */
  clock?: SeatClock
}

/** Watchers' reveal closes by itself after this many seconds (the game goes on without waiting). */
const WATCH_REVEAL_SECONDS = 6

function Stakes({ mine, who, purpose, headingId }: { mine: boolean; who: string; purpose: LivePurpose; headingId: string }) {
  if (purpose.kind === 'draw2') {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-wrong-soft px-3 py-2">
        <Layers className="size-6 shrink-0 text-wrong" aria-hidden />
        <div>
          <h2 id={headingId} className="font-heading text-xl font-bold text-wrong">
            {mine ? 'Draw 2!' : `Draw 2 on ${who}!`} Question {purpose.number} of {DRAW2_QUESTIONS}
          </h2>
          <p className="text-sm">{mine ? 'Each wrong answer means drawing 1 card.' : `Each wrong answer, ${who} draws 1.`}</p>
        </div>
      </div>
    )
  }
  const wild = purpose.card.kind === 'wild'
  const label = cardLabel(purpose.card)
  return (
    <div className="flex items-center gap-3">
      <CardFace card={purpose.card} size="sm" className="shrink-0" />
      <div>
        <h2 id={headingId} className="font-heading text-xl font-bold">
          {mine ? (wild ? 'Wild! Answer right to put it down' : `Answer right to put down ${label}`) : `${who} is playing ${label}`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {mine
            ? wild
              ? 'Then you pick the next subject.'
              : 'Wrong keeps the card in your hand, and you draw 1.'
            : `${who} is answering. Think of your own answer!`}
          {purpose.lastCard && <span className="font-semibold text-foreground">{mine ? ' It’s your last card!' : ` It’s ${who}’s last card!`}</span>}
        </p>
      </div>
    </div>
  )
}

function outcomeText(mine: boolean, who: string, purpose: LivePurpose, correct: boolean): string {
  if (purpose.kind === 'draw2') {
    if (mine) return correct ? 'Correct! No card to draw.' : 'Not quite. Draw 1 card.'
    return correct ? `${who} got it! No card to draw.` : `Not quite. ${who} draws 1.`
  }
  const label = cardLabel(purpose.card)
  if (!correct) return mine ? 'Not quite. The card stays in your hand, and you draw 1.' : `Not quite. ${who} keeps ${label} and draws 1.`
  if (purpose.lastCard) return mine ? 'Correct! That was your last card.' : `${who} got it! That was their last card.`
  if (purpose.card.kind === 'wild') return mine ? 'Correct! Now pick the next subject.' : `${who} got it! They pick the next subject.`
  return mine ? `Correct! ${label} goes down.` : `${who} got it! ${label} goes down.`
}

export function LiveQuestionSheet({ headingId, mine, who, purpose, question, reveal, order, subjectLabel, sending, onChoose, onContinue, footer, clock }: Props) {
  const answered = reveal !== null
  const choiceNotes = answered ? reveal.question.choiceNotes : null
  return (
    <div className="space-y-4">
      {clock && !answered && (
        <p className="flex items-center justify-between text-sm font-semibold text-muted-foreground tabular-nums">
          <span>{mine ? 'Your turn' : `${who}’s turn`}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 font-heading font-bold', clock.low ? 'bg-wrong-soft text-wrong' : 'bg-secondary text-foreground')}>
            <span className="sr-only">Time left </span>
            {clock.text}
          </span>
        </p>
      )}
      <Stakes mine={mine} who={who} purpose={purpose} headingId={headingId} />

      <article className="space-y-1.5">
        <p className="font-heading text-sm font-bold text-primary">{subjectLabel}</p>
        <p className="text-xl leading-snug font-bold">{question.stem}</p>
      </article>

      <ChoiceList
        choices={question.choices}
        // no answer is known until the reveal (-1 = none)
        correctIndex={answered ? reveal.question.correctIndex : -1}
        choiceNotes={choiceNotes}
        order={order}
        selectedIndex={answered ? reveal.selected : undefined}
        onChoose={onChoose}
        keyPrefix={question.id}
        disabled={!mine || sending || answered}
        answerLabel={mine ? 'Your answer' : `${who}’s answer`}
      />

      {sending && <p className="text-center text-sm text-muted-foreground">Checking your answer…</p>}

      {answered && (
        <div role="status" className={cn('animate-in fade-in rounded-xl px-4 py-3.5 duration-200', reveal.correct ? 'bg-correct-soft' : 'bg-wrong-soft')}>
          <p className={cn('font-heading text-lg font-bold', reveal.correct ? 'text-correct' : 'text-wrong')}>{outcomeText(mine, who, purpose, reveal.correct)}</p>
          {reveal.question.explanation && <p className="mt-2 leading-relaxed">{reveal.question.explanation}</p>}
        </div>
      )}

      {answered &&
        (mine ? (
          <Button className="h-13 w-full rounded-xl font-heading text-lg font-bold" onClick={onContinue} autoFocus>
            Continue
          </Button>
        ) : (
          <AutoContinue key={question.id} seconds={WATCH_REVEAL_SECONDS} onContinue={onContinue} />
        ))}
      {footer}
    </div>
  )
}

/** Watchers: Continue taps itself after `seconds` (the bar inside empties); tapping earlier is fine. */
function AutoContinue({ seconds, onContinue }: { seconds: number; onContinue: () => void }) {
  const [left, setLeft] = useState(seconds)
  const [running, setRunning] = useState(false)
  const continueRef = useRef(onContinue)
  useEffect(() => {
    continueRef.current = onContinue
  })
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setRunning(true))
    const timer = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    if (left === 0) continueRef.current()
  }, [left])
  return (
    <Button className="relative h-13 w-full overflow-hidden rounded-xl font-heading text-lg font-bold" onClick={onContinue} autoFocus>
      <span
        className="absolute inset-y-0 left-0 bg-white/20 transition-[width] ease-linear motion-reduce:hidden"
        style={{ width: running ? '0%' : '100%', transitionDuration: `${seconds}s` }}
        aria-hidden
      />
      <span className="relative">
        Continue <span className="font-normal tabular-nums opacity-80">· {left}</span>
      </span>
    </Button>
  )
}
