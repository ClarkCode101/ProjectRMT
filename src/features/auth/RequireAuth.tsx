import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { FullPageMessage } from '@/components/FullPageMessage'
import { useAuth } from './authContext'

/** Wrap private pages with this. Not logged in → go to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageMessage>Loading…</FullPageMessage>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
