import { useState, type FormEvent, type ReactNode } from 'react'
import { NativeSelect } from '@/components/NativeSelect'
import { SubjectCap } from '@/components/specimen'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import type { QuizFilters, SourceFilter } from './api'

const ITEM_COUNTS = [10, 20, 50]
const SOURCES: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Lahat' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'mine', label: 'Akin' },
]

type Props = {
  onStart: (filters: QuizFilters, itemCount: number) => void
  starting: boolean
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
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary/[0.06] font-bold text-primary' : 'hover:border-input',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  )
}

export function PracticeSetup({ onStart, starting }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()

  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [topicId, setTopicId] = useState<number | null>(null)
  const [source, setSource] = useState<SourceFilter>('all')
  const [itemCount, setItemCount] = useState(10)

  const topicsInSubject = (topics.data ?? []).filter((t) => t.subject_id === subjectId)

  function chooseSubject(id: number | null) {
    setSubjectId(id)
    setTopicId(null) // topic list changes with the subject
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onStart({ source, subjectId, topicId }, itemCount)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <h1 className="text-2xl font-extrabold">Practice</h1>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-bold">Subject</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Tile name="subject" checked={subjectId === null} onChange={() => chooseSubject(null)} className="col-span-2 sm:col-span-3">
            Lahat ng subjects
          </Tile>
          {subjects.data?.map((s) => (
            <Tile key={s.id} name="subject" checked={subjectId === s.id} onChange={() => chooseSubject(s.id)}>
              <SubjectCap code={s.code} />
              <span>
                {s.code}
                <span className="sr-only"> — {s.name}</span>
              </span>
            </Tile>
          ))}
        </div>
      </fieldset>

      {subjectId !== null && (
        <div className="space-y-2">
          <Label htmlFor="topic" className="font-bold">
            Topic
          </Label>
          <NativeSelect id="topic" value={topicId ?? ''} onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Lahat ng topics</option>
            {topicsInSubject.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="grid gap-7 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 font-bold">Galing saan ang tanong</legend>
          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map((s) => (
              <Tile key={s.value} name="source" checked={source === s.value} onChange={() => setSource(s.value)} className="justify-center">
                {s.label}
              </Tile>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-bold">Ilang items</legend>
          <div className="grid grid-cols-3 gap-2">
            {ITEM_COUNTS.map((n) => (
              <Tile key={n} name="count" checked={itemCount === n} onChange={() => setItemCount(n)} className="justify-center tabular-nums">
                {n}
              </Tile>
            ))}
          </div>
        </fieldset>
      </div>

      <Button type="submit" className="h-12 w-full rounded-lg text-base font-bold" disabled={starting}>
        {starting ? 'Kinukuha ang mga tanong…' : `Start ${itemCount} items`}
      </Button>
    </form>
  )
}
