import { Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { finishOrder, playerColor, type TeamRoom } from '@/lib/boardTeam'
import { formatPercent } from '@/lib/quiz'

const PLACES = ['1st', '2nd', '3rd', '4th']

/** The finish screen of a team game: the winner, then everyone's square and score. Like the other results screens. */
export function TeamResults({ room }: { room: TeamRoom }) {
  const order = finishOrder(room.players, room.winnerId)
  const winner = room.players.find((p) => p.userId === room.winnerId)
  const me = room.players.find((p) => p.userId === room.me)
  const iWon = room.winnerId === room.me

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeroPanel labelledBy="team-result-heading" className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 id="team-result-heading" className="text-sm font-semibold text-white/70">
              Team game over
            </h1>
            <p className="font-heading text-4xl leading-tight font-bold sm:text-5xl">
              {iWon ? 'You win!' : winner ? `${winner.name} wins!` : 'Game over'}
            </p>
            {me && (
              <p className="mt-1.5 text-white/85 tabular-nums">
                You: {me.correct} of {me.answered} correct
                {me.answered > 0 && ` (${formatPercent(me.correct / me.answered)})`}, square {me.position}
              </p>
            )}
          </div>
          {winner && <Trophy className="mt-1 size-12 shrink-0 text-highlight" aria-hidden />}
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <Link to="/board" className={heroButtonClass}>
            Back to Board Review
          </Link>
        </div>
      </HeroPanel>

      <section aria-labelledby="team-standings-heading" className="space-y-3">
        <h2 id="team-standings-heading" className="text-lg font-bold">
          Standings
        </h2>
        <ol className="divide-y rounded-xl border bg-card">
          {order.map((p, i) => (
            <li key={p.userId} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
              <span className="font-heading font-bold text-muted-foreground">{PLACES[i]}</span>
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-4 shrink-0 rounded-full" style={{ backgroundColor: playerColor(room.players, p.userId) }} aria-hidden />
                <span className="truncate font-semibold">{p.userId === room.me ? 'You' : p.name}</span>
                {p.status !== 'joined' && p.userId !== room.winnerId && (
                  <span className="shrink-0 text-xs text-muted-foreground">{p.status === 'removed' ? '(timed out)' : '(left)'}</span>
                )}
              </span>
              <span className="text-right text-sm tabular-nums">
                <span className="font-semibold">Square {p.position}</span>
                <span className="block text-muted-foreground">
                  {p.correct}/{p.answered} correct
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">Every answer counts toward each player’s own scores, like Practice.</p>
      </section>
    </div>
  )
}
