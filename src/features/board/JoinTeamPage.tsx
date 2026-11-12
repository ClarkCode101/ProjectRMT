import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { readRoomGame, teamActions, teamRoomPath, useNeedsTeamName, useRefreshTeam } from './teamApi'
import { TeamNameStep } from './TeamNameStep'

// /board/join/:code → the invite link a classmate sent (e.g. through Messenger): joins the lobby, then opens it
// (Board Review's or Last Card's: the link is the same for both; the room says which game it is).
// No name yet: asks for it first, so the others don't see "A classmate" on her seat.
export default function JoinTeamPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const refresh = useRefreshTeam()
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)
  const needsName = useNeedsTeamName()
  const [nameSaved, setNameSaved] = useState(false)
  const askName = needsName && !nameSaved

  useEffect(() => {
    if (askName) return // join only once she has a name
    if (tried.current) return // once, even if React runs this twice
    tried.current = true
    teamActions
      .join(code)
      .then(async (roomId) => {
        if (!roomId) throw new Error('Couldn’t join this game.')
        refresh()
        navigate(teamRoomPath(await readRoomGame(roomId), roomId), { replace: true })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t join this game.'))
  }, [askName, code, navigate, refresh])

  if (askName) {
    return (
      <div className="mx-auto max-w-md py-16">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <TeamNameStep headingId="join-name-heading" onSaved={() => setNameSaved(true)} />
        </div>
      </div>
    )
  }
  if (!error) return <FullPageMessage>Joining the game…</FullPageMessage>
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="font-heading text-2xl font-bold">Couldn’t join</p>
      <p className="text-muted-foreground">{error}</p>
      <Link to="/games" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-semibold hover:border-primary">
        Back to Games
      </Link>
    </div>
  )
}
