import { ArrowDown, ArrowUp, Dices, Play, Save, Target } from 'lucide-react'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { BOARD_SIZE, layoutOf, zoneOf, type BoardGame } from '@/lib/board'
import { cn } from '@/lib/utils'
import { BoardGrid } from './BoardGrid'
import { TeamEntry } from './TeamEntry'
import { useFittedBoardWidth } from './useFittedBoardWidth'

// Board Review's start screen, laid out like Mock exam and Practice (one screen, read top to bottom):
// title → the board in the middle (like the rotor) → one status line → one row of buttons → the rules.

type Props = {
  /** the game she can continue, or null */
  inProgress: BoardGame | null
  /** which board to show (her game's, or the last one she played) */
  previewLayoutId: number
  onContinue: () => void
  onNewGame: () => void
}

/** The rules, printed along the bottom (short, like Mock exam's run protocol). */
const RULES = [
  { icon: Dices, text: 'Roll, answer right to move' },
  { icon: ArrowUp, text: 'Ladder: a Challenge question' },
  { icon: ArrowDown, text: 'Snake: a Rescue question' },
  { icon: Target, text: 'Every answer counts in your scores' },
  { icon: Save, text: 'Saved on this device' },
]

export function BoardIntro({ inProgress, previewLayoutId, onContinue, onNewGame }: Props) {
  const { measure, width } = useFittedBoardWidth()
  return (
    // One screen tall, no scrolling (same as Mock exam): the board takes whatever height is left.
    // Phone: minus the top bar, main's padding and the bottom nav. Tablet/computer: minus main's padding (2.5rem).
    <div className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[30rem] max-w-5xl flex-col gap-3 md:h-[calc(100dvh-2.5rem)] md:min-h-[34rem]">
      <PageHeader title="Board Review" subtitle="Snakes and ladders through the six subjects. Answer right to move." />

      {/* ---------- The board ---------- */}
      <section aria-label="Board" ref={measure} className="flex min-h-0 flex-1 items-center justify-center">
        {width !== null && <BoardGrid tokenSquare={inProgress?.position ?? 1} layout={layoutOf(previewLayoutId)} className="shrink-0" style={{ width }} />}
      </section>

      {/* ---------- Status: one line (the board already shows where the token is, so no big headline) ---------- */}
      <p className="shrink-0 truncate px-4 text-center text-base text-muted-foreground tabular-nums" aria-live="polite">
        {inProgress ? (
          <>
            <span className="font-bold text-[#9A5B00]">Paused</span> on <span className="font-bold text-foreground">square {inProgress.position}</span> ·{' '}
            {zoneOf(inProgress.position)} zone · {inProgress.correct}/{inProgress.answered} correct · {BOARD_SIZE - inProgress.position} to go
          </>
        ) : (
          <>
            <span className="font-bold text-foreground">New game</span> · 60 squares, one zone per subject
          </>
        )}
      </p>

      {/* ---------- One row: team on the left | solo on the right (Continue / Start is the main action) ---------- */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        {/* Team games with classmates (live, online). */}
        <TeamEntry />
        <span className="mx-1 hidden h-8 w-px bg-border sm:block" aria-hidden />
        {inProgress && (
          <button
            type="button"
            onClick={onNewGame}
            className="flex h-12 items-center rounded-lg border bg-card px-5 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            New game
          </button>
        )}
        <button type="button" onClick={inProgress ? onContinue : onNewGame} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
          <Play className="size-5 fill-current" aria-hidden />
          {inProgress ? 'Continue' : 'Start game'}
        </button>
      </div>

      {/* ---------- The rules: one quiet line under it all (plain text, not things to tap) ---------- */}
      <div className="w-full shrink-0 border-t border-dashed pt-3">
        <h2 className="sr-only">How it works</h2>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
          {RULES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
