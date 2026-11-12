import { RotateCcw, RotateCw } from 'lucide-react'
import { SUBJECT_COLOR } from '@/lib/books'
import { cardLabel, topCard, type CardGame, type CardPlayer } from '@/lib/cards'
import { cn } from '@/lib/utils'
import { CardBack, CardFace } from './PlayingCard'
import { SUBJECT_SHORT_NAME } from './subjectNames'

// The table (PROJECT_PLAN.md §15, mockup v2): the three computer players around a white oval, the draw pile,
// the pile in the middle with the direction, and what to match. Seats go clockwise from her (bottom):
// 1 on the left, 2 on top, 3 on the right, so "clockwise" on screen is the real turn order.

/** "Rafa M." → "RM" */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * A computer player's cards, face down and fanned in a curve like a hand of cards held up (not a straight row).
 * At most 8 are drawn; the more cards, the tighter the fan, so it never gets wider than about 50 degrees.
 */
function FannedBacks({ count }: { count: number }) {
  const shown = Math.min(count, 8)
  const step = shown > 1 ? Math.min(9, 50 / (shown - 1)) : 0
  return (
    <div className="flex h-14 items-end justify-center" aria-hidden>
      {Array.from({ length: shown }, (_, i) => {
        const offset = i - (shown - 1) / 2
        return (
          <CardBack
            key={i}
            size="xs"
            className={i > 0 ? '-ml-4.5' : undefined}
            style={{ transform: `translateY(${offset * offset * 1.1}px) rotate(${offset * step}deg)`, transformOrigin: '50% 110%' }}
          />
        )
      })}
    </div>
  )
}

/** One computer player: avatar, name plate with the card count, their cards face down, and the Last card banner. */
function Seat({ player, seat, active, compact = false }: { player: CardPlayer; seat: number; active: boolean; compact?: boolean }) {
  const count = player.hand.length
  return (
    // data-seat: where a computer player's cards fly from and to (useCardFlights)
    <div data-seat={seat} className={cn('flex flex-col items-center gap-1.5', compact && 'gap-1')}>
      <div className="flex items-center">
        <span
          className={cn(
            'relative z-1 flex shrink-0 items-center justify-center rounded-full border-3 bg-card font-heading font-bold text-muted-foreground',
            compact ? 'size-10 text-sm' : 'size-12',
            active ? 'border-primary text-primary-deep shadow-[0_0_0_4px_rgb(11_99_130/0.15)]' : 'border-border',
          )}
          aria-hidden
        >
          {initials(player.name)}
        </span>
        <span
          className={cn(
            '-ml-3 rounded-r-full border border-l-0 bg-card py-1 pr-3.5 pl-5 leading-tight',
            active ? 'border-primary text-primary-deep' : 'border-border',
          )}
        >
          <span className={cn('block font-semibold', compact ? 'text-xs' : 'text-sm')}>{player.name}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {count} {count === 1 ? 'card' : 'cards'}
            {active && <span className="sr-only">, playing now</span>}
          </span>
        </span>
      </div>
      {!compact && <FannedBacks count={count} />}
      {count === 1 && (
        <span className="rounded-full border border-highlight/60 bg-highlight-soft px-2.5 py-0.5 text-xs font-bold text-[#7A4D0C]">Last card</span>
      )}
    </div>
  )
}

type Props = {
  /** the top card is flying onto the pile right now: hidden until it lands */
  hideTop?: boolean
  game: CardGame
}

/** The middle of the table: draw pile, the pile with its last few cards, and what to play on. */
function Middle({ game, hideTop = false }: Props) {
  const top = topCard(game)
  const under = game.discard.slice(-3, -1)
  const Direction = game.direction === 1 ? RotateCw : RotateCcw
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-6">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <div data-anchor="draw-pile" className="relative" style={{ width: 92, height: 124 }} aria-hidden>
            <CardBack size="md" className="absolute top-2 left-1.5" />
            <CardBack size="md" className="absolute top-1 left-0.5" />
            <CardBack size="md" className="absolute top-0 left-0" />
          </div>
          <span className="tabular-nums">Draw pile · {game.drawPile.length}</span>
        </div>

        {/* The pile: the top card, with the two before it peeking out underneath */}
        <div className="relative flex flex-col items-center gap-1.5">
          <div data-anchor="discard" className="relative" style={{ width: 104, height: 148 }}>
            {under.map((card, i) => (
              <CardFace key={card.id} card={card} className="absolute top-0 left-0" style={{ transform: `rotate(${i === 0 ? -13 : 9}deg)` }} />
            ))}
            {/* key = the card; a newly played card flies in (useCardFlights) and is hidden until it lands */}
            <CardFace key={top.id} card={top} className="absolute top-0 left-0" style={{ transform: 'rotate(-3deg)', visibility: hideTop ? 'hidden' : undefined }} />
          </div>
          <span className="sr-only">Top card: {cardLabel(top)}</span>
        </div>

        {/* Direction of play */}
        <div className="hidden w-28 flex-col items-center gap-1 text-center text-xs font-semibold text-muted-foreground sm:flex">
          <Direction className="size-10 text-[#9FB6C4]" strokeWidth={2.4} aria-hidden />
          {game.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
        </div>
      </div>

      {/* What fits now */}
      <p className="flex flex-wrap items-center justify-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
        Play on
        <span className="rounded-full px-3 py-1 font-semibold text-white" style={{ background: SUBJECT_COLOR[game.subject] }}>
          {SUBJECT_SHORT_NAME[game.subject]}
        </span>
        {top.kind !== 'wild' && (
          <>
            or
            <span className="rounded-full border bg-card px-3 py-1 font-semibold text-foreground">
              any {top.kind === 'number' ? top.number : cardLabel(top).split(' ').slice(1).join(' ')}
            </span>
          </>
        )}
      </p>
    </div>
  )
}

export function CardTable({ game, hideTop = false }: Props) {
  const [, left, across, right] = game.players
  const active = (seat: number) => !game.finished && game.turn === seat
  return (
    <section aria-label="Table" className="flex min-h-0 flex-1 flex-col">
      {/* Narrow screens (under 700px): the three players in one row, then the middle. */}
      <div className="flex justify-around gap-2 min-[700px]:hidden">
        {left && <Seat player={left} seat={1} active={active(1)} compact />}
        {across && <Seat player={across} seat={2} active={active(2)} compact />}
        {right && <Seat player={right} seat={3} active={active(3)} compact />}
      </div>

      {/* From 700px (every iPad): around the oval, one on each side and one across. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-5 max-[699px]:grid-cols-1 max-[699px]:grid-rows-1">
        <div className="col-start-2 hidden justify-center min-[700px]:flex">{across && <Seat player={across} seat={2} active={active(2)} />}</div>
        <div className="row-start-2 hidden justify-end min-[700px]:flex">{left && <Seat player={left} seat={1} active={active(1)} />}</div>
        {/* The oval: a fixed size that follows the screen, never its contents (a long subject name or the direction
            word used to make it grow and shrink during a game). */}
        <div className="row-start-2 flex items-center justify-center rounded-[50%] border bg-card px-6 py-6 shadow-[0_10px_30px_rgb(23_34_44/0.08),inset_0_0_0_12px_#F6F9FA] max-[699px]:row-start-1 min-[700px]:col-start-2 min-[700px]:h-[18rem] min-[700px]:w-[clamp(26rem,52vw,36rem)] min-[700px]:px-0 min-[700px]:py-0">
          <Middle game={game} hideTop={hideTop} />
        </div>
        <div className="row-start-2 hidden justify-start min-[700px]:col-start-3 min-[700px]:flex">{right && <Seat player={right} seat={3} active={active(3)} />}</div>
      </div>
    </section>
  )
}
