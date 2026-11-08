import { Flag } from 'lucide-react'
import { Link } from 'react-router'
import { LabBench } from '@/components/LabBench'
import type { CoverageLevel, SubjectCoverage } from '@/lib/questions'
import { cn } from '@/lib/utils'

// The first screen of Questions: a specimen archive cabinet on the lab bench, one drawer per subject.
// (Practice has the specimen rack, Mock exam the analyzer, Flashcards the microscope; this is where everything is filed.)
// - A drawer's face shows its code, how many questions it holds, and a meter with one bar per topic,
//   so she sees at a glance which topics need more questions.
// - Tapping a drawer opens its own screen (DrawerBar + the list). Drawers are real links, so Back works.

/** The three looks of a meter bar. Height and fill differ too, so color is never the only signal. */
const BAR: Record<CoverageLevel, string> = {
  enough: 'h-full bg-correct',
  few: 'h-1/2 bg-[#9A5B00]',
  none: 'h-full border border-wrong/70 bg-transparent',
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** One bar per topic, the ones with enough questions first, so it fills up from the left. */
function TopicMeter({ topics }: { topics: SubjectCoverage['topics'] }) {
  return (
    <span aria-hidden className="flex h-2.5 items-end gap-0.5 sm:h-3">
      {[...topics].reverse().map((t) => (
        <span key={t.topicId} className={cn('min-w-0 flex-1 rounded-[1px]', BAR[t.level])} />
      ))}
    </span>
  )
}

function Drawer({ subject, flagged }: { subject: SubjectCoverage; flagged: number }) {
  const none = subject.topics.filter((t) => t.level === 'none').length
  const few = subject.topics.filter((t) => t.level === 'few').length
  return (
    <Link
      to={`/questions?subject=${subject.subjectId}`}
      onClick={() => window.scrollTo({ top: 0 })}
      className="group relative flex min-w-0 flex-col gap-1.5 rounded-lg border border-primary/20 bg-linear-to-b from-card to-secondary/60 px-2.5 pt-2 pb-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_2px_0_rgb(7_71_94/0.12)] outline-none transition-[scale,border-color] duration-200 ease-out hover:scale-[1.015] hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40 sm:gap-2 sm:px-3 sm:pt-2.5"
    >
      <span className="sr-only">
        {subject.name}: {plural(subject.total, 'question')}
        {none > 0 && `, ${plural(none, 'topic')} with none`}
        {few > 0 && `, ${plural(few, 'topic')} with few`}
        {flagged > 0 && `, ${flagged} need a look`}
      </span>
      <span aria-hidden className="flex items-center justify-between gap-1.5">
        {/* the label card in its metal holder */}
        <span className="rounded-[3px] border border-primary/25 bg-white px-1.5 font-heading text-sm leading-6 font-bold text-primary sm:px-2 sm:text-base">{subject.code}</span>
        <span className="flex items-center gap-1.5">
          {flagged > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-highlight-soft px-1.5 text-xs font-bold text-foreground tabular-nums">
              {/* the smallest phones: just the number, so the drawer's own count still fits */}
              <Flag className="size-3 max-[359px]:hidden" />
              {flagged}
            </span>
          )}
          <span className="font-heading text-lg leading-none font-bold tabular-nums sm:text-xl">{subject.total}</span>
        </span>
      </span>
      <TopicMeter topics={subject.topics} />
      {/* the drawer's pull handle */}
      <span aria-hidden className="mx-auto h-1 w-1/3 rounded-full bg-primary-deep/25 transition-colors group-hover:bg-primary/60" />
    </Link>
  )
}

export function ArchiveCabinet({
  coverage,
  flaggedBySubject,
}: {
  coverage: SubjectCoverage[]
  /** how many questions need a look, per subject */
  flaggedBySubject: Map<number, number>
}) {
  return (
    <section aria-label="Archive cabinet">
      <div className="relative px-1 pb-5 sm:px-2 sm:pb-7">
        {/* the same bench the rack, the analyzer and the microscope stand on */}
        <LabBench className="h-10 sm:h-12" />

        {/* the cabinet's body */}
        <div className="relative rounded-2xl border border-primary/15 bg-linear-to-b from-card to-secondary/70 p-2.5 shadow-[inset_0_2px_0_rgb(255_255_255/0.9),0_26px_40px_-30px_rgb(7_71_94/0.8)] sm:p-4">
          {/* top strip: name plate and vents (decoration). Hidden on phones, where height matters more. */}
          <div aria-hidden className="mb-3 flex items-center justify-between gap-3 max-sm:hidden">
            <span className="font-heading text-xs font-bold tracking-[0.25em] text-muted-foreground uppercase">Archive</span>
            <span className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-3.5 w-1 rounded-full bg-primary-deep/15 shadow-[inset_0_1px_1px_rgb(7_71_94/0.3)]" />
              ))}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {coverage.map((s) => (
              <Drawer key={s.subjectId} subject={s} flagged={flaggedBySubject.get(s.subjectId) ?? 0} />
            ))}
          </div>
        </div>

        {/* the cabinet's feet, standing on the bench */}
        <span aria-hidden className="absolute bottom-2 left-[12%] h-3 w-10 rounded-b-md bg-primary-deep/80 sm:bottom-4" />
        <span aria-hidden className="absolute right-[12%] bottom-2 h-3 w-10 rounded-b-md bg-primary-deep/80 sm:bottom-4" />
      </div>
      <CabinetKey />
    </section>
  )
}

/** How to read the meters, in one quiet line. Hidden from screen readers: each drawer already says its numbers. */
function CabinetKey() {
  const item = 'inline-flex items-center gap-1.5'
  const swatch = 'w-1.5 rounded-[1px]'
  return (
    <p aria-hidden className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>Each bar is a topic:</span>
      <span className={item}>
        <span className="flex h-3 items-end"><span className={cn(swatch, BAR.enough)} /></span> 10 or more
      </span>
      <span className={item}>
        <span className="flex h-3 items-end"><span className={cn(swatch, BAR.few)} /></span> 1 to 9
      </span>
      <span className={item}>
        <span className="flex h-3 items-end"><span className={cn(swatch, BAR.none)} /></span> none
      </span>
    </p>
  )
}
