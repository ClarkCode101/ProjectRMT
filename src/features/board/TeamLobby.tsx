import { Check, Link2, Play, Send, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { heroButtonClass } from '@/components/report'
import { inviteLink, playerColor, type TeamRoom } from '@/lib/boardTeam'
import { cn } from '@/lib/utils'
import { teamActions, useClassmates } from './teamApi'

const MAX_PLAYERS = 4

type Props = {
  room: TeamRoom
  /** run a database change, then read the room again; returns false if it failed (the message is shown) */
  act: (action: () => Promise<unknown>) => Promise<boolean>
  busy: boolean
  onLeave: () => void
}

/** The lobby: who's in, invite classmates (list or link), and the host's Start. Laid out like the other start screens. */
export function TeamLobby({ room, act, busy, onLeave }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [shared, setShared] = useState<'copied' | 'shared' | null>(null)
  const classmates = useClassmates(inviteOpen)
  const isHost = room.hostId === room.me
  const joined = room.players.filter((p) => p.status === 'joined')
  const full = joined.length >= MAX_PLAYERS
  const invitedIds = new Set(room.invited.map((i) => i.userId))
  const joinedIds = new Set(joined.map((p) => p.userId))
  const link = inviteLink(window.location.origin, room.inviteCode)

  /** The iPad share sheet (to Messenger and the rest); on a computer without one, copy the link instead. */
  async function shareLink() {
    const message = { title: 'Board Review', text: 'Join my Board Review game on ProjectRMT!', url: link }
    try {
      if (navigator.share) {
        await navigator.share(message)
        setShared('shared')
        return
      }
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return // she closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(link)
      setShared('copied')
    } catch {
      window.prompt('Copy this link and send it to your classmates:', link)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Team game" subtitle={isHost ? 'Invite up to 3 classmates, then start. Everyone needs to be here.' : 'Waiting for the host to start the game.'} />

      {/* ---------- Who's in: four seats ---------- */}
      <section aria-labelledby="lobby-players-heading" className="space-y-2">
        <h2 id="lobby-players-heading" className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          Players · {joined.length} of {MAX_PLAYERS}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = joined[i]
            if (!p) {
              const invitedName = room.invited[i - joined.length]?.name
              return (
                <li key={`empty-${i}`} className="flex h-16 items-center gap-3 rounded-xl border border-dashed px-4 text-muted-foreground">
                  <span className="flex size-9 items-center justify-center rounded-full border border-dashed" aria-hidden>
                    <UserPlus className="size-4" />
                  </span>
                  {invitedName ? `${invitedName} · invited, waiting` : 'Open seat'}
                </li>
              )
            }
            return (
              <li key={p.userId} className="flex h-16 items-center gap-3 rounded-xl border bg-card px-4">
                <span
                  className="flex size-9 items-center justify-center rounded-full font-heading font-bold text-white uppercase"
                  style={{ backgroundColor: playerColor(joined, p.userId) }}
                  aria-hidden
                >
                  {p.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {p.name}
                  {p.userId === room.me && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {p.userId === room.hostId && <span className="rounded-[4px] bg-secondary px-1.5 text-xs font-bold">Host</span>}
              </li>
            )
          })}
        </ul>
      </section>

      {/* ---------- Invite ---------- */}
      <section aria-label="Invite" className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          disabled={full}
          className="flex h-11 items-center gap-2 rounded-lg border bg-card px-4 font-semibold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          <UserPlus className="size-5 text-primary" aria-hidden />
          Invite classmates
        </button>
        <button
          type="button"
          onClick={shareLink}
          disabled={full}
          className="flex h-11 items-center gap-2 rounded-lg border bg-card px-4 font-semibold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
        >
          {shared ? <Check className="size-5 text-correct" aria-hidden /> : <Send className="size-5 text-primary" aria-hidden />}
          {shared === 'copied' ? 'Link copied' : shared === 'shared' ? 'Sent' : 'Send invite link'}
        </button>
      </section>
      <p className="-mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Link2 className="size-3.5" aria-hidden />
        Game code <span className="font-mono font-bold tracking-widest text-foreground">{room.inviteCode}</span>
      </p>

      {/* ---------- Start (host) / waiting, and Leave ---------- */}
      <div className="flex flex-col items-center gap-2 border-t border-dashed pt-4">
        {isHost ? (
          <>
            <button type="button" onClick={() => act(() => teamActions.start(room.id))} disabled={busy || joined.length < 2} className={cn(heroButtonClass, 'w-auto px-8 focus-visible:ring-ring/50')}>
              <Play className="size-5 fill-current" aria-hidden />
              {busy ? 'Starting…' : 'Start game'}
            </button>
            <p className="text-xs text-muted-foreground">
              {joined.length < 2 ? 'At least 2 players to start.' : 'Everyone rolls for the turn order when you start.'}
            </p>
          </>
        ) : (
          <p className="font-heading text-lg font-bold text-muted-foreground">Waiting for the host…</p>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground outline-none hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          {isHost ? 'Cancel the game' : 'Leave the lobby'}
        </button>
      </div>

      {/* ---------- The classmate list ---------- */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} labelledBy="invite-heading" variant="sheet">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="invite-heading" className="font-heading text-xl font-bold">
                Invite classmates
              </h2>
              <p className="text-sm text-muted-foreground">Up to 3 invites waiting at a time. They’ll see it in Board Review.</p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(false)}
              aria-label="Close"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {classmates.isPending ? (
            <p className="text-sm text-muted-foreground">Loading classmates…</p>
          ) : classmates.isError ? (
            <p className="text-sm text-wrong">{classmates.error.message}</p>
          ) : (classmates.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No classmates with a first name yet. Send the invite link instead.</p>
          ) : (
            <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border bg-card">
              {(classmates.data ?? []).map((c) => {
                const state = joinedIds.has(c.userId) ? 'in' : invitedIds.has(c.userId) ? 'invited' : 'none'
                return (
                  <li key={c.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="truncate font-semibold">{c.name}</span>
                    {state === 'none' ? (
                      <button
                        type="button"
                        disabled={busy || full}
                        onClick={() => act(() => teamActions.invite(room.id, c.userId))}
                        className="h-9 shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-60"
                      >
                        Invite
                      </button>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold text-muted-foreground">{state === 'in' ? 'In the game' : 'Invited'}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">Only classmates who set a first name in Settings are listed. Anyone can join with the invite link.</p>
        </div>
      </Dialog>
    </div>
  )
}
