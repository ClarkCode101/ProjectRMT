import { House, ListChecks, Play, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { heroButtonClass } from '@/components/report'
import { cn } from '@/lib/utils'
import { quietHeroButtonClass } from './planStyles'
import type { PlanResultInfo } from './planResults'

/**
 * On a results screen (dark hero panel) of a task from Today's plan:
 * "2 OF 3 DONE · Learn Coagulation", with one dot per task (filled = done).
 */
export function PlanResultHeading({ plan, id }: { plan: PlanResultInfo; id: string }) {
  return (
    <div className="mr-auto min-w-0">
      <h1 id={id} className="text-sm font-semibold text-white/70">
        <span className="font-bold tracking-wide text-highlight uppercase">{plan.done === plan.total ? `All ${plan.total} done` : `${plan.done} of ${plan.total} done`}</span>
        <span className="font-normal text-white/55"> · {plan.taskLabel}</span>
      </h1>
      <span aria-hidden className="mt-1.5 flex gap-1.5">
        {plan.dots.map((done, i) => (
          // A brighter green than the app's "correct", so a done dot stands out on the dark panel.
          <span key={i} className={cn('size-3.5 rounded-full border-2', done ? 'border-white bg-[#4cc27f]' : 'border-white/60 bg-white/10')} />
        ))}
      </span>
    </div>
  )
}

/**
 * The two buttons: gold = the next task, straight in (or, all done, what she learned);
 * see-through = the plan (or Home). Nothing that leads out of the plan.
 */
export function PlanResultButtons({ plan }: { plan: PlanResultInfo }) {
  // "Next" passes on where she started (the Plan page or Home), so leaving the next task goes back there too.
  const location = useLocation()
  return (
    <div className="grid gap-2.5 pt-1 sm:grid-cols-[minmax(0,1fr)_auto]">
      {plan.next ? (
        <>
          <Link to={plan.next.to} state={location.state} className={cn(heroButtonClass, 'min-w-0 sm:flex sm:w-full')}>
            <Play className="size-5 shrink-0 fill-current" aria-hidden />
            <span className="min-w-0 truncate">Next: {plan.next.title}</span>
          </Link>
          <Link to="/plan" className={quietHeroButtonClass}>
            <ListChecks className="size-5" aria-hidden />
            See plan
          </Link>
        </>
      ) : (
        <>
          <Link to="/plan" className={cn(heroButtonClass, 'sm:flex sm:w-full')}>
            <Sparkles className="size-5" aria-hidden />
            See what you learned
          </Link>
          <Link to="/" className={quietHeroButtonClass}>
            <House className="size-5" aria-hidden />
            Back to Home
          </Link>
        </>
      )}
    </div>
  )
}
