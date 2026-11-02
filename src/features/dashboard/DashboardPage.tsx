import { FullPageMessage } from '@/components/FullPageMessage'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPercent, PASSING_RATE, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useTopicPerformance } from './api'

// One horizontal bar per subject with a line at 60%.
// Below 60% is marked with color AND an icon + text, so it never relies on color alone.
function AccuracyBar({ rate, label }: { rate: number | null; label: string }) {
  const below = rate !== null && rate < PASSING_RATE
  return (
    <div className="relative h-3 rounded-full bg-muted" role="img" aria-label={label} title={label}>
      {rate !== null && (
        <div
          className={cn('h-full rounded-full', below ? 'bg-red-600' : 'bg-primary')}
          style={{ width: `${Math.max(rate * 100, 2)}%` }}
        />
      )}
      {/* 60% passing line */}
      <div
        className="absolute -top-1 -bottom-1 w-0.5 bg-foreground/60"
        style={{ left: `${PASSING_RATE * 100}%` }}
        aria-hidden
      />
    </div>
  )
}

function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const hasData = subject.accuracy !== null
  return (
    <details className="group border-b py-3 last:border-0">
      <summary className="cursor-pointer list-none space-y-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">
            {subject.code} <span className="text-sm font-normal text-muted-foreground">{subject.name}</span>
          </span>
          <span className="shrink-0 text-sm tabular-nums">
            {hasData ? (
              <>
                {subject.belowPassing && <span className="font-semibold text-red-700">⚠ Below 60% · </span>}
                <span className="font-semibold">{formatPercent(subject.accuracy!)}</span>
                <span className="text-muted-foreground"> · {subject.attempts} answered</span>
              </>
            ) : (
              <span className="text-muted-foreground">No answers yet</span>
            )}
          </span>
        </div>
        <AccuracyBar
          rate={subject.accuracy}
          label={hasData ? `${subject.code}: ${formatPercent(subject.accuracy!)}` : `${subject.code}: no data`}
        />
      </summary>

      {subject.topics.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">{subject.name} topics, weakest first</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">Topic</th>
              <th className="py-1 text-right font-normal">Answered</th>
              <th className="py-1 text-right font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {subject.topics.map((t) => (
              <tr key={t.topicId} className={cn(t.belowPassing && 'text-red-700')}>
                <td className="py-1">
                  {t.belowPassing && <span aria-label="below 60%">⚠ </span>}
                  {t.name}
                </td>
                <td className="py-1 text-right tabular-nums">{t.attempts}</td>
                <td className="py-1 text-right font-medium tabular-nums">{formatPercent(t.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}

export default function DashboardPage() {
  const performance = useTopicPerformance()
  const subjects = useSubjects()
  const topics = useTopics()

  if (performance.isPending || subjects.isPending || topics.isPending) {
    return <FullPageMessage>Loading…</FullPageMessage>
  }
  if (performance.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Hindi ma-load ang dashboard. Check your internet.</FullPageMessage>
  }

  const summary = summarizePerformance(performance.data, subjects.data, topics.data)
  const weak = summary.filter((s) => s.belowPassing)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Weak-area Dashboard</h1>

      {weak.length > 0 && (
        <p role="status" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          ⚠ Kailangan ng at least 60% sa <strong>bawat</strong> subject. Focus muna sa:{' '}
          <strong>{weak.map((s) => s.code).join(', ')}</strong>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score per subject</CardTitle>
          <CardDescription>Ang guhit ay ang 60% passing line. I-tap ang subject para makita ang topics.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.map((s) => (
            <SubjectRow key={s.subjectId} subject={s} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
