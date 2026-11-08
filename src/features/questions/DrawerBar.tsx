import { ArrowLeft, Plus, Upload } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

// The slim bar at the top of an open book (a subject, one of her books, or all questions). It stays on screen
// while she scrolls, so the way back, which book she's in, Upload and Add are always in reach.
// Everything else (the title page, the topic tabs, the questions) is on the binder page under it (BinderPage.tsx).

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'

export function DrawerBar({ title, addTo, addLabel, uploadTo = '/questions/upload' }: { title: string; addTo: string; addLabel: string; uploadTo?: string }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur md:mx-0 md:px-0">
      <div className="flex items-center gap-2">
        <Link
          to="/questions"
          onClick={() => window.scrollTo({ top: 0 })}
          className={cn('flex h-11 shrink-0 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-muted-foreground hover:text-foreground', focusRing)}
        >
          <ArrowLeft className="size-5" aria-hidden />
          Shelves
        </Link>
        {/* which book is open, small (the big title is on the binder page) */}
        <p className="min-w-0 flex-1 truncate text-center font-heading text-sm font-bold text-muted-foreground">{title}</p>
        {/* Upload a file of questions (the shelves screen has no buttons, so this is where it lives) */}
        <Link
          to={uploadTo}
          aria-label="Upload questions from a file"
          title="Upload"
          className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground', focusRing)}
        >
          <Upload className="size-4" aria-hidden />
        </Link>
        <Link
          to={addTo}
          aria-label={addLabel}
          title={addLabel}
          className={cn('flex h-11 max-w-[40%] min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-highlight font-heading font-bold text-foreground hover:brightness-105 active:translate-y-px md:px-4', focusRing)}
        >
          <Plus className="size-5 shrink-0" aria-hidden />
          <span className="truncate max-md:hidden">{addLabel}</span>
        </Link>
      </div>
    </div>
  )
}
