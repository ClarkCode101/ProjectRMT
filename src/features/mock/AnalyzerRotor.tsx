import type { CSSProperties } from 'react'
import { LabBench } from '@/components/LabBench'
import { tubeStatus, type TubeStatus } from '@/features/quiz/tube'
import { formatPercent, type SubjectSummary } from '@/lib/quiz'
import { cn } from '@/lib/utils'

// The subject picker on Mock exam: the rotor of an analyzer, seen from above.
// - Practice is the specimen rack; Mock exam is the analyzer the rack's tubes go into for a full run.
// - Six slots around the rotor, one tube per subject. The ring around each tube is its cap color:
//   red when the subject is below 60%, green when passing, gray when not started (same as the rack).
// - The hub in the middle loads all six subjects (a mixed exam).
// Every slot (and the hub) is a real radio button, so keyboard and screen readers work like any other choice.
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

const CENTER: CSSProperties = { left: '50%', top: '50%' }

/** Where slot i of n sits: the first one at the top, then clockwise. */
function slotPosition(i: number, n: number): CSSProperties {
  const angle = ((-90 + (360 / n) * i) * Math.PI) / 180
  return { left: `${50 + SLOT_RADIUS * Math.cos(angle)}%`, top: `${50 + SLOT_RADIUS * Math.sin(angle)}%` }
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
}: {
  subject: SubjectSummary
  checked: boolean
  onChange: () => void
  position: CSSProperties
  motion: SlotMotion
}) {
  const status = tubeStatus(subject.accuracy, subject.belowPassing)
  const moving = motion === 'center' || motion === 'absorbed'
  return (
    <label
      style={moving ? CENTER : position}
      className={cn(
        'group absolute flex size-[23%] -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center rounded-full border-[5px] bg-card leading-tight transition-[left,top,scale,opacity,box-shadow] has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        moving ? LOAD_TRANSITION : 'duration-300',
        CAP_RING[status],
        checked ? 'shadow-[0_0_0_4px_var(--highlight),0_10px_20px_-8px_rgb(7_71_94/0.6)]' : 'shadow-[0_6px_12px_-8px_rgb(7_71_94/0.5)]',
        motion === 'normal' && (checked ? 'scale-110' : 'hover:scale-105'),
        motion === 'faded' && 'opacity-25',
        motion === 'center' && 'z-10 scale-125',
        motion === 'absorbed' && 'scale-50 opacity-0',
      )}
    >
      <input type="radio" name="mock-subject" checked={checked} onChange={onChange} className="sr-only" />
      <span className="sr-only">
        {subject.name}: {subject.accuracy === null ? 'not started' : `${formatPercent(subject.accuracy)}${subject.belowPassing ? ', below 60%' : ''}`}
      </span>
      <span aria-hidden className={cn('font-heading text-sm font-bold sm:text-base', checked && 'text-primary')}>
        {subject.code}
      </span>
      <span
        aria-hidden
        className={cn('text-[11px] font-semibold tabular-nums sm:text-xs', status === 'low' ? 'text-wrong' : status === 'passing' ? 'text-correct' : 'text-muted-foreground')}
      >
        {subject.accuracy === null ? 'New' : formatPercent(subject.accuracy)}
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
}: {
  summary: SubjectSummary[]
  /** null = the hub (all subjects) */
  selectedId: number | null
  onSelect: (subjectId: number | null) => void
  phase: RotorPhase
  disabled: boolean
  /** grayed out (an exam is paused), unlike `disabled` alone, which is also on while the start scene plays */
  dimmed: boolean
}) {
  const allChecked = selectedId === null
  const settled = phase === 'land' || phase === 'load'

  function motionFor(subjectId: number): SlotMotion {
    if (allChecked) return phase === 'load' ? 'absorbed' : 'normal'
    if (selectedId === subjectId) return phase === 'load' ? 'center' : 'normal'
    return settled ? 'faded' : 'normal'
  }

  return (
    <fieldset disabled={disabled} className={cn('relative shrink-0 px-4 pb-8', dimmed && 'opacity-50')}>
      <legend className="sr-only">Subject</legend>
      {/* The same bench the Practice rack stands on; its top edge meets the rotor's bottom. */}
      <LabBench className="h-11" />
      {/* 16rem on the smallest phones (so it fits on a 320px screen), then 18rem, then 20rem */}
      <div className="relative mx-auto size-64 min-[400px]:size-72 sm:size-80">
        {/* the rotor's well: a raised ring with a soft shadow, so it reads as a part of the machine */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border border-primary/15 bg-secondary shadow-[inset_0_3px_0_rgb(255_255_255/0.8),inset_0_-8px_18px_rgb(7_71_94/0.12),0_20px_36px_-20px_rgb(7_71_94/0.6)]"
        />

        {/* the part that turns: the slot track and the six tubes */}
        <div className={cn('absolute inset-0', phase === 'spin' && 'analyzer-spin')}>
          <div aria-hidden className={cn('absolute inset-[14%] rounded-full border-2 border-dashed border-primary/15 transition-opacity duration-300', settled && 'opacity-40')} />
          {summary.map((s, i) => (
            <Slot
              key={s.subjectId}
              subject={s}
              checked={selectedId === s.subjectId}
              onChange={() => onSelect(s.subjectId)}
              position={slotPosition(i, summary.length)}
              motion={motionFor(s.subjectId)}
            />
          ))}
        </div>

        {/* the hub stays still (it's the axle): load all six.
            Start scene: with ALL chosen it grows as the tubes slide in; with one subject it shrinks away for that tube. */}
        <label
          className={cn(
            'absolute top-1/2 left-1/2 flex size-[30%] -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center rounded-full bg-primary-deep text-white transition-[scale,opacity,box-shadow] has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
            phase === 'load' ? LOAD_TRANSITION : 'duration-300',
            allChecked ? 'shadow-[0_0_0_4px_var(--highlight),0_12px_24px_-10px_rgb(7_71_94/0.8)]' : 'shadow-[0_10px_20px_-10px_rgb(7_71_94/0.8)]',
            phase === 'load' ? (allChecked ? 'scale-125' : 'scale-50 opacity-0') : allChecked ? 'scale-105' : phase === 'idle' && 'hover:scale-105',
          )}
        >
          <input type="radio" name="mock-subject" checked={allChecked} onChange={() => onSelect(null)} className="sr-only" />
          <span className="sr-only">All subjects, a mixed exam from all six</span>
          <span aria-hidden className="font-heading text-lg leading-none font-bold sm:text-xl">
            ALL
          </span>
          <span aria-hidden className="mt-1 text-[11px] leading-none text-white/70 sm:text-xs">
            6 subjects
          </span>
        </label>
      </div>
    </fieldset>
  )
}
