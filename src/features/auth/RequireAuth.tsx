import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useAuth } from './authContext'

// Its own download: only someone who is still waiting ever needs it.
const AccessPendingPage = lazy(() => import('./AccessPendingPage'))

/**
 * Wrap private pages with this.
 * Not logged in → go to /login. Logged in but not accepted by the admin yet → the waiting page.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, access } = useAuth()
  const location = useLocation()
  const waiting = <FullPageMessage>Loading…</FullPageMessage>

  if (loading) return waiting
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!access) return waiting // still asking the server
  if (access.status !== 'approved') {
    return (
      <Suspense fallback={waiting}>
        <AccessPendingPage />
      </Suspense>
    )
  }
  return children
}
