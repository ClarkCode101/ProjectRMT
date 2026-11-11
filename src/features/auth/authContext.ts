import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { AccessInfo } from '@/lib/access'

export type AuthState = {
  session: Session | null
  /** true while we check if she is already logged in (on first load) */
  loading: boolean
  /** May this account use the app (lib/access.ts)? null while logged out or still being checked. */
  access: AccessInfo | null
  /** Asks the server again (the waiting screen uses it). */
  recheckAccess: () => Promise<void>
}

export const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  access: null,
  recheckAccess: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}
