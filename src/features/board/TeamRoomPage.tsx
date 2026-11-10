import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { TeamGame } from './TeamGame'
import { TeamLobby } from './TeamLobby'
import { TeamResults } from './TeamResults'
import { teamActions, useRefreshTeam, useTeamRoom } from './teamApi'

// /board/team/:roomId → one team game: the lobby, then the live game, then the finish screen.
export default function TeamRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const state = useTeamRoom(roomId)
  const refresh = useRefreshTeam()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const room = state.data?.room ?? null
  // No nav while the game is on, like the solo game.
  useFocusMode(room?.status === 'playing')

  /** Runs a database change, shows its message if it fails, and reads the room again. */
  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true)
      setMessage(null)
      try {
        await action()
        return true
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Something went wrong.')
        return false
      } finally {
        setBusy(false)
        refresh(roomId)
      }
    },
    [refresh, roomId],
  )

  async function leaveLobby() {
    if (room && (await act(() => teamActions.leave(room.id)))) navigate('/board')
  }

  if (state.isPending) return <FullPageMessage>Loading the game…</FullPageMessage>
  if (state.isError) return <FullPageMessage>{state.error.message}</FullPageMessage>
  if (!room || room.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="font-heading text-2xl font-bold">{room ? 'This game was cancelled.' : 'This game isn’t available.'}</p>
        <p className="text-muted-foreground">{room ? 'The host closed the lobby.' : 'It may have ended, or you’re not one of its players.'}</p>
        <Link to="/board" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-semibold hover:border-primary">
          Back to Board Review
        </Link>
      </div>
    )
  }

  if (room.status === 'lobby') {
    return (
      <>
        {message && (
          <p role="alert" className="mx-auto mb-4 max-w-3xl rounded-md border border-wrong/40 bg-wrong-soft p-3 text-sm">
            {message}
          </p>
        )}
        <TeamLobby room={room} act={act} busy={busy} onLeave={leaveLobby} />
      </>
    )
  }

  if (room.status === 'finished') return <TeamResults room={room} />

  return <TeamGame room={room} fetchedAt={state.data!.fetchedAt} act={act} message={message} onLeft={() => navigate('/board')} />
}
