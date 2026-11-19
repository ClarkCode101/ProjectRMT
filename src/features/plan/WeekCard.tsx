import { useQueryClient } from '@tanstack/react-query'
import { ChartNoAxesColumn, Check, Feather, GraduationCap, ListChecks, Minus, Moon, Play, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '@/components/Dialog'
import { heroButtonClass } from '@/components/report'
import { saveStudyDays, studySettingsOptions, type StudySettings } from '@/features/settings/api'
import { canRest, otherRestDay, setDayMode, type DayMode, type StudyDays } from '@/lib/studyDays'
import { LIGHT_COUNT } from '@/lib/studyPlan'
import { cn } from '@/lib/utils'
import { quietButtonClass } from './planStyles'
import type { TileState, WeekTile } from './planWeek'

const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' })
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })

/** How each tile looks: the box, the round mark, and its icon. */
const TILE_LOOK: Record<TileState, { box: string; mark: string }> = {
  done: { box: 'border-correct bg-correct-soft', mark: 'border-correct bg-correct text-white' },
  some: { box: 'border-correct bg-card', mark: 'border-correct bg-card text-correct' },
  none: { box: 'border-border bg-card text-muted-foreground', mark: 'border-dashed border-input text-muted-foreground' },
  rest: { box: 'border-rest bg-rest-soft', mark: 'border-rest bg-card text-rest' },
  today: { box: 'border-[2.5px] border-ink bg-highlight-soft shadow-toon-sm', mark: 'border-ink bg-highlight text-foreground' },
  planned: { box: 'border-border bg-card', mark: 'border-input bg-card text-primary-deep' },
  exam: { box: 'border-ink bg-ink text-white', mark: 'border-white bg-ink text-white' },
}

/** The icon in a tile's round mark. */
function TileIcon({ tile }: { tile: WeekTile }) {
  const className = 'size-3.5'
  if (tile.mode === 'rest' && (tile.state === 'today' || tile.state === 'planned' || tile.state === 'rest')) return <Moon className={className} strokeWidth={3} />
  switch (tile.state) {
    case 'done':
    case 'some':
      return <Check className={className} strokeWidth={3} />
    case 'none':
      return <Minus className={className} strokeWidth={3} />
    case 'rest':
      return <Moon className={className} strokeWidth={3} />
    case 'today':
      return <Play className={cn(className, 'fill-current')} strokeWidth={3} />
    case 'exam':
      return <GraduationCap className={className} strokeWidth={3} />
    case 'planned':
      return tile.mode === 'light' ? <Feather className={className} strokeWidth={3} /> : <ListChecks className={className} strokeWidth={3} />
  }
}

/**
 * "This week": seven tiles, Monday to Sunday. The app picks WHAT to study; here she picks WHEN:
 * tap today or a day ahead to make it a full, light or rest day.
 */
export function WeekCard({
  tiles,
  soFar,
  settings,
  today,
  started,
  onRecap,
}: {
  tiles: WeekTile[]
  soFar: { studied: number; days: number }
  settings: StudySettings
  today: Date
  /** she has started today's plan (then today stays as it is) */
  started: boolean
  /** shows "Last week's recap" (after she closed it on the page) */
  onRecap?: () => void
}) {
  const [open, setOpen] = useState<WeekTile | null>(null)
  return (
    <section aria-labelledby="week-heading" className="scroll-mt-4 rounded-3xl border-[2.5px] border-ink bg-card p-4 shadow-toon sm:p-5">
      {/* One row: the title on the left; how many days she studied (and last week's recap) on the right. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="week-heading" className="font-heading text-lg font-bold">
          This week
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground">
          <span>
            Studied <span className="font-bold text-foreground tabular-nums">{soFar.studied}</span> of {soFar.days} {soFar.days === 1 ? 'day' : 'days'}
          </span>
          {onRecap && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={onRecap}
                aria-haspopup="dialog"
                className="-my-2 flex items-center gap-1.5 rounded-md py-2 font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <ChartNoAxesColumn className="size-4" aria-hidden />
                Last week’s recap
              </button>
            </>
          )}
        </p>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
        {tiles.map((tile) => (
          <li key={tile.key} className="min-w-0">
            <Tile tile={tile} onOpen={() => setOpen(tile)} />
          </li>
        ))}
      </ol>
      {/* Short on purpose: the day sheet explains full, light and rest (and the one-rest-day rule). */}
      <p className="mt-3 text-xs text-muted-foreground">Tap a day to change it.</p>

      <Dialog open={open !== null} onClose={() => setOpen(null)} labelledBy="day-heading" variant="sheet">
        {open && (
          <DaySheet
            // A new sheet (fresh choices) for each day she opens.
            key={open.key}
            tile={open}
            settings={settings}
            today={today}
            locked={open.state === 'today' && started}
            onClose={() => setOpen(null)}
          />
        )}
      </Dialog>
    </section>
  )
}

function Tile({ tile, onOpen }: { tile: WeekTile; onOpen: () => void }) {
  const look = TILE_LOOK[tile.state]
  const body = (
    <>
      {tile.state === 'today' && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 text-[9px] leading-4 font-bold tracking-wide text-white">TODAY</span>
      )}
      <span className={cn('text-[11px] font-bold tracking-wide uppercase', tile.state !== 'exam' && 'text-muted-foreground')}>{shortDay(tile.date)}</span>
      <span className="font-heading text-lg leading-none font-bold tabular-nums">{tile.date.getDate()}</span>
      <span aria-hidden className={cn('grid size-6 place-items-center rounded-full border-2', look.mark)}>
        <TileIcon tile={tile} />
      </span>
      {/* The words drop on a phone (too narrow); the sheet says it all. */}
      <span className={cn('mt-auto hidden text-[11px] leading-tight sm:block', tile.state === 'today' ? 'font-bold' : tile.state === 'rest' || tile.mode === 'rest' ? 'font-bold text-rest' : tile.state !== 'exam' && 'text-muted-foreground')}>
        {tile.label}
      </span>
    </>
  )
  const box = cn('relative flex h-full min-h-20 w-full flex-col items-center gap-1 rounded-2xl border-2 px-0.5 pt-2 pb-1.5 text-center sm:min-h-26', look.box)
  const name = `${weekday(tile.date)} ${tile.date.getDate()}: ${tile.label}`
  if (!tile.editable) {
    return (
      <div className={box} aria-label={name} role="group">
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${name}. Change this day`}
      className={cn(box, 'outline-none hover:brightness-[0.97] focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px')}
    >
      {body}
    </button>
  )
}

/** Tap a day: full, light or rest, for that day only or every week. */
function DaySheet({ tile, settings, today, locked, onClose }: { tile: WeekTile; settings: StudySettings; today: Date; locked: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const days = settings.studyDays
  const [mode, setMode] = useState<DayMode>(tile.mode)
  // "Every Saturday" starts ticked when the day follows a weekly choice that isn't the usual full day.
  const [every, setEvery] = useState(days.dates[tile.key] === undefined && days.weekly[tile.date.getDay()] !== 'full')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  const restOk = canRest(days, tile.date, every)
  const otherRest = otherRestDay(days, tile.date)
  const isToday = tile.state === 'today'
  const title = `${isToday ? 'Today, ' : ''}${weekday(tile.date)}, ${tile.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  async function save() {
    const next: StudyDays = setDayMode(days, tile.date, mode, every, today)
    setSaving(true)
    setError(false)
    try {
      await saveStudyDays(next)
      // Show it right away (the plan reads the settings), then check with the server.
      queryClient.setQueryData(studySettingsOptions.queryKey, { ...settings, studyDays: next })
      void queryClient.invalidateQueries({ queryKey: studySettingsOptions.queryKey })
      onClose()
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  const options: { value: DayMode; icon: LucideIcon; iconClass: string; title: string; about: string; disabled?: boolean }[] = [
    { value: 'full', icon: ListChecks, iconClass: 'bg-highlight', title: 'Full day', about: `The usual 3 tasks · your daily goal of ${settings.dailyTarget}` },
    { value: 'light', icon: Feather, iconClass: 'bg-primary/10 text-primary-deep', title: 'Light day', about: `One small task: ${LIGHT_COUNT} questions · about 10 min` },
    {
      value: 'rest',
      icon: Moon,
      iconClass: 'bg-rest-soft text-rest',
      title: 'Rest',
      about: restOk ? 'No tasks. Your streak stays safe.' : `Your rest day this week is ${otherRest ? weekday(otherRest) : 'already set'}. One a week keeps the streak safe.`,
      disabled: !restOk,
    },
  ]
  // Ticking "every week" can make rest allowed or not; never leave a choice that can't be saved.
  const chosen = mode === 'rest' && !restOk ? null : mode

  return (
    <div className="space-y-3">
      <div>
        <h2 id="day-heading" className="font-heading text-xl font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{locked ? 'You’ve started today’s plan, so today stays as it is. You can change the days ahead.' : 'How much do you want to study that day?'}</p>
      </div>

      <fieldset disabled={locked || saving} className="space-y-2">
        <legend className="sr-only">How much to study</legend>
        {options.map((o) => {
          const Icon = o.icon
          const selected = chosen === o.value
          return (
            <label
              key={o.value}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-border p-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                selected && 'border-[2.5px] border-ink bg-highlight-soft shadow-toon-sm',
                (o.disabled || locked) && 'cursor-not-allowed opacity-60',
              )}
            >
              <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-xl border-2 border-ink', o.iconClass)}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{o.title}</span>
                <span className="block text-sm text-muted-foreground">{o.about}</span>
              </span>
              <input
                type="radio"
                name="day-mode"
                value={o.value}
                checked={selected}
                disabled={o.disabled}
                onChange={() => setMode(o.value)}
                className="size-5 shrink-0 accent-ink"
              />
            </label>
          )
        })}
        <label className="flex cursor-pointer items-center gap-2.5 px-1 pt-1 text-sm">
          <input type="checkbox" checked={every} onChange={(e) => setEvery(e.target.checked)} className="size-5 accent-ink" />
          Every {weekday(tile.date)}
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm font-semibold text-wrong">
          Couldn’t save. Check your internet connection, then try again.
        </p>
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 pt-1">
        <button type="button" onClick={onClose} className={quietButtonClass}>
          {locked ? 'Close' : 'Cancel'}
        </button>
        {!locked && (
          <button type="button" onClick={save} disabled={saving || chosen === null} className={cn(heroButtonClass, 'h-11 text-base sm:flex sm:w-full')}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}
