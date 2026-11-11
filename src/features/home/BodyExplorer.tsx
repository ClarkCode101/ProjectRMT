import { ChevronLeft, ChevronRight, Dices, Play, X } from 'lucide-react'
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { heroButtonClass } from '@/components/report'
import { PASSING_RATE, type SubjectSummary } from '@/lib/quiz'
import { useCountUp } from '@/lib/useCountUp'
import { cn } from '@/lib/utils'
import type { Body3DControls, OrganAnchor } from './Body3D'
import { WarmupCard } from './HomeCards'
import { OrganIcon } from './OrganIcon'
import type { ScoreSnapshot } from './snapshot'
import { correctCount, correctToPass, MIN_ANSWERED, nextMilestone, ORGANS, organLook, scoreCaption, STATUS_COLOR, subjectStatus, type SubjectStatus } from './organs'

// three.js is big, so the 3D body downloads separately, after the rest of Home shows.
const Body3D = lazy(() => import('./Body3D'))

/**
 * The centerpiece of Home: a 3D body you can turn, with a card for each subject around it.
 * Laptops: cards in two columns beside the body, each joined to its organ by a faint line (like a labelled diagram).
 * Tablets and phones: the cards sit in a grid under the body.
 * From tablet size up, the stage stretches to fill the height it is given, so Home fits without scrolling.
 * The cards are the keyboard / screen-reader way to choose; the 3D body is extra.
 *
 * Tapping a card (or its organ) only CHOOSES the subject: the Next up bar below then points its Practice button at it.
 */
export function BodyStage({
  summary,
  selected,
  previous,
  onSelect,
  readout,
  today,
  celebrate = false,
}: {
  summary: SubjectSummary[]
  /** the subject in the Next up bar: it glows on the body and gets the solid line */
  selected: SubjectSummary | undefined
  /** subjects she answered more in since her last visit, with their old numbers (their labels count up from them) */
  previous: Record<string, ScoreSnapshot>
  onSelect: (subjectId: number) => void
  /** the overall score, shown with the body like a scan readout (bottom right on laptops, under Turn on smaller screens) */
  readout?: ReactNode
  /** today's goal and the week so far (laptops only: bottom left, mirroring the readout) */
  today?: ReactNode
  /** true = the body does a little dance (daily goal reached) */
  celebrate?: boolean
}) {
  const mapped = summary.filter((s) => ORGANS[s.code])
  const controls = useRef<Body3DControls | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const lineRefs = useRef(new Map<string, SVGGElement>())
  // The card she's pointing at or tabbed to (its line shows too); null = none.
  const [pointedCode, setPointedCode] = useState<string | null>(null)

  // Runs every frame: move each dashed line so it joins its card to the organ, wherever the body has turned.
  // Done directly on the SVG (not through React state) so turning stays smooth.
  function drawLines(anchors: OrganAnchor[]) {
    const stage = stageRef.current
    const canvasBox = canvasBoxRef.current
    if (!stage || !canvasBox) return
    const stageRect = stage.getBoundingClientRect()
    const canvasRect = canvasBox.getBoundingClientRect()
    for (const a of anchors) {
      const line = lineRefs.current.get(a.code)
      const card = cardRefs.current.get(a.code)
      if (!line || !card) continue
      const cardRect = card.getBoundingClientRect()
      const fromLeft = ORGANS[a.code].side === 'left'
      const x1 = (fromLeft ? cardRect.right : cardRect.left) - stageRect.left
      const y1 = cardRect.top + cardRect.height / 2 - stageRect.top
      const x2 = canvasRect.left - stageRect.left + a.x
      const y2 = canvasRect.top - stageRect.top + a.y
      const elbow = x1 + (fromLeft ? 18 : -18)
      line.querySelector('polyline')?.setAttribute('points', `${x1},${y1} ${elbow},${y1} ${x2},${y2}`)
      line.querySelector('circle')?.setAttribute('cx', String(x2))
      line.querySelector('circle')?.setAttribute('cy', String(y2))
      line.style.opacity = a.facing ? '1' : '0.25'
    }
  }

  // How each organ looks on the body: grey (not started), its color, or glowing (passing).
  const looks = Object.fromEntries(mapped.map((s) => [s.code, organLook(s)]))

  // Each side's cards top to bottom, in the order their organs sit in the body.
  const bySide = (side: 'left' | 'right') => mapped.filter((s) => ORGANS[s.code].side === side).sort((a, b) => ORGANS[a.code].rank - ORGANS[b.code].rank)
  const left = bySide('left')
  const right = bySide('right')

  function card(s: SubjectSummary) {
    const status = subjectStatus(s)
    const isSelected = s.subjectId === selected?.subjectId
    const before = previous[s.code]
    const organ = ORGANS[s.code]
    return (
      <button
        key={s.code}
        ref={(el) => {
          if (el) cardRefs.current.set(s.code, el)
          else cardRefs.current.delete(s.code)
        }}
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(s.subjectId)}
        // Pointing at (or tabbing to) a card shows its line to the organ.
        onPointerEnter={() => setPointedCode(s.code)}
        onPointerLeave={() => setPointedCode(null)}
        onFocus={() => setPointedCode(s.code)}
        onBlur={() => setPointedCode(null)}
        className={cn(
          // A small "lab result" card: white, thin border, light shadow (the box says "you can tap me").
          // It never moves: hover and the chosen state only change the border and shadow, so tapping feels steady.
          // Laptops: as wide as its column allows (up to 20rem), so the full subject name fits.
          // @container: the card shows more (the correct count) when it has the room.
          '@container relative flex w-full min-w-0 flex-col gap-2 rounded-2xl border bg-card px-3 py-2.5 text-left shadow-[0_6px_18px_-12px_rgb(7_71_94/0.45)] outline-none transition-[box-shadow,border-color] focus-visible:ring-3 focus-visible:ring-ring/40 lg:max-w-80 lg:px-3.5',
          isSelected
            ? 'border-primary bg-primary/[0.04] shadow-[0_10px_28px_-16px_rgb(7_71_94/0.6)] ring-1 ring-primary'
            : 'hover:border-primary/40 hover:shadow-[0_12px_28px_-14px_rgb(7_71_94/0.5)]',
          // Just practiced this one: a soft gold flash while its number counts up.
          before && 'score-bump',
        )}
      >
        {/* Top row: the organ (icon on a tint of its own color, like on the body), the subject, the number */}
        <span className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full lg:size-9" style={{ backgroundColor: `${organ.color}26` }}>
            <OrganIcon code={s.code} className="size-4.5 lg:size-5" />
          </span>
          {/* Small screens: just the code (the cards are narrow). Laptops: the full name, with the code under it. */}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-sm leading-tight font-bold" title={s.name}>
              <span className="lg:hidden">{s.code}</span>
              <span className="hidden lg:inline">{s.name}</span>
              <span className="sr-only"> ({organ.name})</span>
            </span>
            <span className="hidden truncate text-xs leading-tight font-semibold text-muted-foreground lg:block">{s.code}</span>
          </span>
          <ScoreNumber subject={s} before={before} />
        </span>

        {/* The bar, in the same language as the readiness bar at the top */}
        <ProgressBar subject={s} status={status} />

        {/* The next small win (what to do to reach the next step) and, when the card is wide enough, how many she got right */}
        <span className="flex items-baseline justify-between gap-2 text-xs leading-tight text-muted-foreground">
          <span className="min-w-0 truncate">{nextMilestone(s)}</span>
          {s.attempts > 0 && (
            <span className="hidden shrink-0 tabular-nums @2xs:inline">
              {correctCount(s)} of {s.attempts} correct
            </span>
          )}
        </span>
      </button>
    )
  }

  // Card columns on laptops: placed from the MIDDLE (where the body is), not from the screen's edges,
  // so the cards stay close to the body like labels in a diagram (they were stuck to the far edges before).
  // The body's half-width grows with the screen's height (about 14% of it), so the columns sit "14dvh + 5rem"
  // from the middle: about 5rem of breathing room between body and cards on any screen. Not tight against the arms
  // (too close felt cramped), not at the screen's edges (too far felt empty). The min() keeps a column inside
  // the stage on narrower laptops.
  // The 3D box (below) is wider than the gap between the columns, so the cards sit over its empty sides
  // (a narrow box would make the camera back up and the body shrink).
  // Each column runs from there out to the stage's edge, and its cards fill it (up to 20rem wide, kept on the
  // body's side), so the sides of the stage are used instead of left empty.
  const column = 'lg:absolute lg:top-0 lg:bottom-20 lg:flex lg:flex-col lg:justify-evenly'
  const leftOfBody = 'lg:left-0 lg:right-[min(calc(50%+14dvh+5rem),calc(100%-12rem))]'
  const rightOfBody = 'lg:right-0 lg:left-[min(calc(50%+14dvh+5rem),calc(100%-12rem))]'

  return (
    <section aria-labelledby="body-heading" className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <h2 id="body-heading" className="sr-only">
        Subjects on the body
      </h2>

      {/* Phones and tablets: body, turn buttons, then a grid of cards (flex order).
          Laptops: one stage with the body in the middle and a column of cards on each side. */}
      <div ref={stageRef} className="relative flex flex-col md:min-h-0 md:flex-1 lg:block">
        {/* Soft spotlight behind the body */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[6%] mx-auto aspect-square w-[70%] max-w-[26rem] rounded-full bg-[radial-gradient(circle,rgb(11_99_130/0.12),transparent_65%)]" />

        <div
          ref={canvasBoxRef}
          className="relative order-1 mx-auto h-[24rem] w-full max-w-[22rem] md:h-auto md:min-h-48 md:max-w-none md:flex-1 lg:absolute lg:w-auto lg:inset-x-28 lg:top-0 lg:bottom-11 xl:inset-x-32"
        >
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Loading 3D body…</div>}>
            <Body3D
              selectedCode={selected?.code}
              looks={looks}
              onPick={(code) => {
                const subject = mapped.find((s) => s.code === code)
                if (subject) onSelect(subject.subjectId)
              }}
              onFrame={drawLines}
              ref={controls}
              celebrate={celebrate}
              className="size-full"
            />
          </Suspense>
        </div>

        {/* Leader lines (laptops only, where the cards sit beside the body): every card is joined to its organ,
            like a labelled diagram, so "this card = this organ" is clear at a glance.
            Thin, dotted and faint, so they stay in the background; pointing at a card makes its line stronger;
            the chosen subject's line is solid blue. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 hidden size-full overflow-visible lg:block">
          {mapped.map((s) => {
            const isSelected = s.subjectId === selected?.subjectId
            const isPointed = s.code === pointedCode
            return (
              <g
                key={s.code}
                ref={(el) => {
                  if (el) lineRefs.current.set(s.code, el)
                  else lineRefs.current.delete(s.code)
                }}
                className="transition-opacity duration-300"
              >
                <polyline
                  fill="none"
                  stroke={isSelected ? 'var(--primary)' : 'var(--muted-foreground)'}
                  strokeOpacity={isSelected ? 1 : isPointed ? 0.8 : 0.35}
                  strokeWidth={isSelected ? 2 : 1.25}
                  strokeDasharray={isSelected ? undefined : '2 4'}
                  strokeLinecap="round"
                />
                <circle r={isSelected ? 3.5 : 2.5} fill={isSelected ? 'var(--primary)' : 'var(--muted-foreground)'} fillOpacity={isSelected ? 1 : isPointed ? 0.8 : 0.5} />
              </g>
            )
          })}
        </svg>

        {/* Subject cards. "contents" lets the same cards be one grid (small screens) or two side columns (laptops). */}
        <div role="group" aria-label="Choose a subject" className="order-3 mt-3 grid shrink-0 grid-cols-3 gap-2 lg:contents">
          {/* Left column sits a little lower and the right a little higher, like the picture. */}
          <div className={cn('contents lg:items-end lg:pt-[8%]', leftOfBody, column)}>{left.map(card)}</div>
          <div className={cn('contents lg:items-start lg:pb-[8%]', rightOfBody, column)}>{right.map(card)}</div>
        </div>

        {/* Turn handle under the feet, like a turntable */}
        <div className="relative order-2 mt-1 flex shrink-0 justify-center lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0">
          <div className="flex w-full max-w-64 items-center">
            <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-foreground/30" />
            <span className="flex items-center rounded-full bg-primary p-0.5 text-primary-foreground shadow-sm">
              <button type="button" aria-label="Turn the body left" onClick={() => controls.current?.rotateBy(-Math.PI / 4)} className="flex size-8 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              {/* Says what the arrows do (they turn the body, they don't change page). */}
              <span aria-hidden className="px-1 text-xs font-bold whitespace-nowrap">
                Turn
              </span>
              <button type="button" aria-label="Turn the body right" onClick={() => controls.current?.rotateBy(Math.PI / 4)} className="flex size-8 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white">
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </span>
            <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-foreground/30" />
          </div>
        </div>

        {/* The overall score: the body's "scan readout". Laptops: under the right-hand cards (same distance from the body). */}
        {readout && (
          <div className={cn('order-2 mt-3 flex justify-center lg:absolute lg:bottom-0 lg:mt-0 lg:justify-start', rightOfBody)}>
            <div className="w-full max-w-sm lg:max-w-80">{readout}</div>
          </div>
        )}

        {/* Today and this week: laptops only, under the left-hand cards, so it balances the overall score
            on the right (smaller screens show today's count in the top line instead). */}
        {today && (
          <div className={cn('hidden lg:absolute lg:bottom-0 lg:flex lg:justify-end', leftOfBody)}>
            <div className="w-full max-w-80">{today}</div>
          </div>
        )}
      </div>
    </section>
  )
}

/** Bar color by how she's doing (same colors as the readiness bar and the number). */
const BAR_COLOR: Record<SubjectStatus, string> = {
  new: 'bg-secondary',
  starting: 'bg-primary',
  low: 'bg-highlight',
  passing: 'bg-correct',
}

/**
 * The card's bar. Getting started: fills with answers toward the 10 a real score needs (matches "2/10").
 * After that: fills with the score, with a marker at 60% (passing), like the readiness bar at the top.
 */
function ProgressBar({ subject, status }: { subject: SubjectSummary; status: SubjectStatus }) {
  const isReal = status === 'low' || status === 'passing'
  const fill = Math.min(1, isReal ? (subject.accuracy ?? 0) : subject.attempts / MIN_ANSWERED)
  return (
    <span aria-hidden className="relative block h-1.5 rounded-full bg-secondary">
      <span className={cn('block h-full rounded-full', BAR_COLOR[status])} style={{ width: `${fill * 100}%` }} />
      {isReal && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/50" style={{ left: `${PASSING_RATE * 100}%` }} />}
    </span>
  )
}

/**
 * The big number on a card: "2/10" while getting started, the score once it's real, colored like the ring.
 * If she practiced it since her last visit (`before`), it counts up from the old number.
 */
function ScoreNumber({ subject, before }: { subject: SubjectSummary; before: ScoreSnapshot | undefined }) {
  const status = subjectStatus(subject)
  const isReal = status === 'low' || status === 'passing'
  // Count answers while getting started; count the percent once the score is real (from 0 if it just became real).
  const to = isReal ? Math.round((subject.accuracy ?? 0) * 100) : subject.attempts
  const wasReal = before !== undefined && before.attempts >= MIN_ANSWERED && before.accuracy !== null
  const from = before === undefined ? to : isReal ? (wasReal ? Math.round(before.accuracy! * 100) : 0) : before.attempts
  const shown = useCountUp(from, to)
  return (
    <span className={cn('shrink-0 font-heading text-xl leading-none font-bold tabular-nums lg:text-2xl', isReal ? STATUS_COLOR[status] : 'text-foreground/75')}>
      {status === 'new' ? '—' : isReal ? `${shown}%` : `${shown}/${MIN_ANSWERED}`}
      <span className="sr-only"> {scoreCaption(subject)}</span>
    </span>
  )
}

/**
 * Next up: always on screen, so Practice is one tap away the moment Home opens.
 * Shows the subject that needs the most work until she taps another card or organ, then that one.
 * Three parts in a row: who (organ, subject, correct count) | how close to the goal | two buttons (Warm-up, gold Practice).
 * The middle fills the bar with something that pulls her forward: the distance to the next goal, as a bar and as steps.
 * Narrow (iPad portrait, phones): the three parts stack, Practice last (nearest the thumbs).
 * Uses its own width (container query), not the screen's.
 */
export function NextUpBar({ subject, subjectTopicIds }: { subject: SubjectSummary; subjectTopicIds: number[] }) {
  const organ = ORGANS[subject.code]
  const status = subjectStatus(subject)
  const [warmupOpen, setWarmupOpen] = useState(false)
  return (
    <section aria-labelledby="next-up-heading" className="@container shrink-0 rounded-2xl border bg-card p-3 shadow-[0_12px_32px_-24px_rgb(7_71_94/0.45)] lg:px-5">
      {/* No entrance animation and a fixed height (one-line title, steps row always there): switching subjects
          only swaps the words and numbers, so nothing on Home shifts or flickers when she taps a card. */}
      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:gap-6">
        {/* Who: the organ on a tint of its own color (same as its card), the subject, and the correct count */}
        <div className="flex min-w-0 items-center gap-3 @3xl:w-60 @3xl:shrink-0">
          <span className="grid size-12 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${organ?.color ?? '#0B6382'}26` }}>
            <OrganIcon code={subject.code} className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wide text-primary uppercase">Next up</p>
            {/* Always one line, so the bar keeps the same height; long names (HTMLE) show in full in the tooltip */}
            <h2 id="next-up-heading" title={subject.name} className="truncate font-heading text-lg leading-tight font-bold">
              {subject.name}
            </h2>
            <p className="text-sm text-muted-foreground tabular-nums">
              {subject.attempts === 0 ? 'Nothing answered yet' : `${correctCount(subject)} of ${subject.attempts} correct`}
            </p>
          </div>
        </div>

        {/* A thin divider between "who" and "how close" on wide bars */}
        <span aria-hidden className="hidden w-px self-stretch bg-secondary @3xl:block" />

        <GoalProgress subject={subject} status={status} />

        {/* Two buttons: a quiet Warm-up, then the gold Practice (the ONE main button on Home), always last.
            Narrow: side by side under the rest, Practice wider. */}
        <div className="grid shrink-0 grid-cols-[auto_1fr] gap-2 @3xl:flex @3xl:items-center">
          <button
            type="button"
            onClick={() => setWarmupOpen(true)}
            aria-haspopup="dialog"
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary/[0.08] px-4 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px"
          >
            <Dices className="size-4 shrink-0" aria-hidden />
            Warm-up
          </button>
          <Link
            to={`/practice?subject=${subject.subjectId}`}
            className={cn(heroButtonClass, 'h-11 w-full px-5 text-base whitespace-nowrap focus-visible:ring-ring/50 sm:flex sm:w-full @3xl:w-auto')}
          >
            <Play className="size-4 fill-current" aria-hidden />
            Practice {subject.code}
          </Link>
        </div>
      </div>

      {/* The mini game: one quick question from this subject. */}
      <Dialog open={warmupOpen} onClose={() => setWarmupOpen(false)} labelledBy="warmup-heading" variant="sheet" size="lg">
        <div className="relative">
          <button
            type="button"
            onClick={() => setWarmupOpen(false)}
            aria-label="Close"
            className="absolute -top-1 -right-1 z-10 flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <X className="size-5" aria-hidden />
          </button>
          {warmupOpen && <WarmupCard key={subject.subjectId} subject={subject} subjectTopicIds={subjectTopicIds} bare />}
        </div>
      </Dialog>
    </section>
  )
}

/** Most steps drawn in the row of steps; past this the row would turn into a gray smear, so it shows this many plus "+". */
const MAX_STEPS = 20

/**
 * The middle of the Next up bar: how close this subject is to its next goal.
 * - Getting started (or new): "3/10 answered", "7 more for a real score", the bar filling toward 10, and 10 steps (3 filled).
 * - Below 60%: "33% now", "14 right in a row to reach 60%", the score bar with the 60% line, and 14 empty steps to fill.
 * - Passing: the score in green and "Passing · keep it above 60%".
 * The steps make "how many more" something she can see and count, not just read.
 */
function GoalProgress({ subject, status }: { subject: SubjectSummary; status: SubjectStatus }) {
  const isReal = status === 'low' || status === 'passing'
  const pct = Math.round((subject.accuracy ?? 0) * 100)
  const fill = Math.min(1, isReal ? (subject.accuracy ?? 0) : subject.attempts / MIN_ANSWERED)
  // Steps: answers toward 10 while getting started (some already filled); right answers in a row still needed when low.
  const steps = status === 'low' ? correctToPass(subject) : isReal ? 0 : MIN_ANSWERED
  const filledSteps = isReal ? 0 : subject.attempts
  const shownSteps = Math.min(steps, MAX_STEPS)

  return (
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span>
          <span className={cn('font-heading text-2xl leading-none font-bold tabular-nums', isReal ? STATUS_COLOR[status] : 'text-foreground/75')}>
            {status === 'new' ? '—' : isReal ? `${pct}%` : `${subject.attempts}/${MIN_ANSWERED}`}
          </span>{' '}
          <span className="text-sm text-muted-foreground">{status === 'new' ? 'not started' : isReal ? 'now' : 'answered'}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {status === 'passing' ? (
            <span className="font-semibold text-correct">Passing · keep it above 60%</span>
          ) : status === 'low' ? (
            <>
              <span className="font-bold text-foreground">{steps} right in a row</span> to reach 60%
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">
                {MIN_ANSWERED - subject.attempts} more {MIN_ANSWERED - subject.attempts === 1 ? 'answer' : 'answers'}
              </span>{' '}
              for a real score
            </>
          )}
        </span>
      </p>

      {/* The bar: score with the 60% line once it's real, answers toward 10 before that */}
      <div aria-hidden className="relative mt-2 h-2 rounded-full bg-secondary">
        <div className={cn('h-full rounded-full', status === 'passing' ? 'bg-correct' : status === 'low' ? 'bg-highlight' : 'bg-primary')} style={{ width: `${fill * 100}%` }} />
        {isReal && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/50" style={{ left: `${PASSING_RATE * 100}%` }} />}
      </div>

      {/* The steps still to take (filled ones are already done). The row is always there (empty when passing),
          so the bar's height never changes between subjects. */}
      <div aria-hidden className="mt-1.5 flex h-2.5 items-center gap-1">
        {Array.from({ length: shownSteps }, (_, i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < filledSteps ? 'bg-primary' : 'bg-secondary')} />
        ))}
        {steps > MAX_STEPS && <span className="text-[10px] leading-none font-bold text-muted-foreground">+{steps - MAX_STEPS}</span>}
      </div>
    </div>
  )
}
