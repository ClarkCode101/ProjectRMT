import { CalendarRange, Crosshair, Play } from 'lucide-react'
import { Link } from 'react-router'
import { HeroPanel, heroButtonClass } from '@/components/report'
import type { FocusTask } from '@/lib/studyPlan'
import { cn } from '@/lib/utils'
import { recapHeadline, recapTip, signedDelta, type WeekRecap } from '@/lib/weeklyRecap'
import { quietHeroButtonClass, tagClass, TONE_CLASS } from './planStyles'
import { reasonNote, shortName } from './planText'

/** "Nov 16 – 22", or "Nov 30 – Dec 6" across two months. */
function weekRange(recap: WeekRecap): string {
  const from = recap.days[0].date
  const to = recap.days[6].date
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  return from.getMonth() === to.getMonth() ? `${month(from)} ${from.getDate()} – ${to.getDate()}` : `${month(from)} ${from.getDate()} – ${month(to)} ${to.getDate()}`
}

function Stat({ value, label, note, good = false }: { value: string; label: string; note?: string | null; good?: boolean }) {
  return (
    <li className="rounded-2xl border-2 border-white/25 bg-white/10 px-3 py-2.5">
      <span className="block font-heading text-2xl leading-tight font-bold tabular-nums">{value}</span>
      <span className="block text-xs text-white/75">{label}</span>
      {note && (
        <span className={cn('mt-1 inline-block rounded-lg px-2 py-px text-[11px] font-bold', good ? 'bg-[#4cc27f]/25 text-[#8fe0b0]' : 'bg-white/10 text-white/75')}>
          {note}
        </span>
      )}
    </li>
  )
}

/**
 * "Your week": last week at a glance (from her answers), compared with the week before, and this week's focus.
 * On the Plan page the first time she opens it in a new week; after that, from "Last week's recap" on This week.
 */
export function WeeklyRecap({
  recap,
  focus,
  start,
  onDone,
  onPlanWeek,
  id = 'recap-heading',
}: {
  recap: WeekRecap
  /** what today's plan works on first (its subject, topic and reason) */
  focus: FocusTask | null
  /** the first task of today's plan; null on a rest day or once it's all done */
  start: { to: string } | null
  /** closes the recap (and remembers it was seen) */
  onDone: () => void
  /** "Plan my week": close it and go to This week (only when shown on the page) */
  onPlanWeek?: () => void
  id?: string
}) {
  const max = Math.max(1, ...recap.days.map((d) => d.answered))
  const pct = (rate: number) => Math.round(rate * 100)
  const tip = recapTip(recap)
  const points = recap.accuracy !== null && recap.prevAccuracy !== null ? pct(recap.accuracy) - pct(recap.prevAccuracy) : null
  const note = focus ? reasonNote(focus.reason) : null

  return (
    <HeroPanel labelledBy={id} className="space-y-3.5 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold tracking-wide text-highlight uppercase">Your week</span>
        <span className="text-sm text-white/65">{weekRange(recap)}</span>
      </div>
      <h2 id={id} className="font-heading text-2xl leading-tight font-bold">
        {recapHeadline(recap)}
      </h2>

      <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          value={String(recap.answered)}
          label="questions answered"
          note={recap.prevAnswered > 0 ? `${signedDelta(recap.answered, recap.prevAnswered)} vs the week before` : null}
          good={recap.answered > recap.prevAnswered}
        />
        <Stat
          value={recap.accuracy === null ? '—' : `${pct(recap.accuracy)}%`}
          label="answered right"
          note={points === null ? null : points === 0 ? 'same as the week before' : `${points > 0 ? '+' : '−'}${Math.abs(points)} points`}
          good={points !== null && points > 0}
        />
        <Stat value={String(recap.fixed)} label={recap.fixed === 1 ? 'past mistake fixed' : 'past mistakes fixed'} note={recap.fixed > 0 ? 'for good' : null} good />
        <Stat
          value={`${recap.streak} ${recap.streak === 1 ? 'day' : 'days'}`}
          label="streak"
          note={recap.rested && recap.streak > 0 ? 'your rest day kept it safe' : null}
        />
      </ul>

      {/* One bar per day: green = studied, dashed purple = a rest day she kept, a thin line = no study. */}
      <ol className="grid h-20 grid-cols-7 items-end gap-2" aria-label="Answers per day">
        {recap.days.map((d) => {
          const restKept = d.mode === 'rest' && d.answered === 0
          const name = d.date.toLocaleDateString('en-US', { weekday: 'short' })
          return (
            <li key={d.key} className="flex h-full flex-col items-center justify-end gap-1 text-[11px] text-white/70">
              <span className="sr-only">
                {name}: {restKept ? 'rest day' : `${d.answered} answered`}
              </span>
              <span
                aria-hidden
                className={cn(
                  'block w-full rounded-t-lg rounded-b',
                  restKept ? 'h-7 border-2 border-dashed border-[#b9a9ff]' : d.answered === 0 ? 'h-1 bg-white/25' : 'border-2 border-white',
                  !restKept && d.answered > 0 && (d.mode === 'light' ? 'bg-[#9fd3e6]' : 'bg-[#4cc27f]'),
                )}
                style={!restKept && d.answered > 0 ? { height: `${Math.max(8, (d.answered / max) * 56)}px` } : undefined}
              />
              <span aria-hidden>{name}</span>
            </li>
          )
        })}
      </ol>

      {focus && note && (
        <div className="flex items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-card px-3 py-2.5 text-foreground">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-ink bg-highlight">
            <Crosshair className="size-5" />
          </span>
          {/* The name may wrap on a phone; the tag goes under it. */}
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-wide text-primary uppercase">This week’s focus</span>
            <span className="block font-heading text-lg leading-tight font-bold">
              {shortName(focus.code, focus.name)}
              {focus.topicName && ` · ${focus.topicName}`}
            </span>
            <span className={cn(tagClass, 'mt-1', TONE_CLASS[note.tone])}>{note.text}</span>
          </span>
        </div>
      )}

      {tip && <p className="text-white/90">{tip}</p>}

      <div className={cn('grid gap-2.5 pt-1', onPlanWeek && 'sm:grid-cols-[minmax(0,1fr)_auto]')}>
        {start ? (
          <Link to={start.to} onClick={onDone} className={cn(heroButtonClass, 'sm:flex sm:w-full')}>
            <Play className="size-5 shrink-0 fill-current" aria-hidden />
            Start this week
          </Link>
        ) : (
          <button type="button" onClick={onDone} className={cn(heroButtonClass, 'sm:flex sm:w-full')}>
            Got it
          </button>
        )}
        {onPlanWeek && (
          <button type="button" onClick={onPlanWeek} className={quietHeroButtonClass}>
            <CalendarRange className="size-5" aria-hidden />
            Plan my week
          </button>
        )}
      </div>
    </HeroPanel>
  )
}
