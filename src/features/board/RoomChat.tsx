import { MessageCircle, Send, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/Dialog'
import {
  CHAT_HOURS,
  MAX_MESSAGE_LENGTH,
  QUICK_REPLIES,
  canSendMessage,
  cleanMessage,
  messageAgo,
  startsGroup,
  type ChatMessage,
  type ChatMoment,
} from '@/lib/boardChat'
import { cn } from '@/lib/utils'
import type { RoomChat as RoomChatState } from './chatApi'

type Props = {
  chat: RoomChatState
  me: string
  /** which quick replies to offer */
  moment: ChatMoment
  /** a player's token color, for the dot by their name */
  colorOf: (userId: string) => string
  headingId: string
  /** the heading is shown on the page; in the game's sheet it's the sheet's title */
  className?: string
  /** height of the scrolling message list, e.g. "max-h-64" (not used with compactLimit) */
  listClassName?: string
  /**
   * The lobby's card. Phones: only the latest few messages and "See all N messages" (onSeeAll opens the chat
   * sheet), so the page doesn't grow with the chat. Tablets and computers: the page fits the screen, and the
   * message list fills the card's space and scrolls (give the section flex-1 min-h-0 from md).
   */
  compactLimit?: number
  onSeeAll?: () => void
  /** put the cursor in the text box when it opens (the game's sheet) */
  autoFocus?: boolean
}

/**
 * The room chat: messages (oldest first, newest at the bottom), quick replies that fit the moment, and a text box.
 * Used as a compact card in the lobby, and inside the chat sheet (game, and the lobby's "See all").
 * Messages from one person close together share one "Name · time" line, like Messenger.
 * While it's on screen, every message counts as read.
 */
export function RoomChat({ chat, me, moment, colorOf, headingId, className, listClassName = 'max-h-64', compactLimit, onSeeAll, autoFocus = false }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const { markRead } = chat

  // Delete is hidden until she taps one of her own messages; a tap anywhere else hides it again.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedId) return
    function onPointerDown(e: PointerEvent) {
      if (!(e.target instanceof Element) || !e.target.closest(`[data-message-id="${selectedId}"]`)) setSelectedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [selectedId])

  // On screen = read; and keep the newest message in view.
  useEffect(() => {
    markRead()
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [chat.messages.length, markRead])

  async function sendTyped() {
    if (!canSendMessage(text) || chat.sending) return
    if (await chat.send(cleanMessage(text))) setText('')
  }

  // compact (lobby): on phones only the messages from this index on show
  const messages = chat.messages
  const phoneFirst = compactLimit === undefined ? 0 : Math.max(0, messages.length - compactLimit)

  const left = MAX_MESSAGE_LENGTH - cleanMessage(text).length
  // for "5 min" next to each message: the time, updated every 30 seconds
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
          <MessageCircle className="size-3.5" aria-hidden />
          Chat
        </h2>
        <p className="text-xs text-muted-foreground">Messages clear after {CHAT_HOURS} hours</p>
      </div>

      {chat.loading || chat.messages.length === 0 ? (
        // In the lobby on tablets and computers this fills the card, so the quick replies and the text box
        // stay at the bottom (where they'll be once messages come), not floating under the heading.
        <p
          className={cn(
            'rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground',
            compactLimit !== undefined && 'md:flex md:min-h-0 md:flex-1 md:items-center md:justify-center md:text-center',
          )}
        >
          {chat.loading ? 'Loading messages…' : 'No messages yet. Say hi, or tap a quick reply.'}
        </p>
      ) : (
        <div
          ref={listRef}
          className={cn(
            'flex flex-col gap-2',
            compactLimit === undefined
              ? ['overflow-y-auto overscroll-contain pr-1 scrollbar-thin', listClassName]
              : 'md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain md:pr-1 md:scrollbar-thin',
          )}
        >
          {phoneFirst > 0 && onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              className="self-center rounded-full px-3 py-1 text-sm font-semibold text-primary outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40 md:hidden"
            >
              See all {messages.length} messages
            </button>
          )}
          <ol aria-label="Messages" aria-live="polite" className="mt-auto">
            {messages.map((m, i) => (
              <MessageRow
                key={m.id}
                message={m}
                mine={m.userId === me}
                color={colorOf(m.userId)}
                ago={messageAgo(m.createdAt, now)}
                // phones (compact): older messages are behind "See all"
                phoneHidden={i < phoneFirst}
                // the first one shown always says who it's from, even mid-group (on phones that's phoneFirst)
                showHeader={i === 0 || startsGroup(messages[i - 1], m) ? 'always' : i === phoneFirst ? 'phone' : 'never'}
                selected={selectedId === m.id}
                onSelect={() => setSelectedId((id) => (id === m.id ? null : m.id))}
                onDelete={() => {
                  setSelectedId(null)
                  void chat.remove(m.id)
                }}
              />
            ))}
          </ol>
        </div>
      )}

      {/* quick replies: one tap sends */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Quick replies">
        {QUICK_REPLIES[moment].map((reply) => (
          <button
            key={reply}
            type="button"
            disabled={chat.sending}
            onClick={() => void chat.send(reply)}
            className="h-9 rounded-full border bg-card px-3.5 text-sm font-semibold outline-none hover:border-primary/60 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
          >
            {reply}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void sendTyped()
        }}
      >
        <label htmlFor={`${headingId}-input`} className="sr-only">
          Message
        </label>
        <input
          id={`${headingId}-input`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_MESSAGE_LENGTH + 20}
          placeholder="Type a message"
          autoComplete="off"
          enterKeyHint="send"
          autoFocus={autoFocus}
          // 16px text, so iPad and iPhone don't zoom in
          className="h-11 min-w-0 flex-1 rounded-lg border bg-card px-3.5 text-base outline-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40"
        />
        <button
          type="submit"
          disabled={!canSendMessage(text) || chat.sending}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-40"
        >
          <Send className="size-5" aria-hidden />
        </button>
      </form>
      {/* the count only shows near the limit */}
      {left < 30 && (
        <p className={cn('-mt-1.5 text-right text-xs tabular-nums', left < 0 ? 'font-semibold text-wrong' : 'text-muted-foreground')} aria-live="polite">
          {left < 0 ? `${-left} characters over the limit` : `${left} characters left`}
        </p>
      )}
      {chat.error && (
        <p role="alert" className="rounded-md border border-wrong/40 bg-wrong-soft p-2.5 text-sm">
          {chat.error}
        </p>
      )}
    </section>
  )
}

type MessageRowProps = {
  message: ChatMessage
  mine: boolean
  color: string
  ago: string
  /** first of a group: the "Name · time" line and a bit more space above ('phone' = only on phones) */
  showHeader: 'always' | 'phone' | 'never'
  /** the lobby on phones: hidden behind "See all" */
  phoneHidden?: boolean
  /** her own message, tapped: Delete shows under it */
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}

/**
 * One message. Classmates' messages are plain text. Her own bubble is a button: tapping it shows Delete under it
 * (like Messenger), so there's no row of trash icons, and only her own messages ever offer it.
 */
function MessageRow({ message, mine, color, ago, showHeader, phoneHidden = false, selected, onSelect, onDelete }: MessageRowProps) {
  const bubbleClass = 'max-w-[85%] rounded-2xl px-3.5 py-2 text-left text-[15px] leading-snug break-words'
  const who = mine ? 'You' : message.name
  return (
    <li
      data-message-id={message.id}
      className={cn(
        'flex flex-col gap-0.5 first:mt-0',
        mine ? 'items-end' : 'items-start',
        showHeader === 'always' ? 'mt-3' : showHeader === 'phone' ? 'mt-1 max-md:mt-0' : 'mt-1',
        phoneHidden && 'max-md:hidden',
      )}
    >
      {showHeader !== 'never' && (
        <span className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', showHeader === 'phone' && 'md:hidden')}>
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span className="font-semibold text-foreground">{who}</span>
          <span aria-hidden>·</span>
          <span>{ago}</span>
        </span>
      )}
      {/* the name isn't repeated on screen mid-group, but a screen reader still hears who said it */}
      {showHeader !== 'always' && <span className={cn('sr-only', showHeader === 'phone' && 'max-md:hidden')}>{who}:</span>}
      {mine ? (
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={selected}
          aria-label={`${message.body}. Your message, tap for options.`}
          className={cn(
            bubbleClass,
            'rounded-br-md bg-primary/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
            selected && 'bg-primary/20 ring-2 ring-primary/40',
          )}
        >
          {message.body}
        </button>
      ) : (
        <span className={cn(bubbleClass, 'rounded-bl-md border bg-card')}>{message.body}</span>
      )}
      {mine && selected && (
        <button
          type="button"
          onClick={onDelete}
          autoFocus
          className="animate-in fade-in slide-in-from-top-1 mt-1 flex h-9 items-center gap-1.5 rounded-full border border-wrong/40 bg-card px-3.5 text-sm font-semibold text-wrong outline-none duration-150 hover:bg-wrong-soft focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </button>
      )}
    </li>
  )
}

/** The full chat as a bottom sheet: in the game (button left of Roll) and from the lobby's "See all". Only X or Esc closes it. */
export function ChatSheet({
  open,
  onClose,
  headingId,
  ...chatProps
}: { open: boolean; onClose: () => void } & Pick<Props, 'chat' | 'me' | 'moment' | 'colorOf' | 'headingId'>) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy={headingId} variant="bottom" closeOnBackdrop={false}>
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="absolute -top-1 right-0 flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <X className="size-5" aria-hidden />
        </button>
        {open && <RoomChat {...chatProps} headingId={headingId} className="[&>div:first-child]:pr-11" listClassName="max-h-[45dvh]" />}
      </div>
    </Dialog>
  )
}

/** One message as a small bubble (over the board, or inside the question popup). */
export function ChatBubble({ message, color, className }: { message: ChatMessage; color: string; className?: string }) {
  return (
    <p className={cn('flex max-w-full items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm shadow-md', className)} role="status">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">
        <span className="font-semibold">{message.name}:</span> {message.body}
      </span>
    </p>
  )
}

/**
 * Inside the question popup, where nothing else can sit on top: the newest classmate message, and for those
 * watching, one row of cheering quick replies (no typing, so the question stays the focus).
 */
export function PopupChatRow({ chat, me, watching, colorOf }: { chat: RoomChatState; me: string; watching: boolean; colorOf: (userId: string) => string }) {
  const bubble = useLatestFromOthers(chat, me)
  if (!bubble && !watching) return null
  return (
    <div className="space-y-2 border-t pt-3">
      {bubble && <ChatBubble message={bubble} color={colorOf(bubble.userId)} className="shadow-none" />}
      {watching && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cheer them on">
          {QUICK_REPLIES.watching.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={chat.sending}
              onClick={() => void chat.send(reply)}
              className="h-9 rounded-full border bg-card px-3.5 text-sm font-semibold outline-none hover:border-primary/60 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      )}
      {chat.error && <p className="text-sm text-wrong">{chat.error}</p>}
    </div>
  )
}

/** A classmate's message sent in the last minute (shown inside the popup). */
function useLatestFromOthers(chat: RoomChatState, me: string): ChatMessage | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(timer)
  }, [])
  const latest = [...chat.messages].reverse().find((m) => m.userId !== me)
  return latest && now - Date.parse(latest.createdAt) < 60_000 ? latest : null
}
