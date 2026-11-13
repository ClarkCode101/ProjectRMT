import { useState } from 'react'
import { useNavigate } from 'react-router'
import { teamActions, teamRoomPath, useRefreshTeam, type GameKind } from '@/features/board/teamApi'
import { playAgainLine, rematchChoice, type TeamRoom } from '@/lib/boardTeam'
import { cn } from '@/lib/utils'
import type { PlayAgain } from './GameFinish'

/**
 * Play again for a team game (Board Review §14, Last Card §15 step 4): tapping it is the vote. The first to tap makes the next
 * lobby of the same game (and hosts it); everyone else from this game gets an invite and taps the same button to join.
 * Back to Games = "I'm done", so a later Play again doesn't invite her.
 */
export function usePlayAgain(room: TeamRoom, game: GameKind) {
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
      if (!nextRoomId) throw new Error('Something went wrong. Try again.')
      refresh()
      navigate(teamRoomPath(game, nextRoomId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      refresh(room.id)
    } finally {
      setBusy(false)
    }
  }

  async function imDone() {
    setBusy(true)
    if (choice.kind !== 'back') await teamActions.rematchDone(room.id).catch(() => undefined)
    refresh()
    navigate('/games')
  }

  const gold: PlayAgain | undefined =
    choice.kind === 'back'
      ? { label: 'Back to the next game', to: teamRoomPath(game, choice.roomId) }
      : choice.kind === 'started'
        ? undefined
        : { label: busy ? 'One moment…' : choice.kind === 'join' ? 'Join the next game' : 'Play again', onClick: playAgain, disabled: busy }

  const line =
    choice.kind === 'started'
      ? `${choice.hostName}’s next game already started.`
      : wantsLine
        ? `${wantsLine}.`
        : choice.kind === 'start'
          ? 'You’ll host the next game. Everyone here gets an invite.'
          : choice.kind === 'join'
            ? `${choice.hostName} is hosting the next game.`
            : null

  const below = (
    <>
      <p className={cn('text-center text-sm', wantsLine ? 'font-semibold text-correct' : 'text-muted-foreground')} aria-live="polite">
        {line}
      </p>
      {error && (
        <p role="alert" className="rounded-md border border-wrong/40 bg-wrong-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}
    </>
  )
  return { gold, onBack: imDone, below }
}
