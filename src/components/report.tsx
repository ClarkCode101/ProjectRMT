import type { ReactNode } from 'react'
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
 * The ProjectRMT mark: a results sheet with a gold "passed" check, on the deep blue tile.
 * Same drawing as public/favicon.svg and the three SVGs in public/icons/ that the app icon PNGs are made from:
 * app-icon.svg (icon-192 / icon-512), app-icon-maskable.svg (Android cuts its own shape, so it's drawn smaller,
 * inside the safe zone) and app-icon-apple.svg (apple-touch-icon: a full square, iOS rounds the corners itself).
 * Keep them in sync, and re-export the PNGs when the drawing changes.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="#07475E" />
      <rect x="7.5" y="5.5" width="15" height="20" rx="2.5" fill="#FFFFFF" />
      <rect x="10.5" y="10" width="9" height="2.2" rx="1.1" fill="#0B6382" />
      <rect x="10.5" y="14.5" width="6" height="1.8" rx="0.9" fill="#B4C0CA" />
      <rect x="10.5" y="18.5" width="4.5" height="1.8" rx="0.9" fill="#B4C0CA" />
      <circle cx="22.5" cy="22.5" r="6" fill="#E9A23B" stroke="#07475E" strokeWidth="2" />
      <path d="M19.8 22.6l1.8 1.8 3.4-3.7" fill="none" stroke="#17222C" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
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
