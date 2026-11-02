import { ChevronDown } from 'lucide-react'

/**
 * One missed question as a row that opens on tap.
 * Closed: just the subject and the question, so a long list stays calm to scan.
 * Open: what she picked, the right answer, and the explanation.
 * Use inside a <ul className="divide-y ...">.
 */
export function MistakeItem({
  subject,
  stem,
  yourAnswer,
  correctAnswer,
  explanation,
}: {
  subject: { code?: string; topicName?: string }
  stem: string
  yourAnswer: string | undefined
  correctAnswer: string | undefined
  explanation: string | null
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">
              <span className="font-heading font-bold text-foreground">{subject.code ?? '—'}</span>
              {subject.topicName && <> {subject.topicName}</>}
            </span>
            <span className="mt-0.5 block leading-snug font-semibold group-open:font-bold">{stem}</span>
          </span>
          <ChevronDown className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>

        <div className="space-y-3 px-4 pb-4 sm:px-5">
          <dl className="grid gap-1.5 text-sm">
            {yourAnswer !== undefined && (
              <div className="flex flex-wrap gap-x-2 rounded-md bg-wrong-soft px-3 py-2">
                <dt className="w-24 shrink-0 font-semibold text-wrong">Your answer</dt>
                <dd className="min-w-0 text-wrong line-through decoration-1">{yourAnswer}</dd>
              </div>
            )}
            <div className="flex flex-wrap gap-x-2 rounded-md bg-correct-soft px-3 py-2">
              <dt className="w-24 shrink-0 font-semibold text-correct">Correct</dt>
              <dd className="min-w-0 font-bold text-correct">{correctAnswer}</dd>
            </div>
          </dl>
          {explanation && <p className="leading-relaxed text-foreground/90">{explanation}</p>}
        </div>
      </details>
    </li>
  )
}
