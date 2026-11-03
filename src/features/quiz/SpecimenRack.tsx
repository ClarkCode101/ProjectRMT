import { Star } from 'lucide-react'
import { LabBench } from '@/components/LabBench'
import { formatPercent, type SubjectSummary } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { tubeStatus, type TubeStatus } from './tube'

// The subject picker on Practice: a rack of six specimen tubes, one per subject.
// - The liquid level is her score in that subject.
// - One dashed "60% pass" line runs across every tube, so she sees at a glance who's above it.
// - The cap is red when the subject is below 60%, green when passing, gray when not started.
// - The tubes stand in a rack: a top plate they go through, and a base they sit on.
// - A small gold star marks the subject Smart pick recommends (the gold "Start here" button under the rack opens it).
// Each tube is a real radio button, so keyboard and screen readers work like any other choice.

/**
 * Size of a tube's glass in the rack. Its width grows with the rack's width (phone → tablet → laptop).
 * Height stays compact (at most 13rem), like the other pages' scenes, so the buttons under the rack fit on one screen.
 */
const RACK_GLASS = 'h-32 w-8 border-2 border-t-0 @md:h-40 @md:w-11 @xl:h-52 @xl:w-14 @3xl:w-15'

const CAP_COLOR: Record<TubeStatus, string> = { low: 'bg-wrong', passing: 'bg-correct', new: 'bg-border' }

// The rack's plate, base and pass line are drawn one piece per tube, each as wide as the tube's slot
// PLUS the gap to the next tube, so the pieces join into one continuous line. Keep these in step with
// the tube widths (w-12 / @md:w-16 / @xl:w-18 / @3xl:w-20) and row gaps (gap-1 / 2 / 4 / 8) below.
const SLOT_WIDTH = 'w-13 @md:w-18 @xl:w-22 @3xl:w-28'
// Cap heights (h-3.5 / @md:h-4 / @xl:h-[1.125rem] / @3xl:h-5): the glass starts right under the cap.
const BELOW_CAP = 'top-3.5 @md:top-4 @xl:top-[1.125rem] @3xl:top-5'
// The top plate crosses each tube 1rem below its cap.
const PLATE_TOP = 'top-[1.875rem] @md:top-[2rem] @xl:top-[2.125rem] @3xl:top-[2.25rem]'

/**
 * Just the picture of a tube: cap, glass, liquid, 60% mark, shine.
 * "rack" = the size in the rack; "large" = the big tube in the subject popup.
 */
export function TubeFigure({
  accuracy,
  status,
  size = 'rack',
  highlighted = false,
  showMark = true,
}: {
  accuracy: number | null
  status: TubeStatus
  size?: 'rack' | 'large'
  highlighted?: boolean
  /** the small 60% tick on the glass (the rack draws one long line across all tubes instead) */
  showMark?: boolean
}) {
  const level = accuracy === null ? 0 : Math.round(accuracy * 100)
  const large = size === 'large'
  return (
    <span aria-hidden className="flex min-h-0 flex-1 flex-col items-center">
      <span className={cn('shrink-0 rounded-t-md rounded-b-sm', large ? 'h-4 w-14 md:h-5 md:w-20' : 'h-3.5 w-10 @md:h-4 @md:w-13 @xl:h-[1.125rem] @xl:w-15 @3xl:h-5 @3xl:w-17', CAP_COLOR[status])} />
      <span
        className={cn(
          'relative overflow-hidden rounded-b-full bg-card transition-colors',
          large ? 'h-36 w-11 border-[3px] border-t-0 md:h-64 md:w-16' : RACK_GLASS,
          highlighted || large ? 'border-primary' : 'border-primary/20 group-hover:border-primary/40',
          large && 'shadow-[0_18px_32px_-16px_rgb(7_71_94/0.55)]',
        )}
      >
        {/* liquid, rises from empty when the tube appears (tube-fill in index.css) */}
        <span className="tube-fill absolute inset-x-0 bottom-0 bg-linear-to-t from-primary to-primary/65" style={{ height: `${level}%` }}>
          <span className="absolute inset-x-0 top-0 h-1.5 bg-white/25" />
        </span>
        {/* 60% passing mark */}
        {showMark && <span className={cn('absolute right-0 h-0.5 rounded-l-full bg-foreground/50', large ? 'w-4 md:w-6' : 'w-3.5 @md:w-4.5 @3xl:w-6')} style={{ bottom: '60%' }} />}
        {/* glass shine */}
        <span className={cn('absolute top-2 bottom-4 rounded-full bg-white/55', large ? 'left-1.5 w-1.5 md:left-2.5' : 'left-1 w-1 @md:left-1.5 @3xl:left-2 @3xl:w-1.5')} />
      </span>
    </span>
  )
}

function Tube({
  subject,
  checked,
  recommended,
  first,
  last,
  onChange,
}: {
  subject: SubjectSummary
  checked: boolean
  recommended: boolean
  first: boolean
  last: boolean
  onChange: () => void
}) {
  const status = tubeStatus(subject.accuracy, subject.belowPassing)
  const ends = cn(first && 'rounded-l-md', last && 'rounded-r-md')
  return (
    <label className="group relative flex min-h-0 w-12 shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl px-1 pt-4 pb-2 outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/40 @md:w-16 @xl:w-18 @3xl:w-20">
      <input type="radio" name="subject" checked={checked} onChange={onChange} className="sr-only" />
      <span className="sr-only">
        {subject.name}: {subject.accuracy === null ? 'not started' : `${formatPercent(subject.accuracy)}${subject.belowPassing ? ', below 60%' : ''}`}
        {recommended && ', recommended: start here'}
      </span>

      {/* A box that stays put while the tube inside lifts, so the rack's plate and pass line don't move with it. */}
      <span className="relative flex min-h-0 flex-1 flex-col items-center">
        {/* The tube lifts a little on hover and when chosen (as if pulled up out of the rack). */}
        <span className={cn('flex min-h-0 flex-1 flex-col transition-transform duration-300 ease-out', checked ? '-translate-y-3' : 'group-hover:-translate-y-1')}>
          <TubeFigure accuracy={subject.accuracy} status={status} highlighted={checked} showMark={false} />
        </span>
        {/* rack top plate: the tubes look like they go through it */}
        <span
          aria-hidden
          className={cn('absolute left-1/2 z-10 h-3 -translate-x-1/2 border-y border-primary/15 bg-secondary', SLOT_WIDTH, PLATE_TOP, ends)}
        />
        {/* the 60% pass line, over the glass area (from under the cap to the bottom) */}
        <span aria-hidden className={cn('pointer-events-none absolute bottom-0 left-1/2 z-20 -translate-x-1/2', SLOT_WIDTH, BELOW_CAP)}>
          <span className="absolute inset-x-0 border-t-2 border-dashed border-foreground/40" style={{ bottom: '60%' }} />
          {last && (
            <span
              className="absolute left-full ml-1.5 translate-y-1/2 text-[10px] leading-none font-bold whitespace-nowrap text-muted-foreground @md:text-xs"
              style={{ bottom: '60%' }}
            >
              60%
              <br />
              pass
            </span>
          )}
        </span>
      </span>

      {/* rack base: the tubes stand on it */}
      <span aria-hidden className={cn('-mt-2 h-2.5 shrink-0 bg-secondary shadow-[inset_0_-2px_0_rgb(7_71_94/0.12)]', SLOT_WIDTH, ends)} />

      <span aria-hidden className="shrink-0 text-center leading-tight">
        <span className={cn('block font-heading text-sm font-bold @md:text-base @xl:text-lg @3xl:text-xl', checked && 'text-primary')}>{subject.code}</span>
        <span className={cn('block text-xs font-semibold tabular-nums @xl:text-sm', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}>
          {subject.accuracy === null ? 'New' : formatPercent(subject.accuracy)}
        </span>
      </span>
    </label>
  )
}

export function SpecimenRack({
  summary,
  selectedId,
  onSelect,
  recommendedId = null,
}: {
  summary: SubjectSummary[]
  selectedId: number | null
  onSelect: (subjectId: number) => void
  /** the subject Smart pick recommends: a small gold star over its tube (the "Start here" button sits under the rack) */
  recommendedId?: number | null
}) {
  return (
    // Widths follow its own width (container queries). A fixed, compact height, like the Mock exam analyzer and the
    // Flashcards microscope, so the scene leaves room for the buttons under it.
    <fieldset className="@container">
      <legend className="sr-only">Subject</legend>
      {/* No card around it: the rack already has its own frame (plate + base), so it stands on the page,
          on a "lab bench" surface, like an object rather than a box of data. */}
      {/* Tubes sit close together in the middle (like a real rack), not spread to the edges. */}
      {/* Extra top room for the star; extra right room for the "60% pass" label. */}
      <div className="relative flex justify-center gap-1 px-2 pt-6 pr-9 pb-2 @md:gap-2 @md:px-4 @md:pr-12 @xl:gap-4 @3xl:gap-6">
        {/* The bench: a soft surface from the rack's base down, fading out at the sides, with a shadow under the rack.
            Its height = the labels under the tubes + half the base (keep in step with the label sizes). */}
        <LabBench className="h-[3.9rem] @xl:h-[4.9rem] @3xl:h-[5.1rem]" />
        {summary.map((s, i) => (
          <div key={s.subjectId} className="relative flex">
            <Tube
              subject={s}
              checked={selectedId === s.subjectId}
              recommended={recommendedId === s.subjectId}
              first={i === 0}
              last={i === summary.length - 1}
              onChange={() => onSelect(s.subjectId)}
            />
            {recommendedId === s.subjectId && (
              // Just a marker: the matching gold "Start here" button is under the rack. The tube's label says it too.
              <Star aria-hidden className="pointer-events-none absolute top-0 left-1/2 z-30 size-4 -translate-x-1/2 -translate-y-1/2 fill-highlight text-highlight @xl:size-5" />
            )}
          </div>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * How to read the rack, in one small line (shown under the page subtitle, before she looks at the tubes).
 * Made of spans so it can sit inside the subtitle's <p>. Hidden from screen readers: each tube already says its score.
 */
export function RackKey() {
  const item = 'inline-flex items-center gap-1.5'
  const swatch = 'h-2 w-3.5 rounded-sm'
  return (
    <span aria-hidden className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className={item}>
        <span className={cn(swatch, 'bg-primary')} /> liquid = your score
      </span>
      <span className={item}>
        <span className={cn(swatch, 'bg-wrong')} /> below 60%
      </span>
      <span className={item}>
        <span className={cn(swatch, 'bg-correct')} /> passing
      </span>
      <span className={item}>
        <span className={cn(swatch, 'bg-border')} /> not started
      </span>
    </span>
  )
}
