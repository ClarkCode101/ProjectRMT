import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Her first name lives on the login account itself (Supabase "user metadata"), not in a table:
// no new table or migration, and it follows her to any device she logs in on.

/** The first name she set in Settings, or null if none (Home then just says "Good morning!"). */
export function firstName(user: Pick<User, 'user_metadata'> | null | undefined): string | null {
  const value: unknown = user?.user_metadata?.first_name
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name === '' ? null : name.slice(0, 40)
}

/** Saves her first name (empty = remove it). The app's session updates by itself afterwards. */
export async function saveFirstName(name: string) {
  const { error } = await supabase.auth.updateUser({ data: { first_name: name.trim().slice(0, 40) } })
  if (error) throw error
}

export const MIN_PASSWORD_LENGTH = 8

/** What's wrong with the change-password form, or null when it's ready to send. */
export function passwordProblem(current: string, next: string, confirm: string): string | null {
  if (current === '') return 'Enter your current password.'
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (next === current) return 'Pick a password different from your current one.'
  if (confirm !== next) return 'The new passwords don’t match.'
  return null
}

/** Why a password change failed, in words she can act on. */
export type PasswordChangeError = 'wrong-current' | 'weak' | 'failed'

/**
 * Changes her password. Checks the current one first (by logging in again with it), so someone
 * holding her unlocked iPad can't lock her out. With `signOutOthers`, every other device is logged out.
 * Returns null on success.
 */
export async function changePassword(
  email: string,
  current: string,
  next: string,
  signOutOthers: boolean,
): Promise<PasswordChangeError | null> {
  const check = await supabase.auth.signInWithPassword({ email, password: current })
  if (check.error) return check.error.code === 'invalid_credentials' ? 'wrong-current' : 'failed'

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return error.code === 'weak_password' ? 'weak' : 'failed'

  // The password is already changed; a failure here only means other devices stay logged in.
  if (signOutOthers) await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
  return null
}
