import { PartyPopper, Play } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { headerButtonClass, PageHeader } from '@/components/dashboard'
import { FullPageMessage } from '@/components/FullPageMessage'
import { MistakeItem } from '@/components/MistakeItem'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { useSubjectOfTopic } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { useMistakes } from './api'

export default function MistakesPage() {
  const mistakes = useMistakes()
  const subjectOf = useSubjectOfTopic()
  // Which subject's mistakes to list; null = all of them.
  const [filter, setFilter] = useState<string | null>(null)

  if (mistakes.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (mistakes.isError) return <FullPageMessage>Couldn’t load the list. Check your internet connection, then refresh.</FullPageMessage>

  if (mistakes.data.length === 0) {
    return (
      <div className="mx-auto max-w-xl pt-4 sm:pt-10">
        <HeroPanel labelledBy="review-heading" className="space-y-4 text-center">
          <PartyPopper className="mx-auto size-10 text-highlight" aria-hidden />
          <div>
            <h1 id="review-heading" className="text-3xl font-bold">
              All clear!
            </h1>
            <p className="mt-1 text-white/85">Nothing to review right now. Questions you miss in practice will show up here.</p>
          </div>
          <Link to="/practice" className={heroButtonClass}>
            <Play className="size-5 fill-current" aria-hidden />
            Start practice
          </Link>
        </HeroPanel>
      </div>
    )
  }

  const withSubject = mistakes.data.map((m) => ({ ...m, subject: subjectOf(m.topicId) }))
  // How many mistakes per subject, for the filter chips.
  const counts = new Map<string, number>()
  for (const m of withSubject) {
    const code = m.subject.code ?? '—'
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  const shown = filter === null ? withSubject : withSubject.filter((m) => (m.subject.code ?? '—') === filter)
  const total = mistakes.data.length

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Review Again"
        subtitle={`${total} ${total === 1 ? 'question' : 'questions'} you got wrong last time. Answer one correctly and it leaves this list.`}
        actions={
          <Link to="/practice?from=mistakes" className={headerButtonClass}>
            <Play className="size-4 fill-current" aria-hidden />
            Practice all {total}
          </Link>
        }
      />

      {/* Filter chips only help when there is more than one subject to choose from. */}
      {counts.size > 1 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by subject">
          <FilterChip active={filter === null} onClick={() => setFilter(null)} label="All" count={total} />
          {[...counts].map(([code, count]) => (
            <FilterChip key={code} active={filter === code} onClick={() => setFilter(code)} label={code} count={count} />
          ))}
        </div>
      )}

      <ul className="divide-y overflow-hidden rounded-xl border bg-card" aria-label="Your mistakes">
        {shown.map((m) => (
          <MistakeItem
            key={m.questionId}
            subject={m.subject}
            stem={m.stem}
            yourAnswer={m.selectedIndex !== null ? m.choices[m.selectedIndex] : undefined}
            correctAnswer={m.choices[m.correctIndex]}
            explanation={m.explanation}
          />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Tap a question to see the answer and explanation.</p>
    </div>
  )
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
        active ? 'border-foreground bg-foreground text-background' : 'bg-card hover:border-primary',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-background/70' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}
