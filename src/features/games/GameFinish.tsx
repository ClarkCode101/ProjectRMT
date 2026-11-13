import { Flag, Play, RotateCcw, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE } from '@/components/report'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { cn } from '@/lib/utils'

// The finish screen of every game (PROJECT_PLAN.md §16), so Board Review and Last Card end the same way.
// Redesigned 2026-11-12 (the owner found the old one too spread out, with no clear focus and a "Back to Games" that
// didn't look like a button). Read top to bottom, on one iPad screen:
//   1. the result is the star: a big headline ("You won!"), one line why, and a small row with the details
//   2. how she did: her score next to her score per subject (no tiles repeating the same numbers)
//   3. Practice links for the subjects under 60%
//   4. two buttons of the same size right under it all: Back to Games and the gold Play again
// The whole block sits in the middle of the screen (pinning the buttons to the very bottom left a big empty gap).

export type SubjectResult = { code: string; correct: number; answered: number; practiceHref: string }

type Props = {
  /** a win shows a trophy; anything else (a loss, a tie) a flag */
  won: boolean
  /** e.g. "You won!", "Rafa M. won", "Board complete!" */
  headline: string
  /** one line under it, e.g. "You ran out of cards first." */
  subline: string
  /** a small row of details under the headline (standings, rolls…) */
  details?: ReactNode
  correct: number
  answered: number
  /** extra lines under her score, e.g. "11 cards drawn for wrong answers" */
  notes?: readonly string[]
  /** her answers per subject, in exam order */
  bySubject: readonly SubjectResult[]
  /** the gold Play again (solo games); for team games use `playAgain` */
  onPlayAgain?: () => void
  /** team games: the gold button can say something else ("Join Ana's game"), be a link back to the next lobby, or wait */
  playAgain?: PlayAgain
  /** team games: Back to Games first says "I'm done" (so a later Play again doesn't invite her), then goes */
  onBack?: () => void
  /** a line under the two buttons, e.g. "Ana wants to play again." */
  below?: ReactNode
}

export type PlayAgain = {
  label: string
  /** a button… */
  onClick?: () => void
  /** …or a link (back to the next lobby she's already in) */
  to?: string
  disabled?: boolean
}

const backClass =
  'flex h-12 items-center justify-center rounded-lg border-2 border-primary/25 bg-card px-4 font-heading text-lg font-bold text-primary-deep outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px disabled:opacity-60'
const playAgainClass = cn(heroButtonClass, 'w-full focus-visible:ring-ring/50 sm:flex sm:w-full')

export function GameFinish({ won, headline, subline, details, correct, answered, notes = [], bySubject, onPlayAgain, playAgain, onBack, below }: Props) {
  const gold: PlayAgain | null = playAgain ?? (onPlayAgain ? { label: 'Play again', onClick: onPlayAgain } : null)
  const rate = answered > 0 ? correct / answered : null
  const toReview = bySubject.filter((s) => s.answered > 0 && s.correct / s.answered < PASSING_RATE)
  const Icon = won ? Trophy : Flag

  return (
    // Tablets and computers: the whole block in the middle of the screen, the buttons right under it.
    <div className="mx-auto flex max-w-3xl flex-col justify-center gap-4 md:min-h-[calc(100dvh-2.5rem)]">
      {/* ---------- 1. The result ---------- */}
      <HeroPanel labelledBy="finish-heading" className="space-y-4">
        <div className="flex items-center gap-4">
          <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-full', won ? 'bg-highlight text-foreground' : 'bg-white/15 text-white')}>
            <Icon className="size-7" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 id="finish-heading" className="font-heading text-3xl leading-tight font-bold sm:text-4xl">
              {headline}
            </h1>
            <p className="text-white/80">{subline}</p>
          </div>
        </div>
        {details && <div className="flex flex-wrap gap-2">{details}</div>}
      </HeroPanel>

      {/* ---------- 2. How she did: her score | per subject ---------- */}
      <section aria-label="Your answers" className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">Your answers</h2>
          <p className="font-heading text-5xl leading-none font-bold tabular-nums">{rate === null ? '—' : formatPercent(rate)}</p>
          <p className="mt-1.5 tabular-nums">{answered > 0 ? `${correct} of ${answered} correct` : 'No questions this time. Next game!'}</p>
          {notes.map((note) => (
            <p key={note} className="mt-0.5 text-sm text-muted-foreground">
              {note}
            </p>
          ))}
        </div>
        {bySubject.length > 0 && (
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-muted-foreground">By subject</h2>
            <ul className="mt-2 space-y-2.5">
              {bySubject.map((s) => {
                const subjectRate = s.answered > 0 ? s.correct / s.answered : 0
                return (
                  <li key={s.code} className="grid grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] items-center gap-3">
                    <span className="font-heading text-sm font-bold">{s.code}</span>
                    <RangeBar rate={subjectRate} label={`${s.code}: ${s.correct} of ${s.answered} correct`} />
                    <span className={cn('text-right text-sm font-semibold tabular-nums', subjectRate < PASSING_RATE && 'text-wrong')}>
                      {s.correct}/{s.answered}
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">The tick marks 60%, the start of the passing range ({REFERENCE_RANGE}).</p>
          </div>
        )}
      </section>

      {/* ---------- 3. Where to study next ---------- */}
      {toReview.length > 0 && (
        <section aria-labelledby="review-next-heading" className="flex flex-wrap items-center gap-2">
          <h2 id="review-next-heading" className="mr-1 text-sm font-semibold text-muted-foreground">
            Review next:
          </h2>
          {toReview.map((s) => (
            <Link
              key={s.code}
              to={s.practiceHref}
              className="inline-flex h-10 items-center rounded-lg border bg-card px-4 font-heading text-sm font-bold outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Practice {s.code}
            </Link>
          ))}
        </section>
      )}

      {/* ---------- 4. Two buttons of the same size ---------- */}
      <div className="space-y-2 pt-2">
        <div className={cn('grid gap-3', gold && 'grid-cols-2')}>
          {onBack ? (
            <button type="button" className={backClass} onClick={onBack}>
              Back to Games
            </button>
          ) : (
            <Link to="/games" className={backClass}>
              Back to Games
            </Link>
          )}
          {gold?.to ? (
            <Link to={gold.to} className={playAgainClass}>
              <Play className="size-5 fill-current" aria-hidden />
              {gold.label}
            </Link>
          ) : gold ? (
            <button type="button" className={playAgainClass} onClick={gold.onClick} disabled={gold.disabled}>
              <RotateCcw className="size-5" aria-hidden />
              {gold.label}
            </button>
          ) : null}
        </div>
        {below}
      </div>
    </div>
  )
}

/** One small pill in the headline's details row, e.g. "Joy D. · 3 cards". `strong` marks her own. */
export function FinishChip({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <span className={cn('rounded-full px-3 py-1 text-sm tabular-nums', strong ? 'bg-highlight font-bold text-foreground' : 'bg-white/12 text-white/90')}>{children}</span>
}
