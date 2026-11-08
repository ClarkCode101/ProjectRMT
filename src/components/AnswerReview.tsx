import { cn } from '@/lib/utils'

/**
 * The answer part of a review row (Practice "Questions you missed", Mock exam review):
 * what she picked, the right answer, and, when the question has choice notes (migration 0008),
 * each note right under its own choice, then the other choices with their notes.
 * Without notes it looks the way it always did.
 */
export function AnswerReview({
  choices,
  correctIndex,
  selectedIndex,
  notes,
}: {
  choices: string[]
  correctIndex: number
  /** null = she left it blank (mock exam) */
  selectedIndex: number | null
  notes: string[] | null
}) {
  const status = selectedIndex === null ? 'blank' : selectedIndex === correctIndex ? 'right' : 'wrong'
  const noteFor = (i: number) => notes?.[i] || null
  // The two choices she didn't pick and that aren't the answer, only those with a note to learn from.
  const others = choices.map((_, i) => i).filter((i) => i !== correctIndex && i !== selectedIndex && noteFor(i))

  return (
    <dl className="grid gap-1.5 text-sm">
      {status !== 'right' && (
        <div className={cn('flex flex-wrap gap-x-2 rounded-md px-3 py-2', status === 'wrong' ? 'bg-wrong-soft' : 'bg-secondary')}>
          <dt className={cn('w-24 shrink-0 font-semibold', status === 'wrong' ? 'text-wrong' : 'text-muted-foreground')}>Your answer</dt>
          <dd className="min-w-0 flex-1">
            {selectedIndex === null ? (
              <span className="text-muted-foreground italic">No answer</span>
            ) : (
              <>
                <span className="text-wrong line-through decoration-1">{choices[selectedIndex]}</span>
                {noteFor(selectedIndex) && <span className="mt-0.5 block leading-snug text-foreground/85">{noteFor(selectedIndex)}</span>}
              </>
            )}
          </dd>
        </div>
      )}
      <div className="flex flex-wrap gap-x-2 rounded-md bg-correct-soft px-3 py-2">
        <dt className="w-24 shrink-0 font-semibold text-correct">{status === 'right' ? 'Your answer' : 'Correct'}</dt>
        <dd className="min-w-0 flex-1">
          <span className="font-bold text-correct">{choices[correctIndex]}</span>
          {noteFor(correctIndex) && <span className="mt-0.5 block leading-snug text-foreground/85">{noteFor(correctIndex)}</span>}
        </dd>
      </div>
      {others.length > 0 && (
        <div className="flex flex-wrap gap-x-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2">
          <dt className="w-24 shrink-0 font-semibold text-muted-foreground">Other choices</dt>
          <dd className="min-w-0 flex-1">
            <ul className="space-y-1">
              {others.map((i) => (
                <li key={i} className="leading-snug">
                  <span className="font-semibold text-foreground">{choices[i]}</span>
                  <span className="block text-muted-foreground">{noteFor(i)}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      )}
    </dl>
  )
}
