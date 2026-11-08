import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { tubeStatus, type TubeStatus } from '@/features/quiz/tube'
import { formatPercent, type SubjectSummary } from '@/lib/quiz'
import { cn } from '@/lib/utils'

// The subject picker on Mock exam: the rotor of an analyzer, seen from above. Works like a game's weapon wheel:
// - Six slots around the rotor, one tube per subject. The ring around each tube is its cap color:
//   red when the subject is below 60%, green when passing, gray when not started (same as Practice's tubes).
// - Drag/swipe sideways and the rotor turns with your finger; let go and it snaps (with a little bounce) so a
//   slot sits at the top, under the gold marker ("load position"). That subject is the one chosen.
// - Tap a slot and the rotor turns it to the top. Tap the hub in the middle for ALL (a mixed full-board exam).
// Every slot (and the hub) is a real radio button, so arrow keys and screen readers work like any other choice.
//
// When she presses Start run, the scene plays in three phases (MockSetup runs the clock):
// 1. spin: the rotor turns twice and slows down (analyzer-spin in index.css). Two full turns, so every tube
//    ends where it started.
// 2. land: the tubes she didn't choose fade.
// 3. load: the chosen tube slides into the center and the hub shrinks away ("the analyzer takes the sample").
//    With ALL chosen, all six slide into the hub instead, and the hub grows a little.

export type RotorPhase = 'idle' | 'spin' | 'land' | 'load'

const CAP_RING: Record<TubeStatus, string> = { low: 'border-wrong', passing: 'border-correct', new: 'border-border' }

/** From the rotor's center to each slot's center, in % of the rotor's width. */
const SLOT_RADIUS = 36

/** The slide into the center. Keep in step with LOAD_MS in MockSetup.tsx. */
const LOAD_TRANSITION = 'duration-600 ease-in-out'

/** The turn after a swipe or tap: springy (overshoots a little, then settles), same feel as Practice's carousel. */
const TURN_TRANSITION = 'transition-[rotate] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-none'

/** How far a drag must go (in px) before it counts as a swipe instead of a tap. */
const TAP_SLOP = 8

/** The biggest the rotor gets (px), on tall screens. */
const MAX_SIZE = 520

const CENTER: CSSProperties = { left: '50%', top: '50%' }

/** The ‹ › buttons beside the rotor: size-11 (44px), with a 12px gap to the rotor. */
const ARROW_SIZE = 44
const ARROW_GAP = 12
const ARROW_CLASS =
  'pointer-events-auto absolute top-1/2 z-30 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border bg-card shadow-sm outline-none transition-colors hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-40'

/** Where slot i of n sits on the (unturned) rotor: the first one at the top, then clockwise. */
function slotPosition(i: number, n: number): CSSProperties {
  const angle = ((-90 + (360 / n) * i) * Math.PI) / 180
  return { left: `${50 + SLOT_RADIUS * Math.cos(angle)}%`, top: `${50 + SLOT_RADIUS * Math.sin(angle)}%` }
}

/**
 * The step closest to `current` that puts slot `target` at the top. Steps keep counting past n (7, 8, …),
 * so going from the last slot to the first turns one step forward instead of spinning all the way back.
 */
function nearestStep(current: number, target: number, n: number) {
  let d = (((target - current) % n) + n) % n
  if (d > n / 2) d -= n
  return current + d
}

/**
 * What a tube is doing in the start scene:
 * normal · faded (not chosen) · center (chosen, slid into the middle) · absorbed (ALL chosen: slides into the hub and disappears)
 */
type SlotMotion = 'normal' | 'faded' | 'center' | 'absorbed'

function Slot({
  subject,
  checked,
  onChange,
  position,
  motion,
  uprightDeg,
  turning,
}: {
  subject: SubjectSummary
  checked: boolean
  onChange: () => void
  position: CSSProperties
  motion: SlotMotion
  /** turns the text back the other way, so it stays upright while the rotor turns */
  uprightDeg: number
  /** true = animate the turn (false while dragging, so it follows the finger) */
  turning: boolean
}) {
  const status = tubeStatus(subject.accuracy, subject.belowPassing)
  const moving = motion === 'center' || motion === 'absorbed'
  return (
    <label
      style={moving ? CENTER : position}
      className={cn(
        'group absolute flex size-[23%] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-[5px] bg-card leading-tight transition-[left,top,scale,opacity,box-shadow] has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        moving ? LOAD_TRANSITION : 'duration-300',
        CAP_RING[status],
        checked ? 'shadow-[0_0_0_4px_var(--highlight),0_0_28px_4px_rgb(233_162_59/0.55)]' : 'shadow-[0_6px_12px_-8px_rgb(7_71_94/0.5)]',
        motion === 'normal' && (checked ? 'z-10 scale-125' : 'hover:scale-105'),
        motion === 'faded' && 'opacity-25',
        motion === 'center' && 'z-10 scale-125',
        motion === 'absorbed' && 'scale-50 opacity-0',
      )}
    >
      <input type="radio" name="mock-subject" checked={checked} onChange={onChange} className="sr-only" />
      <span className="sr-only">
        {subject.name}: {subject.accuracy === null ? 'not started' : `${formatPercent(subject.accuracy)}${subject.belowPassing ? ', below 60%' : ''}`}
      </span>
      <span aria-hidden className={cn('flex flex-col items-center', turning && TURN_TRANSITION)} style={{ rotate: `${uprightDeg}deg` }}>
        {/* 5-letter codes (HTMLE, MICRO) get a smaller size and tighter letters so they stay inside the ring */}
        <span className={cn('font-heading font-bold', subject.code.length > 4 ? 'text-[0.95em] tracking-tight' : 'text-[1.15em]', checked && 'text-primary')}>
          {subject.code}
        </span>
        <span className={cn('text-[0.8em] font-semibold tabular-nums', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}>
          {subject.accuracy === null ? 'New' : formatPercent(subject.accuracy)}
        </span>
      </span>
    </label>
  )
}

export function AnalyzerRotor({
  summary,
  selectedId,
  onSelect,
  phase,
  disabled,
  dimmed,
  onPrev,
  onNext,
}: {
  summary: SubjectSummary[]
  /** null = the hub (all subjects) */
  selectedId: number | null
  onSelect: (subjectId: number | null) => void
  phase: RotorPhase
  disabled: boolean
  /** grayed out (an exam is paused), unlike `disabled` alone, which is also on while the start scene plays */
  dimmed: boolean
  /** the ‹ › buttons (MockSetup knows the order: ALL first, then each subject) */
  onPrev: () => void
  onNext: () => void
}) {
  const n = summary.length
  const allChecked = selectedId === null
  const settled = phase === 'land' || phase === 'load'

  // ---------- Size: as big as the room allows (the page is one screen tall), up to MAX_SIZE ----------
  const areaRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(280)
  useLayoutEffect(() => {
    const area = areaRef.current
    if (!area) return
    // Width: leave room for the ‹ › on each side. Height: leave room for the shadow under it.
    const measure = () => setSize(Math.max(200, Math.min(MAX_SIZE, area.clientWidth - 2 * (ARROW_SIZE + ARROW_GAP), area.clientHeight - 16)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [])

  // ---------- Turning ----------
  // step = which slot is at the top (it keeps counting past n, see nearestStep). dragSteps = how far the finger has turned it.
  const [step, setStep] = useState(0)
  const [dragSteps, setDragSteps] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; active: boolean } | null>(null)
  const justDragged = useRef(false)
  const pxPerStep = size * 0.4

  // A subject chosen any other way (tap, arrow keys, the ‹ › buttons, dots): turn it to the top.
  // Done while rendering (React's "adjust state when a prop changes" pattern), so the turn starts right away.
  const [turnedFor, setTurnedFor] = useState(selectedId)
  if (turnedFor !== selectedId) {
    setTurnedFor(selectedId)
    const i = summary.findIndex((s) => s.subjectId === selectedId)
    if (i >= 0) setStep((s) => nearestStep(s, i, n))
  }

  function onPointerDown(e: PointerEvent) {
    if (disabled || e.button !== 0) return
    drag.current = { x: e.clientX, active: false }
  }
  function onPointerMove(e: PointerEvent<HTMLFieldSetElement>) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    if (!drag.current.active) {
      if (Math.abs(dx) < TAP_SLOP) return
      // Only now take over the pointer: a plain tap still reaches the slot under the finger.
      drag.current.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    setDragSteps(-dx / pxPerStep)
  }
  function onPointerUp(e: PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d?.active) return
    justDragged.current = true // so the click that follows doesn't also choose the slot under the finger
    const dx = e.clientX - d.x
    // Land on the nearest slot. A quick short flick still turns at least one slot.
    let moved = Math.round(-dx / pxPerStep)
    if (moved === 0) moved = dx < 0 ? 1 : -1
    const next = step + moved
    setStep(next)
    setDragging(false)
    setDragSteps(0)
    navigator.vibrate?.(8) // a tiny "click" on phones that support it
    onSelect(summary[((next % n) + n) % n].subjectId)
  }
  function onPointerCancel() {
    drag.current = null
    setDragging(false)
    setDragSteps(0)
  }
  function onClickCapture(e: MouseEvent) {
    if (!justDragged.current) return
    justDragged.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  function motionFor(subjectId: number): SlotMotion {
    if (allChecked) return phase === 'load' ? 'absorbed' : 'normal'
    if (selectedId === subjectId) return phase === 'load' ? 'center' : 'normal'
    return settled ? 'faded' : 'normal'
  }

  const turnDeg = -(step + dragSteps) * (360 / (n || 1))
  const turning = !dragging

  return (
    // Fills the room MockSetup gives it; the rotor is a square as big as fits.
    // self-stretch: takes the full height of the row it's in, so the measurement sees all the room there is.
    <div ref={areaRef} className="relative flex min-h-0 w-full flex-1 items-center justify-center self-stretch">
      <fieldset
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        // fontSize grows with the rotor (≈13px at 300px, ≈21px at 460px); the text inside uses em, so it scales with it.
        style={{ width: size, height: size, fontSize: size * 0.045 }}
        className={cn(
          // The last shadow is the soft round shadow it casts on the page (it's seen from above, so no bench line).
          'relative shrink-0 touch-pan-y rounded-full bg-primary-deep/[0.07] p-2 shadow-[inset_0_3px_8px_rgb(7_71_94/0.25),0_28px_40px_-18px_rgb(7_71_94/0.45)] select-none',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
          dimmed && 'opacity-50',
        )}
      >
        <legend className="sr-only">Subject. Use the arrow keys, or drag the rotor, to switch.</legend>
        <div className="relative size-full">
          {/* the rotor's well: a raised ring with a soft shadow, so it reads as a part of the machine */}
          <div
            aria-hidden
            className="absolute inset-0 rounded-full border border-primary/15 bg-secondary shadow-[inset_0_3px_0_rgb(255_255_255/0.8),inset_0_-8px_18px_rgb(7_71_94/0.12),0_20px_36px_-20px_rgb(7_71_94/0.6)]"
          />

          {/* the hub stays still (it's the axle): load all six. First in the page order, so the arrow keys go ALL → BACT → … like the dots.
              Start scene: with ALL chosen it grows as the tubes slide in; with one subject it shrinks away for that tube. */}
          <label
            className={cn(
              'absolute top-1/2 left-1/2 z-20 flex size-[30%] -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center rounded-full bg-primary-deep text-white transition-[scale,opacity,box-shadow] has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
              phase === 'load' ? LOAD_TRANSITION : 'duration-300',
              allChecked ? 'shadow-[0_0_0_4px_var(--highlight),0_0_32px_6px_rgb(233_162_59/0.5)]' : 'shadow-[0_10px_20px_-10px_rgb(7_71_94/0.8)]',
              phase === 'load' ? (allChecked ? 'scale-125' : 'scale-50 opacity-0') : allChecked ? 'scale-110' : phase === 'idle' && 'hover:scale-105',
            )}
          >
            <input type="radio" name="mock-subject" checked={allChecked} onChange={() => onSelect(null)} className="sr-only" />
            <span className="sr-only">All subjects, a mixed full-board exam</span>
            <span aria-hidden className="font-heading text-[1.5em] leading-none font-bold">
              ALL
            </span>
            <span aria-hidden className="mt-1 text-[0.8em] leading-none text-white/70">
              6 subjects
            </span>
          </label>

          {/* the part that turns: the slot track and the six tubes (the start scene's spin adds on top of the turn) */}
          <div className={cn('absolute inset-0', turning && TURN_TRANSITION, phase === 'spin' && 'analyzer-spin')} style={{ rotate: `${turnDeg}deg` }}>
            <div aria-hidden className={cn('absolute inset-[14%] rounded-full border-2 border-dashed border-primary/15 transition-opacity duration-300', settled && 'opacity-40')} />
            {summary.map((s, i) => (
              <Slot
                key={s.subjectId}
                subject={s}
                checked={selectedId === s.subjectId}
                onChange={() => onSelect(s.subjectId)}
                position={slotPosition(i, n)}
                motion={motionFor(s.subjectId)}
                uprightDeg={-turnDeg}
                turning={turning}
              />
            ))}
          </div>

          {/* the load position: a gold marker at the top that doesn't turn (the slot under it is the one chosen) */}
          <span
            aria-hidden
            className={cn(
              'absolute -top-4 left-1/2 z-20 -translate-x-1/2 border-x-[9px] border-t-[12px] border-x-transparent border-t-highlight drop-shadow-sm transition-opacity',
              (allChecked || phase !== 'idle') && 'opacity-30',
            )}
          />
        </div>
      </fieldset>

      {/* ‹ › hug the rotor's sides (not the screen's edges), so it's clear they turn it. Outside the fieldset so they
          stay outside the drag area. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative" style={{ width: size + 2 * (ARROW_SIZE + ARROW_GAP) }}>
          <button type="button" onClick={onPrev} disabled={disabled} aria-label="Previous subject" className={cn(ARROW_CLASS, 'left-0')}>
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button type="button" onClick={onNext} disabled={disabled} aria-label="Next subject" className={cn(ARROW_CLASS, 'right-0')}>
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
