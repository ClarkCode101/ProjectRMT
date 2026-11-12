import { RotateCcw, RotateCw } from 'lucide-react'
import { SUBJECT_COLOR } from '@/lib/books'
import { cardLabel, topCard, type CardGame, type CardPlayer } from '@/lib/cards'
import { cn } from '@/lib/utils'
import { CardBack, CardFace } from './PlayingCard'

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

/** One computer player: avatar, name plate with the card count, their cards face down, and the Last card banner. */
function Seat({ player, active, compact = false }: { player: CardPlayer; active: boolean; compact?: boolean }) {
  const count = player.hand.length
  return (
    <div className={cn('flex flex-col items-center gap-1.5', compact && 'gap-1')}>
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
      {!compact && (
        <div className="flex h-11 items-center pl-2" aria-hidden>
          {Array.from({ length: Math.min(count, 8) }, (_, i) => (
            <CardBack key={i} size="xs" className={i > 0 ? '-ml-4' : undefined} />
          ))}
        </div>
      )}
      {count === 1 && (
        <span className="rounded-full border border-highlight/60 bg-highlight-soft px-2.5 py-0.5 text-xs font-bold text-[#7A4D0C]">Last card</span>
      )}
    </div>
  )
}

type Props = {
  game: CardGame
  /** subject code → full name, e.g. HEMA → Hematology */
  subjectName: (code: string) => string
}

/** The middle of the table: draw pile, the pile with its last few cards, and what to play on. */
function Middle({ game, subjectName }: Props) {
  const top = topCard(game)
  const under = game.discard.slice(-3, -1)
  const Direction = game.direction === 1 ? RotateCw : RotateCcw
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-6 sm:gap-10">
        {/* Draw pile */}
        <div className="flex flex-col items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <div className="relative" style={{ width: 92, height: 124 }} aria-hidden>
            <CardBack size="md" className="absolute top-2 left-1.5" />
            <CardBack size="md" className="absolute top-1 left-0.5" />
            <CardBack size="md" className="absolute top-0 left-0" />
          </div>
          <span className="tabular-nums">Draw pile · {game.drawPile.length}</span>
        </div>

        {/* The pile: the top card, with the two before it peeking out underneath */}
        <div className="relative flex flex-col items-center gap-1.5">
          <div className="relative" style={{ width: 104, height: 148 }}>
            {under.map((card, i) => (
              <CardFace key={card.id} card={card} className="absolute top-0 left-0" style={{ transform: `rotate(${i === 0 ? -13 : 9}deg)` }} />
            ))}
            {/* key = the card, so a newly played card fades in */}
            <CardFace key={top.id} card={top} className="absolute top-0 left-0 animate-in fade-in zoom-in-90 duration-300 motion-reduce:animate-none" style={{ transform: 'rotate(-3deg)' }} />
          </div>
          <span className="sr-only">Top card: {cardLabel(top)}</span>
        </div>

        {/* Direction of play */}
        <div className="hidden flex-col items-center gap-1 text-xs font-semibold text-muted-foreground sm:flex">
          <Direction className="size-10 text-[#9FB6C4]" strokeWidth={2.4} aria-hidden />
          {game.direction === 1 ? 'Clockwise' : 'Counter-clockwise'}
        </div>
      </div>

      {/* What fits now */}
      <p className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
        Play on
        <span className="rounded-full px-3 py-1 font-semibold text-white" style={{ background: SUBJECT_COLOR[game.subject] }}>
          {subjectName(game.subject)}
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

export function CardTable({ game, subjectName }: Props) {
  const [, left, across, right] = game.players
  const active = (seat: number) => !game.finished && game.turn === seat
  return (
    <section aria-label="Table" className="flex min-h-0 flex-1 flex-col">
      {/* Narrow screens (under 700px): the three players in one row, then the middle. */}
      <div className="flex justify-around gap-2 min-[700px]:hidden">
        {left && <Seat player={left} active={active(1)} compact />}
        {across && <Seat player={across} active={active(2)} compact />}
        {right && <Seat player={right} active={active(3)} compact />}
      </div>

      {/* From 700px (every iPad): around the oval, one on each side and one across. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-[auto_auto] content-center items-center gap-x-4 gap-y-3 max-[699px]:grid-cols-1 max-[699px]:grid-rows-1">
        <div className="col-start-2 hidden justify-center min-[700px]:flex">{across && <Seat player={across} active={active(2)} />}</div>
        <div className="row-start-2 hidden justify-end min-[700px]:flex">{left && <Seat player={left} active={active(1)} />}</div>
        <div className="row-start-2 flex items-center justify-center rounded-[50%] border bg-card px-6 py-6 shadow-[0_10px_30px_rgb(23_34_44/0.08),inset_0_0_0_12px_#F6F9FA] max-[699px]:row-start-1 sm:px-14 sm:py-8 min-[700px]:col-start-2">
          <Middle game={game} subjectName={subjectName} />
        </div>
        <div className="row-start-2 hidden justify-start min-[700px]:col-start-3 min-[700px]:flex">{right && <Seat player={right} active={active(3)} />}</div>
      </div>
    </section>
  )
}
