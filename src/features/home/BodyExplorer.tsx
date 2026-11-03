import { ChevronLeft, ChevronRight, Crosshair, Dices, Play, X } from 'lucide-react'
import { lazy, Suspense, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { heroButtonClass, LowFlag } from '@/components/report'
import { formatPercent, type SubjectSummary } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import type { Body3DControls, OrganAnchor } from './Body3D'
import { WarmupCard } from './HomeCards'
import { OrganIcon } from './OrganIcon'
import { ORGANS, STATUS_COLOR, STATUS_TEXT, subjectStatus } from './organs'

// three.js is big, so the 3D body downloads separately, after the rest of Home shows.
const Body3D = lazy(() => import('./Body3D'))

/**
 * The centerpiece of Home: a 3D body you can turn, with a card for each subject around it.
 * Laptops: cards in two columns beside the body, with dashed lines to their organ (like a labelled diagram).
 * Tablets and phones: the cards sit in a grid under the body.
 * From tablet size up, the stage stretches to fill the height it is given, so Home fits without scrolling.
 * The cards are the keyboard / screen-reader way to choose; the 3D body is extra.
 */
export function BodyStage({
  summary,
  selected,
  onSelect,
  subjectTopicIds,
}: {
  summary: SubjectSummary[]
  selected: SubjectSummary | undefined
  onSelect: (subjectId: number) => void
  subjectTopicIds: number[]
}) {
  const mapped = summary.filter((s) => ORGANS[s.code])
  const controls = useRef<Body3DControls | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const lineRefs = useRef(new Map<string, SVGGElement>())
  const [warmupOpen, setWarmupOpen] = useState(false)

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

  // Each side's cards top to bottom, in the order their organs sit in the body.
  const bySide = (side: 'left' | 'right') => mapped.filter((s) => ORGANS[s.code].side === side).sort((a, b) => ORGANS[a.code].rank - ORGANS[b.code].rank)
  const left = bySide('left')
  const right = bySide('right')

  function card(s: SubjectSummary) {
    const organ = ORGANS[s.code]
    const status = subjectStatus(s)
    const isSelected = s.subjectId === selected?.subjectId
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
        className={cn(
          'rounded-xl bg-card p-2 text-left shadow-[0_10px_28px_-18px_rgb(7_71_94/0.55)] outline-none transition-[box-shadow,transform] focus-visible:ring-3 focus-visible:ring-ring/40 lg:p-2.5',
          isSelected ? 'ring-2 ring-primary' : 'hover:-translate-y-0.5',
        )}
      >
        <span className="flex h-10 items-center justify-center rounded-lg bg-background tall:h-14">
          <OrganIcon code={s.code} className="size-7 tall:size-10" />
        </span>
        <span className="mt-1.5 block font-heading text-sm leading-tight font-bold">
          {s.code} <span className="font-sans text-xs font-normal text-muted-foreground max-lg:hidden">{organ.name}</span>
        </span>
        <span className="block text-[11px] leading-snug text-muted-foreground">
          Score: <span className="font-semibold text-foreground">{s.accuracy === null ? '—' : formatPercent(s.accuracy)}</span>
        </span>
        <span className={cn('block truncate text-[11px] leading-snug font-semibold', STATUS_COLOR[status])}>{STATUS_TEXT[status]}</span>
      </button>
    )
  }

  // Width of each card column on laptops; the 3D view sits between them.
  const column = 'lg:absolute lg:top-0 lg:bottom-11 lg:flex lg:w-32 lg:flex-col lg:justify-evenly xl:w-36'

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
          className="relative order-1 mx-auto h-[24rem] w-full max-w-[22rem] md:h-auto md:min-h-48 md:max-w-none md:flex-1 lg:absolute lg:w-auto lg:inset-x-32 lg:top-0 lg:bottom-11 xl:inset-x-36"
        >
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Loading 3D body…</div>}>
            <Body3D
              selectedCode={selected?.code}
              onPick={(code) => {
                const subject = mapped.find((s) => s.code === code)
                if (subject) onSelect(subject.subjectId)
              }}
              onFrame={drawLines}
              ref={controls}
              className="size-full"
            />
          </Suspense>
        </div>

        {/* Dashed leader lines (laptops only, where the cards sit beside the body) */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 hidden size-full overflow-visible lg:block">
          {mapped.map((s) => (
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
                stroke={s.subjectId === selected?.subjectId ? 'var(--primary)' : 'var(--muted-foreground)'}
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
              <circle r="3.5" fill={s.subjectId === selected?.subjectId ? 'var(--primary)' : 'var(--muted-foreground)'} />
            </g>
          ))}
        </svg>

        {/* Subject cards. "contents" lets the same cards be one grid (small screens) or two side columns (laptops). */}
        <div role="group" aria-label="Choose a subject" className="order-3 mt-3 grid shrink-0 grid-cols-3 gap-2 lg:contents">
          {/* Left column sits a little lower and the right a little higher, like the picture. */}
          <div className={cn('contents lg:left-0 lg:pt-[8%]', column)}>{left.map(card)}</div>
          <div className={cn('contents lg:right-0 lg:pb-[8%]', column)}>{right.map(card)}</div>
        </div>

        {/* Turn handle under the feet, like a turntable */}
        <div className="relative order-2 mt-1 flex shrink-0 justify-center lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0">
          <div className="flex w-full max-w-64 items-center">
            <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-foreground/30" />
            <span className="flex items-center rounded-full bg-primary p-0.5 text-primary-foreground shadow-sm">
              <button type="button" aria-label="Turn the body left" onClick={() => controls.current?.rotateBy(-Math.PI / 4)} className="flex size-8 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white">
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button type="button" aria-label="Turn the body right" onClick={() => controls.current?.rotateBy(Math.PI / 4)} className="flex size-8 items-center justify-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white">
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </span>
            <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-foreground/30" />
          </div>
        </div>
      </div>

      {/* The mini game: one quick question from the chosen subject. */}
      {selected && (
        <div className="flex shrink-0 justify-center">
          <button
            type="button"
            onClick={() => setWarmupOpen(true)}
            aria-haspopup="dialog"
            className="flex h-12 w-full max-w-sm items-center justify-center gap-2.5 rounded-full bg-card px-6 font-heading text-base font-bold shadow-[0_10px_28px_-18px_rgb(7_71_94/0.55)] outline-none hover:ring-1 hover:ring-primary focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <Dices className="size-5 text-primary" aria-hidden />
            Warm-up question: {selected.code}
          </button>
        </div>
      )}

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
          {selected && warmupOpen && <WarmupCard key={selected.subjectId} subject={selected} subjectTopicIds={subjectTopicIds} bare />}
        </div>
      </Dialog>
    </section>
  )
}

/**
 * Details of the chosen subject, laid out like a patient info card:
 * who it is (subject + body part), answered count and weakest topic, and the score on top;
 * the screen's ONE orange button below.
 * Uses its own width (container query), not the screen's, so it fits a narrow tablet column too.
 */
export function SubjectInfoCard({ subject }: { subject: SubjectSummary }) {
  const organ = ORGANS[subject.code]
  const status = subjectStatus(subject)
  const weakest = subject.topics[0] // topics are sorted weakest first
  return (
    <section aria-labelledby="subject-info-heading" className="@container shrink-0 rounded-2xl border bg-card p-4 shadow-[0_12px_32px_-24px_rgb(7_71_94/0.45)]">
      {/* key: replay the entrance when another subject is chosen */}
      <div key={subject.subjectId} className="animate-in fade-in space-y-3 duration-300">
        {/* Header: organ picture, names, score */}
        <div className="flex items-start gap-3 @md:gap-4">
          <div className="hidden size-16 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(160deg,#0B2536,#07475E)] @md:flex tall:size-18">
            <OrganIcon code={subject.code} className="size-10 drop-shadow-[0_0_12px_rgb(255_255_255/0.25)] tall:size-12" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {subject.code}
              {organ && <> · {organ.name}</>}
            </p>
            {/* Long names (HTMLE) stop at two lines; the full name is in the tooltip. */}
            <h2 id="subject-info-heading" title={subject.name} className="line-clamp-2 font-heading text-lg leading-tight font-bold">
              {subject.name}
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground tabular-nums">
              {subject.attempts === 0 ? 'Nothing answered yet' : `${subject.attempts} answered`}
              {weakest && (
                <>
                  {' · Weakest: '}
                  <span className="font-semibold text-foreground">{weakest.name}</span>{' '}
                  <span className={cn('font-semibold', weakest.belowPassing ? 'text-wrong' : 'text-foreground')}>{formatPercent(weakest.accuracy)}</span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={cn('font-heading text-3xl leading-none font-bold tabular-nums tall:text-4xl', status === 'low' && 'text-wrong')}>
              {subject.accuracy === null ? '—' : formatPercent(subject.accuracy)}
            </p>
            <p className={cn('mt-1 flex items-center justify-end gap-1.5 text-xs font-semibold whitespace-nowrap', STATUS_COLOR[status])}>
              {status === 'low' && <LowFlag />}
              {STATUS_TEXT[status]}
            </p>
          </div>
        </div>

        {/* Actions: the whole subject, or just the weakest topic when it is below 60%.
            Two equal halves when both show, so the row looks even; one full-width button otherwise. */}
        <div className={cn('grid gap-2', weakest?.belowPassing && '@sm:grid-cols-2')}>
          <Link
            to={`/practice?subject=${subject.subjectId}`}
            className={cn(heroButtonClass, 'h-11 w-full px-4 text-base whitespace-nowrap focus-visible:ring-ring/50 sm:flex sm:w-full')}
          >
            <Play className="size-4 fill-current" aria-hidden />
            Practice {subject.code}
          </Link>
          {weakest?.belowPassing && (
            <Link
              to={`/practice?subject=${subject.subjectId}&topic=${weakest.topicId}`}
              title={`Practice ${weakest.name} only`}
              className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-primary/30 bg-card px-4 font-heading text-base font-bold text-primary outline-none hover:border-primary hover:bg-primary/[0.04] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Crosshair className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{weakest.name} only</span>
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
