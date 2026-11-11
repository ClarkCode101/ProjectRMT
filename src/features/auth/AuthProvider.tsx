import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAccess, readSavedAccess, rememberOAuthError, type AccessInfo } from '@/lib/access'
import { flushOutbox } from '@/lib/offline/outbox'
import { setOfflineUserId } from '@/lib/offline/storage'
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase'
import { AuthContext } from './authContext'

// A failed Google sign-in comes back as "...#error=...". Keep the reason before the address is cleaned up,
// so the login page can show it.
rememberOAuthError()

/**
 * The login saved on this device, read straight from storage.
 * Only used offline: a login expires after an hour and can't be renewed without internet,
 * but she should still be able to practice. It's renewed by itself once she's back online.
 */
function readSavedSession(): Session | null {
  try {
    const saved = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) ?? 'null') as Session | null
    return saved?.user?.id && saved.refresh_token ? saved : null
  } catch {
    return null
  }
}

/** Checks if she is already logged in (from a previous visit). */
async function loadSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (data.session) return data.session
  // "Retryable" = the server couldn't be reached (offline), not "logged out". Keep her in.
  if (error && isAuthRetryableFetchError(error)) return readSavedSession()
  return null
}

/** Keeps track of the logged-in session and shares it with the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // The server's answer to "may this account use the app?", kept with the account it belongs to.
  const [checked, setChecked] = useState<{ userId: string; info: AccessInfo } | null>(null)
  const userId = session?.user.id ?? null

  useEffect(() => {
    function apply(next: Session | null) {
      // The offline storage keeps each account's saved questions and answers apart.
      setOfflineUserId(next?.user.id ?? null)
      setSession(next)
    }

    // 1. Check if there is a saved session from a previous visit.
    void loadSession().then((saved) => {
      apply(saved)
      setLoading(false)
    })

    // 2. Listen for login / logout / token refresh from now on.
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Step 1 already handles the first check (and keeps her in when offline), so skip it here.
      if (event === 'INITIAL_SESSION') return
      apply(newSession)
      // Logged in again or the login was renewed (e.g. back online): send answers that were waiting.
      if (newSession) void flushOutbox()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const recheckAccess = useCallback(async () => {
    if (!userId) return
    const info = await loadAccess(userId)
    setChecked({ userId, info })
  }, [userId])

  // Ask once for each account that logs in.
  useEffect(() => {
    if (!userId) return
    let stale = false
    void loadAccess(userId).then((info) => {
      if (!stale) setChecked({ userId, info })
    })
    return () => {
      stale = true
    }
  }, [userId])

  const access = useMemo(() => {
    if (!userId) return null
    if (checked?.userId === userId) return checked.info
    // Not answered yet: a member who was approved last time goes straight in (and it's checked again
    // in the background). Anyone else waits for the answer.
    const saved = readSavedAccess(userId)
    return saved?.status === 'approved' ? saved : null
  }, [userId, checked])

  return <AuthContext.Provider value={{ session, loading, access, recheckAccess }}>{children}</AuthContext.Provider>
}
