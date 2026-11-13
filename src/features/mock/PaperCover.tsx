import { Hand } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { RangeBar } from '@/components/report'
import { weakestFirst, type CoverTopic } from '@/lib/boardRun'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { cn } from '@/lib/utils'

// The cover of the next Full Board paper, drawn like a real test booklet (chosen 2026-11-13: the plain paper with
// only the subject code looked like a placeholder). Generic on purpose: "MTLE Mock", never a real agency's name or
// seal, so it can't pass for an official document.
// From top to bottom: the subject's color band; MTLE MOCK · FULL BOARD + booklet n/6 + a barcode + the weight;
// NAME (her first name) and DATE (today) already filled in; the subject; COVERS (its topics, lowest score first, labeled "your scores",
// red below 75% / green at 75%+, with her score in each); her practice score in it (with the 75% tick);
// "Tap to pick what's first" when she can. Items and time are on the count chip, so not repeated here.

/** Topics shown on the cover before "+N more" (about two lines, so the cover stays short enough for an iPad). */
const TOPICS_SHOWN = 4
/** On a phone (below `sm`), only this many: one line, so the cover fits the screen with the chips and Start under it. */
const TOPICS_SHOWN_PHONE = 2

// When the room is short, the cover leaves parts out, least needed first (the page never scrolls; see BoardSetup).
// These read the height of the room the cover sits in (its section is a size container), not the screen's.
/** below this room height: no COVERS topics */
const FIT_NO_TOPICS = '[@container(max-height:24rem)]:hidden'
/** below this: no NAME / DATE line either */
const FIT_NO_NAME = '[@container(max-height:20rem)]:hidden'
/** below this: no "Tap to pick what's first" either (the chips under the paper still switch papers) */
const FIT_NO_HINT = '[@container(max-height:16rem)]:hidden'
/** below this: no barcode or weight line either (an iPhone SE in Safari) */
const FIT_NO_BARCODE = '[@container(max-height:13rem)]:hidden'

/** A made-up barcode: bar widths come from the text, so the same booklet always gets the same bars. */
function Barcode({ text, className }: { text: string; className?: string }) {
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const bars: { x: number; w: number }[] = []
  let x = 0
  for (let i = 0; i < 30; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0
    const w = 1 + ((hash >>> 16) % 3) // 1–3 px
    if (i % 2 === 0) bars.push({ x, w })
    x += w + 1
  }
  return (
    <svg aria-hidden viewBox={`0 0 ${x} 20`} preserveAspectRatio="none" className={className}>
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={20} fill="currentColor" />
      ))}
    </svg>
  )
}

/** A filled-in form field: small caps label, then the value on a dashed line (like a pen on a printed form). */
function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-baseline gap-2', className)}>
      <span className="shrink-0 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
      <span className="min-w-0 flex-1 truncate border-b border-dashed border-foreground/25 pb-0.5 font-semibold">{children}</span>
    </span>
  )
}

type Props = {
  /** paper number (1–6) and how many there are */
  number: number
  total: number
  code: string
  name: string
  /** the subject's color (band, code, spine of the chips) */
  color: string
  /** share of the general average, in whole percent */
  weight: number
  /** her first name, or null (then a blank line, like an unfilled form) */
  studentName: string | null
  /** the subject's topics, with her Practice score in each (null = not answered yet), in the subject's order */
  topics: CoverTopic[]
  /** her score in this subject on Practice (all her answers so far), or null if she hasn't started it */
  practiceScore: number | null
  /** "Tap to pick what's first" in the corner (when there's another paper to switch to) */
  tapHint?: boolean
  /** a line along the bottom (where she left off a paused paper); none = no footer. Items and time are on the
   *  count chip under the paper, so the cover doesn't repeat them. */
  footer?: ReactNode
}

/** A topic chip's colors: red below 75%, green at 75% or more, plain when she hasn't tried it. */
function topicTone(accuracy: number | null): string {
  if (accuracy === null) return 'border-border bg-secondary/50 text-muted-foreground'
  return accuracy < PASSING_RATE ? 'border-wrong/30 bg-wrong-soft text-wrong' : 'border-correct/30 bg-correct-soft text-correct'
}

export function PaperCover({ number, total, code, name, color, weight, studentName, topics, practiceScore, tapHint = false, footer }: Props) {
  // read once when the cover first shows (a date doesn't need to tick)
  const [today] = useState(() => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }))
  const sorted = weakestFirst(topics)
  const shown = sorted.slice(0, TOPICS_SHOWN)
  const more = sorted.length - shown.length
  const morePhone = sorted.length - Math.min(sorted.length, TOPICS_SHOWN_PHONE)
  const anyTried = topics.some((t) => t.accuracy !== null)

  return (
    // Its height comes from what's on it (not the room around it), so nothing on the cover can be cut off.
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-primary/15 bg-card text-sm shadow-[0_22px_36px_-18px_rgb(7_71_94/0.55)]">
      {/* the subject's color band */}
      <span aria-hidden className="h-2.5 shrink-0" style={{ background: color }} />

      {/* ---------- The booklet's header: what it is, which booklet, a barcode, the weight ---------- */}
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-widest uppercase">MTLE Mock · Full Board</p>
          <Barcode text={`${code}-${number}`} className={cn('mt-1.5 h-5 w-28 text-foreground/70', FIT_NO_BARCODE)} />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
            Booklet <span className="text-foreground tabular-nums">{number}</span>/{total}
          </p>
          <p className={cn('mt-1.5 text-[11px] font-bold tracking-widest text-muted-foreground uppercase tabular-nums', FIT_NO_BARCODE)} title={`${weight}% of the general average`}>
            {weight}% weight
          </p>
        </div>
      </div>

      {/* ---------- Name and date, already filled in ---------- */}
      <div className={cn('mx-4 mt-2.5 flex shrink-0 gap-4 border-y border-dashed border-foreground/15 py-2 sm:mx-5 sm:mt-3 sm:py-2.5', FIT_NO_NAME)}>
        <Field label="Name" className="flex-1">
          {studentName ?? ' '}
        </Field>
        <Field label="Date" className="w-36 shrink-0">
          <span className="font-mono tabular-nums">{today}</span>
        </Field>
      </div>

      {/* ---------- The subject, what it covers, and where she stands ---------- */}
      {/* A phone gets the same cover, a little tighter (smaller code, less space), so it fits above Start. */}
      <div className="flex flex-col gap-2.5 px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        <div className="text-center">
          <p className="font-heading text-4xl leading-none font-black tracking-wide sm:text-5xl md:text-6xl" style={{ color }}>
            {code}
          </p>
          <p title={name} className="mt-1.5 truncate text-muted-foreground sm:mt-2">
            {name}
          </p>
        </div>

        {shown.length > 0 && (
          <div className={FIT_NO_TOPICS}>
            <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              Covers{anyTried && <span className="font-semibold normal-case tracking-normal"> · your scores</span>}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`Topics in ${code}, with your scores, lowest first`}>
              {shown.map((t, i) => (
                <li
                  key={t.name}
                  className={cn(
                    'flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
                    i >= TOPICS_SHOWN_PHONE && 'max-sm:hidden',
                    topicTone(t.accuracy),
                  )}
                >
                  <span className="truncate text-foreground">{t.name}</span>
                  {t.accuracy !== null && <span className="shrink-0 font-mono font-bold tabular-nums">{formatPercent(t.accuracy)}</span>}
                </li>
              ))}
              {/* "+N more": counted for the phone (fewer chips shown) and for bigger screens */}
              {morePhone > 0 && <li className="px-1 py-0.5 text-xs font-semibold text-muted-foreground sm:hidden">+{morePhone} more</li>}
              {more > 0 && <li className="px-1 py-0.5 text-xs font-semibold text-muted-foreground max-sm:hidden">+{more} more</li>}
            </ul>
          </div>
        )}

        <div>
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Your practice score</span>
            <span className={cn('font-mono font-bold tabular-nums', practiceScore === null ? 'text-muted-foreground' : practiceScore < PASSING_RATE ? 'text-wrong' : 'text-correct')}>
              {practiceScore === null ? 'Not started' : formatPercent(practiceScore)}
            </span>
          </p>
          <span className="mt-1.5 block">
            <RangeBar rate={practiceScore} label={`Your practice score in ${code}: ${practiceScore === null ? 'not started' : formatPercent(practiceScore)}`} />
          </span>
        </div>

        {/* On an iPad there's no hover, so say it: the paper itself is what you tap to switch. */}
        {tapHint && (
          <p aria-hidden className={cn('flex items-center justify-end gap-1 text-xs font-semibold text-primary', FIT_NO_HINT)}>
            <Hand className="size-3.5" />
            Tap to pick what's first
          </p>
        )}
      </div>

      {/* ---------- Along the bottom, only when there's something to say (where she left off a paused paper) ---------- */}
      {footer && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-dashed border-foreground/15 px-5 py-3 font-semibold tabular-nums">{footer}</div>
      )}
    </div>
  )
}
