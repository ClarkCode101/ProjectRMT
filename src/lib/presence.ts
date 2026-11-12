// Who has the app open right now (Supabase Realtime Presence). Nothing is saved in the database:
// each open app joins one shared channel and says "I'm here"; when the app closes (or the phone/iPad drops the
// connection, e.g. the tab is in the background for a while) Supabase removes her from the list by itself.
// Used by the Board Review invite list, so it only shows classmates who can answer the invite now.
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'

const CHANNEL = 'online-members'

// ---------- A tiny store: the set of user ids online, and who wants to hear when it changes ----------

let onlineIds: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()

function setOnline(next: ReadonlySet<string>) {
  onlineIds = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The user ids of everyone with the app open right now (including her own). */
export function useOnlineIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => onlineIds)
}

/**
 * Join the "online" channel while she's signed in. Call once, in the app layout (always on screen).
 * Quiet if it fails: the invite list then just shows nobody online, and the code still works.
 */
export function useAnnouncePresence(userId: string | null) {
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(CHANNEL, { config: { presence: { key: userId } } })
    channel
      .on('presence', { event: 'sync' }, () => {
        // presenceState() is keyed by the presence key we set above (her user id); one key per person,
        // even if she has the app open on two devices
        setOnline(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ online_at: new Date().toISOString() })
      })
    return () => {
      void supabase.removeChannel(channel)
      setOnline(new Set())
    }
  }, [userId])
}
