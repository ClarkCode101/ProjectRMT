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
