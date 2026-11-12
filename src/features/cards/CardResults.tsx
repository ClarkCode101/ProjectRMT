import { CARD_SUBJECTS, ranking, type CardGame } from '@/lib/cards'
import { useSubjects } from '@/lib/referenceData'
import { FinishChip, GameFinish } from '@/features/games/GameFinish'

type Props = { game: CardGame; onPlayAgain: () => void }

/** "You won!", "Rafa M. won", or a tie when the cards ran out. */
function headline(game: CardGame): string {
  if (game.winner === null) return 'It’s a tie'
  return game.players[game.winner].isHuman ? 'You won!' : `${game.players[game.winner].name} won`
}

function subline(game: CardGame): string {
  if (game.endReason === 'outOfCards') return 'No cards were left to draw, so the fewest cards wins.'
  if (game.winner === 0) return 'You ran out of cards first.'
  const left = game.players[0].hand.length
  return `You had ${left} ${left === 1 ? 'card' : 'cards'} left. Next game!`
}

/** Last Card's finish screen (PROJECT_PLAN.md §15–16): who won, everyone's cards left, and where to study next. */
export function CardResults({ game, onPlayAgain }: Props) {
  const subjects = useSubjects()
  const practiceHref = (code: string) => {
    const id = subjects.data?.find((s) => s.code === code)?.id
    return id ? `/practice?subject=${id}` : '/practice'
  }
  // Subjects in exam order first, then any other subject a Wild's question came from.
  const codes = [...CARD_SUBJECTS, ...Object.keys(game.bySubject).filter((c) => !(CARD_SUBJECTS as readonly string[]).includes(c))].filter((c) => game.bySubject[c])

  return (
    <GameFinish
      won={game.winner === 0}
      headline={headline(game)}
      subline={subline(game)}
      details={[
        // Everyone's cards left, fewest first (hers in gold).
        ...ranking(game).map((seat) => {
          const player = game.players[seat]
          const count = player.hand.length
          return (
            <FinishChip key={seat} strong={player.isHuman}>
              {player.isHuman ? 'You' : player.name} · {count} {count === 1 ? 'card' : 'cards'}
            </FinishChip>
          )
        }),
      ]}
      correct={game.correct}
      answered={game.answered}
      notes={game.drawnForMistakes > 0 ? [`${game.drawnForMistakes} ${game.drawnForMistakes === 1 ? 'card' : 'cards'} drawn for wrong answers`] : []}
      bySubject={codes.map((code) => ({ code, ...game.bySubject[code], practiceHref: practiceHref(code) }))}
      onPlayAgain={onPlayAgain}
    />
  )
}
