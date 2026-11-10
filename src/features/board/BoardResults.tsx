import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE } from '@/components/report'
import { tallyAccuracy, ZONE_SUBJECTS, type BoardGame } from '@/lib/board'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjects } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

type Props = { game: BoardGame; onPlayAgain: () => void }

/** The finish screen: how the game went, and where to study next. */
export function BoardResults({ game, onPlayAgain }: Props) {
  const subjects = useSubjects()
  const rate = game.answered > 0 ? game.correct / game.answered : 0
  // Subjects in exam order first, then any other subject a rescue question came from.
  const codes = [...ZONE_SUBJECTS, ...Object.keys(game.bySubject).filter((c) => !(ZONE_SUBJECTS as readonly string[]).includes(c))].filter((c) => game.bySubject[c])
  const toReview = codes.filter((c) => (tallyAccuracy(game.bySubject[c]) ?? 1) < PASSING_RATE)
  const subjectId = (code: string) => subjects.data?.find((s) => s.code === code)?.id

  const tiles = [
    { label: 'Rolls', value: game.turns },
    { label: 'Ladders climbed', value: game.laddersClimbed },
    { label: 'Snakes escaped', value: game.snakesEscaped },
    { label: 'Snakes slid', value: game.snakesSlid },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeroPanel labelledBy="board-result-heading" className="space-y-5">
        <div>
          <h1 id="board-result-heading" className="text-sm font-semibold text-white/70">
            Board complete
          </h1>
          <p className="font-heading text-6xl leading-none font-bold tabular-nums sm:text-7xl">{formatPercent(rate)}</p>
          <p className="mt-1.5 text-white/85 tabular-nums">
            {game.correct} of {game.answered} correct
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg bg-white/10 px-3 py-2">
              <dt className="text-xs text-white/75">{t.label}</dt>
              <dd className="font-heading text-2xl font-bold tabular-nums">{t.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <button type="button" className={heroButtonClass} onClick={onPlayAgain}>
            <RotateCcw className="size-5" aria-hidden />
            Play again
          </button>
          <Link
            to="/"
            className="rounded-md px-2 py-2.5 text-center text-sm font-semibold text-white/85 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
          >
            Back to Home
          </Link>
        </div>
      </HeroPanel>

      {codes.length > 0 && (
        <section aria-labelledby="board-subject-heading" className="space-y-3">
          <h2 id="board-subject-heading" className="text-lg font-bold">
            By subject
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {codes.map((code) => {
              const tally = game.bySubject[code]
              const subjectRate = tallyAccuracy(tally) ?? 0
              return (
                <li key={code} className="grid grid-cols-[4rem_minmax(0,1fr)_3.5rem] items-center gap-3 px-4 py-3">
                  <span className="font-heading font-bold">{code}</span>
                  <RangeBar rate={subjectRate} label={`${code}: ${tally.correct} of ${tally.answered} correct`} />
                  <span className={cn('text-right font-semibold tabular-nums', subjectRate < PASSING_RATE && 'text-wrong')}>
                    {tally.correct}/{tally.answered}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">The tick on each bar marks 60%, the start of the passing range ({REFERENCE_RANGE}).</p>
        </section>
      )}

      {toReview.length > 0 && (
        <section aria-labelledby="board-review-heading" className="space-y-3">
          <h2 id="board-review-heading" className="text-lg font-bold">
            Review next
          </h2>
          <div className="flex flex-wrap gap-2">
            {toReview.map((code) => {
              const id = subjectId(code)
              return (
                <Link
                  key={code}
                  to={id ? `/practice?subject=${id}` : '/practice'}
                  className="inline-flex h-11 items-center rounded-lg border bg-card px-4 font-heading font-bold outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  Practice {code}
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
