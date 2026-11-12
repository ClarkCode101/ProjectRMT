import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { HeroPanel, heroButtonClass, RangeBar, REFERENCE_RANGE } from '@/components/report'
import { tallyAccuracy } from '@/lib/board'
import { CARD_SUBJECTS, ranking, type CardGame } from '@/lib/cards'
import { formatPercent, PASSING_RATE } from '@/lib/quiz'
import { useSubjects } from '@/lib/referenceData'
import { cn } from '@/lib/utils'

type Props = { game: CardGame; onPlayAgain: () => void }

/** "You won!", "Rafa M. won", or a tie when the cards ran out. */
function headline(game: CardGame): string {
  if (game.winner === null) return 'It’s a tie'
  return game.players[game.winner].isHuman ? 'You won!' : `${game.players[game.winner].name} won`
}

/** The finish screen (Lab report style, like Board Review): who won, everyone's cards left, and where to study next. */
export function CardResults({ game, onPlayAgain }: Props) {
  const subjects = useSubjects()
  const rate = game.answered > 0 ? game.correct / game.answered : 0
  // Subjects in exam order first, then any other subject a Wild's question came from.
  const codes = [...CARD_SUBJECTS, ...Object.keys(game.bySubject).filter((c) => !(CARD_SUBJECTS as readonly string[]).includes(c))].filter((c) => game.bySubject[c])
  const toReview = codes.filter((c) => (tallyAccuracy(game.bySubject[c]) ?? 1) < PASSING_RATE)
  const subjectId = (code: string) => subjects.data?.find((s) => s.code === code)?.id
  const order = ranking(game)

  const tiles = [
    { label: 'Questions', value: game.answered },
    { label: 'Cards left', value: game.players[0].hand.length },
    { label: 'Drawn for wrong answers', value: game.drawnForMistakes },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeroPanel labelledBy="cards-result-heading" className="space-y-5">
        <div>
          <h1 id="cards-result-heading" className="font-heading text-2xl font-bold">
            {headline(game)}
          </h1>
          {game.endReason === 'outOfCards' && <p className="text-sm text-white/70">No cards were left to draw, so the fewest cards wins.</p>}
          <p className="mt-3 font-heading text-6xl leading-none font-bold tabular-nums sm:text-7xl">{game.answered > 0 ? formatPercent(rate) : '—'}</p>
          <p className="mt-1.5 text-white/85 tabular-nums">
            {game.answered > 0 ? `You: ${game.correct} of ${game.answered} correct` : 'You didn’t answer a question this time. Next game!'}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-2">
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
            to="/games"
            className="rounded-md px-2 py-2.5 text-center text-sm font-semibold text-white/85 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
          >
            Back to Games
          </Link>
        </div>
      </HeroPanel>

      <section aria-labelledby="cards-table-heading" className="space-y-3">
        <h2 id="cards-table-heading" className="text-lg font-bold">
          Cards left
        </h2>
        <ol className="divide-y rounded-xl border bg-card">
          {order.map((seat, place) => {
            const player = game.players[seat]
            const count = player.hand.length
            return (
              <li key={seat} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 font-heading font-bold text-muted-foreground tabular-nums">{place + 1}</span>
                <span className={cn('flex-1 font-semibold', player.isHuman && 'text-primary-deep')}>{player.isHuman ? 'You' : player.name}</span>
                {seat === game.winner && <span className="rounded-full bg-highlight-soft px-2.5 py-0.5 text-xs font-bold text-[#7A4D0C]">Winner</span>}
                <span className="w-20 text-right tabular-nums">
                  {count} {count === 1 ? 'card' : 'cards'}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      {codes.length > 0 && (
        <section aria-labelledby="cards-subject-heading" className="space-y-3">
          <h2 id="cards-subject-heading" className="text-lg font-bold">
            Your answers by subject
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
        <section aria-labelledby="cards-review-heading" className="space-y-3">
          <h2 id="cards-review-heading" className="text-lg font-bold">
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
