import { ChevronDown, Play } from 'lucide-react'
import { Link } from 'react-router'
import { headerButtonClass, PageHeader } from '@/components/dashboard'
import { FullPageMessage } from '@/components/FullPageMessage'
import { LowFlag, RangeBar } from '@/components/report'
import { formatPercent, overallStats, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useTopicPerformance } from './api'

// One row per subject. Closed: score and bar. Tap to open: its topics, weakest first.
// Below 60% gets red AND an L flag, so it never relies on color alone.
function SubjectRow({ subject }: { subject: SubjectSummary }) {
  const hasData = subject.accuracy !== null
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none space-y-2.5 px-4 py-3.5 outline-none hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset sm:px-5 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 font-heading text-lg font-bold">{subject.code}</span>
              <span className="truncate text-sm text-muted-foreground">{subject.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
              {subject.belowPassing && <LowFlag />}
              <span className={cn('font-heading text-lg font-bold', !hasData && 'text-sm font-normal text-muted-foreground', subject.belowPassing && 'text-wrong')}>
                {hasData ? formatPercent(subject.accuracy!) : 'No answers yet'}
              </span>
            </span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </div>
          <RangeBar rate={subject.accuracy} label={hasData ? `${subject.code}: ${formatPercent(subject.accuracy!)}` : `${subject.code}: no answers yet`} />
        </summary>

        <div className="space-y-3 bg-background/60 px-4 py-4 sm:px-5">
          {subject.topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven’t answered any questions in this subject yet.</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2" aria-label={`${subject.name} topics, weakest first`}>
              {subject.topics.map((t) => (
                <li key={t.topicId} className="space-y-1.5">
                  <p className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className={cn('shrink-0 font-semibold', t.belowPassing && 'text-wrong')}>{formatPercent(t.accuracy)}</span>
                  </p>
                  <RangeBar rate={t.accuracy} label={`${t.name}: ${formatPercent(t.accuracy)}, ${t.attempts} answered`} />
                </li>
              ))}
            </ul>
          )}
          <Link to={`/practice?subject=${subject.subjectId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <Play className="size-3.5 fill-current" aria-hidden />
            Practice {subject.code}
          </Link>
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
    return <FullPageMessage>Couldn’t load your progress. Check your internet connection, then refresh.</FullPageMessage>
  }

  const summary = summarizePerformance(performance.data, subjects.data, topics.data)
  const stats = overallStats(summary)

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Progress"
        subtitle="You need 60% or higher in every subject to pass."
        actions={
          <Link to={stats.weakest ? `/practice?subject=${stats.weakest.subjectId}` : '/practice'} className={headerButtonClass}>
            <Play className="size-4 fill-current" aria-hidden />
            {stats.weakest ? `Practice ${stats.weakest.code}` : 'Start practice'}
          </Link>
        }
      />

      {/* Three numbers in one quiet strip, instead of three separate cards. */}
      <dl className="grid grid-cols-3 divide-x rounded-xl border bg-card">
        <div className="px-3 py-3.5 sm:px-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">Overall</dt>
          <dd className={cn('font-heading text-2xl font-bold tabular-nums sm:text-3xl', stats.accuracy !== null && stats.accuracy < 0.6 && 'text-wrong')}>
            {stats.accuracy === null ? '—' : formatPercent(stats.accuracy)}
          </dd>
        </div>
        <div className="px-3 py-3.5 sm:px-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">Passing</dt>
          <dd className="font-heading text-2xl font-bold tabular-nums sm:text-3xl">
            {stats.passingSubjects}
            <span className="text-base text-muted-foreground sm:text-lg">/{stats.totalSubjects}</span>
          </dd>
        </div>
        <div className="px-3 py-3.5 sm:px-5">
          <dt className="text-xs text-muted-foreground sm:text-sm">Answered</dt>
          <dd className="font-heading text-2xl font-bold tabular-nums sm:text-3xl">{stats.answered}</dd>
        </div>
      </dl>

      <section aria-labelledby="subjects-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 id="subjects-heading" className="text-lg font-bold">
            Subjects
          </h2>
          <p className="text-xs text-muted-foreground">The tick on each bar marks 60%. Tap a subject for its topics.</p>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {summary.map((s) => (
            <SubjectRow key={s.subjectId} subject={s} />
          ))}
        </ul>
      </section>
    </div>
  )
}
