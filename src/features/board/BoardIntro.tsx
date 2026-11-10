import { ArrowDown, ArrowUp, Dices, Play, Target } from 'lucide-react'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { BOARD_SIZE, layoutOf, zoneOf, type BoardGame } from '@/lib/board'
import { cn } from '@/lib/utils'
import { BoardGrid } from './BoardGrid'
import { TeamEntry } from './TeamEntry'
import { useFittedBoardWidth } from './useFittedBoardWidth'

// Board Review's start screen, laid out like Mock exam and Practice (one screen, read top to bottom):
// title → the board in the middle (like the rotor) → the name plate → Start (or Continue / New game) → the rules.

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

      {/* ---------- Name plate ---------- */}
      <div className="shrink-0 text-center" aria-live="polite">
        {inProgress ? (
          <>
            <p className="font-heading text-4xl leading-none font-black tracking-wide tabular-nums md:text-5xl">SQUARE {inProgress.position}</p>
            <p className="mt-2 truncate px-4 text-sm text-muted-foreground tabular-nums">
              <span className="font-bold text-[#9A5B00]">Paused</span> · {zoneOf(inProgress.position)} zone · {inProgress.correct}/{inProgress.answered} correct · {BOARD_SIZE - inProgress.position} to go
            </p>
          </>
        ) : (
          <>
            <p className="font-heading text-4xl leading-none font-black tracking-wide md:text-5xl">NEW GAME</p>
            <p className="mt-2 truncate px-4 text-sm text-muted-foreground">60 squares · one zone per subject · a different board each game</p>
          </>
        )}
      </div>

      {/* ---------- Start (or Continue / New game) ---------- */}
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        {inProgress ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNewGame}
              className="flex h-12 items-center rounded-lg border bg-card px-5 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              New game
            </button>
            <button type="button" onClick={onContinue} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
              <Play className="size-5 fill-current" aria-hidden />
              Continue
            </button>
          </div>
        ) : (
          <button type="button" onClick={onNewGame} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
            <Play className="size-5 fill-current" aria-hidden />
            Start game
          </button>
        )}
        <p className="text-xs text-muted-foreground">Your game is saved on this device.</p>
        {/* Team games with classmates (live, online). */}
        <TeamEntry />
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
