import { cn } from '@/lib/utils'
import { liquidBackground, MIX_CODE, type TubeStatus } from './tube'

// The picture of one specimen tube, used by the Practice subject carousel:
// - the liquid's color is the subject (its book and Last Card color; Mix = six layers)
// - the liquid level is her score in that subject
// - the cap is red below 60%, green when passing, gray when not started
// - a small tick on the glass marks the 60% passing line

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
      <span className={cn('h-4 w-14 shrink-0 rounded-t-md rounded-b-sm md:h-5 md:w-20', CAP_COLOR[status])} />
      <span className="relative h-40 w-11 overflow-hidden rounded-b-full border-[3px] border-t-0 border-primary bg-card shadow-[0_18px_32px_-16px_rgb(7_71_94/0.55)] md:h-60 md:w-16">
        {/* liquid */}
        <span className={cn('absolute inset-x-0 bottom-0', animateFill && 'tube-fill')} style={{ height: `${level}%`, background: liquidBackground(code) }}>
          <span className="absolute inset-x-0 top-0 h-1.5 bg-white/25" />
        </span>
        {/* 60% passing mark */}
        <span className="absolute right-0 h-0.5 w-4 rounded-l-full bg-foreground/50 md:w-6" style={{ bottom: '60%' }} />
        {/* glass shine */}
        <span className="absolute top-2 bottom-4 left-1.5 w-1.5 rounded-full bg-white/55 md:left-2.5" />
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
  const swatch = 'h-2 w-3.5 rounded-sm'
  return (
    <span aria-hidden className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className={item}>
        <span className={swatch} style={{ background: liquidBackground(MIX_CODE, 'right') }} /> liquid = subject · level = your score
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
