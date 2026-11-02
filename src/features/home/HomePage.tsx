import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { SubjectCap } from '@/components/specimen'
import { useTopicPerformance } from '@/features/dashboard/api'
import { useMistakes } from '@/features/mistakes/api'
import { formatPercent, summarizePerformance } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

// Countdown, streak and daily target come in Phase 4 (planner/streak).
export default function HomePage() {
  const mistakes = useMistakes()
  const performance = useTopicPerformance()
  const subjects = useSubjects()
  const topics = useTopics()

  const mistakeCount = mistakes.data?.length ?? 0
  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])

  return (
    <div className="space-y-8">
      <Link
        to="/practice"
        className="block rounded-xl bg-primary px-5 py-6 text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:translate-y-px"
      >
        <span className="block text-2xl font-extrabold">Start practice</span>
        <span className="mt-1 block text-primary-foreground/80">
          Pumili ng subject o topic. May paliwanag pagkatapos ng bawat sagot.
        </span>
      </Link>

      <section aria-labelledby="review-heading" className="space-y-2">
        <h2 id="review-heading" className="text-lg font-bold">
          Review Again
        </h2>
        {mistakeCount > 0 ? (
          <Link
            to="/practice?from=mistakes"
            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 outline-none hover:border-input focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <span>
              <span className="font-bold">{mistakeCount}</span> tanong na mali ang huling sagot mo
            </span>
            <span className="flex shrink-0 items-center font-semibold text-primary">
              Practice
              <ChevronRight className="size-4" aria-hidden />
            </span>
          </Link>
        ) : (
          <p className="text-muted-foreground">Wala pang kailangang balikan. Dito mapupunta ang mga mamamali mo.</p>
        )}
      </section>

      <section aria-labelledby="subjects-heading" className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 id="subjects-heading" className="text-lg font-bold">
            Subjects
          </h2>
          <Link to="/dashboard" className="text-sm font-semibold text-primary hover:underline">
            See topics
          </Link>
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {summary.map((s) => (
            <li key={s.subjectId} className="flex items-center gap-3 px-4 py-3">
              <SubjectCap code={s.code} />
              <span className="w-14 shrink-0 font-bold">{s.code}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{s.name}</span>
              <span
                className={cn(
                  'shrink-0 text-right font-bold tabular-nums',
                  s.accuracy === null && 'font-normal text-muted-foreground',
                  s.belowPassing && 'text-wrong',
                )}
              >
                {s.accuracy === null ? 'Wala pang sagot' : formatPercent(s.accuracy)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Kailangan ng at least 60% sa bawat subject para pumasa.</p>
      </section>
    </div>
  )
}
