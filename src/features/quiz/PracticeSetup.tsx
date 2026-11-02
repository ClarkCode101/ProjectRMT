import { useState, type FormEvent } from 'react'
import { NativeSelect } from '@/components/NativeSelect'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useSubjects, useTopics } from '@/lib/referenceData'
import type { QuizFilters, SourceFilter } from './api'

const ITEM_COUNTS = [10, 20, 50]

type Props = {
  onStart: (filters: QuizFilters, itemCount: number) => void
  starting: boolean
}

export function PracticeSetup({ onStart, starting }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()

  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [topicId, setTopicId] = useState<number | null>(null)
  const [source, setSource] = useState<SourceFilter>('all')
  const [itemCount, setItemCount] = useState(10)

  const topicsInSubject = (topics.data ?? []).filter((t) => t.subject_id === subjectId)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onStart({ source, subjectId, topicId }, itemCount)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Practice Quiz</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <NativeSelect
              id="subject"
              value={subjectId ?? ''}
              onChange={(e) => {
                setSubjectId(e.target.value ? Number(e.target.value) : null)
                setTopicId(null) // topic list changes with the subject
              }}
            >
              <option value="">All subjects</option>
              {subjects.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="topic">Topic</Label>
            <NativeSelect
              id="topic"
              value={topicId ?? ''}
              disabled={subjectId === null}
              onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{subjectId === null ? 'Pumili muna ng subject' : 'All topics'}</option>
              {topicsInSubject.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <NativeSelect id="source" value={source} onChange={(e) => setSource(e.target.value as SourceFilter)}>
              <option value="all">All (built-in + mine)</option>
              <option value="builtin">Built-in only</option>
              <option value="mine">My questions only</option>
            </NativeSelect>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Number of items</legend>
            <div className="grid grid-cols-3 gap-2">
              {ITEM_COUNTS.map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={itemCount === n ? 'default' : 'outline'}
                  className="h-11 text-base"
                  aria-pressed={itemCount === n}
                  onClick={() => setItemCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </fieldset>

          <Button type="submit" className="h-12 w-full text-base" disabled={starting}>
            {starting ? 'Loading questions…' : 'Start'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
