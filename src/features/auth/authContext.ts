import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthState = {
  session: Session | null
  /** true while we check if she is already logged in (on first load) */
  loading: boolean
}

export const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function useAuth() {
  return useContext(AuthContext)
}
