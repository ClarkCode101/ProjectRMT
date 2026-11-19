import { ListChecks, Play, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { heroButtonClass } from '@/components/report'
import { quietButtonClass, tagClass, TONE_CLASS } from '@/features/plan/planStyles'
import { minutesFor, progressText, taskNote, taskTitle, tomorrowLine } from '@/features/plan/planText'
import type { TodaysPlan } from '@/features/plan/useTodaysPlan'
import { planTaskLink } from '@/lib/planLinks'
import { cn } from '@/lib/utils'

/**
 * Today's plan, slim, at the bottom of Home (where the thumbs reach on an iPad). Same height as the Next up bar,
 * so the body and its cards keep their room. Only the NEXT task and its Start button; the rest is on the Plan page.
 */
export function PlanBar({ today }: { today: TodaysPlan & { plan: NonNullable<TodaysPlan['plan']> } }) {
  const { plan, rows, current, allDone, rest, preview } = today
  const doneCount = rows.filter((r) => r.complete).length
  const left = current ? current.items - current.done : 0
  const minutes = current ? minutesFor(current.task, left) : null
  const note = current ? taskNote(current.task, plan) : null

  return (
    <section aria-labelledby="plan-bar-heading" className="@container shrink-0 rounded-3xl border-[2.5px] border-ink bg-card p-3 shadow-toon lg:px-5">
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:gap-6">
        {/* Where she is today: the title, one dot per task, "1 of 3 done" */}
        <div className="flex items-center justify-between gap-3 @3xl:block @3xl:w-40 @3xl:shrink-0">
          <div>
            <h2 id="plan-bar-heading" className="text-xs font-bold tracking-wide text-primary uppercase">
              Today’s plan
            </h2>
            <span aria-hidden className="mt-1 flex gap-1.5">
              {rows.map((r) => (
                <span
                  key={r.index}
                  className={cn(
                    'size-3.5 rounded-full border-2 border-ink bg-secondary',
                    r.complete && 'border-correct bg-correct',
                    r.index === current?.index && 'bg-highlight',
                  )}
                />
              ))}
            </span>
          </div>
          <p className={cn('text-sm @3xl:mt-1 @3xl:text-xs', allDone ? 'font-semibold text-correct' : 'text-muted-foreground')}>
            {rest ? (
              <span className="rounded-full border-2 border-rest bg-rest-soft px-2 py-0.5 text-xs font-bold text-rest">Rest day</span>
            ) : plan.comeback && !allDone ? (
              <span className="rounded-full border-2 border-ink bg-highlight px-2 py-0.5 text-xs font-bold text-foreground">Welcome back!</span>
            ) : (
              <>
                <span className="font-bold tabular-nums">{doneCount}</span> of {rows.length} done
              </>
            )}
          </p>
        </div>

        <span aria-hidden className="hidden w-px self-stretch bg-secondary @3xl:block" />

        {/* The next task (or, all done, a peek at tomorrow) */}
        <div className="min-w-0 flex-1">
          {current && note ? (
            <>
              <p className="text-xs font-bold text-muted-foreground">
                {current.done > 0 ? `Next · ${progressText(current)}` : 'Next'}
                {minutes !== null && ` · ~${minutes} min`}
              </p>
              <p className="truncate font-heading text-lg leading-tight font-bold">{taskTitle(current.task)}</p>
              <span className={cn(tagClass, 'mt-0.5', TONE_CLASS[note.tone])}>{note.text}</span>
            </>
          ) : rest ? (
            <>
              <p className="font-heading text-lg leading-tight font-bold text-rest">Rest day. Your streak stays safe.</p>
              {preview && <p className="truncate text-sm text-muted-foreground">Tomorrow: {tomorrowLine(preview)}</p>}
            </>
          ) : (
            <>
              <p className="font-heading text-lg leading-tight font-bold text-correct">Today’s plan is done. Nice work!</p>
              {preview && <p className="truncate text-sm text-muted-foreground">Tomorrow: {tomorrowLine(preview)}</p>}
            </>
          )}
        </div>

        {/* See plan (quiet) + the ONE gold button, always last. Narrow: side by side under the rest, Start wider.
            All done or resting: See plan only (no "Extra practice": the day has a finish line). */}
        <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2 @3xl:flex @3xl:items-center">
          <Link to="/plan" className={quietButtonClass}>
            {allDone ? <Sparkles className="size-4 shrink-0" aria-hidden /> : <ListChecks className="size-4 shrink-0" aria-hidden />}
            {allDone ? 'See what you learned' : 'See plan'}
          </Link>
          {current ? (
            <Link to={planTaskLink(current.task, left)} className={cn(heroButtonClass, 'h-11 min-w-0 px-5 text-base sm:flex sm:w-full @3xl:w-auto')}>
              <Play className="size-4 shrink-0 fill-current" aria-hidden />
              <span className="min-w-0 truncate">
                {current.done > 0 ? 'Continue' : 'Start'}
                <span className="sr-only">: {taskTitle(current.task, left)}</span>
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  )
}
