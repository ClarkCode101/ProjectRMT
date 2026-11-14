import { useId, type ReactNode } from 'react'
import { PASSING_LABEL, PASSING_RATE } from '@/lib/quiz'
import { cn } from '@/lib/utils'

// Shared pieces of the "lab report" look. Scores read like a results sheet:
// a score, the passing range 60–100, and an L flag only where something needs attention.
// Rule of thumb for this app: one colored focal element per screen, everything else quiet.

/** The passing range shown next to scores. */
export const REFERENCE_RANGE = `${Math.round(PASSING_RATE * 100)}–100`

/** The L flag a lab printout puts next to a low result. Text, not just color, so it works for everyone. */
export function LowFlag() {
  return (
    <abbr
      title={`Low: below ${PASSING_LABEL}`}
      className="inline-block min-w-5 rounded-[3px] bg-wrong-soft px-1 text-center text-xs font-extrabold text-wrong no-underline"
    >
      L
    </abbr>
  )
}

/**
 * A thin score bar with a tick at 75%.
 * Blue when passing, red when below; the number next to it says the exact score.
 */
export function RangeBar({ rate, label }: { rate: number | null; label: string }) {
  const low = rate !== null && rate < PASSING_RATE
  return (
    <div className="relative h-1.5 rounded-full bg-secondary" role="img" aria-label={label} title={label}>
      {rate !== null && (
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', low ? 'bg-wrong' : 'bg-primary')}
          style={{ width: `${Math.max(rate * 100, 2)}%` }}
          aria-hidden
        />
      )}
      <div className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/35" style={{ left: `${PASSING_RATE * 100}%` }} aria-hidden />
    </div>
  )
}

export type SampleState = 'pending' | 'current' | 'correct' | 'wrong'

/**
 * Quiz progress: one segment per item, green or red once answered.
 * Segments stretch to fill the row, so it stays one tidy line on any screen.
 * Screen readers get the "Item x of y" text instead.
 */
export function SampleRun({ samples }: { samples: SampleState[] }) {
  return (
    <div aria-hidden className="flex gap-0.5">
      {samples.map((state, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 min-w-0 flex-1 rounded-full transition-colors duration-300',
            state === 'pending' && 'bg-secondary',
            state === 'current' && 'bg-primary',
            state === 'correct' && 'bg-correct',
            state === 'wrong' && 'bg-wrong',
          )}
        />
      ))}
    </div>
  )
}

/**
 * The dark blue card. Use at most ONE per screen, for the single thing she should do next.
 */
export function HeroPanel({
  labelledBy,
  children,
  className,
}: {
  labelledBy?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={labelledBy} className={cn('rounded-xl bg-primary-deep p-5 text-white sm:p-6', className)}>
      {children}
    </section>
  )
}

/**
 * Classes for the gold main button inside a HeroPanel. Put them on a <Link> or a <button>.
 * Full width on phones; from small tablets up it sizes to its text.
 */
export const heroButtonClass =
  'flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-highlight px-6 font-heading text-lg font-bold text-foreground outline-none hover:brightness-105 focus-visible:ring-4 focus-visible:ring-white/60 active:translate-y-px disabled:opacity-60 sm:inline-flex sm:w-auto'

/**
 * The ProjectRMT mark: a cyan slime mascot with lab goggles pushed up on its forehead, wearing a lab coat
 * with a gold RMT ID badge, on the deep blue rounded tile.
 * Same drawing as public/favicon.svg and the three SVGs in public/icons/ that the app icon PNGs are made from:
 * app-icon.svg (icon-192 / icon-512), app-icon-maskable.svg (Android cuts its own shape, so the slime is drawn
 * smaller, keeping goggles and face inside the safe zone) and app-icon-apple.svg (apple-touch-icon: a full square,
 * iOS rounds the corners itself). Keep them in sync, and re-export the PNGs when the drawing changes.
 */
export function Logo({ className }: { className?: string }) {
  // Each Logo needs its own clip id, or two logos on one page would share (and fight over) one.
  const clipId = useId()
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn('size-8 shrink-0', className)}>
      <clipPath id={clipId}>
        <rect width="512" height="512" rx="128" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width="512" height="512" fill="#07475E" />
        {/* slime body + right-side shade */}
        <path d="M92 540C70 360 130 140 256 136C382 140 442 360 420 540Z" fill="#4FC1D6" />
        <path d="M364 214C404 280 426 400 420 540H384C392 420 386 300 364 214Z" fill="#3AA8BF" />
        {/* safety goggles on the forehead */}
        <path d="M104 236C170 206 342 206 408 236L404 262C340 236 172 236 108 262Z" fill="#0E3445" />
        <rect x="160" y="196" width="84" height="64" rx="26" fill="#0E3445" />
        <rect x="268" y="196" width="84" height="64" rx="26" fill="#0E3445" />
        <rect x="170" y="206" width="64" height="44" rx="18" fill="#BFEFF8" />
        <rect x="278" y="206" width="64" height="44" rx="18" fill="#BFEFF8" />
        <path d="M184 220L198 212M292 220L306 212" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
        <rect x="240" y="218" width="32" height="14" rx="5" fill="#0E3445" />
        {/* face */}
        <ellipse cx="220" cy="314" rx="16" ry="21" fill="#0E3445" />
        <ellipse cx="292" cy="314" rx="16" ry="21" fill="#0E3445" />
        <circle cx="225" cy="306" r="5.5" fill="#FFFFFF" />
        <circle cx="297" cy="306" r="5.5" fill="#FFFFFF" />
        <path d="M240 350Q256 364 272 350" fill="none" stroke="#0E3445" strokeWidth="8" strokeLinecap="round" />
        {/* lab coat with folded collar */}
        <path d="M40 540C48 450 104 404 184 392L236 460L230 540Z" fill="#FFFFFF" />
        <path d="M472 540C464 450 408 404 328 392L276 460L282 540Z" fill="#FFFFFF" />
        <path d="M184 392L160 356L234 424L236 460Z" fill="#DCE6EC" />
        <path d="M328 392L352 356L278 424L276 460Z" fill="#DCE6EC" />
        {/* gold RMT ID badge */}
        <rect x="330" y="440" width="62" height="40" rx="7" fill="#E9A23B" />
        <rect x="338" y="450" width="22" height="20" rx="3" fill="#FFFFFF" />
        <rect x="366" y="452" width="18" height="5" rx="2.5" fill="#FFFFFF" />
        <rect x="366" y="463" width="12" height="5" rx="2.5" fill="#FFFFFF" />
      </g>
    </svg>
  )
}

/** The logo with the app name, RMT in the accent color. Pass wordmark={false} for the mark alone. */
export function Brand({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-heading font-bold tracking-tight', className)}>
      <Logo className="size-[1.6em]" />
      {wordmark ? (
        <span>
          Project<span className="text-primary">RMT</span>
        </span>
      ) : (
        <span className="sr-only">ProjectRMT</span>
      )}
    </span>
  )
}
