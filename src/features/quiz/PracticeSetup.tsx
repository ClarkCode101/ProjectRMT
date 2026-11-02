import { Play } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { PageHeader } from '@/components/dashboard'
import { NativeSelect } from '@/components/NativeSelect'
import { heroButtonClass } from '@/components/report'
import { Label } from '@/components/ui/label'
import { useTopicPerformance } from '@/features/dashboard/api'
import { formatPercent, summarizePerformance } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import type { QuizFilters, SourceFilter } from './api'

const ITEM_COUNTS = [10, 20, 50]
const SOURCES: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'mine', label: 'Mine' },
]

type Props = {
  onStart: (filters: QuizFilters, itemCount: number) => void
  starting: boolean
  /** Subject to pre-select, e.g. when she taps a subject on Home. */
  initialSubjectId?: number | null
}

/** A radio button that looks like a pressable tile. Real radios keep keyboard + screen readers working. */
function Tile({
  name,
  checked,
  onChange,
  children,
  className,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-primary/50',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  )
}

/** A group of choices with a plain heading. */
function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 flex items-baseline gap-2">
        <span className="font-heading text-lg font-bold">{title}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  )
}

export function PracticeSetup({ onStart, starting, initialSubjectId = null }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()

  const [subjectId, setSubjectId] = useState<number | null>(initialSubjectId)
  const [topicId, setTopicId] = useState<number | null>(null)
  const [source, setSource] = useState<SourceFilter>('all')
  const [itemCount, setItemCount] = useState(10)

  const topicsInSubject = (topics.data ?? []).filter((t) => t.subject_id === subjectId)
  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])
  const chosenSubject = summary.find((s) => s.subjectId === subjectId)
  const chosenTopic = topicsInSubject.find((t) => t.id === topicId)

  function chooseSubject(id: number | null) {
    setSubjectId(id)
    setTopicId(null) // topic list changes with the subject
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onStart({ source, subjectId, topicId }, itemCount)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader title="Practice" subtitle="Choose what to study. You’ll see the explanation after every answer." />

      {/* Phones and tablets: one column, with the Start bar stuck to the bottom of the screen.
          Laptops: choices on the left, a small Start card on the right that follows the scroll. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
        <div className="space-y-7">
          <Group title="Subject">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Tile name="subject" checked={subjectId === null} onChange={() => chooseSubject(null)} className="col-span-2 sm:col-span-3">
                <span className="font-heading text-base font-bold">All subjects</span>
                <span className="text-sm text-muted-foreground">A mix from all six</span>
              </Tile>
              {summary.map((s) => (
                <Tile key={s.subjectId} name="subject" checked={subjectId === s.subjectId} onChange={() => chooseSubject(s.subjectId)}>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-heading text-base font-bold">{s.code}</span>
                      <span
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          s.accuracy === null && 'font-normal text-muted-foreground',
                          s.belowPassing && 'text-wrong',
                        )}
                      >
                        {s.accuracy === null ? 'New' : formatPercent(s.accuracy)}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{s.name}</span>
                  </span>
                </Tile>
              ))}
            </div>
          </Group>

          {subjectId !== null && (
            <Group title="Topic" hint="optional">
              <Label htmlFor="topic" className="sr-only">
                Topic
              </Label>
              <NativeSelect
                id="topic"
                value={topicId ?? ''}
                onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}
                className="h-12 rounded-lg bg-card"
              >
                <option value="">All topics</option>
                {topicsInSubject.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Group>
          )}

          <div className="grid gap-7 sm:grid-cols-2">
            <Group title="Number of items">
              <div className="grid grid-cols-3 gap-2">
                {ITEM_COUNTS.map((n) => (
                  <Tile key={n} name="count" checked={itemCount === n} onChange={() => setItemCount(n)} className="justify-center">
                    <span className="font-heading text-lg font-bold tabular-nums">{n}</span>
                  </Tile>
                ))}
              </div>
            </Group>
            <Group title="Question source">
              <div className="grid grid-cols-3 gap-2">
                {SOURCES.map((s) => (
                  <Tile key={s.value} name="source" checked={source === s.value} onChange={() => setSource(s.value)} className="justify-center font-semibold">
                    {s.label}
                  </Tile>
                ))}
              </div>
            </Group>
          </div>
        </div>

        {/* "contents" below lg lets the bar stick within the whole column, not just this box. */}
        <div className="contents lg:block">
          <div className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] space-y-3 rounded-xl bg-primary-deep p-3 text-white shadow-[0_10px_30px_-12px_rgb(7_71_94/0.6)] md:bottom-4 lg:top-6 lg:bottom-auto lg:p-5">
            <p className="px-1 text-sm text-white/85 lg:px-0 lg:text-base" aria-live="polite">
              <span className="font-bold text-white">{chosenSubject?.code ?? 'All subjects'}</span>
              {chosenSubject && <>, {chosenTopic?.name ?? 'all topics'}</>}
              <span className="block text-white/70 lg:mt-1">
                {itemCount} items, about {itemCount} minutes
              </span>
            </p>
            <button type="submit" className={cn(heroButtonClass, 'sm:flex sm:w-full')} disabled={starting}>
              <Play className="size-5 fill-current" aria-hidden />
              {starting ? 'Loading questions…' : `Start ${itemCount} items`}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
