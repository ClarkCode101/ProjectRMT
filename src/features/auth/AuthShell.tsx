import type { ReactNode } from 'react'
import { Logo } from '@/components/report'
import { cn } from '@/lib/utils'

// The card shared by the login page and the "waiting for approval" page: light graph-paper page with ONE
// compact card in the middle. Brand side on the left (a short band on top on phones), the task on the right.

/** Faint graph-paper lines, like the grid on a lab chart. Pure CSS, no image file. */
const GRAPH_PAPER = {
  backgroundImage:
    'linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

/** Same grid, in faint blue, for the light page behind the card. */
const LIGHT_GRAPH_PAPER = {
  backgroundImage:
    'linear-gradient(rgb(7 71 94 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(7 71 94 / 0.05) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

const STAMP_TONES = {
  /** green, like on the real results screens */
  passed: 'border-correct text-correct',
  /** dark gold: not a result yet */
  pending: 'border-[#B7791F] text-[#B7791F]',
  declined: 'border-wrong text-wrong',
}

/** A rubber stamp ("PASSED", "PENDING"…), same look as on the real results screens. */
export function Stamp({
  tone,
  className,
  children,
}: {
  tone: keyof typeof STAMP_TONES
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'stamp inline-block rounded-lg border-[3px] px-2.5 py-1 font-heading leading-none font-bold tracking-wider',
        STAMP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A small lab-report slip on the brand side. Decoration only, so screen readers skip it. */
export function ReportSlip({
  title,
  head,
  rows,
  footLabel,
  stamp,
}: {
  title: string
  /** the two column headings, if the rows need them */
  head?: [string, string]
  rows: { label: string; value: ReactNode; big?: boolean }[]
  footLabel: string
  stamp: ReactNode
}) {
  return (
    <div
      aria-hidden
      className="w-full -rotate-2 rounded-2xl border-[2.5px] border-ink bg-card p-4 text-sm text-card-foreground shadow-[0_5px_0_var(--ink)]"
    >
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">{title}</p>
      <div className="my-3 border-t-2 border-dashed" />
      {head && (
        <div className="flex justify-between text-xs font-bold tracking-wider text-muted-foreground uppercase">
          <span>{head[0]}</span>
          <span>{head[1]}</span>
        </div>
      )}
      <ul className={cn('space-y-2', head && 'mt-2')}>
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-4">
            <span>{row.label}</span>
            <span className={cn('font-heading font-bold tabular-nums', row.big ? 'text-xl' : 'text-base')}>{row.value}</span>
          </li>
        ))}
      </ul>
      <div className="my-3 border-t-2 border-dashed" />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{footLabel}</span>
        {stamp}
      </div>
    </div>
  )
}

/** The short white strip that replaces the slip on phones, so the task stays near the top. */
export function PhoneStrip({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="flex w-fit items-center gap-4 rounded-xl border-[2.5px] border-ink bg-card px-4 py-2.5 text-card-foreground shadow-toon-sm md:hidden"
    >
      {children}
    </div>
  )
}

export function AuthShell({
  slip,
  strip,
  children,
}: {
  /** bigger screens: the report slip on the brand side */
  slip: ReactNode
  /** phones: the short strip shown instead */
  strip: ReactNode
  /** the task side (a form, or the waiting message) */
  children: ReactNode
}) {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      style={LIGHT_GRAPH_PAPER}
    >
      <div className="grid w-full max-w-sm overflow-hidden rounded-3xl border-[2.5px] border-ink bg-card shadow-[0_6px_0_var(--ink)] md:max-w-[820px] md:grid-cols-[5fr_6fr]">
        <div className="relative overflow-hidden border-ink bg-primary-deep text-white max-md:border-b-[2.5px] md:border-r-[2.5px]">
          <div aria-hidden className="absolute inset-0" style={GRAPH_PAPER} />
          <div className="relative flex h-full flex-col gap-5 p-6 md:justify-between md:gap-8 md:p-8">
            <div className="flex items-center gap-3">
              <Logo className="size-10 rounded-xl ring-[2.5px] ring-ink" />
              <h1 className="font-heading text-2xl font-bold tracking-tight">
                Project<span className="text-highlight">RMT</span>
              </h1>
            </div>

            <div className="hidden md:block">{slip}</div>
            {strip}

            <p className="font-heading text-lg leading-snug font-semibold text-white/90 md:text-xl">
              Your MTLE review, <span className="text-highlight">one result at a time.</span>
            </p>
          </div>
        </div>

        {children}
      </div>
    </main>
  )
}
