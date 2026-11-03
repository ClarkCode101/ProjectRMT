import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The Exit button at the top of a running quiz, mock exam or flashcard session.
 * It has its own fill and border so it clearly reads as a button (not a label), but stays neutral
 * (no blue or gold) so it never competes with the choices or Next.
 * tone "dark" = on the mock exam's dark run bar.
 */
export function ExitButton({ onClick, tone = 'light', className }: { onClick: () => void; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold outline-none transition-colors active:translate-y-px',
        tone === 'light'
          ? 'border bg-card text-foreground shadow-[0_2px_0_rgb(7_71_94/0.08)] hover:border-wrong/50 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40'
          : 'border border-white/20 bg-white/10 text-white hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/60',
        className,
      )}
    >
      <X className="size-4" aria-hidden />
      Exit
    </button>
  )
}
