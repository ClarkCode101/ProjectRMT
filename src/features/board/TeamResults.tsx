import { Check, Play, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { finishOrder, playAgainLine, playerColor, playingAgainIds, rematchChoice, type TeamRoom } from '@/lib/boardTeam'
import { formatPercent } from '@/lib/quiz'
import { cn } from '@/lib/utils'
import { teamActions, useRefreshTeam } from './teamApi'

const PLACES = ['1st', '2nd', '3rd', '4th']

/**
 * Play again: tapping it is the vote. The first to tap makes the next lobby; the others tap the same button to join it.
 * Who already tapped shows live ("Ana wants to play again", and a badge in the standings). No code needed.
 * "Back to Board Review" stays for whoever is done.
 */
function PlayAgain({ room }: { room: TeamRoom }) {
  const navigate = useNavigate()
  const refresh = useRefreshTeam()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const choice = rematchChoice(room.rematch, room.me)
  const wantsLine = playAgainLine(room.rematch, room.me)

  async function playAgain() {
    setBusy(true)
    setError(null)
    try {
      const nextRoomId = await teamActions.rematch(room.id)
      refresh()
      navigate(`/board/team/${nextRoomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      refresh(room.id)
    } finally {
      setBusy(false)
    }
  }

  /**
   * Back to Board Review = "no" to Play again: saved first, so a later Play again doesn't invite her and the others
   * see "Done". If she's already in the next game, there's nothing to say no to. A failure never keeps her here.
   */
  async function imDone() {
    setBusy(true)
    if (choice.kind !== 'back') await teamActions.rematchDone(room.id).catch(() => undefined)
    navigate('/board')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {choice.kind === 'back' ? (
          <Link to={`/board/team/${choice.roomId}`} className={heroButtonClass}>
            <Play className="size-5 fill-current" aria-hidden />
            Back to the next game
          </Link>
        ) : choice.kind !== 'started' ? (
          <button type="button" onClick={playAgain} disabled={busy} className={heroButtonClass}>
            <Play className="size-5 fill-current" aria-hidden />
            {busy ? 'One moment…' : 'Play again'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={imDone}
          disabled={busy}
          className="rounded-md px-3 py-2 text-center font-semibold text-white/85 outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-white/60 disabled:opacity-60"
        >
          Back to Board Review
        </button>
      </div>
      <p className={cn('text-sm', wantsLine ? 'font-semibold text-highlight' : 'text-white/75')} aria-live="polite">
        {choice.kind === 'started'
          ? `${choice.hostName}’s next game already started.`
          : wantsLine
            ? `${wantsLine}.`
            : choice.kind === 'start'
              ? 'Same group, new game. Everyone here gets an invite.'
              : null}
      </p>
      {error && (
        <p role="alert" className="rounded-md bg-white/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </div>
  )
}

/** The finish screen of a team game: the winner, then everyone's square and score. Like the other results screens. */
export function TeamResults({ room }: { room: TeamRoom }) {
  const order = finishOrder(room.players, room.winnerId)
  const winner = room.players.find((p) => p.userId === room.winnerId)
  const me = room.players.find((p) => p.userId === room.me)
  const iWon = room.winnerId === room.me
  const again = playingAgainIds(room.rematch)

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
        <PlayAgain room={room} />
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
                {again.has(p.userId) ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-correct-soft px-2 py-0.5 text-xs font-bold text-correct">
                    <Check className="size-3.5" aria-hidden />
                    Playing again
                  </span>
                ) : (
                  p.rematchDone && <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">Done</span>
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
