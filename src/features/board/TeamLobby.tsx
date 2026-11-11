import { Check, Copy, Link2, LogOut, Play, UserPlus, X } from 'lucide-react'
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
  const [linkCopied, setLinkCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const classmates = useClassmates(inviteOpen)
  const isHost = room.hostId === room.me
  const joined = room.players.filter((p) => p.status === 'joined')
  const full = joined.length >= MAX_PLAYERS
  const needPlayers = joined.length < 2 // a game needs 2; until then inviting is the focus, not Start
  const invitedIds = new Set(room.invited.map((i) => i.userId))
  const joinedIds = new Set(joined.map((p) => p.userId))
  const link = inviteLink(window.location.origin, room.inviteCode)

  /** Copy the invite link to paste in the group chat; "Link copied" shows for 2 seconds. */
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setLinkCopied(true)
      window.setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      window.prompt('Copy this link and send it to your classmates:', link)
    }
  }

  /** Copy just the code; "Code copied" shows for 2 seconds. */
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.inviteCode)
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      window.prompt('Copy this game code and send it to your classmates:', room.inviteCode)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Team game" subtitle="Up to 4 players, live." />

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
              if (invitedName) {
                return (
                  <li key={`empty-${i}`} className="flex h-16 items-center gap-3 rounded-xl border border-dashed px-4 text-muted-foreground">
                    <span className="flex size-9 items-center justify-center rounded-full border border-dashed" aria-hidden>
                      <UserPlus className="size-4" />
                    </span>
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-foreground">{invitedName}</span> · invited, waiting
                    </span>
                  </li>
                )
              }
              // Every open seat opens the classmate list; only the first one says so, so the words aren't repeated.
              const firstOpen = i === joined.length + room.invited.length
              return (
                <li key={`empty-${i}`}>
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    aria-label="Open seat. Invite a classmate."
                    className={cn(
                      'flex h-16 w-full items-center gap-3 rounded-xl border border-dashed px-4 text-left text-muted-foreground outline-none hover:border-primary/60 hover:bg-card hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40',
                      firstOpen && 'font-semibold',
                    )}
                  >
                    <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-current" aria-hidden>
                      <UserPlus className="size-4" />
                    </span>
                    {firstOpen ? 'Invite a classmate' : 'Open seat'}
                  </button>
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

      {/* ---------- Invite with code: the code is the main way; the link is the backup. Seats above open the list. ----------
          Stands out while she still needs players; quiets down once 2 are in, so Start takes the focus. */}
      {!full && (
        <section
          aria-labelledby="lobby-invite-heading"
          className={cn(
            'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
            needPlayers ? 'border-primary/50 bg-card shadow-sm' : 'border-dashed',
          )}
        >
          <div>
            <h2 id="lobby-invite-heading" className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Invite with code
            </h2>
            {/* tap to copy it, e.g. to paste in the group chat */}
            <button
              type="button"
              onClick={copyCode}
              aria-label={`${room.inviteCode.split('').join(' ')}. Tap to copy.`}
              className="group -ml-2 flex items-center gap-2 rounded-lg px-2 py-1 outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px"
            >
              <span className={cn('font-mono font-bold tracking-widest', needPlayers ? 'text-2xl' : 'text-xl')}>{room.inviteCode}</span>
              <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-primary" aria-live="polite">
                {codeCopied ? (
                  <>
                    <Check className="size-4 text-correct" aria-hidden />
                    Copied
                  </>
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={copyLink}
            aria-live="polite"
            className="flex h-10 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            {linkCopied ? <Check className="size-4 text-correct" aria-hidden /> : <Link2 className="size-4 text-primary" aria-hidden />}
            {linkCopied ? 'Link copied' : 'Copy link'}
          </button>
        </section>
      )}

      {/* ---------- Bottom bar: Leave on the left, Start (host) or waiting on the right ---------- */}
      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onLeave}
          className="flex h-12 items-center justify-center gap-2 self-stretch rounded-lg border bg-card px-5 font-semibold text-muted-foreground outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40 sm:self-start"
        >
          {isHost ? <X className="size-5" aria-hidden /> : <LogOut className="size-5" aria-hidden />}
          {isHost ? 'Cancel game' : 'Leave lobby'}
        </button>
        {isHost ? (
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <button type="button" onClick={() => act(() => teamActions.start(room.id))} disabled={busy || needPlayers} className={cn(heroButtonClass, 'px-8 focus-visible:ring-ring/50')}>
              <Play className="size-5 fill-current" aria-hidden />
              {busy ? 'Starting…' : 'Start game'}
            </button>
            {needPlayers && <p className="text-center text-xs text-muted-foreground sm:text-right">Need 1 more player to start.</p>}
          </div>
        ) : (
          <p className="text-center font-heading text-lg font-bold text-muted-foreground sm:text-right">Waiting for the host to start…</p>
        )}
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
