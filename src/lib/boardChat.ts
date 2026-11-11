// Board Review room chat (PROJECT_PLAN.md §14, Step 3; migration 0029): the quick replies, tidying a typed message,
// reading the database's rows, and counting what she hasn't read yet. Pure logic, easy to unit test.

/** The most characters in one message (the database checks it too). */
export const MAX_MESSAGE_LENGTH = 200

/** Messages show only while under this many hours old (the database hides and deletes older ones). */
export const CHAT_HOURS = 5

export type ChatMessage = { id: string; userId: string; name: string; body: string; createdAt: string }

/** Where the chat is open: each moment gets quick replies that fit it. */
export type ChatMoment = 'lobby' | 'game' | 'watching'

export const QUICK_REPLIES: Record<ChatMoment, readonly string[]> = {
  lobby: ['Ready!', 'Let’s start!', 'Wait for me', 'Inviting one more'],
  game: ['Your turn!', 'Help me with this one', 'Nice save!', 'Good luck!'],
  // watching a classmate's question: cheering only, so the question stays the focus
  watching: ['You got this!', 'Take your time', 'Good luck!'],
}

/** A typed message as it will be sent: spaces tidied (like the database does). Empty = nothing to send. */
export function cleanMessage(typed: string): string {
  return typed.replace(/\s+/g, ' ').trim()
}

/** True when the typed text can be sent: something to say, and not over the limit. */
export function canSendMessage(typed: string): boolean {
  const clean = cleanMessage(typed)
  return clean.length > 0 && clean.length <= MAX_MESSAGE_LENGTH
}

/** The database's rows as the app uses them; anything odd is skipped, never a crash. */
export function parseMessages(rows: unknown): ChatMessage[] {
  if (!Array.isArray(rows)) return []
  return rows.flatMap((r) => {
    if (typeof r !== 'object' || r === null) return []
    const o = r as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.user_id !== 'string' || typeof o.body !== 'string') return []
    return [
      {
        id: o.id,
        userId: o.user_id,
        name: typeof o.name === 'string' && o.name ? o.name : 'A classmate',
        body: o.body,
        createdAt: typeof o.created_at === 'string' ? o.created_at : new Date(0).toISOString(),
      },
    ]
  })
}

/** Messages from classmates (not her own) sent after she last looked. */
export function unreadCount(messages: readonly ChatMessage[], me: string, seenUpTo: string | null): number {
  const seen = seenUpTo ? Date.parse(seenUpTo) : -Infinity
  return messages.filter((m) => m.userId !== me && Date.parse(m.createdAt) > seen).length
}

/** Messages from one person this close together share one "Name · time" line, like Messenger. */
export const GROUP_GAP_MS = 5 * 60_000

/** True when this message starts a new group: the first one, another sender, or 5+ minutes after the one before. */
export function startsGroup(previous: ChatMessage | undefined, message: ChatMessage): boolean {
  if (!previous || previous.userId !== message.userId) return true
  const gap = Date.parse(message.createdAt) - Date.parse(previous.createdAt)
  return !Number.isFinite(gap) || gap >= GROUP_GAP_MS
}

/** The newest message, or undefined. */
export function latestMessage(messages: readonly ChatMessage[]): ChatMessage | undefined {
  return messages[messages.length - 1]
}

/** "now", "5 min", "2 hr" since a message was sent. */
export function messageAgo(createdAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(createdAt)) / 60_000)
  if (!Number.isFinite(minutes) || minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} hr`
}
