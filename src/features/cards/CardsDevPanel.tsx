import { useState } from 'react'
import type { CardGame } from '@/lib/cards'
import { devDraw2OnMe, devEmptyDrawPile, devFinish, devGiveActionCards, devLeaveOneCard, devNextBot } from '@/lib/cardsDev'
import { cn } from '@/lib/utils'

type Props = {
  game: CardGame
  /** puts a changed table in place (and saves it) */
  onApply: (change: (game: CardGame) => CardGame) => void
  showAnswers: boolean
  onShowAnswers: (on: boolean) => void
  fastBots: boolean
  onFastBots: (on: boolean) => void
}

const devButton = 'w-full rounded-md border border-dashed border-wrong/60 bg-card px-3 py-2 text-left font-mono text-xs font-bold hover:bg-wrong-soft'

/**
 * DEV ONLY (npm run dev): a red "DEV" button on the Last Card table that opens shortcuts for testing
 * (show the answers, fast computer turns, set up a win, a loss, action cards, a Draw 2…).
 * Rendered only behind `import.meta.env.DEV`, which is false in `npm run build`, so it never reaches the deployed app.
 */
export function CardsDevPanel({ game, onApply, showAnswers, onShowAnswers, fastBots, onFastBots }: Props) {
  const [open, setOpen] = useState(false)
  const nextBot = devNextBot(game)
  const run = (change: (g: CardGame) => CardGame) => {
    onApply(change)
    setOpen(false)
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-9 rounded-md border border-dashed border-wrong/60 bg-wrong-soft px-3 font-mono text-xs font-bold"
      >
        DEV
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-40 w-64 space-y-1.5 rounded-xl border border-dashed border-wrong/60 bg-card p-3 shadow-lg">
          <p className="font-mono text-[11px] font-bold text-wrong">DEV TEST ONLY (npm run dev)</p>
          <label className="flex items-center gap-2 font-mono text-xs">
            <input type="checkbox" checked={showAnswers} onChange={(e) => onShowAnswers(e.target.checked)} />
            Show answers
          </label>
          <label className="flex items-center gap-2 pb-1 font-mono text-xs">
            <input type="checkbox" checked={fastBots} onChange={(e) => onFastBots(e.target.checked)} />
            Fast computer turns
          </label>
          <button type="button" className={devButton} onClick={() => run((g) => devLeaveOneCard(g, 0))}>
            Me: 1 card left
          </button>
          <button type="button" className={devButton} onClick={() => run((g) => devLeaveOneCard(g, nextBot))}>
            {game.players[nextBot]?.name ?? 'Next computer'}: 1 card left
          </button>
          <button type="button" className={devButton} onClick={() => run(devGiveActionCards)}>
            Give me Skip, Reverse, Draw 2, Wild
          </button>
          <button type="button" className={devButton} onClick={() => run(devDraw2OnMe)}>
            Draw 2 on me
          </button>
          <button type="button" className={devButton} onClick={() => run(devEmptyDrawPile)}>
            Empty draw pile ({game.drawPile.length} left)
          </button>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button type="button" className={cn(devButton, 'text-center')} onClick={() => run((g) => devFinish(g, 0))}>
              Finish: I win
            </button>
            <button type="button" className={cn(devButton, 'text-center')} onClick={() => run((g) => devFinish(g, nextBot))}>
              Finish: bot wins
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
