import { useQueryClient } from '@tanstack/react-query'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { FullPageMessage } from './FullPageMessage'

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/practice', label: 'Practice', icon: '📝' },
  { to: '/mistakes', label: 'Mistakes', icon: '🔁' },
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
]

/** Header on top, page in the middle, tab bar at the bottom (thumb-friendly on phones). */
export function AppLayout() {
  const queryClient = useQueryClient()

  async function logOut() {
    await supabase.auth.signOut()
    queryClient.clear() // forget cached quiz data from this account
  }

  return (
    <div className="min-h-dvh bg-muted/40 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <span className="font-semibold text-primary">MTLE Reviewer</span>
          <Button variant="ghost" size="sm" onClick={logOut}>
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {/* Pages are lazy-loaded; this shows while a page's code downloads. */}
        <Suspense fallback={<FullPageMessage>Loading…</FullPageMessage>}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-16 flex-col items-center justify-center gap-0.5 text-xs outline-none focus-visible:bg-muted',
                    isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
                  )
                }
              >
                <span aria-hidden className="text-xl">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
