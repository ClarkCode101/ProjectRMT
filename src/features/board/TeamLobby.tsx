import { Check, Copy, Link2, LogOut, Play, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/dashboard'
import { Dialog } from '@/components/Dialog'
import { heroButtonClass } from '@/components/report'
import { inviteLink, playerColor, type TeamRoom } from '@/lib/boardTeam'
import { cn } from '@/lib/utils'
import type { RoomChat as RoomChatState } from './chatApi'
import { ChatSheet, RoomChat } from './RoomChat'
import { teamActions, useClassmates } from './teamApi'

const MAX_PLAYERS = 4
/** invites waiting at a time per person (board_invite, migration 0023) */
const MAX_WAITING_INVITES = 3

/** One seat: a wide row on phones and iPad portrait, a small upright card (avatar over name) from 1024px. */
const seatClass = 'flex h-16 items-center gap-3 rounded-xl border px-4 lg:h-auto lg:flex-col lg:justify-center lg:gap-1.5 lg:px-2 lg:py-3 lg:text-center'

type Props = {
  room: TeamRoom
  /** run a database change, then read the room again; returns false if it failed (the message is shown) */
  act: (action: () => Promise<unknown>) => Promise<boolean>
  busy: boolean
  onLeave: () => void
  chat: RoomChatState
}

/** The lobby: who's in, invite classmates (list or link), the room chat, and the host's Start. Laid out like the other start screens. */
export function TeamLobby({ room, act, busy, onLeave, chat }: Props) {
  const [inviteOpen, setInviteOpen] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const classmates = useClassmates(inviteOpen)
  const isHost = room.hostId === room.me
  const hostName = room.players.find((p) => p.userId === room.hostId)?.name ?? 'the host'
  const joined = room.players.filter((p) => p.status === 'joined')
  const full = joined.length >= MAX_PLAYERS
  const needPlayers = joined.length < 2 // a game needs 2; until then inviting is the focus, not Start
  // the host leaving closes the lobby only when nobody else is in (otherwise the host passes on)
  const cancels = isHost && joined.length <= 1
  // invites waiting in this lobby (the database also counts her invites in other lobbies, and says so if over)
  const invitesFull = room.invited.length >= MAX_WAITING_INVITES
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [chatSheetOpen, setChatSheetOpen] = useState(false)
  const chatColor = (userId: string) => playerColor(joined, userId)

  /** Invite from the list; a failure (e.g. the 3-invite limit) shows inside the popup, where she's looking. */
  function inviteClassmate(userId: string) {
    setInviteError(null)
    void act(async () => {
      try {
        await teamActions.invite(room.id, userId)
      } catch (e) {
        setInviteError(e instanceof Error ? e.message : 'Couldn’t send the invite.')
      }
    })
  }
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
    // Tablets and computers: one screen, no page scroll (like Mock exam's start screen); the chat takes the space left.
    // Very short windows (under 36rem) scroll the page instead of squeezing the chat.
    <div className="mx-auto flex max-w-3xl flex-col gap-5 md:h-[calc(100dvh-2.5rem)] md:min-h-144">
      {/* ---------- Title on the left; invite with code in the space beside it (top right), so the chat gets the room ----------
          The code is the main way, the link the backup; the seats below open the classmate list. The box stands out
          while she still needs players and quiets down once 2 are in, so Start takes the focus. Hidden when full. */}
      <PageHeader
        title="Team game"
        subtitle="Up to 4 players, live."
        actions={
          !full && (
            <section
              aria-labelledby="lobby-invite-heading"
              className={cn(
                'flex items-center gap-4 rounded-xl border py-2.5 pr-2.5 pl-4',
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
                  className="group -ml-1.5 flex items-center gap-2 rounded-lg px-1.5 outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px"
                >
                  <span className="font-mono text-xl font-bold tracking-widest">{room.inviteCode}</span>
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
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border bg-card px-3.5 text-sm font-semibold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                {linkCopied ? <Check className="size-4 text-correct" aria-hidden /> : <Link2 className="size-4 text-primary" aria-hidden />}
                {linkCopied ? 'Link copied' : 'Copy link'}
              </button>
            </section>
          )
        }
      />

      {/* ---------- Who's in: four seats ---------- */}
      <section aria-labelledby="lobby-players-heading" className="space-y-2">
        <h2 id="lobby-players-heading" className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          Players · {joined.length} of {MAX_PLAYERS}
        </h2>
        {/* Phones and iPad portrait: 2 × 2 wide cards. iPad landscape and computers: one row of 4 small upright
            cards (avatar on top, name under it), so the whole lobby fits on the screen without scrolling. */}
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = joined[i]
            if (!p) {
              const invitedName = room.invited[i - joined.length]?.name
              if (invitedName) {
                return (
                  <li key={`empty-${i}`} className={cn(seatClass, 'border-dashed text-muted-foreground')}>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed" aria-hidden>
                      <UserPlus className="size-4" />
                    </span>
                    <span className="min-w-0 truncate lg:max-w-full lg:text-sm">
                      <span className="font-semibold text-foreground">{invitedName}</span>
                      <span className="lg:hidden"> · invited, waiting</span>
                      <span className="hidden lg:block lg:text-xs">Invited, waiting</span>
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
                      seatClass,
                      'w-full border-dashed text-left text-muted-foreground outline-none hover:border-primary/60 hover:bg-card hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40 lg:h-full',
                      firstOpen && 'font-semibold',
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-current" aria-hidden>
                      <UserPlus className="size-4" />
                    </span>
                    <span className="min-w-0 truncate lg:max-w-full lg:text-sm">{firstOpen ? 'Invite a classmate' : 'Open seat'}</span>
                  </button>
                </li>
              )
            }
            return (
              <li key={p.userId} className={cn(seatClass, 'relative bg-card')}>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full font-heading font-bold text-white uppercase"
                  style={{ backgroundColor: playerColor(joined, p.userId) }}
                  aria-hidden
                >
                  {p.name.charAt(0)}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold lg:max-w-full lg:flex-none lg:text-sm">
                  {p.name}
                  {p.userId === room.me && <span className="text-muted-foreground"> (you)</span>}
                </span>
                {p.userId === room.hostId && (
                  <span className="rounded-[4px] bg-secondary px-1.5 text-xs font-bold lg:absolute lg:top-1.5 lg:right-1.5">Host</span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {/* ---------- Room chat (migration 0029) ---------- */}
      {/* phones: the latest 3 only, older ones in the sheet; tablets and computers: fills the space left and scrolls inside */}
      <RoomChat
        chat={chat}
        me={room.me}
        moment="lobby"
        colorOf={chatColor}
        headingId="lobby-chat-heading"
        className="rounded-xl border bg-card p-4 md:min-h-48 md:flex-1"
        compactLimit={3}
        onSeeAll={() => setChatSheetOpen(true)}
      />
      <ChatSheet
        open={chatSheetOpen}
        onClose={() => setChatSheetOpen(false)}
        chat={chat}
        me={room.me}
        moment="lobby"
        colorOf={chatColor}
        headingId="lobby-chat-sheet-heading"
      />

      {/* ---------- Bottom bar: Leave on the left, Start (host) or waiting on the right ----------
          On tablets and computers the page fits the screen, so this is always at the bottom, in thumb reach. */}
      <div className="flex shrink-0 flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onLeave}
          className="flex h-12 items-center justify-center gap-2 self-stretch rounded-lg border bg-card px-5 font-semibold text-muted-foreground outline-none hover:border-wrong/60 hover:text-wrong focus-visible:ring-3 focus-visible:ring-ring/40 sm:self-start"
        >
          {/* The host alone cancels the lobby; with others in, the host passes to the next player (migration 0031). */}
          {cancels ? <X className="size-5" aria-hidden /> : <LogOut className="size-5" aria-hidden />}
          {cancels ? 'Cancel game' : 'Leave lobby'}
        </button>
        {isHost ? (
          <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
            <button type="button" onClick={() => act(() => teamActions.start(room.id))} disabled={busy || needPlayers} className={cn(heroButtonClass, 'px-8 focus-visible:ring-ring/50')}>
              <Play className="size-5 fill-current" aria-hidden />
              {busy ? 'Starting…' : 'Start game'}
            </button>
            {/* After Play again the host is whoever tapped first, so say it plainly */}
            <p className="text-center text-xs text-muted-foreground sm:text-right" aria-live="polite">
              {needPlayers ? 'Need 1 more player to start.' : 'You’re the host. Tap Start when everyone’s in.'}
            </p>
          </div>
        ) : (
          <p className="text-center font-heading text-lg font-bold text-muted-foreground sm:text-right" aria-live="polite">
            Waiting for {hostName} to start…
          </p>
        )}
      </div>

      {/* ---------- The classmate list ---------- */}
      {/* Only the X (or Esc) closes it, like the Play with classmates sheet */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} labelledBy="invite-heading" variant="sheet" closeOnBackdrop={false}>
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id="invite-heading" className="font-heading text-xl font-bold">
              Invite classmates
            </h2>
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
            <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">No classmates with a first name yet. Share the code below instead.</p>
          ) : (
            <ul className="max-h-[50dvh] divide-y overflow-y-auto rounded-lg border bg-card">
              {(classmates.data ?? []).map((c) => {
                const state = joinedIds.has(c.userId) ? 'in' : invitedIds.has(c.userId) ? 'invited' : 'none'
                return (
                  <li key={c.userId} className="flex items-center gap-3 px-4 py-2.5">
                    {/* the same initial circle as the seats; a player's own color once they're in */}
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full font-heading font-bold uppercase',
                        state === 'in' ? 'text-white' : 'bg-secondary text-muted-foreground',
                      )}
                      style={state === 'in' ? { backgroundColor: playerColor(joined, c.userId) } : undefined}
                      aria-hidden
                    >
                      {c.name.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                    {state === 'none' ? (
                      <button
                        type="button"
                        disabled={busy || full || invitesFull}
                        onClick={() => inviteClassmate(c.userId)}
                        className="h-9 shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
                      >
                        Invite
                      </button>
                    ) : state === 'invited' ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-correct-soft px-2.5 py-1 text-sm font-bold text-correct">
                        <Check className="size-4" aria-hidden />
                        Invited
                      </span>
                    ) : (
                      <span className="shrink-0 text-sm font-semibold text-muted-foreground">In the game</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {inviteError && (
            <p role="alert" className="rounded-md border border-wrong/40 bg-wrong-soft p-3 text-sm">
              {inviteError}
            </p>
          )}
          {/* the 3-invite limit, only once it matters */}
          {room.invited.length > 0 && (
            <p className="text-right text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {invitesFull ? `${MAX_WAITING_INVITES} of ${MAX_WAITING_INVITES} invites used. Wait for an answer to invite more.` : `${room.invited.length} of ${MAX_WAITING_INVITES} invites used`}
            </p>
          )}

          {/* for anyone not on the list (no first name yet): the code itself, ready to copy */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-sm">
            <span className="text-muted-foreground">Not on the list? Share the code</span>
            <button
              type="button"
              onClick={copyCode}
              aria-label={`${room.inviteCode.split('').join(' ')}. Tap to copy.`}
              className="group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <span className="font-mono font-bold tracking-widest">{room.inviteCode}</span>
              {codeCopied ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-correct">
                  <Check className="size-4" aria-hidden />
                  Copied
                </span>
              ) : (
                <Copy className="size-4 text-muted-foreground group-hover:text-primary" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
