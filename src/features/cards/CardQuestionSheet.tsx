import { Layers } from 'lucide-react'
import { ChoiceList } from '@/components/ChoiceList'
import { Button } from '@/components/ui/button'
import type { QuizQuestion } from '@/features/quiz/api'
import { cardLabel, DRAW2_QUESTIONS, type Card } from '@/lib/cards'
import { cn } from '@/lib/utils'
import { CardFace } from './PlayingCard'

/** What the question is for: putting a card down, or one of the questions after a Draw 2 hit her. */
export type AskPurpose = { kind: 'play'; card: Card; lastCard: boolean } | { kind: 'draw2'; number: number }

type Props = {
  headingId: string
  purpose: AskPurpose
  question: QuizQuestion
  /** e.g. "HEMA · Coagulation" */
  subjectLabel: string
  /** a Wild's question from her weakest topic */
  weakTopicName: string | null
  order: number[]
  selectedIndex: number | undefined
  onChoose: (originalIndex: number) => void
  onContinue: () => void
}

/** The popup's heading: what's at stake. */
function Stakes({ purpose, weakTopicName, headingId }: { purpose: AskPurpose; weakTopicName: string | null; headingId: string }) {
  if (purpose.kind === 'draw2') {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-wrong-soft px-3 py-2">
        <Layers className="size-6 shrink-0 text-wrong" aria-hidden />
        <div>
          <h2 id={headingId} className="font-heading text-xl font-bold text-wrong">
            Draw 2! Question {purpose.number} of {DRAW2_QUESTIONS}
          </h2>
          <p className="text-sm">Each wrong answer means drawing 1 card. Then your turn is skipped.</p>
        </div>
      </div>
    )
  }
  const wild = purpose.card.kind === 'wild'
  return (
    <div className="flex items-center gap-3">
      <CardFace card={purpose.card} size="sm" />
      <div>
        <h2 id={headingId} className="font-heading text-xl font-bold">
          {wild ? 'Wild! Answer right to put it down' : `Answer right to put down ${cardLabel(purpose.card)}`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {wild ? 'Then you pick the next subject.' : 'Wrong keeps the card in your hand, and you draw 1.'}
          {purpose.lastCard && <span className="font-semibold text-foreground"> It’s your last card!</span>}
          {wild && weakTopicName && <> From your weak topic: {weakTopicName}.</>}
        </p>
      </div>
    </div>
  )
}

function outcomeText(purpose: AskPurpose, isCorrect: boolean): string {
  if (purpose.kind === 'draw2') return isCorrect ? 'Correct! No card to draw.' : 'Not quite. Draw 1 card.'
  if (!isCorrect) return 'Not quite. The card stays in your hand, and you draw 1.'
  if (purpose.lastCard) return 'Correct! That was your last card.'
  if (purpose.card.kind === 'wild') return 'Correct! Now pick the next subject.'
  return `Correct! ${cardLabel(purpose.card)} goes down.`
}

/** The question popup's content: what's at stake, the question, then what happens. */
export function CardQuestionSheet({ headingId, purpose, question, subjectLabel, weakTopicName, order, selectedIndex, onChoose, onContinue }: Props) {
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
          <p className={cn('font-heading text-lg font-bold', isCorrect ? 'text-correct' : 'text-wrong')}>{outcomeText(purpose, isCorrect)}</p>
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
