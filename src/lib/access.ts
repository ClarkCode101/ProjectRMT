import { MIN_PASSWORD_LENGTH } from './profile'
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
  /** she logged in with a temporary password from the admin and must choose her own first (migration 0038) */
  mustChangePassword: boolean
}

/** Used when the server can't be asked and nothing is saved: let her in. The database still decides what she gets. */
export const ASSUMED_ACCESS: AccessInfo = { status: 'approved', isAdmin: false, requestedAt: null, mustChangePassword: false }

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
    mustChangePassword: row.must_change_password === true,
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
      JSON.stringify({
        status: info.status,
        is_admin: info.isAdmin,
        requested_at: info.requestedAt,
        must_change_password: info.mustChangePassword,
      }),
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
  /** the name on their account, or null if they haven't set one. Typed by the person themself: don't trust it. */
  name: string | null
  /** how they sign in, e.g. ['google'] (the database knows this; they can't change it) */
  providers: string[]
  status: AccessStatus
  isAdmin: boolean
  requestedAt: string
  /**
   * When they last studied (an answer, a session, a flashcard review). null = never studied.
   * undefined = the database doesn't send it yet (migration 0037 not run): then nothing is shown.
   */
  lastActiveAt?: string | null
}

/** Everyone with an account, newest request first. Admin only (the database refuses anyone else). */
export async function listMembers(): Promise<Member[]> {
  const { data, error } = await supabase.rpc('list_members')
  if (error) throw error
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    name: row.name,
    providers: row.providers ?? [],
    status: row.status,
    isAdmin: row.is_admin,
    requestedAt: row.requested_at,
    lastActiveAt: row.last_active_at,
  }))
}

/** Accept (approved) or decline / remove (declined) someone. Admin only. */
export async function setMemberAccess(userId: string, status: 'approved' | 'declined') {
  const { error } = await supabase.rpc('set_member_access', { p_user: userId, p_status: status })
  if (error) throw error
}

/**
 * Deletes a declined account and everything in it, for good (migration 0035). Admin only; the database also
 * refuses unless the account was declined first.
 */
export async function deleteMember(userId: string) {
  const { error } = await supabase.rpc('delete_member', { p_user: userId })
  if (error) throw error
}

/**
 * Plain words for a failed email sign-up. Always our own text: Supabase's messages are technical.
 * Codes: https://supabase.com/docs/guides/auth/debugging/error-codes
 */
export function signUpErrorMessage(error: { code?: string; message?: string }): string {
  switch (error.code) {
    case 'user_already_exists':
    case 'email_exists':
      return 'That email already has an account. Log in instead.'
    case 'weak_password':
      return `Use a stronger password, at least ${MIN_PASSWORD_LENGTH} characters.`
    case 'email_address_invalid':
      return 'That email doesn’t look right. Check it and try again.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many sign-ups right now. Try again in a few minutes.'
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Sign-up with email is turned off. Use Continue with Google, or ask your admin.'
    default:
      return 'Couldn’t create the account. Check your internet connection and try again.'
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * The admin's "when did they last study" note: "Studied 2 h ago", "Studied 5 days ago", "Not studied yet".
 * After 30 days it gives the date instead. undefined (the database doesn't send it yet) → null: show nothing.
 */
export function lastStudiedLabel(lastActiveAt: string | null | undefined, now: number): string | null {
  if (lastActiveAt === undefined) return null
  if (lastActiveAt === null) return 'Not studied yet'
  const time = Date.parse(lastActiveAt)
  if (Number.isNaN(time)) return null
  const ago = Math.max(0, now - time)
  if (ago < MINUTE) return 'Studied just now'
  if (ago < HOUR) return `Studied ${Math.floor(ago / MINUTE)} min ago`
  if (ago < DAY) return `Studied ${Math.floor(ago / HOUR)} h ago`
  const days = Math.floor(ago / DAY)
  if (days <= 30) return `Studied ${days} ${days === 1 ? 'day' : 'days'} ago`
  return `Studied on ${new Date(time).toLocaleDateString()}`
}

/* ---------------------------------- Temporary password (migration 0038) ---------------------------------- */

/** Letters and digits that can't be mixed up when read out or typed: no 0/o, 1/l/i. */
const TEMP_PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * A temporary password like "kx7m-4pqr-9tzb": 12 random characters in three groups (about 59 bits).
 * Made in the browser with the secure random generator; the database only ever keeps it hashed.
 */
export function makeTempPassword(
  fillRandom: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const chars: string[] = []
  // Reject bytes past the last full multiple of the alphabet, so every character is equally likely.
  const limit = 256 - (256 % TEMP_PASSWORD_ALPHABET.length)
  while (chars.length < 12) {
    for (const byte of fillRandom(new Uint8Array(16))) {
      if (byte < limit && chars.length < 12) chars.push(TEMP_PASSWORD_ALPHABET[byte % TEMP_PASSWORD_ALPHABET.length])
    }
  }
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((group) => group.join('')).join('-')
}

/** Admin: give an email account a temporary password. Logs them out everywhere; they must pick a new one next login. */
export async function adminResetPassword(userId: string, password: string) {
  const { error } = await supabase.rpc('admin_reset_password', { p_user: userId, p_password: password })
  if (error) throw error
}

/** The member saved a new password: stop asking for one. */
export async function finishPasswordChange() {
  const { error } = await supabase.rpc('finish_password_change')
  if (error) throw error
}

/** Two letters for the round badge next to a name: "Sample Student" → "SS", no name → from the email. */
export function initials(name: string | null, email: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  const source = words[0] ?? email
  return source.slice(0, 2).toUpperCase()
}

/** "Google", "Email", or "Google + Email": how someone signs in, for the admin's list. */
export function signInMethod(providers: readonly string[]): string {
  const names = providers.map((provider) => (provider === 'google' ? 'Google' : provider === 'email' ? 'Email' : provider))
  return names.length > 0 ? names.join(' + ') : 'Unknown'
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
