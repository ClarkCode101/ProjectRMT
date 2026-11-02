import { useQueryClient } from '@tanstack/react-query'
import { ChartNoAxesColumn, House, NotebookPen, RotateCcw, type LucideIcon } from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { FullPageMessage } from './FullPageMessage'

const NAV_ITEMS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/practice', label: 'Practice', icon: NotebookPen },
  { to: '/mistakes', label: 'Review', icon: RotateCcw },
  { to: '/dashboard', label: 'Progress', icon: ChartNoAxesColumn },
]

function NavItems({ variant }: { variant: 'bar' | 'header' }) {
  return (
    <ul className={cn(variant === 'bar' ? 'grid grid-cols-4' : 'flex items-center gap-1')}>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                variant === 'bar'
                  ? 'flex h-16 flex-col items-center justify-center gap-1 text-xs'
                  : 'flex h-9 items-center gap-2 rounded-md px-3 text-sm',
                isActive ? 'font-bold text-primary' : 'text-muted-foreground hover:text-foreground',
                variant === 'header' && isActive && 'bg-secondary',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-5" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export function AppLayout() {
  const queryClient = useQueryClient()

  async function logOut() {
    await supabase.auth.signOut()
    queryClient.clear() // forget cached quiz data from this account
  }

  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-10">
      <header className="pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-4">
          <span className="text-lg font-extrabold tracking-tight">
            MTLE <span className="font-normal text-muted-foreground">Reviewer</span>
          </span>
          <nav aria-label="Main" className="hidden md:block">
            <NavItems variant="header" />
          </nav>
          <button
            type="button"
            onClick={logOut}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-2 pb-6">
        {/* Pages are lazy-loaded; this shows while a page's code downloads. */}
        <Suspense fallback={<FullPageMessage>Loading…</FullPageMessage>}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="mx-auto max-w-2xl">
          <NavItems variant="bar" />
        </div>
      </nav>
    </div>
  )
}
