import { PASSING_LABEL, PASSING_RATE } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { liquidBackground, MIX_CODE, type TubeStatus } from './tube'

// The picture of one specimen tube, used by the Practice subject carousel:
// - the liquid's color is the subject (its book and Last Card color; Mix = six layers)
// - the liquid level is her score in that subject
// - the cap is red below 75%, green when passing, gray when not started
// - a small tick on the glass marks the 75% passing line
// Cartoon look: ink outline, a hard shadow, and a little face near the bottom (like the organs on Home).

const CAP_COLOR: Record<TubeStatus, string> = { low: 'bg-wrong', passing: 'bg-correct', new: 'bg-border' }

export function TubeFigure({
  code,
  accuracy,
  status,
  animateFill = true,
}: {
  /** subject code (CC, MICRO…) or MIX */
  code: string
  accuracy: number | null
  status: TubeStatus
  /** true = the liquid rises from empty when the tube appears (tube-fill in index.css) */
  animateFill?: boolean
}) {
  const level = accuracy === null ? 0 : Math.round(accuracy * 100)
  return (
    <span aria-hidden className="flex flex-col items-center">
      {/* -mb: the cap overlaps the glass a little, so the two outlines meet as one */}
      <span className={cn('relative z-10 -mb-0.5 h-5 w-14 shrink-0 rounded-lg border-[3px] border-ink md:h-6 md:w-20', CAP_COLOR[status])} />
      <span className="relative h-40 w-11 overflow-hidden rounded-b-full border-[3px] border-ink bg-card shadow-toon md:h-60 md:w-16">
        {/* liquid */}
        <span className={cn('absolute inset-x-0 bottom-0', animateFill && 'tube-fill')} style={{ height: `${level}%`, background: liquidBackground(code) }}>
          <span className="absolute inset-x-0 top-0 h-1.5 bg-white/25" />
        </span>
        {/* 75% passing mark */}
        <span className="absolute right-0 h-[3px] w-4 rounded-l-full bg-foreground md:w-6" style={{ bottom: `${PASSING_RATE * 100}%` }} />
        {/* glass shine */}
        <span className="absolute top-2 bottom-12 left-1.5 w-1.5 rounded-full bg-white/70 md:left-2.5" />
        {/* the face: two eyes and a smile, near the round bottom */}
        <svg viewBox="0 0 24 14" className="absolute inset-x-0 bottom-4 mx-auto w-6 md:bottom-6 md:w-8">
          <circle cx="7" cy="4" r="2.2" fill="var(--foreground)" />
          <circle cx="17" cy="4" r="2.2" fill="var(--foreground)" />
          <path d="M9 8.5q3 3.2 6 0" fill="none" stroke="var(--foreground)" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    </span>
  )
}

/**
 * How to read the tubes, in one small line at the bottom of Practice.
 * Hidden from screen readers: the carousel already says each subject's score.
 */
export function TubeKey() {
  const item = 'inline-flex items-center gap-1.5'
  const swatch = 'h-2.5 w-4 rounded-[4px] border-[1.5px] border-ink'
  return (
    <span aria-hidden className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className={item}>
        <span className={swatch} style={{ background: liquidBackground(MIX_CODE, 'right') }} /> liquid = subject · level = your score
      </span>
      <span className={item}>
        <span className={cn(swatch, 'bg-wrong')} /> below {PASSING_LABEL}
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
