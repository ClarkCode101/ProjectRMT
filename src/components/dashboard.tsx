import type { ReactNode } from 'react'

// Page-level building blocks shared by every screen size.

/**
 * Title row at the top of a page: title (and a short line under it) with the page's actions.
 * Phones: actions go full width under the title. Wider screens: actions sit on the right.
 */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-bold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row sm:items-center">{actions}</div>}
    </div>
  )
}

/** Classes for the gold main button in a PageHeader. */
export const headerButtonClass =
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-highlight px-5 font-heading text-base font-bold text-foreground outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px disabled:opacity-60 sm:h-11'

/** Classes for a secondary (white, outlined) button in a PageHeader. */
export const headerSecondaryClass =
  'inline-flex h-12 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-base font-semibold outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 sm:h-11'

/** Classes for the "← Back" link at the top of a task screen: an outline, so it reads as a button. */
export const backLinkClass =
  'inline-flex h-10 items-center gap-1.5 rounded-lg border bg-card pr-3.5 pl-2.5 text-sm font-semibold outline-none hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/40'
