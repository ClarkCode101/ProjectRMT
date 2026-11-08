import { ArrowLeft, Check, CircleX, Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { CoverageLevel, SubjectCoverage } from '@/lib/questions'
import { cn } from '@/lib/utils'

// The bar at the top of a list screen (inside a drawer, or all questions). It stays on screen while she scrolls,
// so the way back, where she is, Add, and the topics are always in reach.
// Phones: the topics are one row to swipe through, so the list stays high up. Computers: they wrap, so no sideways scrolling.

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

const LOW_LEVEL = {
  none: { label: 'None', icon: CircleX, className: 'text-wrong' },
  few: { label: 'Few', icon: TriangleAlert, className: 'text-[#9A5B00]' },
}

/** A topic folder. Selected = solid blue with a check, like the topic chips on Practice. Warns only when a topic is low. */
function FolderTab({ checked, onChange, level, children }: { checked: boolean; onChange: () => void; level?: CoverageLevel; children: ReactNode }) {
  const low = level && level !== 'enough' ? LOW_LEVEL[level] : null
  return (
    <label
      className={cn(
        // relative: keeps the hidden radio inside the tab, or it would make the whole page scroll sideways on phones.
        'relative inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg rounded-b-sm border border-b-2 px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary-deep bg-primary text-white' : 'border-primary/20 bg-card hover:border-primary/50',
      )}
    >
      <input type="radio" name="drawer-topic" checked={checked} onChange={onChange} className="sr-only" />
      {checked ? <Check className="-ml-0.5 size-4 shrink-0" aria-hidden /> : low && <low.icon className={cn('-ml-0.5 size-4 shrink-0', low.className)} aria-label={low.label} />}
      {children}
    </label>
  )
}

export function DrawerBar({
  title,
  subtitle,
  count,
  addTo,
  addLabel,
  subject,
  topicId,
  onSelectTopic,
}: {
  /** "HEMA", or "All questions" */
  title: string
  /** the full subject name; computers only, phones have no room for it */
  subtitle?: string
  count: number
  addTo: string
  addLabel: string
  /** the open drawer; none when browsing all questions */
  subject?: SubjectCoverage
  topicId: number | null
  onSelectTopic: (topicId: number | null) => void
}) {
  // A folder chosen from elsewhere (coming back from the editor) may be off to the side on a phone: bring it into view.
  const tabs = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    tabs.current?.querySelector('input:checked')?.closest('label')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [topicId])

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:mx-0 md:px-0">
      {/* key: another drawer plays the slide-out again */}
      <div key={subject?.subjectId ?? 'all'} className="drawer-open space-y-2">
        <div className="flex items-center gap-2">
          <Link
            to="/questions"
            onClick={() => window.scrollTo({ top: 0 })}
            className={cn('flex h-11 shrink-0 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-muted-foreground hover:text-foreground', focusRing)}
          >
            <ArrowLeft className="size-5" aria-hidden />
            Cabinet
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center font-heading text-lg leading-tight font-bold">
            {title}
            {subtitle && <span className="font-sans text-sm font-normal text-muted-foreground max-md:hidden"> · {subtitle}</span>}
            <span className="font-sans text-sm font-normal text-muted-foreground tabular-nums"> · {count}</span>
          </h1>
          <Link
            to={addTo}
            aria-label={addLabel}
            title={addLabel}
            className={cn('flex h-11 max-w-[40%] min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-highlight font-heading font-bold text-foreground hover:brightness-105 active:translate-y-px md:px-4', focusRing)}
          >
            <Plus className="size-5 shrink-0" aria-hidden />
            <span className="truncate max-md:hidden">{addLabel}</span>
          </Link>
        </div>

        {subject && (
          <fieldset ref={tabs} className="min-w-0">
            <legend className="sr-only">Topic in {subject.name}</legend>
            {/* The scrolling is on this div because a fieldset doesn't keep its contents inside it. */}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
              <FolderTab checked={topicId === null} onChange={() => onSelectTopic(null)}>
                All
              </FolderTab>
              {/* fewest questions first (summarizeCoverage), so the gaps are easy to spot */}
              {subject.topics.map((t) => (
                <FolderTab key={t.topicId} checked={topicId === t.topicId} onChange={() => onSelectTopic(t.topicId)} level={t.level}>
                  {t.name} <span className="tabular-nums">{t.count}</span>
                </FolderTab>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </div>
  )
}
