import { useQuery } from '@tanstack/react-query'
import { EyeOff, Flag, Info, Play, SlidersHorizontal, Target, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '@/components/Dialog'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { useTopicPerformance } from '@/features/dashboard/api'
import { DEFAULT_SOURCE, questionPoolOptions, type QuizFilters, type SourceChoice } from '@/features/quiz/api'
import { SourcePicker } from '@/features/quiz/SourcePicker'
import { tubeStatus } from '@/features/quiz/tube'
import { formatClock, MOCK_ITEM_COUNTS, secondsLeft, timeLimitSec, type SavedMock } from '@/lib/mockExam'
import { formatPercent, overallStats, summarizePerformance } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { AnalyzerRotor, type RotorPhase } from './AnalyzerRotor'

// Mock exam setup, laid out like Practice (one screen, read top to bottom):
// the analyzer rotor (turn it to choose a subject, or tap ALL in the middle) → the name plate → dots →
// Items → Start run → the run's rules. Same moves as Practice's carousel: swipe, ‹ ›, arrow keys, dots.

type Props = {
  onStart: (filters: QuizFilters, itemCount: number, label: string) => void
  starting: boolean
  /** an exam she left part-way, saved on this device */
  saved: SavedMock | null
  onResume: () => void
  onDiscard: () => void
}

// The start scene, about 1.7 seconds in all (see AnalyzerRotor):
// spin (the rotor turns twice and slows down) → land (the other tubes fade) → load (the chosen tube slides to the center).
/** Keep in step with .analyzer-spin in index.css. */
const SPIN_MS = 900
const LAND_MS = 200
/** Keep in step with LOAD_TRANSITION in AnalyzerRotor.tsx. */
const LOAD_MS = 600

/** The run's rules, printed along the bottom (short, like a label on real equipment). */
const RULES = [
  { icon: Timer, text: 'Auto-submits at 0:00' },
  { icon: EyeOff, text: 'Answers after you submit' },
  { icon: Flag, text: 'Flag items, come back later' },
  { icon: Target, text: 'Pass: 60% or higher' },
]

export function MockSetup({ onStart, starting, saved, onResume, onDiscard }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()
  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])
  const overall = overallStats(summary)

  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [itemCount, setItemCount] = useState<number>(100)
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>(DEFAULT_SOURCE)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [phase, setPhase] = useState<RotorPhase>('idle')

  const chosen = summary.find((s) => s.subjectId === subjectId)
  const label = chosen?.code ?? 'All subjects'
  const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === subjectId).map((t) => t.id)
  const filters: QuizFilters = { ...sourceChoice, subjectId, topicId: null }
  const pool = useQuery({ ...questionPoolOptions(filters, subjectTopicIds), enabled: subjectId === null || topics.isSuccess })
  const available = pool.data?.length ?? null
  const examItems = available === null ? itemCount : Math.min(itemCount, available)
  const optionsChanged = sourceChoice.source !== 'all' || sourceChoice.verifiedOnly

  // An exam left part-way: offer to resume it first (only one at a time).
  // The clock is read once when the page opens (the exact second doesn't matter here).
  const [openedAt] = useState(() => Date.now())
  const savedLeft = saved ? secondsLeft(saved, openedAt) : 0
  const savedAnswered = saved ? saved.answers.filter((a) => a !== null).length : 0

  // If starting fails (e.g. no internet), put the rotor back so the error message above can be read.
  const wasStarting = useRef(starting)
  useEffect(() => {
    if (wasStarting.current && !starting) setPhase('idle')
    wasStarting.current = starting
  }, [starting])

  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const busy = starting || phase !== 'idle'
  const locked = Boolean(saved) || busy

  // ---------- The order she steps through: ALL first (the real-exam default), then each subject ----------
  const order: (number | null)[] = [null, ...summary.map((s) => s.subjectId)]
  const position = Math.max(0, order.indexOf(subjectId))
  function go(step: -1 | 1) {
    setSubjectId(order[(position + step + order.length) % order.length])
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saved || busy) return // finish or discard the saved one first
    // Reduced motion: no scene, start right away.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onStart(filters, itemCount, label)
    setPhase('spin')
    timers.current = [
      window.setTimeout(() => setPhase('land'), SPIN_MS),
      window.setTimeout(() => setPhase('load'), SPIN_MS + LAND_MS),
      window.setTimeout(() => onStart(filters, itemCount, label), SPIN_MS + LAND_MS + LOAD_MS),
    ]
  }

  // ---------- The name plate under the rotor ----------
  const plateAccuracy = chosen ? chosen.accuracy : overall.accuracy
  const plateStatus = chosen ? tubeStatus(chosen.accuracy, chosen.belowPassing) : tubeStatus(overall.accuracy, overall.accuracy !== null && overall.accuracy < 0.6)
  const plateColor = plateStatus === 'low' ? 'text-wrong' : plateStatus === 'passing' ? 'text-correct' : 'text-muted-foreground'

  return (
    // One screen tall, no scrolling (same as Practice): the rotor takes whatever height is left.
    // Phone: minus the top bar (3.5rem), main's padding (0.5 + 1.5rem) and the bottom nav (5.5rem).
    // Tablet/computer: minus main's padding (pt-5 + pb-5 = 2.5rem). min-h: on a very short screen it scrolls instead of squashing.
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[34rem] max-w-5xl flex-col gap-3 md:h-[calc(100dvh-2.5rem)] md:min-h-[36rem]"
    >
      {/* Tight gaps (gap-3) and one-line subtitle: every px saved goes to the rotor. */}
      <PageHeader title="Mock exam" subtitle="Turn the rotor or tap ALL. Timed like the real exam." />

      {/* ---------- The rotor (with ‹ › right beside it) ---------- */}
      <section aria-label="Analyzer" className="flex min-h-0 flex-1">
        <AnalyzerRotor
          summary={summary}
          selectedId={subjectId}
          onSelect={setSubjectId}
          phase={phase}
          disabled={locked}
          dimmed={Boolean(saved)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
        />
      </section>

      {/* ---------- Name plate. No dots here (unlike Practice): the rotor already shows all seven and the ▼ marks the chosen one. ---------- */}
      <div className="shrink-0 text-center">
        <div aria-live="polite">
          {saved ? (
            <>
              <p className="font-heading text-4xl leading-none font-black tracking-wide md:text-5xl">{saved.label}</p>
              <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                <span className="font-bold text-[#9A5B00]">Paused</span> · {savedAnswered}/{saved.answers.length} answered ·{' '}
                {savedLeft > 0 ? `${formatClock(savedLeft)} left` : 'time is up'}
              </p>
            </>
          ) : (
            <>
              <p key={label} className="animate-in fade-in slide-in-from-bottom-2 font-heading text-4xl leading-none font-black tracking-wide duration-300 md:text-5xl">
                {chosen?.code ?? 'FULL BOARD'}
              </p>
              {/* one line always (truncate), so a long subject name can't wrap and push the rotor around */}
              <p title={chosen?.name} className="mt-2 truncate px-4 text-sm text-muted-foreground">
                {chosen?.name ?? 'All six subjects'}
                {' · '}
                <span className={cn('font-bold tabular-nums', plateColor)}>{plateAccuracy === null ? 'Not started' : `Score ${formatPercent(plateAccuracy)}`}</span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* ---------- Items + Start (or Resume / Discard) ---------- */}
      {saved ? (
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="flex h-12 items-center rounded-lg border bg-card px-5 font-heading font-bold outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Discard
            </button>
            <button type="button" onClick={onResume} disabled={starting} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
              <Play className="size-5 fill-current" aria-hidden />
              {savedLeft > 0 ? 'Resume' : 'See results'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Finish or discard it before starting a new one.</p>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-center gap-2">
          {/* Items and Start: one row on laptops (saves a row of height for the rotor), stacked on phones (too narrow). */}
          <div className="flex flex-col items-center gap-3 lg:flex-row lg:gap-6">
          {/* Items: physical-looking keys (the chosen one is pressed in), and how long that run takes */}
          <fieldset disabled={busy} className="flex items-center gap-3">
            <legend className="sr-only">Items</legend>
            <span aria-hidden className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Items
            </span>
            <div className="flex gap-2">
              {MOCK_ITEM_COUNTS.map((n) => (
                <label
                  key={n}
                  className={cn(
                    'flex h-10 min-w-14 cursor-pointer items-center justify-center rounded-lg border font-mono font-bold tabular-nums transition-[translate,box-shadow,background-color] has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                    itemCount === n
                      ? 'translate-y-0.5 border-primary-deep bg-primary text-white shadow-[inset_0_2px_3px_rgb(0_0_0/0.25)]'
                      : 'border-primary/20 bg-card text-foreground shadow-[0_3px_0_rgb(7_71_94/0.18)] hover:border-primary/50',
                  )}
                >
                  <input type="radio" name="mock-count" checked={itemCount === n} onChange={() => setItemCount(n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
            <span className="flex items-center gap-1 font-mono text-sm font-bold text-muted-foreground tabular-nums">
              <Timer className="size-4" aria-hidden />
              <span className="sr-only">Time limit</span>
              {formatClock(timeLimitSec(examItems))}
            </span>
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              disabled={busy}
              aria-label={optionsChanged ? 'Question options (changed)' : 'Question options'}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <SlidersHorizontal className="size-5" aria-hidden />
              {optionsChanged && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-highlight" aria-hidden />}
            </button>
            <button type="submit" className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')} disabled={busy || available === 0}>
              <Play className="size-5 fill-current" aria-hidden />
              {busy ? 'Starting run…' : `Start run · ${available === null ? '…' : examItems} items`}
            </button>
          </div>
          </div>
          {/* How many questions there are: ALWAYS one line (h-4), so the rotor above doesn't grow and shrink as it comes and goes.
              With fewer than the items picked, a small warning icon explains why Start says fewer items. */}
          <p className="flex h-4 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            {available !== null && available < itemCount && <Info className="size-3.5 shrink-0 text-[#9A5B00]" aria-hidden />}
            {available === null
              ? 'Counting questions…'
              : available === 0
                ? 'No questions here yet. Try another subject or source.'
                : available < itemCount
                  ? `Only ${available} questions available in ${label}`
                  : `${available} questions available`}
          </p>
        </div>
      )}

      {/* ---------- The run's rules: one quiet line under it all (plain text, not things to tap) ---------- */}
      <div className="w-full shrink-0 border-t border-dashed pt-3">
        <h2 className="sr-only">Run protocol</h2>
        {/* centered with even gaps (like the tube key on Practice), not spread to the far edges */}
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
          {RULES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="mock-options-heading" variant="sheet">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="mock-options-heading" className="font-heading text-lg font-bold">
              Question options
            </h2>
            <button
              type="button"
              onClick={() => setOptionsOpen(false)}
              aria-label="Close"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <SourcePicker value={sourceChoice} onChange={setSourceChoice} />
          <button
            type="button"
            onClick={() => setOptionsOpen(false)}
            className="h-11 w-full rounded-lg bg-primary font-heading font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Done
          </button>
        </div>
      </Dialog>
    </form>
  )
}
