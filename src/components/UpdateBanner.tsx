import { RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * "New version ready", shown at the top (the bottom belongs to Home's Next up bar and the phone's tab bar).
 * Phone: one slim line in a pill, so nothing wraps. Tablet and up: a card, top center, with one more line.
 * Same white card and blue button as the install tip. Not gold, so it doesn't compete with Practice.
 * AppLayout hides it during a quiz or mock exam and shows it again after.
 */
export function UpdateBanner({ onRefresh, onLater }: { onRefresh: () => void; onLater: () => void }) {
  const [refreshing, setRefreshing] = useState(false)

  function refresh() {
    setRefreshing(true)
    onRefresh()
  }

  return (
    <aside
      role="status"
      aria-label="App update"
      className={cn(
        'animate-in fade-in slide-in-from-top-2 fixed inset-x-3 top-[calc(3.75rem+env(safe-area-inset-top))] z-40 flex items-center gap-2.5 rounded-full border-[2.5px] border-ink bg-card py-1.5 pr-1.5 pl-4 shadow-toon duration-300',
        'md:inset-x-auto md:top-4 md:left-1/2 md:w-[29rem] md:-translate-x-1/2 md:gap-3 md:rounded-2xl md:py-2.5 md:pl-3',
      )}
    >
      <span className="flex shrink-0 items-center justify-center md:size-10 md:rounded-xl md:bg-primary/10">
        <RefreshCw className="size-5 text-primary" strokeWidth={2.4} aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-heading font-bold">New version ready</p>
        <p className="hidden text-sm leading-snug text-muted-foreground md:block">Refresh to get the latest ProjectRMT.</p>
      </div>

      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="h-10 shrink-0 rounded-full border-2 border-ink bg-primary px-4 font-heading text-sm font-semibold text-primary-foreground shadow-toon-sm outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-[3px] active:shadow-none disabled:opacity-70 md:rounded-xl"
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>

      <button
        type="button"
        onClick={onLater}
        aria-label="Hide. The new version opens next time."
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  )
}
