import { GameFinish, type Standing, type StandingBadge } from '@/features/games/GameFinish'
import { usePlayAgain } from '@/features/games/usePlayAgain'
import { lifelinesLine, ZONE_SUBJECTS } from '@/lib/board'
import { finishOrder, playerColor, playingAgainIds, type TeamPlayer, type TeamRoom } from '@/lib/boardTeam'
import { useSubjects } from '@/lib/referenceData'
import { LifelineIcons } from './Lifelines'
import { useMyGameAnswers } from './teamApi'

/** One badge at most: Playing again, Done, or why they're no longer in it. */
function badgeOf(p: TeamPlayer, again: Set<string>, won: boolean): StandingBadge | null {
  if (again.has(p.userId)) return 'again'
  if (p.rematchDone) return 'done'
  if (p.status === 'joined' || won) return null
  return p.status === 'removed' ? 'timedOut' : 'left'
}

/**
 * The finish screen of a Board Review team game: the same screen as every other game (GameFinish, §16), so the result,
 * the standings, her answers and the two buttons are always in the same places (decided 2026-11-13: one look for
 * Board Review and Last Card). The standings show how far along the 60 squares each player got.
 */
export function TeamResults({ room }: { room: TeamRoom }) {
  const playAgain = usePlayAgain(room, 'board')
  const answers = useMyGameAnswers(room.id)
  const subjects = useSubjects()
  const winner = room.players.find((p) => p.userId === room.winnerId)
  const me = room.players.find((p) => p.userId === room.me)
  const iWon = room.winnerId === room.me
  const again = playingAgainIds(room.rematch)

  const standings: Standing[] = finishOrder(room.players, room.winnerId).map((p) => {
    const won = p.userId === room.winnerId
    return {
      key: p.userId,
      name: p.name,
      isMe: p.userId === room.me,
      won,
      color: playerColor(room.players, p.userId),
      badge: badgeOf(p, again, won),
      progress: { value: p.position, max: 60, label: `${p.userId === room.me ? 'You' : p.name}: square ${p.position} of 60` },
      metric: String(p.position),
      extra: <LifelineIcons used={p.lifelinesUsed} className="text-white/70" />,
      score: { correct: p.correct, answered: p.answered },
    }
  })

  // Her answers by subject: exam order first, then any other subject a snake's rescue question came from.
  const bySubject = answers.data ?? {}
  const codes = [...ZONE_SUBJECTS, ...Object.keys(bySubject).filter((c) => !(ZONE_SUBJECTS as readonly string[]).includes(c))].filter((c) => bySubject[c])
  const practiceHref = (code: string) => {
    const id = subjects.data?.find((s) => s.code === code)?.id
    return id ? `/practice?subject=${id}` : '/practice'
  }

  return (
    <GameFinish
      won={iWon}
      headline={iWon ? 'You won!' : winner ? `${winner.name} won` : 'Game over'}
      subline={iWon ? 'You reached square 60 first.' : winner ? `${winner.name} reached square 60 first.` : 'The game ended before anyone reached square 60.'}
      standings={standings}
      correct={me?.correct ?? 0}
      answered={me?.answered ?? 0}
      notes={me && me.answered > 0 ? [lifelinesLine(me.lifelinesUsed)] : []}
      bySubject={codes.map((code) => ({ code, ...bySubject[code], practiceHref: practiceHref(code) }))}
      playAgain={playAgain.gold}
      onBack={playAgain.onBack}
      below={playAgain.below}
    />
  )
}
