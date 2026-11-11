import { supabase } from './supabase'

// Access = "may this account use the app?" (migration 0033).
// Anyone can create an account with Google, but the admin must accept it first.
// The real lock is in the database; this file only asks for the answer so the app can show the right screen.

export type AccessStatus = 'pending' | 'approved' | 'declined'

export type AccessInfo = {
  status: AccessStatus
  isAdmin: boolean
  /** ISO time she first signed in (when the request was made), or null if unknown */
  requestedAt: string | null
}

/** Used when the server can't be asked and nothing is saved: let her in. The database still decides what she gets. */
export const ASSUMED_ACCESS: AccessInfo = { status: 'approved', isAdmin: false, requestedAt: null }

/** Reads the server's (or the saved) answer. Null when it isn't a shape we know. */
export function parseAccess(value: unknown): AccessInfo | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const status = row.status
  if (status !== 'pending' && status !== 'approved' && status !== 'declined') return null
  return {
    status,
    isAdmin: status === 'approved' && row.is_admin === true,
    requestedAt: typeof row.requested_at === 'string' ? row.requested_at : null,
  }
}

const cacheKey = (userId: string) => `projectrmt:access:${userId}`

/** The answer saved on this device the last time it was online (each account has its own). */
export function readSavedAccess(userId: string): AccessInfo | null {
  try {
    return parseAccess(JSON.parse(localStorage.getItem(cacheKey(userId)) ?? 'null'))
  } catch {
    return null
  }
}

function saveAccess(userId: string, info: AccessInfo) {
  try {
    localStorage.setItem(
      cacheKey(userId),
      JSON.stringify({ status: info.status, is_admin: info.isAdmin, requested_at: info.requestedAt }),
    )
  } catch {
    // storage blocked: we just ask again next time
  }
}

/**
 * Asks the server for this account's status. No internet (or the server can't answer): the answer saved on
 * this device, so an approved member can still practice offline.
 */
export async function loadAccess(userId: string): Promise<AccessInfo> {
  try {
    const { data, error } = await supabase.rpc('my_access')
    if (error) throw error
    const info = parseAccess(data)
    if (!info) throw new Error('Unexpected answer from my_access')
    saveAccess(userId, info)
    return info
  } catch {
    return readSavedAccess(userId) ?? ASSUMED_ACCESS
  }
}

/* ---------------------------------- Admin ---------------------------------- */

export type Member = {
  userId: string
  email: string
  /** the name on their account, or null if they haven't set one */
  name: string | null
  status: AccessStatus
  isAdmin: boolean
  requestedAt: string
}

/** Everyone with an account, newest request first. Admin only (the database refuses anyone else). */
export async function listMembers(): Promise<Member[]> {
  const { data, error } = await supabase.rpc('list_members')
  if (error) throw error
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    name: row.name,
    status: row.status,
    isAdmin: row.is_admin,
    requestedAt: row.requested_at,
  }))
}

/** Accept (approved) or decline / remove (declined) someone. Admin only. */
export async function setMemberAccess(userId: string, status: 'approved' | 'declined') {
  const { error } = await supabase.rpc('set_member_access', { p_user: userId, p_status: status })
  if (error) throw error
}

/** Two letters for the round badge next to a name: "Sample Student" → "SS", no name → from the email. */
export function initials(name: string | null, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  const source = words[0] ?? email
  return source.slice(0, 2).toUpperCase()
}

/* ---------------------------------- Google sign-in ---------------------------------- */

/** Sends her to Google's account picker; Google sends her back here logged in. */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

const OAUTH_ERROR_KEY = 'projectrmt:oauth-error'

/** Pulls the "why it failed" text out of the address Google/Supabase sent her back to, if any. */
export function oauthErrorFrom(search: string, hash: string): string | null {
  for (const part of [search.replace(/^\?/, ''), hash.replace(/^#/, '')]) {
    const params = new URLSearchParams(part)
    const text = params.get('error_description') ?? params.get('error')
    if (text) return text
  }
  return null
}

/**
 * Call once when the app starts, before anything changes the address: a failed Google sign-in comes back as
 * "...#error=..." and the login page would never see it otherwise.
 */
export function rememberOAuthError() {
  try {
    const text = oauthErrorFrom(window.location.search, window.location.hash)
    if (text) sessionStorage.setItem(OAUTH_ERROR_KEY, text)
  } catch {
    // storage blocked: she just won't see the reason
  }
}

/** The saved failure, read once (then forgotten) by the login page. */
export function takeOAuthError(): string | null {
  try {
    const text = sessionStorage.getItem(OAUTH_ERROR_KEY)
    sessionStorage.removeItem(OAUTH_ERROR_KEY)
    return text
  } catch {
    return null
  }
}
