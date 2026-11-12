// Board Review team games: talking to the database (migration 0023). Every change goes through a database function,
// which checks who is calling; the screen only reads the room's state and shows it.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import type { LifelineId } from '@/lib/board'
import { parseTeamRoom, type TeamRoom } from '@/lib/boardTeam'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/authContext'
import { firstName } from '@/lib/profile'

/** What went wrong, in words she can act on. */
export function teamErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string } | null
  // The functions don't exist: the database update (migration 0023) hasn't been run yet.
  if (e?.code === 'PGRST202' || e?.code === '42883') return 'Team games aren’t ready yet. Try again later.'
  if (!navigator.onLine) return 'You’re offline. Team games need the internet.'
  // Our own messages from the database functions are written to be shown as they are.
  if (e?.message && e.code === 'P0001') return e.message
  return 'Something went wrong. Check your internet connection and try again.'
}

/** Runs a database function and throws a readable error. */
async function call<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(teamErrorMessage(error))
  return data
}

// ---------- Reading ----------

export type Classmate = { userId: string; name: string }
export type TeamInvite = { inviteId: string; roomId: string; fromName: string; players: number; createdAt: string }
export type MyTeamRoom = { roomId: string; status: string; myTurn: boolean; players: number }

/** She has no first name yet: team games ask for one first (TeamNameStep), since classmates see it. */
export function useNeedsTeamName(): boolean {
  return firstName(useAuth().session?.user) === null
}

/** Classmates to invite (accounts with a first name). */
export function useClassmates(enabled: boolean) {
  return useQuery({
    queryKey: ['board-classmates'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Classmate[]> =>
      ((await call(supabase.rpc('board_classmates'))) ?? []).map((c) => ({ userId: c.user_id, name: c.name })),
  })
}

/** Invites waiting for her, checked every 20 seconds (and when she comes back to the app). */
export function useMyInvites() {
  return useQuery({
    queryKey: ['board-invites'],
    refetchInterval: 20_000,
    retry: false,
    queryFn: async (): Promise<TeamInvite[]> =>
      ((await call(supabase.rpc('board_my_invites'))) ?? []).map((i) => ({
        inviteId: i.invite_id,
        roomId: i.room_id,
        fromName: i.from_name,
        players: i.players,
        createdAt: i.created_at,
      })),
  })
}

/** Her lobby or game that isn't over (at most one), checked every 20 seconds. */
export function useMyTeamRoom() {
  return useQuery({
    queryKey: ['board-my-room'],
    refetchInterval: 20_000,
    retry: false,
    queryFn: async (): Promise<MyTeamRoom | null> => {
      const rows = await call(supabase.rpc('board_my_room'))
      const r = rows?.[0]
      return r ? { roomId: r.room_id, status: r.status, myTurn: r.my_turn, players: r.players } : null
    },
  })
}

/**
 * For the red dot on the Board Review nav icon: an invite or her turn is waiting. Quiet if anything fails.
 * Used once, in the app layout (always on screen), so it also keeps the invites and "your turn" live.
 */
export function useBoardAlert(userId: string | null): boolean {
  const invites = useMyInvites()
  const room = useMyTeamRoom()
  useLiveBoardAlerts(userId)
  return (invites.data?.length ?? 0) > 0 || room.data?.myTurn === true
}

/**
 * Supabase Realtime: an invite sent to her, or a change in a game she's in (e.g. her turn), reads them again at once
 * instead of waiting for the 20-second check (which stays as a fallback if the live connection drops).
 * The database only sends rows she may read (RLS): her own invites, and rooms she's a player in.
 */
function useLiveBoardAlerts(userId: string | null) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`board-alerts-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_invites', filter: `to_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['board-invites'] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'board_rooms' }, () => {
        void queryClient.invalidateQueries({ queryKey: ['board-my-room'] })
        void queryClient.invalidateQueries({ queryKey: ['board-invites'] }) // e.g. a lobby started: its invite is gone
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}

/** Her answers in one finished team game, per subject code (migration 0030). Empty if she answered none. */
export function useMyGameAnswers(roomId: string) {
  return useQuery({
    queryKey: ['board-my-answers', roomId],
    staleTime: Infinity, // a finished game doesn't change
    retry: false,
    queryFn: async (): Promise<Record<string, { answered: number; correct: number }>> => {
      const rows = (await call(supabase.rpc('board_my_game_answers', { p_room: roomId }))) ?? []
      return Object.fromEntries(rows.map((r) => [r.subject_code, { answered: r.answered, correct: r.correct }]))
    },
  })
}

export type TeamRoomState = { room: TeamRoom; fetchedAt: number }

/**
 * One room, kept live: Supabase Realtime tells us when the room changes and we read it again, with a refresh every
 * 4 seconds as a fallback (e.g. if the live connection drops on a phone). `fetchedAt` is for the turn clock.
 */
export function useTeamRoom(roomId: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['board-room', roomId],
    enabled: Boolean(roomId),
    refetchInterval: 4_000,
    queryFn: async (): Promise<TeamRoomState | null> => {
      const room = parseTeamRoom(await call(supabase.rpc('board_room_state', { p_room: roomId! })))
      return room ? { room, fetchedAt: Date.now() } : null
    },
  })

  useEffect(() => {
    if (!roomId) return
    const channel = supabase
      .channel(`board-room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_rooms', filter: `id=eq.${roomId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ['board-room', roomId] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, queryClient])

  return query
}

// ---------- Changing (each one reads the room again afterwards) ----------

export const teamActions = {
  createRoom: () => call(supabase.rpc('board_create_room')),
  invite: (roomId: string, userId: string) => call(supabase.rpc('board_invite', { p_room: roomId, p_to: userId })),
  respondInvite: (inviteId: string, accept: boolean) => call(supabase.rpc('board_respond_invite', { p_invite: inviteId, p_accept: accept })),
  join: (code: string) => call(supabase.rpc('board_join', { p_code: code })),
  /** Same as join, from the code box: the database's "invite link isn't valid" becomes words about a typed code. */
  joinByCode: async (code: string) => {
    try {
      return await call(supabase.rpc('board_join', { p_code: code }))
    } catch (e) {
      if (e instanceof Error && e.message.includes('invite link')) {
        throw new Error('No game with that code. Check the letters, or ask the host for the code again.')
      }
      throw e
    }
  },
  leave: (roomId: string) => call(supabase.rpc('board_leave', { p_room: roomId })),
  /** The host removes a player from the lobby (migration 0039). They can come back with an invite or the code. */
  kick: (roomId: string, userId: string) => call(supabase.rpc('board_kick', { p_room: roomId, p_user: userId })),
  /** Play again from the finish screen: makes the next lobby, or joins it if someone already did. */
  rematch: (finishedRoomId: string) => call(supabase.rpc('board_rematch', { p_room: finishedRoomId })),
  /** Back to Board Review from the finish screen: "I'm done", so a later Play again won't invite her. */
  rematchDone: (finishedRoomId: string) => call(supabase.rpc('board_rematch_done', { p_room: finishedRoomId })),
  start: (roomId: string) => call(supabase.rpc('board_start', { p_room: roomId })),
  roll: (roomId: string) => call(supabase.rpc('board_roll', { p_room: roomId })),
  answer: (roomId: string, selectedIndex: number) => call(supabase.rpc('board_answer', { p_room: roomId, p_selected: selectedIndex })),
  skip: (roomId: string) => call(supabase.rpc('board_skip', { p_room: roomId })),
  /** Rule out 2, Second chance or Snake shield on her question (the database does it; migration 0032) */
  spendLifeline: (roomId: string, lifeline: LifelineId) => call(supabase.rpc('board_use_lifeline', { p_room: roomId, p_lifeline: lifeline })),
}

/**
 * Logging out = leaving her team lobby, like tapping Leave lobby, so the others don't wait on an empty seat
 * (a host passes the lobby on, or cancels it if alone). A game that already started is kept: she may be
 * switching devices, and the turn timer moves on without her. Best effort: never stops the logout.
 */
export async function leaveLobbyBeforeLogout() {
  try {
    const { data } = await supabase.rpc('board_my_room')
    const room = data?.[0]
    if (room?.status === 'lobby') await supabase.rpc('board_leave', { p_room: room.room_id })
  } catch {
    // offline or the call failed: log out anyway
  }
}

/** Read the room (and the start screen's lists) again right away. */
export function useRefreshTeam() {
  const queryClient = useQueryClient()
  // the same function every render, so effects that use it don't run again on each re-render
  return useCallback(
    (roomId?: string) => {
      if (roomId) void queryClient.invalidateQueries({ queryKey: ['board-room', roomId] })
      void queryClient.invalidateQueries({ queryKey: ['board-invites'] })
      void queryClient.invalidateQueries({ queryKey: ['board-my-room'] })
    },
    [queryClient],
  )
}
