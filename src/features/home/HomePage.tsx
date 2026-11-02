import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useTopicPerformance } from '@/features/dashboard/api'
import { useMistakes } from '@/features/mistakes/api'
import { dailyActivity } from '@/lib/activity'
import { overallStats, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { useRecentActivity } from './api'
import { BodyStage, SubjectInfoCard } from './BodyExplorer'
import { ReadinessCard, TrendCards } from './HomeCards'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning!'
  if (hour < 18) return 'Good afternoon!'
  return 'Good evening!'
}

/** The subject to show first: the weakest one below 60%, else one not tried yet, else the lowest score. */
function pickFocus(summary: SubjectSummary[]): SubjectSummary | undefined {
  const byScore = (a: SubjectSummary, b: SubjectSummary) => (a.accuracy ?? 0) - (b.accuracy ?? 0)
  return (
    summary.filter((s) => s.belowPassing).sort(byScore)[0] ??
    summary.find((s) => s.accuracy === null) ??
    [...summary].sort(byScore)[0]
  )
}

// Countdown and daily target come in Phase 4 (planner).
export default function HomePage() {
  const mistakes = useMistakes()
  const performance = useTopicPerformance()
  const subjects = useSubjects()
  const topics = useTopics()
  // Read the clock once when the page opens, not on every re-render.
  const [now] = useState(() => new Date())
  const activity = useRecentActivity(now)
  // null = nothing tapped yet, so show the subject that needs the most work.
  const [selectedId, setSelectedId] = useState<number | null>(null)

  if (performance.isPending || subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (performance.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load your progress. Check your internet connection, then refresh.</FullPageMessage>
  }

  const summary = summarizePerformance(performance.data, subjects.data, topics.data)
  const stats = overallStats(summary)
  const selected = summary.find((s) => s.subjectId === selectedId) ?? pickFocus(summary)
  const selectedTopicIds = topics.data.filter((t) => t.subject_id === selected?.subjectId).map((t) => t.id)
  const mistakeCount = mistakes.data?.length ?? 0

  return (
    // Tablet and up: two columns that exactly fill the screen height, so nothing scrolls.
    // (7rem = the top bar and the page's top/bottom padding in AppLayout.)
    // On a very short window it stops shrinking at min-h and the page scrolls instead of squeezing.
    // Phone: one column that scrolls as usual.
    <div className="grid gap-5 md:h-[calc(100dvh-7rem)] md:min-h-[34rem] md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] lg:gap-6">
      <div className="flex flex-col gap-2 md:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-2xl leading-tight font-bold">{greeting(now.getHours())}</h1>
            <p className="text-sm text-muted-foreground">Turn the body and tap an organ to explore a subject.</p>
          </div>
          {mistakeCount > 0 && (
            <Link
              to="/mistakes"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-[0_8px_20px_-14px_rgb(7_71_94/0.5)] outline-none hover:ring-1 hover:ring-primary focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <RotateCcw className="size-4" aria-hidden />
              Review again
              <span className="rounded-full bg-wrong-soft px-1.5 font-bold text-wrong tabular-nums">{mistakeCount}</span>
            </Link>
          )}
        </div>
        <BodyStage summary={summary} selected={selected} onSelect={setSelectedId} subjectTopicIds={selectedTopicIds} />
      </div>

      <div className="flex flex-col gap-4 md:min-h-0">
        {selected && <SubjectInfoCard subject={selected} />}
        <TrendCards days={dailyActivity(activity.data ?? [], now)} />
        <ReadinessCard stats={stats} summary={summary} />
      </div>
    </div>
  )
}
