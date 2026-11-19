import { Check, Info, Play, Target } from 'lucide-react'
import { heroButtonClass } from '@/components/report'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Between the two steps of a "Learn" task: she studied the answers, now she tries the same questions herself.
 * Getting them right right after studying is how she (and the plan) knows she learned them.
 * "Later" goes Home; the Plan page then says "Studied. Next: the test." and its button comes back here.
 */
export function StudyDone({
  count,
  starting,
  message,
  onStart,
  onLater,
}: {
  count: number
  starting: boolean
  /** why the test couldn't start (shown above the button, which then tries again) */
  message: string | null
  onStart: () => void
  onLater: () => void
}) {
  return (
    <div className="mx-auto max-w-xl space-y-4 sm:pt-8">
      <section aria-labelledby="study-done-heading" className="space-y-4 rounded-3xl border-[2.5px] border-ink bg-card p-6 text-center shadow-toon">
        {/* The two steps: study done, test next */}
        <ol className="flex items-center justify-center gap-2 text-sm font-bold">
          <li className="flex items-center gap-1.5 rounded-xl border-2 border-correct bg-correct-soft px-2.5 py-1 text-correct">
            <Check className="size-4" strokeWidth={3} aria-hidden />
            1. Study {count}
            <span className="sr-only">(done)</span>
          </li>
          <li aria-hidden className="text-muted-foreground">
            →
          </li>
          <li aria-current="step" className="flex items-center gap-1.5 rounded-xl border-2 border-ink bg-highlight px-2.5 py-1">
            <Target className="size-4" aria-hidden />
            2. Test the same {count}
          </li>
        </ol>

        <div>
          <h1 id="study-done-heading" className="font-heading text-3xl font-bold">
            Now try them yourself
          </h1>
          <p className="mt-1 text-muted-foreground">
            The same {count} {count === 1 ? 'question' : 'questions'}, mixed up, without the answers. The ones you miss come back tomorrow.
          </p>
        </div>

        {message && (
          <p role="status" className="flex items-start gap-2 rounded-md border border-highlight/50 bg-highlight-soft p-3 text-left text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {message}
          </p>
        )}

        <button type="button" className={cn(heroButtonClass, 'mx-auto sm:flex sm:w-80')} disabled={starting} onClick={onStart} autoFocus>
          <Play className="size-5 fill-current" aria-hidden />
          {starting ? 'Loading…' : 'Start the test'}
        </button>
      </section>

      <Button variant="ghost" className="h-12 w-full rounded-lg text-base" onClick={onLater}>
        Later. What I studied is saved.
      </Button>
    </div>
  )
}
