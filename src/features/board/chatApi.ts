// Board Review room chat (migration 0029): reading a room's messages live, sending, deleting,
// and remembering what she has already read (on this device).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { latestMessage, parseMessages, unreadCount, type ChatMessage } from '@/lib/boardChat'
import { supabase } from '@/lib/supabase'
import { teamErrorMessage } from './teamApi'

const seenKey = (roomId: string) => `board-chat-seen:${roomId}`

function readSeen(roomId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(roomId))
  } catch {
    return null
  }
}

export type RoomChat = {
  messages: ChatMessage[]
  /** true until the first read comes back */
  loading: boolean
  /** classmates' messages she hasn't looked at yet */
  unread: number
  /** she's looking at the chat: everything up to now counts as read */
  markRead: () => void
  send: (body: string) => Promise<boolean>
  remove: (messageId: string) => Promise<void>
  sending: boolean
  /** the last send or delete that failed, in words she can act on */
  error: string | null
}

/**
 * One room's chat, kept live: Supabase Realtime tells us when a message is sent or deleted and we read the list
 * again, with a refresh every 8 seconds as a fallback. Used once per room screen (TeamRoomPage) and passed down.
 */
export function useRoomChat(roomId: string | undefined, me: string | undefined): RoomChat {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['board-chat', roomId],
    enabled: Boolean(roomId),
    refetchInterval: 8_000,
    retry: false,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase.rpc('board_room_messages', { p_room: roomId! })
      if (error) throw new Error(teamErrorMessage(error))
      return parseMessages(data)
    },
  })

  useEffect(() => {
    if (!roomId) return
    const reload = () => void queryClient.invalidateQueries({ queryKey: ['board-chat', roomId] })
    const channel = supabase
      .channel(`board-chat-${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_messages', filter: `room_id=eq.${roomId}` }, reload)
      // Deletes can't be filtered by room (Realtime only sends the id), so any delete reads the list again.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_messages' }, reload)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, queryClient])

  const messages = query.data ?? []
  const [seenUpTo, setSeenUpTo] = useState<string | null>(() => (roomId ? readSeen(roomId) : null))
  const newest = latestMessage(messages)?.createdAt ?? null

  const markRead = useCallback(() => {
    if (!roomId || !newest || (seenUpTo && Date.parse(seenUpTo) >= Date.parse(newest))) return
    setSeenUpTo(newest)
    try {
      window.localStorage.setItem(seenKey(roomId), newest)
    } catch {
      // storage full or blocked: the count just resets next time
    }
  }, [roomId, newest, seenUpTo])

  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (body: string) => {
      if (!roomId) return false
      setSending(true)
      setError(null)
      const { error: e } = await supabase.rpc('board_send_message', { p_room: roomId, p_body: body })
      setSending(false)
      void queryClient.invalidateQueries({ queryKey: ['board-chat', roomId] })
      if (e) {
        setError(teamErrorMessage(e))
        return false
      }
      return true
    },
    [roomId, queryClient],
  )

  const remove = useCallback(
    async (messageId: string) => {
      setError(null)
      const { error: e } = await supabase.rpc('board_delete_message', { p_message: messageId })
      if (e) setError(teamErrorMessage(e))
      void queryClient.invalidateQueries({ queryKey: ['board-chat', roomId] })
    },
    [roomId, queryClient],
  )

  return {
    messages,
    loading: query.isPending,
    unread: me ? unreadCount(messages, me, seenUpTo) : 0,
    markRead,
    send,
    remove,
    sending,
    error,
  }
}

/**
 * A classmate's newest message, for a few seconds after it arrives (the bubble over the board).
 * Messages already there when the screen opened don't pop up. `paused` = the chat is open, no bubble needed.
 */
export function useNewMessageBubble(chat: RoomChat, me: string, paused: boolean, seconds = 4): ChatMessage | null {
  const newest = latestMessage(chat.messages)
  // the newest message once the first read came back: that one and older never pop up
  const baseline = useRef<string | null | undefined>(undefined)
  const [shown, setShown] = useState<ChatMessage | null>(null)

  useEffect(() => {
    if (chat.loading) return
    if (baseline.current === undefined) {
      baseline.current = newest?.id ?? null
      return
    }
    if (!newest || newest.id === baseline.current || newest.userId === me || paused) return
    setShown(newest)
    const timer = window.setTimeout(() => setShown(null), seconds * 1000)
    return () => window.clearTimeout(timer)
    // only when a new message arrives (or the first read comes back)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest?.id, chat.loading])

  useEffect(() => {
    if (paused) setShown(null)
  }, [paused])

  return shown
}
