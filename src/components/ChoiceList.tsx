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
  /** can't be tapped yet (e.g. watching a teammate answer in Board Review) */
  disabled?: boolean
  /** Board Review lifelines, before the answer: choices taken away by Rule out 2 (original indexes) */
  ruledOut?: readonly number[]
  /** Board Review Second chance: her wrong first pick, crossed out in red while she picks again */
  firstWrong?: number | null
  /** the label on the picked choice after the answer (default "Your answer"; e.g. "Ana’s answer" when watching) */
  answerLabel?: string
}

/** The answer buttons of a multiple-choice question (Practice and Board Review). */
export function ChoiceList({
  choices,
  correctIndex,
  choiceNotes,
  order,
  selectedIndex,
  onChoose,
  keyPrefix,
  disabled = false,
  ruledOut = [],
  firstWrong = null,
  answerLabel = 'Your answer',
}: Props) {
  const answered = selectedIndex !== undefined
  return (
    <div className="space-y-2" role="group" aria-label="Choices">
      {order.map((originalIndex, displayPos) => {
        const isCorrectChoice = originalIndex === correctIndex
        const isSelected = selectedIndex === originalIndex
        const showCorrect = answered && isCorrectChoice
        // Second chance's first pick stays red after the answer too (unless it was the final pick).
        const isFirstWrong = firstWrong === originalIndex && !isSelected
        const showWrong = (answered && isSelected && !isCorrectChoice) || isFirstWrong
        // Taken away by Rule out 2: shown faded and struck through until the answer, then like any other choice.
        const isRuledOut = !answered && ruledOut.includes(originalIndex)
        // The other two choices: quieter, but their text stays readable (it may carry a note to learn from).
        const isOther = answered && !isSelected && !isCorrectChoice && !isFirstWrong
        // Shown only after she answers, right under its own choice (so the "why" sits next to the "what").
        const note = answered ? choiceNotes?.[originalIndex] : undefined
        return (
          <button
            key={`${keyPrefix}-${originalIndex}`}
            type="button"
            disabled={answered || disabled || isRuledOut || isFirstWrong}
            onClick={() => onChoose(originalIndex)}
            aria-keyshortcuts={CHOICE_LETTERS[displayPos]}
            aria-label={isRuledOut ? `${CHOICE_LETTERS[displayPos]}, ruled out: ${choices[originalIndex]}` : undefined}
            className={cn(
              // A "sticker" button: ink outline and a hard shadow. Pressing pushes it down onto the shadow.
              'group flex min-h-14 w-full items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-card px-3 py-3 text-left text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
              note && 'items-start',
              !answered && !disabled && !isRuledOut && !isFirstWrong && 'shadow-toon-sm transition-[transform,box-shadow,background-color] duration-75 active:translate-y-[3px] active:shadow-none hover:bg-[#F1FAFC]',
              showCorrect && 'bg-correct-soft font-semibold shadow-toon-sm',
              showWrong && 'bg-wrong-soft shadow-toon-sm',
              // The other two: flat (no shadow) and faded, so the right and wrong ones stand out.
              isOther && 'border-ink/30 bg-card/60',
              isRuledOut && 'border-dashed border-ink/40 bg-transparent opacity-45',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-[10px] border-2 font-heading text-sm font-bold transition-colors',
                showCorrect
                  ? 'border-ink bg-correct text-white'
                  : showWrong
                    ? 'border-ink bg-wrong text-white'
                    : isOther
                      ? 'border-ink/30 bg-secondary text-muted-foreground'
                      : 'border-ink bg-[#D5F1F6] text-foreground group-hover:bg-primary group-hover:text-primary-foreground group-disabled:group-hover:bg-[#D5F1F6] group-disabled:group-hover:text-foreground',
              )}
            >
              {showCorrect ? <Check className="size-4" strokeWidth={3} aria-label="Correct answer" /> : showWrong ? <X className="size-4" strokeWidth={3} aria-label={isFirstWrong ? 'Your first pick, incorrect' : `${answerLabel}, incorrect`} /> : CHOICE_LETTERS[displayPos]}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block', note && 'pt-1', isOther && 'text-muted-foreground', isRuledOut && 'line-through')}>{choices[originalIndex]}</span>
              {note && <span className={cn('mt-1 block text-sm leading-snug', isOther ? 'text-muted-foreground' : 'text-foreground/85')}>{note}</span>}
            </span>
            {(showCorrect || showWrong) && (
              <span
                aria-hidden // the icon's label already says this to screen readers
                className={cn('shrink-0', note && 'pt-1.5', 'font-heading text-[11px] font-bold tracking-wide uppercase', showCorrect ? 'text-correct' : 'text-wrong')}
              >
                {showCorrect ? (isSelected ? answerLabel : 'Correct') : isFirstWrong ? 'First pick' : answerLabel}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
