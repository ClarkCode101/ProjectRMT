import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Dialog } from '@/components/Dialog'
import { formatPercent } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import type { CarouselItem } from './SubjectCarousel'
import { tubeStatus } from './tube'

// The popup that opens when she chooses the middle tube of the Practice carousel:
// the subject's name on top, then its choices (topics + Start, passed in as children).
// Switching subjects happens on the carousel itself, so there's no tube in here.
// Phones: it slides up as a bottom sheet. Clicking outside does NOT close it; only ✕ or Esc does.

export function SubjectPopup({
  open,
  onClose,
  item,
  disabled,
  overlay,
  children,
}: {
  open: boolean
  onClose: () => void
  item: CarouselItem | undefined
  /** true while pouring / loading the quiz: no closing */
  disabled?: boolean
  /** shown over the whole popup (the pour scene) */
  overlay?: ReactNode
  children: ReactNode
}) {
  // When it opens, put focus on the subject name, so screen readers hear the subject first.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  function close() {
    if (!disabled) onClose()
  }

  if (!item) return null
  const status = tubeStatus(item.accuracy, item.belowPassing)

  return (
    <Dialog open={open} onClose={close} labelledBy="subject-popup-heading" variant="sheet" size="lg" closeOnBackdrop={false}>
      <div className="relative flex flex-col gap-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 ref={headingRef} id="subject-popup-heading" tabIndex={-1} className="font-heading text-2xl leading-none font-bold outline-none">
              {item.code}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.name}
              {' · '}
              <span className={cn('font-bold tabular-nums', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}>
                {item.accuracy === null ? 'Not started' : `Score ${formatPercent(item.accuracy)}`}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={disabled}
            aria-label="Close and go back to the subjects"
            className="-mt-1 -mr-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {children}

        {/* The pour scene covers the popup for a moment after Start (passed in by Practice). */}
        {overlay && <div className="animate-in fade-in absolute -inset-5 z-30 grid place-items-center rounded-[inherit] bg-card/95 duration-150">{overlay}</div>}
      </div>
    </Dialog>
  )
}
