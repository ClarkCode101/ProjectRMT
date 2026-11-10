import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { teamActions, useRefreshTeam } from './teamApi'

// /board/join/:code → the invite link a classmate sent (e.g. through Messenger): joins the lobby, then opens it.
export default function JoinTeamPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const refresh = useRefreshTeam()
  const [error, setError] = useState<string | null>(null)
  const tried = useRef(false)

  useEffect(() => {
    if (tried.current) return // once, even if React runs this twice
    tried.current = true
    teamActions
      .join(code)
      .then((roomId) => {
        refresh()
        navigate(`/board/team/${roomId}`, { replace: true })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t join this game.'))
  }, [code, navigate, refresh])

  if (!error) return <FullPageMessage>Joining the game…</FullPageMessage>
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="font-heading text-2xl font-bold">Couldn’t join</p>
      <p className="text-muted-foreground">{error}</p>
      <Link to="/board" className="inline-flex h-11 items-center rounded-lg border bg-card px-5 font-semibold hover:border-primary">
        Back to Board Review
      </Link>
    </div>
  )
}
