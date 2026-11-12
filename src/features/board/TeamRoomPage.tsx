import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useFocusMode } from '@/components/layoutContext'
import { TeamGame } from './TeamGame'
import { TeamLobby } from './TeamLobby'
import { TeamResults } from './TeamResults'
import { useRoomChat } from './chatApi'
import { CardsLiveRoom } from '@/features/cards/CardsLiveRoom'
import { teamActions, useRefreshTeam, useRoomGame, useTeamRoom } from './teamApi'

// /board/team/:roomId and /cards/team/:roomId → one team game: the lobby, then the live game, then the finish screen.
// Board Review and Last Card share the room and the lobby (migration 0042); the room says which game it is.
// Keyed by the room, so Play again (a new room) starts fresh: its own chat, clock and reveals.
export default function TeamRoomPage() {
  const { roomId } = useParams()
  return <TeamRoomScreen key={roomId} roomId={roomId} />
}

function TeamRoomScreen({ roomId }: { roomId: string | undefined }) {
  const navigate = useNavigate()
  const state = useTeamRoom(roomId)
  const gameQuery = useRoomGame(roomId)
  const cards = gameQuery.data === 'cards'
  const home = cards ? '/cards' : '/board'
  const homeLabel = cards ? 'Back to Last Card' : 'Back to Board Review'
  const refresh = useRefreshTeam()
  // One chat for the room: lobby and game (migration 0029)
  const chat = useRoomChat(roomId, state.data?.room.me)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const room = state.data?.room ?? null
  // No nav while the game is on, like the solo game.
  useFocusMode(room?.status === 'playing' || room?.status === 'live')

  // She was in this lobby, and now the room says she isn't a player: the host removed her (migration 0039).
  // (Leaving on her own goes straight back to Board Review, and a closed lobby says "cancelled".)
  const [wasInLobby, setWasInLobby] = useState(false)
  if (room?.status === 'lobby' && !wasInLobby) setWasInLobby(true)
  const removed = wasInLobby && state.isSuccess && !room
  useEffect(() => {
    if (removed) refresh() // Board Review's start screen stops offering "Back to your team lobby"
  }, [removed, refresh])

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
    if (room && (await act(() => teamActions.leave(room.id)))) navigate(home)
  }

  if (state.isPending || (gameQuery.isPending && gameQuery.fetchStatus !== 'idle')) return <FullPageMessage>Loading the game…</FullPageMessage>
  if (state.isError) return <FullPageMessage>{state.error.message}</FullPageMessage>
  if (removed) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="font-heading text-2xl font-bold">You’re no longer in this lobby</p>
        <p className="text-muted-foreground">The host removed you from the lobby. You can join again if they invite you or send you the code.</p>
        <Link to={home} className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-semibold hover:border-primary">
          {homeLabel}
        </Link>
      </div>
    )
  }
  if (!room || room.status === 'cancelled') {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="font-heading text-2xl font-bold">{room ? 'This game was cancelled.' : 'This game isn’t available.'}</p>
        <p className="text-muted-foreground">{room ? 'The host closed the lobby.' : 'It may have ended, or you’re not one of its players.'}</p>
        <Link to={home} className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-semibold hover:border-primary">
          {homeLabel}
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
        <TeamLobby room={room} act={act} busy={busy} onLeave={leaveLobby} chat={chat} game={cards ? 'cards' : 'board'} />
      </>
    )
  }

  // Last Card: its own live table (and, for now, its own finish), read from her card view (step 2–3)
  if (cards) return <CardsLiveRoom roomId={room.id} />

  if (room.status === 'finished') return <TeamResults room={room} />

  return <TeamGame room={room} fetchedAt={state.data!.fetchedAt} act={act} message={message} onLeft={() => navigate('/board')} chat={chat} />
}
