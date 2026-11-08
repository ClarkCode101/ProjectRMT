import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { LabBench } from '@/components/LabBench'
import { formatPercent } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { tubeStatus } from './tube'
import { TubeFigure } from './TubeFigure'

// The subject picker on Practice, like a "choose your character" screen in a game:
// - one big tube in the middle (the subject in focus), the next ones smaller and faded on each side
// - drag/swipe the tubes (they follow your finger), then they snap to the nearest one with a little bounce
// - it loops: after the last tube comes the first again
// - tap the middle tube to open it; tap a side tube to bring it to the middle
// - ← → keys and the ‹ › buttons work too

export type CarouselItem = { key: string; code: string; name: string; accuracy: number | null; belowPassing: boolean }

/** How far a drag must go (in px) before it counts as a swipe instead of a tap. */
const TAP_SLOP = 8
/** Room in the stage besides the tube (px): the gap to the bench at the bottom (bottom-5) + the lift on top. */
const STAGE_EXTRA = 40

/** The shortest way round the loop from `pos` to item `i`: e.g. with 7 items, item 0 is +1 from item 6. */
function loopOffset(i: number, pos: number, count: number) {
  let d = (((i - pos) % count) + count) % count
  if (d > count / 2) d -= count
  return d
}

export function SubjectCarousel({
  items,
  index,
  onIndexChange,
  onOpen,
}: {
  items: CarouselItem[]
  /** the item in the middle */
  index: number
  onIndexChange: (index: number) => void
  /** she chose the middle tube (tap, Enter, or the button under it) */
  onOpen: () => void
}) {
  const count = items.length
  const stageRef = useRef<HTMLDivElement>(null)
  // Distance between two tubes, in px. Grows with the screen; measured so a drag in px can be turned into "tubes moved".
  const [spacing, setSpacing] = useState(120)
  // How much to shrink every tube so the tallest one fits the stage (the page is one screen tall, no scrolling).
  const [fit, setFit] = useState(1)
  const [dragPx, setDragPx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<number | null>(null)
  // The tube under the finger when the press began (after pointer capture, later events all point at the stage).
  const pressedOffset = useRef<number | null>(null)

  // useLayoutEffect: measured before the first paint, so the tubes don't show at the wrong size for a moment.
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      // The tube's real height (offsetHeight ignores the scale), vs. the room left after the star, lift and bench.
      const tube = stage.querySelector<HTMLElement>('[data-tube]')
      const nextFit = tube ? Math.min(1, Math.max(0.45, (stage.clientHeight - STAGE_EXTRA) / tube.offsetHeight)) : 1
      setFit(nextFit)
      setSpacing(Math.min(200, Math.max(96, stage.clientWidth * 0.24)) * Math.max(0.7, nextFit))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  function goTo(i: number) {
    const next = ((i % count) + count) % count
    if (next !== index) navigator.vibrate?.(8) // a tiny "click" on phones that support it
    onIndexChange(next)
  }

  // Where the carousel is right now, in "items": e.g. 2.4 = between item 2 and 3 while dragging.
  const pos = index - dragPx / spacing

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    dragStart.current = e.clientX
    const tube = (e.target as HTMLElement).closest<HTMLElement>('[data-offset]')
    pressedOffset.current = tube ? Number(tube.dataset.offset) : null
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
      // A swipe: land on the nearest tube. A quick short flick still moves at least one tube.
      let moved = Math.round(-dx / spacing)
      if (moved === 0) moved = dx < 0 ? 1 : -1
      goTo(index + moved)
      return
    }
    // A tap: on the middle tube = open it; on a side tube = bring it to the middle.
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
      onOpen()
    }
  }

  const item = items[index]
  if (!item) return null
  const status = tubeStatus(item.accuracy, item.belowPassing)
  const prev = items[(index - 1 + count) % count]
  const next = items[(index + 1) % count]

  const arrowClass =
    'z-20 flex size-11 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40'

  return (
    // Fills the room Practice gives it: the stage takes whatever height is left after the name plate and dots.
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative flex min-h-0 flex-1 items-center">
        <button type="button" onClick={() => goTo(index - 1)} aria-label={`Previous subject: ${prev.name}`} className={cn(arrowClass, 'absolute left-0 md:left-4')}>
          <ChevronLeft className="size-5" aria-hidden />
        </button>

        {/* ---------- The stage: every tube is placed by how far it is from the middle ---------- */}
        <div
          ref={stageRef}
          role="group"
          aria-roledescription="carousel"
          aria-label="Subjects. Use the left and right arrow keys to switch, Enter to choose."
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className={cn(
            'relative h-full min-h-0 flex-1 touch-pan-y overflow-hidden rounded-3xl outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
        >
          <LabBench className="h-10" />
          {items.map((it, i) => {
            const offset = loopOffset(i, pos, count)
            const distance = Math.abs(offset)
            // Middle = full size; one step out = 70%; two steps = 52%. Further ones are hidden (they travel round the back).
            const scale = Math.max(0.52, 1 - distance * 0.3 + Math.max(0, distance - 1) * 0.12)
            const opacity = distance >= 2.5 ? 0 : distance <= 1 ? 1 - distance * 0.45 : 0.55 - (distance - 1) * 0.35
            const centered = Math.round(offset) === 0 && !dragging
            const itStatus = tubeStatus(it.accuracy, it.belowPassing)
            return (
              <div
                key={it.key}
                data-offset={Math.round(offset)}
                aria-hidden
                className={cn(
                  'absolute bottom-5 left-1/2 origin-bottom',
                  // A springy ease (overshoots a little, then settles): the "game" feel. None while dragging, so it follows the finger.
                  !dragging && 'transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none',
                  distance >= 2.5 && 'pointer-events-none',
                )}
                style={{
                  transform: `translateX(calc(-50% + ${offset * spacing}px)) scale(${scale * fit})`,
                  opacity,
                  zIndex: 10 - Math.round(distance),
                }}
              >
                <div data-tube className={cn('relative transition-transform duration-300', centered && '-translate-y-2')}>
                  {/* Remounted when it lands in the middle, so its liquid rises again (side tubes stay still). */}
                  <TubeFigure key={centered ? `${it.key}-center` : it.key} accuracy={it.accuracy} status={itStatus} animateFill={centered} />
                </div>
              </div>
            )
          })}
        </div>

        <button type="button" onClick={() => goTo(index + 1)} aria-label={`Next subject: ${next.name}`} className={cn(arrowClass, 'absolute right-0 md:right-4')}>
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {/* ---------- The name plate under the middle tube ---------- */}
      <div aria-live="polite" className="text-center">
        <p key={item.key} className="animate-in fade-in slide-in-from-bottom-2 font-heading text-4xl leading-none font-black tracking-wide duration-300 md:text-5xl">
          {item.code}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {item.name}
          {' · '}
          <span className={cn('font-bold tabular-nums', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}>
            {item.accuracy === null ? 'Not started' : `Score ${formatPercent(item.accuracy)}`}
          </span>
        </p>
      </div>

      {/* ---------- Dots: where she is in the loop. Each one jumps to that subject. ---------- */}
      <div className="flex justify-center gap-1">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            onClick={() => goTo(i)}
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
