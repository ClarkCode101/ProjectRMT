import { Users, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { cn } from '@/lib/utils'
import { teamActions, useMyInvites, useMyTeamRoom, useRefreshTeam } from './teamApi'

/**
 * "Play with classmates" on Board Review's start screen: opens a sheet with the invites waiting for her and
 * "New team game". If she's already in a team game, the button takes her back to it instead.
 */
export function TeamEntry() {
  const navigate = useNavigate()
  const invites = useMyInvites()
  const myRoom = useMyTeamRoom()
  const refresh = useRefreshTeam()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const waiting = invites.data ?? []
  const room = myRoom.data ?? null

  async function run(action: () => Promise<string | null | undefined>) {
    setBusy(true)
    setError(null)
    try {
      const roomId = await action()
      refresh()
      if (roomId) navigate(`/board/team/${roomId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  if (room) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/board/team/${room.roomId}`)}
        className="relative flex h-11 items-center gap-2 rounded-lg border bg-card px-4 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <Users className="size-5 text-primary" aria-hidden />
        {room.status === 'lobby' ? 'Back to your team lobby' : room.myTurn ? 'Your turn in your team game' : 'Back to your team game'}
        {room.myTurn && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-wrong ring-2 ring-background" aria-hidden />}
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-11 items-center gap-2 rounded-lg border bg-card px-4 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <Users className="size-5 text-primary" aria-hidden />
        Play with classmates
        {waiting.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-wrong px-1.5 text-xs font-bold text-white tabular-nums">
            {waiting.length}
            <span className="sr-only"> {waiting.length === 1 ? 'invite' : 'invites'} waiting</span>
          </span>
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="team-entry-heading" variant="sheet" size="lg">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="team-entry-heading" className="font-heading text-xl font-bold">
                Play with classmates
              </h2>
              <p className="text-sm text-muted-foreground">2 to 4 players, live. Everyone races their own token to 60.</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-wrong/40 bg-wrong-soft p-3 text-sm">
              {error}
            </p>
          )}

          <section aria-labelledby="team-invites-heading" className="space-y-2">
            <h3 id="team-invites-heading" className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Invites {waiting.length > 0 && `(${waiting.length})`}
            </h3>
            {waiting.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">No invites right now. Start a game and invite your classmates.</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {waiting.map((inv) => (
                  <li key={inv.inviteId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{inv.fromName} invited you</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {inv.players} of 4 {inv.players === 1 ? 'player' : 'players'} in the lobby
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => teamActions.respondInvite(inv.inviteId, false))}
                        className="h-10 rounded-lg border bg-card px-4 text-sm font-semibold outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => teamActions.respondInvite(inv.inviteId, true))}
                        className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
                      >
                        Join game
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => teamActions.createRoom())}
            className={cn(
              'flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-highlight font-heading text-lg font-bold text-foreground outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px disabled:opacity-60',
            )}
          >
            <Users className="size-5" aria-hidden />
            {busy ? 'One moment…' : 'New team game'}
          </button>
          <p className="text-center text-xs text-muted-foreground">Team games use the built-in questions, so everyone gets the same ones. Needs the internet.</p>
        </div>
      </Dialog>
    </>
  )
}
