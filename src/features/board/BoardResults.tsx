import { lifelinesLine, ZONE_SUBJECTS, type BoardGame } from '@/lib/board'
import { useSubjects } from '@/lib/referenceData'
import { FinishChip, GameFinish } from '@/features/games/GameFinish'

type Props = { game: BoardGame; onPlayAgain: () => void }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Board Review's solo finish screen (PROJECT_PLAN.md §14, §16): how the game went, and where to study next. */
export function BoardResults({ game, onPlayAgain }: Props) {
  const subjects = useSubjects()
  const practiceHref = (code: string) => {
    const id = subjects.data?.find((s) => s.code === code)?.id
    return id ? `/practice?subject=${id}` : '/practice'
  }
  // Subjects in exam order first, then any other subject a rescue question came from.
  const codes = [...ZONE_SUBJECTS, ...Object.keys(game.bySubject).filter((c) => !(ZONE_SUBJECTS as readonly string[]).includes(c))].filter((c) => game.bySubject[c])

  return (
    <GameFinish
      won
      headline="Board complete!"
      subline={`You reached square 60 in ${plural(game.turns, 'roll', 'rolls')}.`}
      details={
        <>
          <FinishChip>{plural(game.laddersClimbed, 'ladder', 'ladders')} climbed</FinishChip>
          <FinishChip>{plural(game.snakesEscaped, 'snake', 'snakes')} escaped</FinishChip>
          <FinishChip>{plural(game.snakesSlid, 'snake', 'snakes')} slid down</FinishChip>
        </>
      }
      correct={game.correct}
      answered={game.answered}
      notes={[lifelinesLine(game.lifelinesUsed)]}
      bySubject={codes.map((code) => ({ code, ...game.bySubject[code], practiceHref: practiceHref(code) }))}
      onPlayAgain={onPlayAgain}
    />
  )
}
