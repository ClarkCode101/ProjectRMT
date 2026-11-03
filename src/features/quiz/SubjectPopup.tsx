import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Dialog } from '@/components/Dialog'
import { formatPercent } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { TubeFigure } from './SpecimenRack'
import { tubeStatus } from './tube'

// The popup that opens when she taps a tube in the rack:
// the tube, big, on the left (swipe it, or use ‹ › / ← →, to switch subjects),
// and the choices for that subject on the right (passed in as children).
// Phones: it slides up as a bottom sheet, with the tube on top and the choices under it.
// Clicking outside does NOT close it; only ✕ or Esc does.

export type PopupItem = { key: string; code: string; name: string; accuracy: number | null; belowPassing: boolean }

/** The big tube. Remounted per subject, so the liquid rises again and it slides in from the swiped side. */
function BigTube({ item, enter }: { item: PopupItem; enter: 'open' | 'left' | 'right' }) {
  return (
    <span
      className={cn(
        'animate-in fade-in block duration-300 ease-out',
        enter === 'open' && 'zoom-in-50',
        enter === 'right' && 'slide-in-from-right-8',
        enter === 'left' && 'slide-in-from-left-8',
      )}
    >
      <TubeFigure accuracy={item.accuracy} status={tubeStatus(item.accuracy, item.belowPassing)} size="large" />
    </span>
  )
}

export function SubjectPopup({
  open,
  onClose,
  items,
  index,
  onIndexChange,
  disabled,
  overlay,
  children,
}: {
  open: boolean
  onClose: () => void
  items: PopupItem[]
  index: number
  onIndexChange: (index: number) => void
  /** true while pouring / loading the quiz: no switching or closing */
  disabled?: boolean
  /** shown over the whole popup (the pour scene) */
  overlay?: ReactNode
  children: ReactNode
}) {
  const item = items[index]
  const [enter, setEnter] = useState<'open' | 'left' | 'right'>('open')
  const swipeStart = useRef<number | null>(null)

  // When it opens, put focus on the subject name (not the tube), so screen readers hear the subject first
  // and no focus ring shows around the tube. (Runs after Dialog has opened, since Dialog is a child.)
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (open) headingRef.current?.focus()
  }, [open])

  /** Every way of closing goes here, so the tube zooms in again the next time it opens. */
  function close() {
    if (disabled) return
    setEnter('open')
    onClose()
  }

  function go(step: -1 | 1) {
    if (disabled || items.length < 2) return
    setEnter(step === 1 ? 'right' : 'left')
    onIndexChange((index + step + items.length) % items.length)
  }

  function onPointerDown(e: PointerEvent) {
    swipeStart.current = e.clientX
  }
  function onPointerUp(e: PointerEvent) {
    if (swipeStart.current === null) return
    const dx = e.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1) // swipe left = next, like flipping a page
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') go(1)
    if (e.key === 'ArrowLeft') go(-1)
  }

  if (!item) return null
  const prev = items[(index - 1 + items.length) % items.length]
  const next = items[(index + 1) % items.length]
  const status = tubeStatus(item.accuracy, item.belowPassing)

  return (
    <Dialog open={open} onClose={close} labelledBy="subject-popup-heading" variant="sheet" size="xl" closeOnBackdrop={false}>
      <div className="relative">
        {/* Close: top-right corner of the popup on every screen size */}
        <button
          type="button"
          onClick={close}
          disabled={disabled}
          aria-label="Close and go back to the rack"
          className="absolute -top-1 -right-1 z-20 flex size-10 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          <X className="size-5" aria-hidden />
        </button>

        <div className="grid gap-5 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
          {/* ---------- Left: the tube and the subject switcher ---------- */}
          <div className="flex items-center gap-4 pr-10 md:flex-col md:justify-center md:gap-5 md:border-r md:pr-8">
            <div
              role="group"
              aria-label="Subject tube. Swipe it or use the left and right arrow keys to switch subjects."
              tabIndex={0}
              onKeyDown={onKeyDown}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (swipeStart.current = null)}
              className="shrink-0 touch-pan-y rounded-2xl px-3 pt-2 pb-3 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <BigTube key={item.key} item={item} enter={enter} />
            </div>

            <div className="min-w-0 flex-1 space-y-3 md:flex-none md:text-center">
              <div aria-live="polite">
                <h2 ref={headingRef} id="subject-popup-heading" tabIndex={-1} className="font-heading text-2xl leading-none font-bold outline-none">
                  {item.code}
                </h2>
                {/* Long names (HTMLE) stop at two lines; the full name is in the tooltip. */}
                <p title={item.name} className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {item.name}
                </p>
                <p className={cn('mt-1 text-sm font-bold tabular-nums', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}>
                  {item.accuracy === null ? 'Not started' : `Score ${formatPercent(item.accuracy)}`}
                </p>
              </div>
              <div className="flex gap-2 md:justify-center">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  disabled={disabled}
                  aria-label={`Previous subject: ${prev.name}`}
                  className="flex size-10 items-center justify-center rounded-full border bg-card outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  disabled={disabled}
                  aria-label={`Next subject: ${next.name}`}
                  className="flex size-10 items-center justify-center rounded-full border bg-card outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
                >
                  <ChevronRight className="size-5" aria-hidden />
                </button>
              </div>
              <p className="hidden text-xs text-muted-foreground md:block">Swipe the tube to switch</p>
            </div>
          </div>

          {/* ---------- Right: topics + Start. Fills the popup's height so Start sits at the bottom. ---------- */}
          <div className="flex min-w-0 flex-col">{children}</div>
        </div>

        {/* The pour scene covers the popup for a moment after Start (passed in by Practice). */}
        {overlay && <div className="animate-in fade-in absolute -inset-5 z-30 grid place-items-center rounded-[inherit] bg-card/95 duration-150">{overlay}</div>}
      </div>
    </Dialog>
  )
}
