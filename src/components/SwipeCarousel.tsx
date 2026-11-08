import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { LabBench } from '@/components/LabBench'
import { cn } from '@/lib/utils'

// A "choose your character" picker, like a game's select screen (used by Practice's tubes and Flashcards' lenses):
// - one big figure in the middle (the one in focus), the next ones smaller and faded on each side
// - drag/swipe (they follow your finger), then they snap to the nearest one with a little bounce
// - it loops: after the last one comes the first again
// - tap the middle one to open it; tap a side one to bring it to the middle
// - ← → keys, the ‹ › buttons and the dots work too
// The page passes in what each figure looks like (renderFigure) and the detail line under the name (renderDetail).

export type CarouselEntry = { key: string; code: string; name: string }

/** How far a drag must go (in px) before it counts as a swipe instead of a tap. */
const TAP_SLOP = 8
/**
 * Room in the stage besides the figure (px).
 * bottom: the gap at the bottom (bottom-5) + the lift on top.
 * center: room above and below for the figure's soft shadow, so the stage's edge never cuts it off in a straight line.
 */
const STAGE_EXTRA = { bottom: 40, center: 110 }

/** The shortest way round the loop from `pos` to item `i`: e.g. with 7 items, item 0 is +1 from item 6. */
function loopOffset(i: number, pos: number, count: number) {
  let d = (((i - pos) % count) + count) % count
  if (d > count / 2) d -= count
  return d
}

export function SwipeCarousel<T extends CarouselEntry>({
  items,
  index,
  onIndexChange,
  onOpen,
  renderFigure,
  renderDetail,
  label,
  align = 'bottom',
  bench = true,
  disabled = false,
}: {
  items: T[]
  /** the item in the middle */
  index: number
  onIndexChange: (index: number) => void
  /** she chose the middle one (tap, Enter, or the page's own button) */
  onOpen: () => void
  /** the picture of one item. `centered` = it's the one in the middle (not while dragging). */
  renderFigure: (item: T, state: { centered: boolean }) => ReactNode
  /** shown after the name under the big code, e.g. "Score 72%" */
  renderDetail: (item: T) => ReactNode
  /** for screen readers, e.g. "Subjects" */
  label: string
  /** bottom = figures stand on the bench (tubes); center = they float in the middle (lenses) */
  align?: 'bottom' | 'center'
  /** the soft "lab bench" surface under the figures */
  bench?: boolean
  /** true while the page's start scene plays: no switching */
  disabled?: boolean
}) {
  const count = items.length
  const stageRef = useRef<HTMLDivElement>(null)
  // Distance between two figures, in px. Grows with the screen; measured so a drag in px can be turned into "items moved".
  const [spacing, setSpacing] = useState(120)
  // How much to shrink every figure so it fits the stage (the page is one screen tall, no scrolling).
  const [fit, setFit] = useState(1)
  const [dragPx, setDragPx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)
  // The figure under the finger when the press began (after pointer capture, later events all point at the stage).
  const pressedOffset = useRef<number | null>(null)

  // useLayoutEffect: measured before the first paint, so the figures don't show at the wrong size for a moment.
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      // The figure's real size (offsetWidth/Height ignore the scale), vs. the room in the stage.
      const figure = stage.querySelector<HTMLElement>('[data-figure]')
      const nextFit = figure ? Math.min(1, Math.max(0.45, (stage.clientHeight - STAGE_EXTRA[align]) / figure.offsetHeight)) : 1
      setFit(nextFit)
      // Narrow figures (tubes): spacing follows the screen width. Wide ones (lenses): at least ~90% of a figure's
      // width, so the side ones (70% size) sit beside the middle one instead of hiding behind it.
      const byWidth = Math.min(200, Math.max(96, stage.clientWidth * 0.24)) * Math.max(0.7, nextFit)
      const byFigure = figure ? figure.offsetWidth * nextFit * 0.9 : 0
      setSpacing(Math.max(byWidth, byFigure))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [align])

  function goTo(i: number) {
    if (disabled) return
    const next = ((i % count) + count) % count
    if (next !== index) navigator.vibrate?.(8) // a tiny "click" on phones that support it
    onIndexChange(next)
  }

  // Where the carousel is right now, in "items": e.g. 2.4 = between item 2 and 3 while dragging.
  const pos = index - dragPx / spacing

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || e.button !== 0) return
    dragStart.current = e.clientX
    const figure = (e.target as HTMLElement).closest<HTMLElement>('[data-offset]')
    pressedOffset.current = figure ? Number(figure.dataset.offset) : null
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent) {
    if (dragStart.current === null) return
    const dx = e.clientX - dragStart.current
    if (!dragging && Math.abs(dx) < TAP_SLOP) return
    setDragging(true)
    setDragPx(dx)
  }
  function onPointerUp(e: PointerEvent) {
    if (dragStart.current === null) return
    const dx = e.clientX - dragStart.current
    dragStart.current = null
    setDragging(false)
    setDragPx(0)
    if (Math.abs(dx) >= TAP_SLOP) {
      // A swipe: land on the nearest one. A quick short flick still moves at least one.
      let moved = Math.round(-dx / spacing)
      if (moved === 0) moved = dx < 0 ? 1 : -1
      goTo(index + moved)
      return
    }
    // A tap: on the middle one = open it; on a side one = bring it to the middle.
    const offset = pressedOffset.current
    if (offset === null) return
    if (offset === 0) onOpen()
    else goTo(index + offset)
  }
  function onPointerCancel() {
    dragStart.current = null
    setDragging(false)
    setDragPx(0)
  }
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') goTo(index + 1)
    else if (e.key === 'ArrowLeft') goTo(index - 1)
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!disabled) onOpen()
    }
  }

  const item = items[index]
  if (!item) return null
  const prev = items[(index - 1 + count) % count]
  const next = items[(index + 1) % count]

  const arrowClass =
    'z-20 flex size-11 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-40'

  return (
    // Fills the room the page gives it: the stage takes whatever height is left after the name plate and dots.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative flex min-h-0 flex-1 items-center">
        <button type="button" onClick={() => goTo(index - 1)} disabled={disabled} aria-label={`Previous: ${prev.name}`} className={cn(arrowClass, 'absolute left-0 md:left-4')}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>

        {/* ---------- The stage: every figure is placed by how far it is from the middle ---------- */}
        <div
          ref={stageRef}
          role="group"
          aria-roledescription="carousel"
          aria-label={`${label}. Use the left and right arrow keys to switch, Enter to choose.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className={cn(
            'relative h-full min-h-0 flex-1 touch-pan-y overflow-hidden rounded-3xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40',
            // The far figures fade out toward the sides instead of being cut off in a straight line (no visible "box").
            '[mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]',
            disabled ? 'cursor-default' : dragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          {bench && <LabBench className="h-10" />}
          {items.map((it, i) => {
            const offset = loopOffset(i, pos, count)
            const distance = Math.abs(offset)
            // Middle = full size; one step out = 70%; two steps = 52%. Further ones are hidden (they travel round the back).
            const scale = Math.max(0.52, 1 - distance * 0.3 + Math.max(0, distance - 1) * 0.12)
            const opacity = distance >= 2.5 ? 0 : distance <= 1 ? 1 - distance * 0.45 : 0.55 - (distance - 1) * 0.35
            const centered = Math.round(offset) === 0 && !dragging
            return (
              <div
                key={it.key}
                data-offset={Math.round(offset)}
                aria-hidden
                className={cn(
                  'absolute left-1/2',
                  align === 'bottom' ? 'bottom-5 origin-bottom' : 'top-1/2 origin-center',
                  // A springy ease (overshoots a little, then settles): the "game" feel. None while dragging, so it follows the finger.
                  !dragging && 'transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
                  distance >= 2.5 && 'pointer-events-none',
                )}
                style={{
                  transform: `translateX(calc(-50% + ${offset * spacing}px))${align === 'center' ? ' translateY(-50%)' : ''} scale(${scale * fit})`,
                  opacity,
                  zIndex: 10 - Math.round(distance),
                }}
              >
                <div data-figure className={cn('relative transition-transform duration-300', centered && '-translate-y-2')}>
                  {renderFigure(it, { centered })}
                </div>
              </div>
            )
          })}
        </div>

        <button type="button" onClick={() => goTo(index + 1)} disabled={disabled} aria-label={`Next: ${next.name}`} className={cn(arrowClass, 'absolute right-0 md:right-4')}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {/* ---------- The name plate under the middle one (one line of detail, truncated so it can't wrap and shift the stage) ---------- */}
      <div aria-live="polite" className="text-center">
        <p key={item.key} className="animate-in fade-in slide-in-from-bottom-2 font-heading text-4xl leading-none font-black tracking-wide duration-300 md:text-5xl">
          {item.code}
        </p>
        <p title={item.name} className="mt-2 truncate px-4 text-sm text-muted-foreground">
          {item.name}
          {' · '}
          {renderDetail(item)}
        </p>
      </div>

      {/* ---------- Dots: where she is in the loop. Each one jumps there. ---------- */}
      <div className="flex justify-center gap-1">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            onClick={() => goTo(i)}
            disabled={disabled}
            aria-label={`${it.name}${i === index ? ' (showing)' : ''}`}
            aria-current={i === index}
            className="group flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <span className={cn('block h-2 rounded-full transition-all duration-300', i === index ? 'w-5 bg-primary' : 'w-2 bg-primary/25 group-hover:bg-primary/50')} />
          </button>
        ))}
      </div>
    </div>
  )
}
