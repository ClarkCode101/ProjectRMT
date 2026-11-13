import { useState } from 'react'
import type { LiveDevOp } from '@/lib/cardsLiveDev'
import { cn } from '@/lib/utils'

type Props = {
  /** runs a shortcut on the server (the dev key goes along; see liveApi.ts) */
  onRun: (op: LiveDevOp) => void
  showAnswers: boolean
  onShowAnswers: (on: boolean) => void
  /** the player after her, for the "1 card left" button */
  nextName: string
  drawPileCount: number
}

const devButton = 'w-full rounded-md border border-dashed border-wrong/60 bg-card px-3 py-2 text-left font-mono text-xs font-bold hover:bg-wrong-soft'

/**
 * DEV ONLY (npm run dev): the red "DEV" button on the LIVE Last Card table. Like the solo game's panel, but the
 * shortcuts run on the server (Edge Function action "dev"), which refuses them without the dev key.
 * Rendered only behind `import.meta.env.DEV`, which is false in `npm run build`.
 */
export function CardsLiveDevPanel({ onRun, showAnswers, onShowAnswers, nextName, drawPileCount }: Props) {
  const [open, setOpen] = useState(false)
  const run = (op: LiveDevOp) => {
    onRun(op)
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
          <p className="font-mono text-[11px] font-bold text-wrong">DEV TEST ONLY · live game (server, dev key)</p>
          <label className="flex items-center gap-2 pb-1 font-mono text-xs">
            <input type="checkbox" checked={showAnswers} onChange={(e) => onShowAnswers(e.target.checked)} />
            Show answers
          </label>
          <button type="button" className={devButton} onClick={() => run('oneCard')}>
            Me: 1 card left
          </button>
          <button type="button" className={devButton} onClick={() => run('nextOneCard')}>
            {nextName}: 1 card left
          </button>
          <button type="button" className={devButton} onClick={() => run('actions')}>
            Give me Skip, Reverse, Draw 2, Wild
          </button>
          <button type="button" className={devButton} onClick={() => run('draw2')}>
            Draw 2 on me
          </button>
          <button type="button" className={devButton} onClick={() => run('emptyPile')}>
            Empty draw pile ({drawPileCount} left)
          </button>
          <button type="button" className={devButton} onClick={() => run('timeUp')}>
            Time’s up now (pass this turn)
          </button>
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button type="button" className={cn(devButton, 'text-center')} onClick={() => run('finishMe')}>
              Finish: I win
            </button>
            <button type="button" className={cn(devButton, 'text-center')} onClick={() => run('finishNext')}>
              Finish: next wins
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
