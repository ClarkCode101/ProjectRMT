import { CloudOff, Layers, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import { ExitButton } from '@/components/ExitButton'
import { describeMove, type CardGame } from '@/lib/cards'
import type { HandState } from './handState'
import { cn } from '@/lib/utils'
import { CardTable } from './CardTable'
import { Hand } from './Hand'

// The game screen's look (PROJECT_PLAN.md §15, mockup v2), with no data loading or saving in it:
// CardsPage owns the game and passes it in. Top line → the table → her side (You + Draw | her hand | Answer to play).

type Props = {
  game: CardGame
  hand: HandState
  online: boolean
  /** a problem to show at the top (e.g. no questions loaded) */
  message: string | null
  /** subject code → full name */
  subjectName: (code: string) => string
  onExit: () => void
  /** tapped a card in her hand */
  onPick: (cardId: string) => void
  /** Draw a card, or Keep card after drawing one that fits */
  onDraw: () => void
  onAnswerToPlay: () => void
  /** the popups (question, subject picker) */
  children?: ReactNode
}

export function CardsGameView({ game, hand, online, message, subjectName, onExit, onPick, onDraw, onAnswerToPlay, children }: Props) {
  const lastMove = describeMove(game.log, game.players)
  const yourTurn = game.turn === 0 && !game.finished
  const cardsLeft = game.players[0].hand.length
  return (
    // The whole game fits on one screen (no scrolling): top line, the table in the space left, her hand and buttons.
    <div className="fixed inset-0 z-20 flex flex-col gap-2 bg-[radial-gradient(ellipse_at_50%_45%,#FFFFFF_0%,#EEF3F6_55%,#E2E9EE_100%)] px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-6">
      <h1 className="sr-only">Last Card</h1>
      <div className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-3 text-sm">
        <ExitButton onClick={onExit} />
        {/* What just happened (screen readers hear it too) */}
        <p aria-live="polite" className="min-w-0 truncate rounded-full border bg-card px-3 py-1 text-center font-semibold text-muted-foreground">
          {lastMove ?? 'Cards dealt. You go first.'}
        </p>
        <p className="min-w-16 text-right text-muted-foreground tabular-nums">
          {game.correct} of {game.answered} correct
        </p>
      </div>

      {message && (
        <p role="status" className="mx-auto w-full max-w-5xl shrink-0 rounded-md border border-highlight/50 bg-highlight-soft p-3">
          {message}
        </p>
      )}

      <CardTable game={game} subjectName={subjectName} />

      {!online && (
        <p role="status" className="flex shrink-0 items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <CloudOff className="size-4 shrink-0" aria-hidden />
          Offline. Your answers are saved on this device and sync when you’re back online.
        </p>
      )}

      {/* ---------- Her side (thumb zone) ----------
          From 1024px (iPad landscape, computers): You + Draw | her hand | Answer to play, side by side.
          Narrower (iPad portrait, phones): her hand across the whole width, then Draw and Answer to play under it. */}
      <div className="mx-auto flex w-full max-w-6xl shrink-0 flex-wrap items-end gap-2 lg:flex-nowrap lg:gap-4">
        <div className="order-2 flex flex-1 items-center gap-3 lg:order-1 lg:w-44 lg:flex-none lg:flex-col lg:items-start">
          <div className="hidden items-center lg:flex">
            <span
              className={cn(
                'relative z-1 flex size-14 items-center justify-center rounded-full border-3 bg-card font-heading font-bold',
                yourTurn ? 'border-primary text-primary-deep shadow-[0_0_0_4px_rgb(11_99_130/0.15)]' : 'border-border text-muted-foreground',
              )}
              aria-hidden
            >
              You
            </span>
            <span className="-ml-3 rounded-r-full border border-l-0 bg-card py-1 pr-4 pl-5 leading-tight">
              <span className="block text-sm font-semibold">{yourTurn ? 'Your turn' : 'Waiting'}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                {cardsLeft} {cardsLeft === 1 ? 'card' : 'cards'}
              </span>
            </span>
          </div>
          {cardsLeft === 1 && !game.finished && (
            <span className="hidden rounded-full border border-highlight/60 bg-highlight-soft px-2.5 py-0.5 text-xs font-bold text-[#7A4D0C] lg:inline">Last card</span>
          )}
          <button
            type="button"
            onClick={onDraw}
            disabled={!hand.canDraw && !hand.keepingDrawn}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-card px-4 font-heading font-bold shadow-[0_2px_6px_rgb(23_34_44/0.08)] outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50 lg:w-full lg:flex-none"
          >
            <Layers className="size-5" aria-hidden />
            {hand.keepingDrawn ? 'Keep card' : 'Draw a card'}
          </button>
        </div>

        <div className="order-1 w-full min-w-0 lg:order-2 lg:w-auto lg:flex-1">
          <p className="text-center text-sm font-semibold text-muted-foreground" aria-live="polite">
            {hand.hint}
          </p>
          <Hand cards={game.players[0].hand} playableIds={hand.playableIds} selectedId={hand.picked} onSelect={onPick} />
        </div>

        <button
          type="button"
          onClick={onAnswerToPlay}
          disabled={!hand.picked}
          className="order-3 flex h-16 flex-1 items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-left text-white shadow-[0_8px_20px_rgb(11_99_130/0.33)] outline-none hover:bg-primary-deep focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-45 disabled:shadow-none lg:w-48 lg:flex-none"
        >
          <Play className="size-6 shrink-0 fill-current" aria-hidden />
          <span className="leading-tight">
            <span className="block font-heading text-lg font-bold">Answer to play</span>
            <span className="block text-sm text-white/85">{hand.picked ? '1 question' : 'Pick a card first'}</span>
          </span>
        </button>
      </div>

      {children}
    </div>
  )
}
