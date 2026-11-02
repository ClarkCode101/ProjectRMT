import { ChevronDown, TriangleAlert } from 'lucide-react'
import { FullPageMessage } from '@/components/FullPageMessage'
import { SubjectCap } from '@/components/specimen'
import { formatPercent, PASSING_RATE, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useTopicPerformance } from './api'

// One horizontal bar per subject with a tick at 60%.
// Below 60% is marked with color AND an icon + text, so it never relies on color alone.
function AccuracyBar({ rate, label }: { rate: number | null; label: string }) {
  const below = rate !== null && rate < PASSING_RATE
  return (
    <div className="relative h-2.5 rounded-full bg-secondary" role="img" aria-label={label} title={label}>
      {rate !== null && (
        <div
          className={cn('h-full rounded-full', below ? 'bg-wrong' : 'bg-primary')}
          style={{ width: `${Math.max(rate * 100, 2)}%` }}
        />
      )}
      <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{ left: `${PASSING_RATE * 100}%` }} aria-hidden />
    </div>
  )
}

function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const hasData = subject.accuracy !== null
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none space-y-2.5 px-4 py-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <SubjectCap code={subject.code} />
            <span className="min-w-0 flex-1">
              <span className="font-bold">{subject.code}</span>
              <span className="block truncate text-sm text-muted-foreground">{subject.name}</span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {hasData ? (
                <>
                  <span className={cn('block text-lg font-extrabold', subject.belowPassing && 'text-wrong')}>
                    {formatPercent(subject.accuracy!)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{subject.attempts} nasagot</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Wala pang sagot</span>
              )}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </div>
          <AccuracyBar
            rate={subject.accuracy}
            label={hasData ? `${subject.code}: ${formatPercent(subject.accuracy!)}` : `${subject.code}: wala pang sagot`}
          />
          {subject.belowPassing && (
            <p className="flex items-center gap-1.5 text-sm font-bold text-wrong">
              <TriangleAlert className="size-4" aria-hidden />
              Below 60%
            </p>
          )}
        </summary>

        <div className="px-4 pb-4">
          {subject.topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">Wala pang nasagot na tanong sa subject na ito.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{subject.name} topics, pinakamahina muna</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-normal">Topic</th>
                  <th className="py-1.5 text-right font-normal">Nasagot</th>
                  <th className="py-1.5 text-right font-normal">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subject.topics.map((t) => (
                  <tr key={t.topicId} className={cn(t.belowPassing && 'text-wrong')}>
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {t.belowPassing && <TriangleAlert className="size-3.5" aria-label="Below 60%" />}
                        {t.name}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{t.attempts}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{formatPercent(t.accuracy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>
    </li>
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
    return <FullPageMessage>Hindi ma-load ang progress. Check your internet, then refresh.</FullPageMessage>
  }

  const summary = summarizePerformance(performance.data, subjects.data, topics.data)
  const weak = summary.filter((s) => s.belowPassing)

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold">Progress</h1>
        <p className="text-muted-foreground">
          Kailangan ng at least 60% sa bawat subject. Ang itim na guhit sa bar ang 60%. I-tap ang subject para makita
          ang topics.
        </p>
      </div>

      {weak.length > 0 && (
        <p role="status" className="flex gap-2 rounded-lg border-l-4 border-wrong bg-wrong-soft p-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-wrong" aria-hidden />
          <span>
            Unahin ang <strong>{weak.map((s) => s.code).join(', ')}</strong>, below 60% pa.
          </span>
        </p>
      )}

      <ul className="divide-y rounded-xl border bg-card">
        {summary.map((s) => (
          <SubjectRow key={s.subjectId} subject={s} />
        ))}
      </ul>
    </div>
  )
}
