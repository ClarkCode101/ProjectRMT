import { ArrowDown, ArrowUp, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChoiceList } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import { NO_LIFELINES, type LifelineId, type Pending, type QuestionLifelines } from '@/lib/board'
import { formatTurnClock } from '@/lib/boardTeam'
import { cn } from '@/lib/utils'
import type { QuizQuestion } from '@/features/quiz/api'
import { LifelineBar, LifelinePills } from './Lifelines'

const DICE = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6]

/** A die showing 1–6. */
export function DieFace({ value, className }: { value: number; className?: string }) {
  const Icon = DICE[Math.min(6, Math.max(1, value)) - 1]
  return <Icon className={className} aria-label={`Rolled ${value}`} />
}

/** What's at stake for this question: the popup's heading. `who` = a teammate's name when watching their turn. */
function Stakes({ purpose, weakTopicName, headingId, who }: { purpose: Pending; weakTopicName: string | null; headingId: string; who?: string }) {
  if (purpose.kind === 'move') {
    const squares = `${purpose.roll} ${purpose.roll === 1 ? 'square' : 'squares'}`
    return (
      <div className="flex items-center gap-3">
        <DieFace value={purpose.roll} className="size-10 shrink-0 text-primary-deep" />
        <h2 id={headingId} className="font-heading text-xl font-bold">
          {who ? `${who} needs this right to move ${squares}` : `Answer right to move ${squares}`}
        </h2>
      </div>
    )
  }
  if (purpose.kind === 'ladder') {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-correct-soft px-3 py-2">
        <ArrowUp className="size-6 shrink-0 text-correct" aria-hidden />
        <div>
          <h2 id={headingId} className="font-heading text-xl font-bold text-correct">
            {who ? `${who} is on a ladder! Challenge question` : 'Ladder! Challenge question'}
          </h2>
          <p className="text-sm">{who ? `A right answer climbs to square ${purpose.to}.` : `Answer right to climb to square ${purpose.to}. Wrong just keeps you here.`}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-wrong-soft px-3 py-2">
      <ArrowDown className="size-6 shrink-0 text-wrong" aria-hidden />
      <div>
        <h2 id={headingId} className="font-heading text-xl font-bold text-wrong">
          {who ? `${who} hit a snake! Rescue question` : 'Snake! Rescue question'}
        </h2>
        <p className="text-sm">
          {who ? `A right answer stays safe; wrong slides down to square ${purpose.to}.` : `Answer right to stay safe, or slide down to square ${purpose.to}.`}
          {weakTopicName && <> From your weak topic: {weakTopicName}.</>}
        </p>
      </div>
    </div>
  )
}

/** The line after the answer: what happens on the board when the popup closes. */
function outcomeText(purpose: Pending, isCorrect: boolean, position: number, who?: string, shielded = false): string {
  const squares = purpose.kind === 'move' ? `${purpose.roll} ${purpose.roll === 1 ? 'square' : 'squares'}` : ''
  if (purpose.kind === 'snake' && !isCorrect && shielded) {
    return who ? `Not quite, but ${who}’s Snake shield held. No slide!` : 'Not quite, but your Snake shield held. No slide!'
  }
  if (who) {
    switch (purpose.kind) {
      case 'move':
        return isCorrect ? `${who} got it! Moves ${squares}.` : `Not quite. ${who} stays on square ${position}.`
      case 'ladder':
        return isCorrect ? `${who} got it! Climbs to square ${purpose.to}.` : `Not quite. ${who} stays at the foot of the ladder.`
      case 'snake':
        return isCorrect ? `${who} got it! Escaped the snake.` : `Not quite. ${who} slides down to square ${purpose.to}.`
    }
  }
  switch (purpose.kind) {
    case 'move':
      return isCorrect ? `Correct! Move ${squares}.` : `Not quite. You stay on square ${position}.`
    case 'ladder':
      return isCorrect ? `Correct! Climb to square ${purpose.to}.` : 'Not quite. You stay at the foot of the ladder.'
    case 'snake':
      return isCorrect ? 'Correct! You escaped the snake.' : `Not quite. Slide down to square ${purpose.to}.`
  }
}

type Props = {
  /** id for the heading, so the popup is announced by name */
  headingId: string
  purpose: Pending
  question: QuizQuestion
  /** e.g. "HEMA · Coagulation" */
  subjectLabel: string
  weakTopicName: string | null
  order: number[]
  /** the original index she picked, once she answers */
  selectedIndex: number | undefined
  /** her square before this question */
  position: number
  onChoose: (originalIndex: number) => void
  onContinue: () => void
  /** team games: watching a teammate's turn (their name); the choices can't be tapped */
  watching?: string
  /** team games: seconds left on the turn's clock, shown at the top */
  clockSeconds?: number
  /** team games: waiting for the database to check the answer */
  checking?: boolean
  /** team games: after the answer, Continue taps itself after this many seconds */
  autoContinueSeconds?: number
  /** team games: the chat row at the bottom (newest message, quick replies for watchers) */
  footer?: ReactNode
  /** the lifelines on this question (Rule out 2, Second chance, Snake shield) */
  lifelines?: QuestionLifelines
  /** her turn: spent lifelines this game, and what tapping one does (shows the lifeline row) */
  lifelineBar?: { used: readonly LifelineId[]; onUse: (id: LifelineId) => void; busy?: boolean }
}

/** The question popup's content: what's at stake, the question, then what happens. */
export function TurnSheet({
  headingId,
  purpose,
  question,
  subjectLabel,
  weakTopicName,
  order,
  selectedIndex,
  position,
  onChoose,
  onContinue,
  watching,
  clockSeconds,
  checking = false,
  autoContinueSeconds,
  footer,
  lifelines = NO_LIFELINES,
  lifelineBar,
}: Props) {
  // In a team game the answer is only known once the database has checked it (correct_index -1 until then).
  const answered = selectedIndex !== undefined && question.correct_index >= 0
  const isCorrect = selectedIndex === question.correct_index
  const retrying = !answered && lifelines.firstWrong !== null
  return (
    <div className="space-y-4">
      {clockSeconds !== undefined && !answered && (
        <p className="flex items-center justify-between text-sm font-semibold text-muted-foreground tabular-nums">
          <span>{watching ? `${watching}’s turn` : 'Your turn'}</span>
          {/* red in the last 15 seconds */}
          <span className={cn('rounded-full bg-secondary px-2.5 py-0.5 font-heading font-bold text-foreground', clockSeconds <= 15 && 'bg-wrong-soft text-wrong')}>
            <span className="sr-only">Time left </span>
            {formatTurnClock(clockSeconds)}
          </span>
        </p>
      )}
      <Stakes purpose={purpose} weakTopicName={watching ? null : weakTopicName} headingId={headingId} who={watching} />
      {watching && !answered && <LifelinePills current={lifelines} who={watching} />}

      <article className="space-y-1.5">
        <p className="font-heading text-sm font-bold text-primary">{subjectLabel}</p>
        <p className="text-xl leading-snug font-bold">{question.stem}</p>
      </article>

      {/* Second chance: her first pick was wrong; it stays crossed out and she picks once more. */}
      {retrying && (
        <p role="status" className="rounded-xl border border-highlight/60 bg-highlight-soft px-4 py-3">
          <span className="font-heading text-lg font-bold">Not that one.</span>{' '}
          {watching ? `${watching} gets a second chance.` : 'Second chance: pick once more.'}
        </p>
      )}

      <ChoiceList
        choices={question.choices}
        correctIndex={question.correct_index}
        choiceNotes={question.choice_notes}
        order={order}
        selectedIndex={answered ? selectedIndex : undefined}
        onChoose={onChoose}
        keyPrefix={question.id}
        disabled={Boolean(watching) || checking}
        ruledOut={lifelines.ruledOut}
        firstWrong={lifelines.firstWrong}
      />

      {checking && <p className="text-center text-sm text-muted-foreground">Checking your answer…</p>}
      {watching && !answered && <p className="text-center text-sm text-muted-foreground">{watching} is answering. Think of your own answer while you wait!</p>}

      {lifelineBar && !watching && !answered && (
        <LifelineBar
          current={lifelines}
          used={lifelineBar.used}
          pendingKind={purpose.kind}
          choiceCount={question.choices.length}
          onUse={lifelineBar.onUse}
          busy={lifelineBar.busy || checking}
        />
      )}

      {answered && (
        <div role="status" className={cn('animate-in fade-in rounded-xl px-4 py-3.5 duration-200', isCorrect ? 'bg-correct-soft' : 'bg-wrong-soft')}>
          <p className={cn('font-heading text-lg font-bold', isCorrect ? 'text-correct' : 'text-wrong')}>{outcomeText(purpose, isCorrect, position, watching, lifelines.shield)}</p>
          {question.explanation && <p className="mt-2 leading-relaxed">{question.explanation}</p>}
        </div>
      )}

      {answered &&
        (autoContinueSeconds ? (
          <AutoContinueButton key={question.id} seconds={autoContinueSeconds} onContinue={onContinue} />
        ) : (
          <Button className="h-13 w-full rounded-xl font-heading text-lg font-bold" onClick={onContinue} autoFocus>
            Continue
          </Button>
        ))}
      {footer}
    </div>
  )
}

/**
 * Team games: Continue that taps itself after `seconds`, so every screen moves on together
 * (and before the next player's clock really starts). The bar inside empties as the time runs out;
 * tapping earlier is fine.
 */
function AutoContinueButton({ seconds, onContinue }: { seconds: number; onContinue: () => void }) {
  const [left, setLeft] = useState(seconds)
  // false on the first paint (bar full), then true so the bar slides smoothly to empty over `seconds`
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
      {/* the time left, emptying from right to left */}
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
