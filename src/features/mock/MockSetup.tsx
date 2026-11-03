import { useQuery } from '@tanstack/react-query'
import { Check, EyeOff, Flag, Play, SlidersHorizontal, Target, Timer, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Dialog } from '@/components/Dialog'
import { PageHeader } from '@/components/dashboard'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { useTopicPerformance } from '@/features/dashboard/api'
import { DEFAULT_SOURCE, questionPoolOptions, type QuizFilters, type SourceChoice } from '@/features/quiz/api'
import { SourcePicker } from '@/features/quiz/SourcePicker'
import { formatClock, MOCK_ITEM_COUNTS, secondsLeft, timeLimitSec, type SavedMock } from '@/lib/mockExam'
import { formatPercent, summarizePerformance } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

type Props = {
  onStart: (filters: QuizFilters, itemCount: number, label: string) => void
  starting: boolean
  /** an exam she left part-way, saved on this device */
  saved: SavedMock | null
  onResume: () => void
  onDiscard: () => void
}

/** One row in the subject list (a real radio button). */
function SubjectRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-2.5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary/[0.05] ring-1 ring-primary' : 'hover:border-primary/50',
      )}
    >
      <input type="radio" name="mock-subject" checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', checked ? 'border-primary bg-primary text-white' : 'border-border')}
        aria-hidden
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      {children}
    </label>
  )
}

const RULES = [
  { icon: Timer, text: 'Timed. It submits by itself when time runs out.' },
  { icon: EyeOff, text: 'No answers shown until you submit.' },
  { icon: Flag, text: 'Flag items and come back to them.' },
  { icon: Target, text: '60% or higher to pass.' },
]

export function MockSetup({ onStart, starting, saved, onResume, onDiscard }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()
  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])

  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [itemCount, setItemCount] = useState<number>(100)
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>(DEFAULT_SOURCE)
  const [optionsOpen, setOptionsOpen] = useState(false)

  const chosen = summary.find((s) => s.subjectId === subjectId)
  const label = chosen?.code ?? 'All subjects'
  const subjectTopicIds = (topics.data ?? []).filter((t) => t.subject_id === subjectId).map((t) => t.id)
  const filters: QuizFilters = { ...sourceChoice, subjectId, topicId: null }
  const pool = useQuery({ ...questionPoolOptions(filters, subjectTopicIds), enabled: subjectId === null || topics.isSuccess })
  const available = pool.data?.length ?? null
  const examItems = available === null ? itemCount : Math.min(itemCount, available)
  const optionsChanged = sourceChoice.source !== 'all' || sourceChoice.verifiedOnly

  // An exam left part-way: offer to resume it first (only one at a time).
  // The clock is read once when the page opens (the exact second doesn't matter on this card).
  const [openedAt] = useState(() => Date.now())
  const savedLeft = saved ? secondsLeft(saved, openedAt) : 0
  const savedAnswered = saved ? saved.answers.filter((a) => a !== null).length : 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saved) return // finish or discard the saved one first
    onStart(filters, itemCount, label)
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Mock exam" subtitle="Timed, like the real board exam. Answers are shown only after you submit." />

      {saved && (
        <section aria-labelledby="resume-heading" className="flex flex-col gap-3 rounded-2xl border border-highlight/60 bg-highlight-soft p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="resume-heading" className="font-heading text-lg font-bold">
              You have a mock exam in progress
            </h2>
            <p className="text-sm text-foreground/80 tabular-nums">
              {saved.label} · {savedAnswered} of {saved.answers.length} answered · {savedLeft > 0 ? `${formatClock(savedLeft)} left` : 'time is up'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onDiscard}
              className="h-11 rounded-lg border bg-card px-4 text-sm font-semibold outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onResume}
              disabled={starting}
              className="h-11 rounded-lg bg-primary px-5 font-heading font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
            >
              {savedLeft > 0 ? 'Resume' : 'See results'}
            </button>
          </div>
        </section>
      )}

      <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8', saved && 'pointer-events-none opacity-50')} aria-disabled={Boolean(saved)}>
        {/* ---------- Subject ---------- */}
        <fieldset className="space-y-2.5" disabled={Boolean(saved)}>
          <legend className="mb-2.5 font-heading text-lg font-bold">Subject</legend>
          <SubjectRow checked={subjectId === null} onChange={() => setSubjectId(null)}>
            <span className="min-w-0 flex-1">
              <span className="block font-heading font-bold">All subjects</span>
              <span className="block text-sm text-muted-foreground">A mixed exam from all six</span>
            </span>
          </SubjectRow>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {summary.map((s) => (
              <SubjectRow key={s.subjectId} checked={subjectId === s.subjectId} onChange={() => setSubjectId(s.subjectId)}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-heading font-bold">{s.code}</span>
                    <span className={cn('text-sm font-semibold tabular-nums', s.accuracy === null ? 'font-normal text-muted-foreground' : s.belowPassing ? 'text-wrong' : 'text-correct')}>
                      {s.accuracy === null ? 'New' : formatPercent(s.accuracy)}
                    </span>
                  </span>
                  <span className="block truncate text-sm text-muted-foreground" title={s.name}>
                    {s.name}
                  </span>
                </span>
              </SubjectRow>
            ))}
          </div>
        </fieldset>

        {/* ---------- The exam slip: what she's about to take, and Start (the one colored thing here) ---------- */}
        <HeroPanel labelledBy="slip-heading" className="space-y-5 lg:sticky lg:top-6">
          <div>
            <p className="text-xs font-semibold tracking-wide text-white/60 uppercase">Exam slip</p>
            <h2 id="slip-heading" className="font-heading text-2xl font-bold">
              {chosen?.name ?? 'All subjects'}
            </h2>
          </div>

          <fieldset className="space-y-2" disabled={Boolean(saved)}>
            <legend className="mb-2 text-sm font-semibold text-white/80">Items</legend>
            <div className="flex rounded-lg bg-white/10 p-1">
              {MOCK_ITEM_COUNTS.map((n) => (
                <label
                  key={n}
                  className={cn(
                    'flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md font-heading font-bold tabular-nums transition-colors has-focus-visible:ring-2 has-focus-visible:ring-white/70',
                    itemCount === n ? 'bg-white text-primary-deep' : 'text-white/80 hover:text-white',
                  )}
                >
                  <input type="radio" name="mock-count" checked={itemCount === n} onChange={() => setItemCount(n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <dt className="text-white/70">Time limit</dt>
              <dd className="font-heading text-xl font-bold tabular-nums">{formatClock(timeLimitSec(examItems))}</dd>
            </div>
            <div className="rounded-lg bg-white/10 px-3 py-2">
              <dt className="text-white/70">Questions</dt>
              <dd className="font-heading text-xl font-bold tabular-nums">{available === null ? '…' : examItems}</dd>
            </div>
          </dl>
          {available !== null && available < itemCount && (
            <p className="rounded-md bg-white/10 px-3 py-2 text-sm text-white/90">
              {available === 0 ? 'No questions here yet. Try another subject or source.' : `Only ${available} questions here, so the exam has ${available} items.`}
            </p>
          )}

          <ul className="space-y-2 text-sm text-white/85">
            {RULES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-white/60" aria-hidden />
                {text}
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              disabled={Boolean(saved)}
              aria-label={optionsChanged ? 'Question options (changed)' : 'Question options'}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-white/10 outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/60"
            >
              <SlidersHorizontal className="size-5" aria-hidden />
              {optionsChanged && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-highlight" aria-hidden />}
            </button>
            <button type="submit" className={cn(heroButtonClass, 'flex-1 sm:flex sm:w-full')} disabled={starting || Boolean(saved) || available === 0}>
              <Play className="size-5 fill-current" aria-hidden />
              {starting ? 'Preparing…' : `Start ${examItems} items`}
            </button>
          </div>
        </HeroPanel>
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
