import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { layoutOf } from '@/lib/board'
import type { Card } from '@/lib/cards'
import { cn } from '@/lib/utils'
import { BoardGrid } from '@/features/board/BoardGrid'
import { CardBack, CardFace } from '@/features/cards/PlayingCard'
import { DRAG_START_PX, dragTarget, type GameId, type GameStatus } from './games'

// The Games page's row of games (PROJECT_PLAN.md §16), like a game's select screen: no boxes, just the game
// itself (the board, a hand of cards) standing over its shadow. The one in the middle is "picked": it pops, then
// floats up and down with a gentle sway; the others wait smaller and faded at the sides.
// Swipe on a tablet or phone, or press and drag with a mouse; on any device the arrows and dots do the same
// (WCAG 2.5.1: never swipe-only).
// Tapping the game in the middle opens it; tapping one at the side brings it to the middle first.

export type GameSlide = {
  id: GameId
  title: string
  /** one line about the game, shown when there is no game to continue */
  blurb: string
  status: GameStatus
  /** a red note, e.g. a team game waiting for her */
  alert: string | null
  art: { kind: 'board'; layoutId: number; token: number } | { kind: 'cards' }
}

type Props = {
  games: readonly GameSlide[]
  /** the game to show first (the last one she looked at) */
  initial: GameId
  /** a game came to the middle */
  onShow: (id: GameId) => void
  /** opens the game's start screen (Continue, New game, and for Board Review the team games) */
  onOpen: (id: GameId) => void
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** How wide each game's spot in the row is. */
const SLIDE_WIDTH = 'min(34rem, 84%)'

const SAMPLE_HAND: Card[] = [
  { id: 'CC-7', kind: 'number', subject: 'CC', number: 7 },
  { id: 'MICRO-skip', kind: 'skip', subject: 'MICRO' },
  { id: 'HEMA-3', kind: 'number', subject: 'HEMA', number: 3 },
  { id: 'wild-1', kind: 'wild' },
  { id: 'CM-draw2', kind: 'draw2', subject: 'CM' },
]

/** The game itself: the board with her token, or a fanned hand in front of the draw pile. */
function Art({ art }: { art: GameSlide['art'] }) {
  if (art.kind === 'board') {
    return <BoardGrid tokenSquare={art.token} layout={layoutOf(art.layoutId)} style={{ width: 'min(26rem, 76vw)' }} />
  }
  return (
    // On phones the hand is shown smaller, so all five cards fit.
    <span className="flex items-end max-sm:scale-[0.7]">
      <span className="relative mr-3 hidden sm:block" style={{ width: 70, height: 96 }}>
        <CardBack size="sm" className="absolute top-1.5 left-1" />
        <CardBack size="sm" className="absolute top-0 left-0" />
      </span>
      {SAMPLE_HAND.map((card, i) => {
        const offset = i - (SAMPLE_HAND.length - 1) / 2
        return (
          <CardFace
            key={card.id}
            card={card}
            size="lg"
            className={cn(i > 0 && '-ml-12')}
            style={{ transform: `translateY(${offset * offset * 2}px) rotate(${offset * 6}deg)`, transformOrigin: '50% 120%' }}
          />
        )
      })}
    </span>
  )
}

export function GamePicker({ games, initial, onShow, onOpen }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => Math.max(0, games.findIndex((g) => g.id === initial)))

  const slides = () => Array.from(trackRef.current?.querySelectorAll<HTMLElement>('[data-slide]') ?? [])

  /** Brings game `index` to the middle. */
  function show(index: number, smooth = true) {
    const track = trackRef.current
    const slide = slides()[index]
    if (!track || !slide) return
    track.scrollTo({ left: slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' })
  }

  // Start on the last game she looked at, without sliding there.
  useLayoutEffect(() => {
    show(active, false)
    // only on the first paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Whichever game is nearest the middle right now. */
  function nearestIndex(): number {
    const track = trackRef.current
    if (!track) return active
    const middle = track.scrollLeft + track.clientWidth / 2
    let nearest = 0
    let best = Infinity
    slides().forEach((slide, i) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - middle)
      if (distance < best) {
        best = distance
        nearest = i
      }
    })
    return nearest
  }

  /** While she swipes or drags: whichever game is nearest the middle is the picked one. */
  function onScroll() {
    const nearest = nearestIndex()
    if (nearest !== active) {
      setActive(nearest)
      onShow(games[nearest].id)
    }
  }

  // ---------- Press and drag with a mouse (touch and pens already swipe natively) ----------
  const drag = useRef<{ x: number; left: number; startIndex: number; moved: boolean } | null>(null)
  const [dragging, setDragging] = useState(false)
  /** set when a drag ends, so letting go over a game doesn't also open it */
  const justDragged = useRef(false)

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const track = trackRef.current
    if (event.pointerType !== 'mouse' || event.button !== 0 || !track) return
    drag.current = { x: event.clientX, left: track.scrollLeft, startIndex: active, moved: false }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    const track = trackRef.current
    if (!d || !track) return
    const dx = event.clientX - d.x
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_START_PX) return // still just a click
      d.moved = true
      setDragging(true)
      track.setPointerCapture(event.pointerId) // keep following even outside the row
    }
    track.scrollLeft = d.left - dx // the row follows the mouse
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    setDragging(false)
    justDragged.current = true
    window.setTimeout(() => (justDragged.current = false), 0)
    show(dragTarget(d.startIndex, event.clientX - d.x, nearestIndex(), games.length))
  }

  const arrowClass =
    'absolute top-[40%] z-10 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-foreground shadow-[0_8px_20px_-10px_rgb(7_71_94/0.45)] outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-0 md:flex'

  return (
    <section aria-roledescription="carousel" aria-label="Games" className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <div className="relative md:min-h-0 md:flex-1">
        <button type="button" className={cn(arrowClass, 'left-0')} onClick={() => show(active - 1)} disabled={active === 0} aria-label="Previous game">
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <div
          ref={trackRef}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // A drag that ends over a game must not open it.
          onClickCapture={(event) => {
            if (!justDragged.current) return
            event.preventDefault()
            event.stopPropagation()
          }}
          // While dragging, snapping is off (it would fight the mouse) and nothing gets text-selected.
          className={cn(
            'relative flex items-start overflow-x-auto overscroll-x-contain py-2 [scrollbar-width:none] md:h-full md:items-center [&::-webkit-scrollbar]:hidden',
            dragging ? 'cursor-grabbing snap-none select-none [&_*]:cursor-grabbing' : 'cursor-grab snap-x snap-mandatory',
          )}
        >
          {/* Room at both ends, so the first and last game can sit in the middle too. */}
          <div aria-hidden className="h-px shrink-0" style={{ width: `calc((100% - ${SLIDE_WIDTH}) / 2)` }} />
          {games.map((game, i) => {
            const isActive = i === active
            return (
              <article key={game.id} data-slide aria-roledescription="slide" aria-label={`${i + 1} of ${games.length}`} className="shrink-0 snap-center" style={{ width: SLIDE_WIDTH }}>
                {/* One big button (a swipe never counts as a tap): in the middle it opens the game,
                    at the side it first comes to the middle. */}
                <button
                  type="button"
                  onClick={() => (isActive ? onOpen(game.id) : show(i))}
                  tabIndex={isActive ? undefined : -1}
                  aria-label={`${game.title}. ${game.status.paused ? `Paused: ${game.status.line}` : 'New game'}${game.alert ? `. ${game.alert}` : ''}`}
                  className="group flex w-full cursor-pointer flex-col items-center gap-4 rounded-3xl px-2 pt-6 pb-3 outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
                >
                  {/* The stage: the game standing over its shadow on the floor. */}
                  <span className="relative flex h-60 w-full items-end justify-center pb-5 sm:h-72 lg:h-80">
                    <span
                      aria-hidden
                      className={cn(
                        'absolute bottom-0 h-8 w-[72%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(7_54_74/0.5),rgb(7_54_74/0.2)_55%,transparent)]',
                        isActive ? 'game-shadow' : 'opacity-40',
                      )}
                    />
                    {/* key: the pop plays again each time this game becomes the picked one */}
                    <span
                      key={isActive ? 'picked' : 'waiting'}
                      className={cn('relative block transition-[opacity,scale] duration-300 motion-reduce:transition-none', isActive ? 'game-pick' : 'scale-[0.8] opacity-45')}
                    >
                      <span className={cn('block', isActive && 'game-float')}>
                        <Art art={game.art} />
                      </span>
                    </span>
                  </span>

                  <span className={cn('flex max-w-full flex-col items-center gap-1 text-center transition-opacity duration-300', !isActive && 'opacity-45')}>
                    <span className="flex flex-wrap items-center justify-center gap-2">
                      <span className="font-heading text-3xl font-bold">{game.title}</span>
                      {game.alert && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-wrong-soft px-2.5 py-0.5 text-xs font-bold text-wrong">
                          <span className="size-2 rounded-full bg-wrong" aria-hidden />
                          {game.alert}
                        </span>
                      )}
                    </span>
                    <span className="max-w-full truncate text-sm text-muted-foreground tabular-nums">
                      {game.status.paused ? <span className="font-bold text-[#9A5B00]">Paused</span> : <span className="font-bold text-foreground">New game</span>}
                      {game.status.paused ? ` · ${game.status.line}` : ` · ${game.blurb}`}
                    </span>
                    {/* Only on the picked game: what a tap does. */}
                    <span aria-hidden className={cn('mt-1 inline-flex items-center gap-1 font-heading text-sm font-bold text-primary', !isActive && 'invisible')}>
                      Tap to play
                      <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </button>
              </article>
            )
          })}
          <div aria-hidden className="h-px shrink-0" style={{ width: `calc((100% - ${SLIDE_WIDTH}) / 2)` }} />
        </div>
        <button type="button" className={cn(arrowClass, 'right-0')} onClick={() => show(active + 1)} disabled={active === games.length - 1} aria-label="Next game">
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>

      {/* Dots: which game is picked; tap one to go there. */}
      <div className="flex shrink-0 justify-center gap-1">
        {games.map((game, i) => (
          <button
            key={game.id}
            type="button"
            onClick={() => show(i)}
            aria-label={`Show ${game.title}`}
            aria-current={i === active ? 'true' : undefined}
            className="flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <span className={cn('block h-2.5 rounded-full transition-all duration-300 motion-reduce:transition-none', i === active ? 'w-7 bg-primary' : 'w-2.5 bg-input')} />
          </button>
        ))}
      </div>
    </section>
  )
}
