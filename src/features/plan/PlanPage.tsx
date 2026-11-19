import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, CalendarClock, CalendarDays, Check, ChevronDown, Layers, ListChecks, Moon, Play, TrendingUp, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { saveStudyDays, studySettingsOptions, useStudySettings, type StudySettings } from '@/features/settings/api'
import { FROM_PLAN_PAGE, planTaskLink } from '@/lib/planLinks'
import type { SubjectSummary } from '@/lib/quiz'
import { setDayMode } from '@/lib/studyDays'
import { weekRecap } from '@/lib/weeklyRecap'
import { isFocusTask, MISTAKE_STEPS, mistakeLadder, reasonFor, type Phase, type PlanAttempt, type StudyPlan } from '@/lib/studyPlan'
import { cn } from '@/lib/utils'
import { learnedToday, type RecapRow } from './planRecap'
import { quietButtonClass, tagClass, TONE_CLASS } from './planStyles'
import { minutesFor, PHASE_ABOUT, PHASE_LABEL, progressText, reasonNote, taskNote, taskTileLabel, taskTitle, taskWhy, tomorrowLine, type PlanRow } from './planText'
import { weekSoFar, weekTiles } from './planWeek'
import { useTodaysPlan } from './useTodaysPlan'
import { PlanDevPanel } from './PlanDevPanel'
import { WeekCard } from './WeekCard'
import { markRecapSeen, readRecapSeen } from './recapSeen'
import { WeeklyRecap } from './WeeklyRecap'

// /plan: today's three tasks in full (with why each one is there), the road to the exam,
// the past mistakes coming back, and tomorrow. The slim bar on Home starts the next task; this page explains.
export default function PlanPage() {
  const today = useTodaysPlan()
  const settings = useStudySettings()
  // The plan's "today" (in DEV, maybe a pretend date: planDev.ts).
  const now = today.now
  const [swapOpen, setSwapOpen] = useState(false)
  // The weekly recap: the Monday of the last week she closed it for (this device), and the sheet to see it again.
  const [recapSeen, setRecapSeen] = useState(readRecapSeen)
  const [recapOpen, setRecapOpen] = useState(false)

  if (today.loading) return <FullPageMessage>Making today’s plan…</FullPageMessage>
  if (!today.plan) return <FullPageMessage>Couldn’t make today’s plan. Check your internet connection, then refresh.</FullPageMessage>

  const { plan, rows, progress, current, allDone, rest, started, preview, input, summary } = today
  // All done: what moved today, instead of three green "Done" boxes.
  const recap = allDone && input ? learnedToday(plan, progress, summary, input.attempts, now) : null
  // This week: what she did each day, today, and her choices for the days ahead.
  const tiles = input
    ? weekTiles({
        today: now,
        studyDays: input.studyDays,
        attempts: input.attempts,
        dailyTarget: input.dailyTarget,
        examDate: input.examDate,
        todayLabel: rest ? 'Rest' : current ? taskTileLabel(current.task) : 'Done',
        tomorrow: preview,
      })
    : null
  // How many past mistakes a day's plan takes ("137 waiting · about 10 a day"); null when today's plan has none.
  const mistakesTask = plan.tasks.find((t) => t.kind === 'mistakes')
  const mistakesPerDay = mistakesTask?.kind === 'mistakes' ? mistakesTask.count : null
  const doneCount = rows.filter((r) => r.complete).length
  const left = current ? current.items - current.done : 0
  // "about 35 min" beside "Today's tasks": the time the tasks not done yet still take.
  const minutesLeft = rows.reduce((sum, r) => (r.complete ? sum : sum + (minutesFor(r.task, r.items - r.done) ?? 0)), 0)
  // Swap changes the first subject task that isn't done yet.
  const swapRow = rows.find((r) => isFocusTask(r.task) && !r.complete)
  const dateLine = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  // "Your week": last week's recap, on top the first time she opens the Plan page in a new week.
  const lastWeek = input ? weekRecap(input.attempts, now, input.studyDays) : null
  const showRecap = lastWeek !== null && recapSeen !== lastWeek.weekStart
  // Its focus line: what today's plan works on (on a rest day, tomorrow's).
  const recapFocus = plan.tasks.find(isFocusTask) ?? preview?.task ?? null
  const recapStart = current ? { to: planTaskLink(current.task, left) } : null
  function closeRecap() {
    if (!lastWeek) return
    markRecapSeen(lastWeek.weekStart)
    setRecapSeen(lastWeek.weekStart)
    setRecapOpen(false)
  }

  // The gold button (and Swap beside it). On a tablet or phone it floats at the bottom of the screen (thumb zone);
  // on a computer it sits right under the notes.
  const startBar = current ? (
    <div className={cn('grid gap-2', swapRow && 'grid-cols-[auto_minmax(0,1fr)]')}>
      {swapRow && (
        <button type="button" onClick={() => setSwapOpen(true)} aria-haspopup="dialog" className={cn(quietButtonClass, 'h-12')}>
          <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
          Swap
        </button>
      )}
      <Link to={planTaskLink(current.task, left)} state={FROM_PLAN_PAGE} className={cn(heroButtonClass, 'min-w-0 px-4 sm:flex sm:w-full')}>
        <Play className="size-4 shrink-0 fill-current" aria-hidden />
        <span className="min-w-0 truncate">
          {current.done > 0 ? 'Continue' : 'Start'}: {taskTitle(current.task, left)}
        </span>
      </Link>
    </div>
  ) : null

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Today’s plan"
        subtitle={dateLine}
        actions={
          <div className="flex items-center gap-3">
            {/* DEV ONLY (npm run dev): pretend dates and situations. Never in the deployed app. */}
            {import.meta.env.DEV && <PlanDevPanel today={today} />}
            {rest ? (
              <p className="font-heading text-lg font-bold text-rest">Rest day</p>
            ) : (
              <div className="sm:text-right">
                <p className={cn('text-base', allDone ? 'font-semibold text-correct' : 'text-muted-foreground')} aria-live="polite">
                  <span className={cn('font-heading text-xl font-bold tabular-nums', !allDone && 'text-foreground')}>{doneCount}</span> of {rows.length} done
                </p>
                {/* one small pill per task, green when it's done */}
                <div aria-hidden className="mt-1.5 flex gap-1 sm:justify-end">
                  {rows.map((r) => (
                    <span key={r.index} className={cn('h-2 w-8 rounded-full border-[1.5px] border-ink', r.complete ? 'bg-correct' : 'bg-secondary')} />
                  ))}
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* A new week: last week's recap first (once; then from "Last week's recap" on This week). */}
      {showRecap && (
        <WeeklyRecap
          recap={lastWeek}
          focus={recapFocus}
          start={recapStart}
          onDone={closeRecap}
          onPlanWeek={() => {
            closeRecap()
            // After the recap closes, bring This week into view (it sits under the tasks).
            requestAnimationFrame(() => document.getElementById('week-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
          }}
        />
      )}

      {/* ---------- Today's tasks first: sticky notes, then Swap + the gold button ---------- */}
      <section aria-labelledby={rest || recap ? undefined : 'tasks-heading'} aria-label={rest || recap ? 'Today' : undefined} className="space-y-3">
        {!rest && !recap && (
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="tasks-heading" className="font-heading text-lg font-bold">
              Today’s tasks
            </h2>
            {minutesLeft > 0 && (
              <span className="text-sm text-muted-foreground">
                about {minutesLeft} min{doneCount > 0 && ' left'}
              </span>
            )}
          </div>
        )}
        {plan.mode === 'light' && !allDone && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border-2 border-ink bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary-deep">Light day</span>
            One small task today, your choice.
          </p>
        )}
        {plan.comeback && !allDone && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="rounded-full border-2 border-ink bg-highlight px-2.5 py-0.5 text-xs font-bold text-foreground">Welcome back!</span>
            A lighter day to get going again. Nothing piles up.
          </p>
        )}
        {rest ? (
          <RestCard />
        ) : recap ? (
          <LearnedCard rows={recap} />
        ) : (
          // pt-3: room for the tape on top of each note. One column on a phone; side by side from sm.
          <ol className={cn('grid grid-cols-[minmax(0,1fr)] gap-5 pt-3', NOTE_COLUMNS[rows.length] ?? 'sm:grid-cols-3')}>
            {rows.map((row, i) => (
              <TaskNote key={row.index} row={row} plan={plan} isCurrent={row.index === current?.index} tilt={i} />
            ))}
          </ol>
        )}

        {/* Computer: the gold button right under the notes (tablet and phone: it floats at the bottom, below). */}
        {startBar ? (
          <div className="hidden pt-1 lg:block">{startBar}</div>
        ) : (
          // All done: no "Extra practice" here. The day has a clear finish line (Practice is still in the menu).
          // Rest day: only the way to change her mind.
          rest &&
          settings.data && (
            <div className="flex flex-wrap justify-end gap-2">
              <StudyAnywayButton settings={settings.data} today={now} />
            </div>
          )
        )}
        {/* All done (or resting): a peek at tomorrow, a reason to come back. */}
        {(allDone || rest) && preview && (
          <p className="flex items-center gap-2.5 rounded-2xl border-2 border-dashed border-primary bg-primary/5 px-3 py-2 text-sm">
            <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-bold">Tomorrow:</span> {tomorrowLine(preview)}
            </span>
          </p>
        )}
      </section>

      {/*
        Her week, past mistakes, and the road to the exam.
        Tablet/phone: one column (week, road, mistakes). Computer: week + mistakes side by side (about the same height),
        then the road across the whole width. minmax(0,…) so a long tag can't push a column wider than the screen.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-stretch">
        {/* The app picks what to study; she picks when (full, light or rest). */}
        {tiles && settings.data && (
          <WeekCard
            tiles={tiles}
            soFar={weekSoFar(tiles, input?.attempts ?? [], now)}
            settings={settings.data}
            today={now}
            started={started}
            onRecap={lastWeek && !showRecap ? () => setRecapOpen(true) : undefined}
          />
        )}
        <div className="lg:order-3 lg:col-span-2">
          <RoadCard plan={plan} examDate={input?.examDate ?? null} />
        </div>
        {input && (
          <div className="lg:order-2">
            <MistakesCard attempts={input.attempts} perDay={mistakesPerDay} />
          </div>
        )}
      </div>

      {/* Tablet and phone: the gold button floats at the bottom of the screen (thumb zone), above the phone's tab bar. */}
      {startBar && (
        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 rounded-3xl border-[2.5px] border-ink bg-card/95 p-2.5 shadow-toon backdrop-blur md:bottom-4 lg:hidden">
          {startBar}
        </div>
      )}

      {lastWeek && (
        <Dialog open={recapOpen} onClose={() => setRecapOpen(false)} labelledBy="recap-sheet-heading" variant="sheet">
          <WeeklyRecap id="recap-sheet-heading" recap={lastWeek} focus={recapFocus} start={recapStart} onDone={closeRecap} />
        </Dialog>
      )}

      {/* Swap: another subject for today (tomorrow's plan still starts from her weakest) */}
      <Dialog open={swapOpen} onClose={() => setSwapOpen(false)} labelledBy="swap-heading" variant="sheet">
        <SwapList
          plan={plan}
          summary={summary}
          swapRow={swapRow}
          onClose={() => setSwapOpen(false)}
          onPick={(subject) => {
            if (swapRow) today.swap(swapRow.index, subject)
            setSwapOpen(false)
          }}
        />
      </Dialog>
    </div>
  )
}

/** How many notes side by side (from sm): a light day's single note stays note-sized instead of stretching across. */
const NOTE_COLUMNS: Record<number, string> = {
  1: 'sm:grid-cols-[minmax(0,22rem)]',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
}

/** A small, different tilt per note (and per piece of tape), so they look stuck on by hand. Straightens on hover. */
const NOTE_TILT = ['-rotate-[1.2deg]', 'rotate-[0.8deg]', '-rotate-[0.6deg]']
const TAPE_TILT = ['-rotate-3', 'rotate-[4deg]', '-rotate-2']

/**
 * One task as a sticky note: number (or a check), time, its name, the tag, and one line on why it's in the plan.
 * Yellow = the one she's on, white = still to do, green = done.
 */
function TaskNote({ row, plan, isCurrent, tilt }: { row: PlanRow; plan: StudyPlan; isCurrent: boolean; tilt: number }) {
  const { task, index, items, done, complete } = row
  const note = taskNote(task, plan)
  const minutes = minutesFor(task, items - done)
  return (
    <li className={cn('relative motion-safe:transition-transform hover:rotate-0', NOTE_TILT[tilt % NOTE_TILT.length])}>
      {/* the piece of tape holding the note */}
      <span
        aria-hidden
        className={cn('absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 rounded-sm border border-ink/15 bg-white/75', TAPE_TILT[tilt % TAPE_TILT.length])}
      />
      <div
        className={cn(
          'flex h-full flex-col gap-2.5 rounded-xl border-2 border-ink bg-card p-4 pt-5 shadow-toon-sm',
          complete && 'border-correct bg-correct-soft',
          isCurrent && 'border-[2.5px] bg-highlight-soft shadow-toon',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            aria-hidden
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-full border-2 border-ink bg-secondary font-heading font-bold',
              complete && 'border-correct bg-correct text-white',
              isCurrent && 'bg-highlight',
            )}
          >
            {complete ? <Check className="size-4" strokeWidth={3} /> : index + 1}
          </span>
          {complete ? (
            <span className="text-xs font-bold text-correct">Done</span>
          ) : (
            minutes !== null && <span className="text-xs font-bold whitespace-nowrap text-muted-foreground">~{minutes} min</span>
          )}
        </div>
        <h3 className={cn('font-heading text-lg leading-tight font-bold', complete && 'text-correct')}>
          {taskTitle(task)}
          {complete && <span className="sr-only"> (done)</span>}
        </h3>
        {complete ? (
          <p className="text-sm text-muted-foreground">Nice work. Ticked off for today.</p>
        ) : (
          <>
            <span>
              <span className={cn(tagClass, TONE_CLASS[note.tone])}>{note.text}</span>
            </span>
            {/* The "why" line only on the note she's on: the tag already says why for the others (less to read). */}
            {isCurrent && <p className="text-sm text-muted-foreground">{taskWhy(task)}</p>}
          </>
        )}
        {/* started but not finished: how far she is */}
        {!complete && done > 0 && (
          <div className="mt-auto pt-1">
            <div aria-hidden className="h-2 overflow-hidden rounded-full border-[1.5px] border-ink bg-card">
              <div className="h-full bg-highlight" style={{ width: `${Math.min(100, (done / items) * 100)}%` }} />
            </div>
            <p className="mt-1 text-xs font-bold tabular-nums">{progressText(row)}</p>
          </div>
        )}
      </div>
    </li>
  )
}

/** Today is a rest day (her choice in "This week"). */
function RestCard() {
  return (
    <section aria-labelledby="rest-heading" className="flex items-start gap-3 rounded-3xl border-[2.5px] border-rest bg-rest-soft p-4">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-rest bg-card text-rest">
        <Moon className="size-5" />
      </span>
      <div>
        <h2 id="rest-heading" className="font-heading text-xl font-bold text-rest">
          Rest day
        </h2>
        <p className="mt-0.5 text-sm">No tasks today, and your streak stays safe. A rest helps what you learned settle in. See you tomorrow!</p>
      </div>
    </section>
  )
}

/** On a rest day: change her mind and make today a full day (the plan is made right away). */
function StudyAnywayButton({ settings, today }: { settings: StudySettings; today: Date }) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  async function studyToday() {
    const next = setDayMode(settings.studyDays, today, 'full', false, today)
    setSaving(true)
    setError(false)
    try {
      await saveStudyDays(next)
      queryClient.setQueryData(studySettingsOptions.queryKey, { ...settings, studyDays: next })
      void queryClient.invalidateQueries({ queryKey: studySettingsOptions.queryKey })
    } catch {
      setError(true)
    }
    setSaving(false)
  }
  return (
    <>
      {error && (
        <p role="alert" className="w-full text-right text-sm font-semibold text-wrong">
          Couldn’t save. Check your internet connection, then try again.
        </p>
      )}
      <button type="button" onClick={studyToday} disabled={saving} className={quietButtonClass}>
        <ListChecks className="size-4 shrink-0" aria-hidden />
        {saving ? 'Making your plan…' : 'Study today anyway'}
      </button>
    </>
  )
}

const PHASES: Phase[] = ['build', 'strengthen', 'simulate']

/** Build → Strengthen → Simulate, with "You" on the current one. No exam date (or it passed): a nudge to set it. */
function RoadCard({ plan, examDate }: { plan: StudyPlan; examDate: string | null }) {
  const at = plan.phase ? PHASES.indexOf(plan.phase) : -1
  const examLabel = examDate
    ? new Date(Number(examDate.slice(0, 4)), Number(examDate.slice(5, 7)) - 1, Number(examDate.slice(8, 10))).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  return (
    <section aria-labelledby="road-heading" className="h-full rounded-3xl border-[2.5px] border-ink bg-card p-4 shadow-toon sm:p-5">
      <h2 id="road-heading" className="flex items-baseline justify-between gap-3 font-heading text-lg font-bold">
        Road to the exam
        {plan.daysLeft !== null && plan.daysLeft >= 0 && examLabel && (
          <span className="font-sans text-sm font-normal text-muted-foreground">
            {examLabel} · {plan.daysLeft === 0 ? 'today' : `${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'}`}
          </span>
        )}
      </h2>
      {at >= 0 ? (
        // One column per phase: its bar, then its name ("You" beside the one she's in), then what it's about.
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {PHASES.map((p, i) => (
            <li key={p} aria-current={i === at ? 'step' : undefined}>
              <span aria-hidden className={cn('block h-3 rounded-full border-2 border-ink', i < at ? 'bg-primary' : i === at ? 'bg-highlight' : 'bg-secondary')} />
              <span className={cn('mt-2 flex flex-wrap items-center gap-1.5 font-heading text-sm font-bold', i !== at && 'text-muted-foreground')}>
                {PHASE_LABEL[p]}
                {i === at && <span className="rounded-md bg-ink px-1.5 text-[10px] leading-4 text-white">You</span>}
              </span>
              {/* What a phase is about: only for the one she's in. */}
              {i === at && <span className="block text-xs text-muted-foreground">{PHASE_ABOUT[p]}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          <CalendarClock className="mr-1 inline size-4 align-[-3px] text-primary" aria-hidden />
          <Link to="/settings" className="font-semibold text-primary hover:underline">
            {examDate ? 'Set your next exam date' : 'Set your exam date'}
          </Link>{' '}
          to see your road: Build, then Strengthen, then Simulate.
        </p>
      )}
    </section>
  )
}

const STEP_LABELS = MISTAKE_STEPS.map((d) => `${d} ${d === 1 ? 'day' : 'days'}`)

/**
 * Past mistakes: everything still waiting as one big number ("21 waiting · about 10 a day", oldest first),
 * then one box per step (1, 3, 7, 14 days) and the fixed ones. The step boxes add up to the big number,
 * and the 1-day box (gold) is where every new mistake starts, so she sees where they all are.
 */
function MistakesCard({ attempts, perDay }: { attempts: readonly PlanAttempt[]; perDay: number | null }) {
  const { waiting, fixed } = mistakeLadder(attempts)
  const waitingTotal = waiting.reduce((sum, n) => sum + n, 0)
  const total = waitingTotal + fixed
  const [howOpen, setHowOpen] = useState(false)
  return (
    <section aria-labelledby="mistakes-heading" className="h-full rounded-3xl border-[2.5px] border-ink bg-card p-4 shadow-toon sm:p-5">
      <h2 id="mistakes-heading" className="flex items-baseline justify-between gap-3 font-heading text-lg font-bold">
        Past mistakes
        {perDay !== null && waitingTotal > 0 && <span className="font-sans text-sm font-normal text-muted-foreground">about {perDay} a day</span>}
      </h2>
      {total === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nothing yet. Questions you miss show up here, then come back after 1, 3, 7 and 14 days.</p>
      ) : (
        <>
          <p className="mt-4 flex items-baseline gap-2">
            <span className="font-heading text-3xl leading-none font-bold tabular-nums">{waitingTotal}</span>
            <span className="text-sm text-muted-foreground">waiting{waitingTotal > 0 && ', oldest first'}</span>
          </p>
          <ul className="mt-4 grid grid-cols-5 gap-2 text-center" aria-label="Where they are">
            {waiting.map((n, i) => (
              <li
                key={STEP_LABELS[i]}
                className={cn('rounded-xl border-ink px-0.5 py-2', i === 0 ? 'border-[2.5px] bg-highlight-soft' : 'border-2 bg-secondary')}
              >
                <span className="block font-heading text-xl leading-tight font-bold tabular-nums">{n}</span>
                <span className="text-[11px] text-muted-foreground">{STEP_LABELS[i]}</span>
              </li>
            ))}
            <li className="rounded-xl border-2 border-correct bg-correct-soft px-0.5 py-2">
              <span className="block font-heading text-xl leading-tight font-bold text-correct tabular-nums">{fixed}</span>
              <span className="text-[11px] text-muted-foreground">fixed</span>
            </li>
          </ul>
          {/* How the steps work: hidden until she asks (less to read every day). */}
          <button
            type="button"
            onClick={() => setHowOpen((o) => !o)}
            aria-expanded={howOpen}
            aria-controls="mistakes-how"
            className="-my-1 mt-2 flex items-center gap-1 rounded-md py-1 text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            How it works
            <ChevronDown className={cn('size-3.5 motion-safe:transition-transform', howOpen && 'rotate-180')} aria-hidden />
          </button>
          {howOpen && (
            <p id="mistakes-how" className="mt-1 text-xs text-muted-foreground">
              A miss starts at 1 day. Get it right and it climbs a step (comes back later). Right at 14 days, and it’s fixed.
            </p>
          )}
        </>
      )}
    </section>
  )
}

const RECAP_ICON = {
  topic: { icon: TrendingUp, className: 'bg-correct-soft text-correct' },
  fixed: { icon: Check, className: 'bg-correct-soft text-correct' },
  cards: { icon: Layers, className: 'bg-primary/10 text-primary' },
  other: { icon: Check, className: 'bg-primary/10 text-primary' },
  retry: { icon: Undo2, className: 'bg-highlight-soft text-foreground' },
} as const

/** "What you learned today": one line per task, with what moved (a topic's score, mistakes fixed). */
function LearnedCard({ rows }: { rows: RecapRow[] }) {
  return (
    <section aria-labelledby="learned-heading" className="rounded-3xl border-[2.5px] border-correct bg-card p-4 shadow-toon">
      <h2 id="learned-heading" className="font-heading text-xl font-bold text-correct">
        What you learned today
      </h2>
      <ul className="mt-1 divide-y-2 divide-secondary">
        {rows.map((row, i) => {
          const { icon: Icon, className } = RECAP_ICON[row.kind]
          return (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl border-2 border-ink', className)}>
                <Icon className="size-4.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{row.title}</p>
                <p className="text-sm text-muted-foreground">{row.detail}</p>
              </div>
              {row.kind === 'topic' && row.to !== null && (
                <p className="shrink-0 font-heading text-lg font-bold whitespace-nowrap tabular-nums">
                  <span className="text-base text-muted-foreground">{row.from === null ? 'new' : `${Math.floor(row.from * 100)}%`}</span>
                  <span aria-hidden className="text-muted-foreground"> → </span>
                  <span className="sr-only"> to </span>
                  <span className={row.from === null || row.to >= row.from ? 'text-correct' : 'text-foreground'}>{Math.floor(row.to * 100)}%</span>
                </p>
              )}
              {row.kind === 'fixed' && <p className="shrink-0 font-heading text-lg font-bold whitespace-nowrap text-correct tabular-nums">{row.score}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The Swap sheet: every subject with its score; the other subjects already in the plan are left out. */
function SwapList({
  plan,
  summary,
  swapRow,
  onClose,
  onPick,
}: {
  plan: StudyPlan
  summary: SubjectSummary[]
  swapRow: PlanRow | undefined
  onClose: () => void
  onPick: (subject: SubjectSummary) => void
}) {
  const takenIds = new Set(plan.tasks.flatMap((t, i) => (isFocusTask(t) && i !== swapRow?.index ? [t.subjectId] : [])))
  const swapTask = swapRow && isFocusTask(swapRow.task) ? swapRow.task : null
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="swap-heading" className="font-heading text-lg font-bold">
            Swap task {swapRow ? swapRow.index + 1 : ''}
          </h2>
          <p className="text-sm text-muted-foreground">Pick another subject for today. Tomorrow’s plan still starts from your weakest.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <ul className="divide-y-2 divide-secondary">
        {summary
          .filter((s) => !takenIds.has(s.subjectId))
          .map((s) => {
            const picked = swapTask?.subjectId === s.subjectId
            const note = reasonNote(reasonFor(s))
            return (
              <li key={s.subjectId}>
                <button
                  type="button"
                  aria-current={picked || undefined}
                  onClick={() => (picked ? onClose() : onPick(s))}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <span className={cn('min-w-0', picked && 'font-bold')}>{s.name}</span>
                  <span className={cn(tagClass, picked ? TONE_CLASS[note.tone] : 'border-ink/40 bg-secondary')}>
                    {s.accuracy === null || s.attempts === 0 ? 'Not tried' : `${Math.floor(s.accuracy * 100)}%`}
                    {picked && ' · picked'}
                  </span>
                </button>
              </li>
            )
          })}
      </ul>
    </div>
  )
}
