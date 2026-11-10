import { ArrowDown, ArrowUp, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from 'lucide-react'
import { ChoiceList } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import type { Pending } from '@/lib/board'
import { cn } from '@/lib/utils'
import type { QuizQuestion } from '@/features/quiz/api'

const DICE = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6]

/** A die showing 1–6. */
export function DieFace({ value, className }: { value: number; className?: string }) {
  const Icon = DICE[Math.min(6, Math.max(1, value)) - 1]
  return <Icon className={className} aria-label={`Rolled ${value}`} />
}

/** What's at stake for this question: the popup's heading. */
function Stakes({ purpose, weakTopicName, headingId }: { purpose: Pending; weakTopicName: string | null; headingId: string }) {
  if (purpose.kind === 'move') {
    return (
      <div className="flex items-center gap-3">
        <DieFace value={purpose.roll} className="size-10 shrink-0 text-primary-deep" />
        <h2 id={headingId} className="font-heading text-xl font-bold">
          Answer right to move {purpose.roll} {purpose.roll === 1 ? 'square' : 'squares'}
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
            Ladder! Challenge question
          </h2>
          <p className="text-sm">Answer right to climb to square {purpose.to}. Wrong just keeps you here.</p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-wrong-soft px-3 py-2">
      <ArrowDown className="size-6 shrink-0 text-wrong" aria-hidden />
      <div>
        <h2 id={headingId} className="font-heading text-xl font-bold text-wrong">
          Snake! Rescue question
        </h2>
        <p className="text-sm">
          Answer right to stay safe, or slide down to square {purpose.to}.
          {weakTopicName && <> From your weak topic: {weakTopicName}.</>}
        </p>
      </div>
    </div>
  )
}

/** The line after she answers: what will happen on the board when she closes the popup. */
function outcomeText(purpose: Pending, isCorrect: boolean, position: number): string {
  switch (purpose.kind) {
    case 'move':
      return isCorrect ? `Correct! Move ${purpose.roll} ${purpose.roll === 1 ? 'square' : 'squares'}.` : `Not quite. You stay on square ${position}.`
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
}

/** The question popup's content: what's at stake, the question, then what happens. */
export function TurnSheet({ headingId, purpose, question, subjectLabel, weakTopicName, order, selectedIndex, position, onChoose, onContinue }: Props) {
  const answered = selectedIndex !== undefined
  const isCorrect = selectedIndex === question.correct_index
  return (
    <div className="space-y-4">
      <Stakes purpose={purpose} weakTopicName={weakTopicName} headingId={headingId} />

      <article className="space-y-1.5">
        <p className="font-heading text-sm font-bold text-primary">{subjectLabel}</p>
        <p className="text-xl leading-snug font-bold">{question.stem}</p>
      </article>

      <ChoiceList
        choices={question.choices}
        correctIndex={question.correct_index}
        choiceNotes={question.choice_notes}
        order={order}
        selectedIndex={selectedIndex}
        onChoose={onChoose}
        keyPrefix={question.id}
      />

      {answered && (
        <div role="status" className={cn('animate-in fade-in rounded-xl px-4 py-3.5 duration-200', isCorrect ? 'bg-correct-soft' : 'bg-wrong-soft')}>
          <p className={cn('font-heading text-lg font-bold', isCorrect ? 'text-correct' : 'text-wrong')}>{outcomeText(purpose, isCorrect, position)}</p>
          {question.explanation && <p className="mt-2 leading-relaxed">{question.explanation}</p>}
        </div>
      )}

      {answered && (
        <Button className="h-13 w-full rounded-xl font-heading text-lg font-bold" onClick={onContinue} autoFocus>
          Continue
        </Button>
      )}
    </div>
  )
}
