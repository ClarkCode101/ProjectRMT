import { useQuery } from '@tanstack/react-query'
import { EyeOff, Flag, Info, Play, SlidersHorizontal, Target, Timer, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '@/components/Dialog'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { useTopicPerformance } from '@/features/dashboard/api'
import { DEFAULT_SOURCE, questionPoolOptions, type QuizFilters, type SourceChoice } from '@/features/quiz/api'
import { SourcePicker } from '@/features/quiz/SourcePicker'
import { formatClock, MOCK_ITEM_COUNTS, secondsLeft, timeLimitSec, type SavedMock } from '@/lib/mockExam'
import { summarizePerformance } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { LabBench } from '@/components/LabBench'
import { AnalyzerRotor, type RotorPhase } from './AnalyzerRotor'

// Mock exam setup, drawn as an analyzer (Practice is the specimen rack; this is the machine for a full run):
// the rotor on the left picks the subject, the display on the right shows the run and has Start.

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

/** The run's rules, printed along the bottom of the machine (short, like a label on real equipment). */
const RULES = [
  { icon: Timer, text: 'Auto-submits at 0:00' },
  { icon: EyeOff, text: 'Answers after you submit' },
  { icon: Flag, text: 'Flag items, come back later' },
  { icon: Target, text: 'Pass: 60% or higher' },
]

// Status light colors. Brighter than the app's --correct / --wrong on purpose: a light on the dark display
// has to look lit, and the darker brand greens and reds are hard to see on deep blue.
const LED = { on: 'bg-[#5EE39A]', paused: 'bg-highlight', off: 'bg-[#FF8A95]' }

type Status = { text: string; light: string; blink?: boolean }

export function MockSetup({ onStart, starting, saved, onResume, onDiscard }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()
  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])

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

  // The status light at the top of the display. Color is never the only signal: the word says it too.
  const status: Status = saved
    ? { text: 'Run paused', light: LED.paused }
    : phase === 'load'
      ? { text: `Loading ${label}`, light: LED.on, blink: true }
      : busy
        ? { text: 'Running', light: LED.on, blink: true }
      : available === 0
        ? { text: 'No samples', light: LED.off }
        : { text: 'Ready', light: LED.on }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Mock exam" subtitle="Load a subject into the analyzer, then start the run. Timed like the real board exam." />

      {/* ---------- The analyzer: one machine standing on the lab bench ----------
          Its body holds the rotor (in a round window) and a small LCD with the run; it has feet, vents and a
          power light so it reads as equipment, not as a card. Start sits under it, like Look on Flashcards. */}
      <section aria-label="Analyzer" className="flex flex-col items-center gap-5">
        <div className="relative w-full max-w-3xl px-2 pb-7">
          {/* the same bench the Practice rack and the Flashcards microscope stand on */}
          <LabBench className="h-12" />

          {/* the machine's body */}
          <div className="relative rounded-[2rem] border border-primary/15 bg-linear-to-b from-card to-secondary/70 p-4 shadow-[inset_0_2px_0_rgb(255_255_255/0.9),0_26px_40px_-30px_rgb(7_71_94/0.8)] sm:p-6">
            {/* top strip: name plate, power light, vents (decoration) */}
            <div aria-hidden className="mb-4 flex items-center justify-between gap-3">
              <span className="font-heading text-xs font-bold tracking-[0.25em] text-muted-foreground uppercase">RMT-6</span>
              <span className="flex items-center gap-3">
                <span className={cn('size-2 rounded-full shadow-[0_0_6px_1px_rgb(94_227_154/0.7)]', LED.on)} />
                <span className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-3.5 w-1 rounded-full bg-primary-deep/15 shadow-[inset_0_1px_1px_rgb(7_71_94/0.3)]" />
                  ))}
                </span>
              </span>
            </div>

            <div className="grid items-center justify-items-center gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:justify-items-stretch md:gap-8">
              <AnalyzerRotor summary={summary} selectedId={subjectId} onSelect={setSubjectId} phase={phase} disabled={Boolean(saved) || busy} dimmed={Boolean(saved)} />

              <div className="w-full max-w-xs space-y-4 md:max-w-none">
                {/* ---------- the LCD: status, what's loaded, run time ---------- */}
                <div className="rounded-xl bg-primary-deep px-4 py-3.5 font-mono text-white shadow-[inset_0_2px_10px_rgb(0_0_0/0.4)]" aria-live="polite">
                  <p className="flex items-center gap-2 text-xs font-bold tracking-widest uppercase">
                    {/* ring-white/20 + a soft glow so the light looks lit */}
                    <span className={cn('size-2.5 rounded-full shadow-[0_0_10px_2px_rgb(255_255_255/0.25)] ring-2 ring-white/20', status.light, status.blink && 'led-blink')} aria-hidden />
                    {status.text}
                  </p>
                  {saved ? (
                    <>
                      <h2 className="mt-2 font-heading text-lg leading-tight font-bold">{saved.label} · in progress</h2>
                      <p className="mt-1 text-sm text-white/80 tabular-nums">
                        {savedAnswered}/{saved.answers.length} answered · {savedLeft > 0 ? `${formatClock(savedLeft)} left` : 'time is up'}
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="mt-2 font-heading text-lg leading-tight font-bold">
                        {chosen?.code ?? 'All subjects'} · {available === null ? '…' : examItems} items
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80 tabular-nums">
                        <Timer className="size-4 opacity-70" aria-hidden />
                        {formatClock(timeLimitSec(examItems))}
                      </p>
                    </>
                  )}
                </div>

                {/* ---------- the machine's Items keys (physical-looking; the chosen one is pressed in) ---------- */}
                {!saved && (
                  <fieldset disabled={busy} className="flex items-center justify-between gap-3">
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
                  </fieldset>
                )}
              </div>
            </div>
          </div>

          {/* the machine's feet, standing on the bench */}
          <span aria-hidden className="absolute bottom-4 left-[12%] h-3 w-10 rounded-b-md bg-primary-deep/80" />
          <span aria-hidden className="absolute right-[12%] bottom-4 h-3 w-10 rounded-b-md bg-primary-deep/80" />
        </div>

        {/* ---------- Start (or Resume / Discard), centered under the machine ---------- */}
        {saved ? (
          <div className="flex flex-col items-center gap-1.5">
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
          <div className="flex flex-col items-center gap-1.5">
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
                {busy ? 'Starting run…' : `Start run · ${examItems} items`}
              </button>
            </div>
            {/* only when there are fewer questions than the items picked */}
            {available !== null && available < itemCount && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="size-3.5 shrink-0 text-[#9A5B00]" aria-hidden />
                {available === 0 ? 'No questions here yet. Try another subject or source.' : `Only ${available} questions in ${chosen?.code ?? 'All subjects'}.`}
              </p>
            )}
          </div>
        )}

        {/* ---------- The run's rules: one quiet line under it all (plain text, not things to tap) ---------- */}
        <div className="w-full border-t border-dashed pt-3">
          <h2 className="sr-only">Run protocol</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground lg:flex lg:flex-wrap lg:justify-between">
            {RULES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

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
