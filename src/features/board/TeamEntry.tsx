import { Plus, Users, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { cleanGameCode, GAME_CODE_LENGTH } from '@/lib/boardTeam'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { cn } from '@/lib/utils'
import { teamActions, useMyInvites, useMyTeamRoom, useNeedsTeamName, useRefreshTeam } from './teamApi'
import { TeamNameStep } from './TeamNameStep'

/**
 * "Play with classmates" on Board Review's start screen: opens a sheet with the invites waiting for her (only when
 * there are some), "Join with a code", and "Host a new game". If she's already in a team game, the button takes her
 * back to it instead.
 */
export function TeamEntry() {
  const navigate = useNavigate()
  const invites = useMyInvites()
  const myRoom = useMyTeamRoom()
  const refresh = useRefreshTeam()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const codeReady = code.length === GAME_CODE_LENGTH
  const online = useOnline()
  const needsName = useNeedsTeamName()
  // set right after saving, so she goes on at once instead of waiting for the login to refresh with the name
  const [nameSaved, setNameSaved] = useState(false)

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

  function joinWithCode(value: string) {
    if (busy || value.length < GAME_CODE_LENGTH) return
    run(() => teamActions.joinByCode(value))
  }

  /**
   * Clean what she types or pastes (a pasted invite link gives its code). It never joins by itself: she checks the
   * code, then taps Join (or presses Enter), which turns solid once all 6 characters are in.
   */
  function onCodeChange(typed: string) {
    setCode(cleanGameCode(typed))
    setError(null)
  }

  function submitCode(e: FormEvent) {
    e.preventDefault()
    joinWithCode(code)
  }

  if (room) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/board/team/${room.roomId}`)}
        className="relative flex h-12 items-center gap-2 rounded-lg border bg-card px-4 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
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
        className="relative flex h-12 items-center gap-2 rounded-lg border bg-card px-4 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
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

      {/* Only the X (or Esc) closes it: a stray tap outside shouldn't lose a half-typed code */}
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="team-entry-heading" variant="sheet" size="lg" closeOnBackdrop={false}>
        {/* No name yet: ask for it first (classmates see it, and it puts her on their Invite list), then the usual sheet */}
        {needsName && !nameSaved ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mb-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <TeamNameStep headingId="team-entry-heading" onSaved={() => setNameSaved(true)} />
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="team-entry-heading" className="font-heading text-xl font-bold">
                Play with classmates
              </h2>
              <p className="text-sm text-muted-foreground">2–4 players, live. Everyone gets the same questions.</p>
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

          {!online && (
            <p role="status" className="rounded-md border border-highlight/50 bg-highlight-soft p-3 text-sm">
              You’re offline. Team games need the internet.
            </p>
          )}

          {/* Invites: only when there are some (an empty "no invites" box would take the top spot for nothing) */}
          {waiting.length > 0 && (
            <section aria-label="Invites">
              <ul className="divide-y rounded-lg border border-primary/40 bg-card shadow-sm">
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
            </section>
          )}

          <section aria-labelledby="team-code-heading" className="space-y-2">
            <h3 id="team-code-heading" className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Join with a code
            </h3>
            <form onSubmit={submitCode} className="flex gap-2">
              <label htmlFor="team-code-input" className="sr-only">
                Game code
              </label>
              <input
                id="team-code-input"
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                // underscores read as "type here", not as a real code
                placeholder="______"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="h-12 min-w-0 flex-1 rounded-lg border bg-card px-4 text-center font-mono text-xl font-bold tracking-[0.3em] uppercase outline-none placeholder:font-normal placeholder:text-muted-foreground/40 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
              />
              {/* outlined until all 6 characters are in, then solid: ready to tap */}
              <button
                type="submit"
                disabled={busy || !codeReady}
                className={cn(
                  'h-12 shrink-0 rounded-lg px-5 font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                  codeReady ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border bg-card text-muted-foreground',
                )}
              >
                Join
              </button>
            </form>
          </section>

          {/* the two choices: join someone's game (above) or host your own */}
          <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground uppercase" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            disabled={busy || !online}
            onClick={() => run(() => teamActions.createRoom())}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-highlight font-heading text-lg font-bold text-foreground outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px disabled:opacity-60"
          >
            <Plus className="size-5" aria-hidden />
            {busy ? 'One moment…' : 'Host a new game'}
          </button>
        </div>
        )}
      </Dialog>
    </>
  )
}
