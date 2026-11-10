import { Check, X } from 'lucide-react'
import { CHOICE_LETTERS } from '@/lib/choiceKeys'
import { cn } from '@/lib/utils'

type Props = {
  choices: string[]
  correctIndex: number
  /** One short note per choice (original order), shown after she answers. */
  choiceNotes: string[] | null
  /** order[displayPosition] = original choice index (the shuffled display order) */
  order: number[]
  /** the ORIGINAL index she picked, or undefined while she hasn't answered */
  selectedIndex: number | undefined
  onChoose: (originalIndex: number) => void
  /** changes per question, so React gives each question fresh buttons */
  keyPrefix: string | number
}

/** The answer buttons of a multiple-choice question (Practice and Board Review). */
export function ChoiceList({ choices, correctIndex, choiceNotes, order, selectedIndex, onChoose, keyPrefix }: Props) {
  const answered = selectedIndex !== undefined
  return (
    <div className="space-y-2" role="group" aria-label="Choices">
      {order.map((originalIndex, displayPos) => {
        const isCorrectChoice = originalIndex === correctIndex
        const isSelected = selectedIndex === originalIndex
        const showCorrect = answered && isCorrectChoice
        const showWrong = answered && isSelected && !isCorrectChoice
        // The other two choices: quieter, but their text stays readable (it may carry a note to learn from).
        const isOther = answered && !isSelected && !isCorrectChoice
        // Shown only after she answers, right under its own choice (so the "why" sits next to the "what").
        const note = answered ? choiceNotes?.[originalIndex] : undefined
        return (
          <button
            key={`${keyPrefix}-${originalIndex}`}
            type="button"
            disabled={answered}
            onClick={() => onChoose(originalIndex)}
            aria-keyshortcuts={CHOICE_LETTERS[displayPos]}
            className={cn(
              'group flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left text-base transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              note && 'items-start',
              !answered && 'hover:border-primary active:bg-secondary',
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
              {showCorrect ? <Check className="size-4" aria-label="Correct answer" /> : showWrong ? <X className="size-4" aria-label="Your answer, incorrect" /> : CHOICE_LETTERS[displayPos]}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block', note && 'pt-1', isOther && 'text-muted-foreground')}>{choices[originalIndex]}</span>
              {note && <span className={cn('mt-1 block text-sm leading-snug', isOther ? 'text-muted-foreground' : 'text-foreground/85')}>{note}</span>}
            </span>
            {(showCorrect || showWrong) && (
              <span
                aria-hidden // the icon's label already says this to screen readers
                className={cn('shrink-0', note && 'pt-1.5', 'font-heading text-[11px] font-bold tracking-wide uppercase', showCorrect ? 'text-correct' : 'text-wrong')}
              >
                {showCorrect ? (isSelected ? 'Your answer' : 'Correct') : 'Your answer'}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
