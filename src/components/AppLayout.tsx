import { useQueryClient } from '@tanstack/react-query'
import {
  Dices,
  Ellipsis,
  House,
  Layers,
  Library,
  LogOut,
  NotebookPen,
  Play,
  Settings,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/authContext'
import { useOfflineSync } from '@/lib/offline/useOfflineSync'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Dialog } from './Dialog'
import { FullPageMessage } from './FullPageMessage'
import { InstallHint } from './InstallHint'
import type { LayoutContext } from './layoutContext'
import { Brand, Logo } from './report'

type NavItem = { to: string; label: string; icon: LucideIcon }

const HOME: NavItem = { to: '/', label: 'Home', icon: House }
const PRACTICE: NavItem = { to: '/practice', label: 'Practice', icon: NotebookPen }
const MOCK: NavItem = { to: '/mock', label: 'Mock exam', icon: Timer }
const FLASHCARDS: NavItem = { to: '/flashcards', label: 'Flashcards', icon: Layers }
const BOARD: NavItem = { to: '/board', label: 'Board Review', icon: Dices }
const QUESTIONS: NavItem = { to: '/questions', label: 'Questions', icon: Library }
const COMMUNITY: NavItem = { to: '/community', label: 'Community', icon: Users }
// Quick reference (/reference) is off the menus for now; the page and its address still work.

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'
const floating = 'bg-card shadow-[0_12px_32px_-16px_rgb(7_71_94/0.35)]'

/** One tab in the phone's bottom bar. */
function BarTab({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn('flex h-16 flex-col items-center justify-center gap-1 text-xs', focusRing, isActive ? 'font-bold text-primary' : 'text-muted-foreground')
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="size-5" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
          {item.label}
        </>
      )}
    </NavLink>
  )
}

/** A label that appears to the right of a rail icon on hover or keyboard focus. */
function Tooltip({ children }: { children: string }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full z-20 ml-3 rounded-md bg-foreground px-2 py-1 text-xs font-semibold whitespace-nowrap text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  )
}

/** One round icon in the floating rail. */
function RailLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex size-11 items-center justify-center rounded-full transition-colors',
          focusRing,
          isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="size-5" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden />
          <Tooltip>{item.label}</Tooltip>
        </>
      )}
    </NavLink>
  )
}

export function AppLayout() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const [focusMode, setFocusMode] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  // Sends answers waiting on the device and keeps the offline question bank fresh.
  useOfflineSync(session?.user.id ?? null)

  const email = session?.user.email ?? ''
  const displayName = email.split('@')[0] || 'Reviewer'

  async function logOut() {
    setMoreOpen(false)
    setProfileOpen(false)
    await supabase.auth.signOut()
    queryClient.clear() // forget cached quiz data from this account
  }

  return (
    <div className={cn('min-h-dvh', focusMode ? 'pb-10' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-24')}>
      {!focusMode && (
        <>
          {/* Phone: slim top bar with the logo and your initial (opens the menu). */}
          <header className="pt-[env(safe-area-inset-top)] md:hidden">
            <div className="flex h-14 items-center justify-between px-4">
              <Brand className="text-xl" />
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-label="Account menu"
                className={cn('flex size-9 items-center justify-center rounded-full bg-primary-deep font-heading font-bold text-white uppercase', focusRing)}
              >
                {displayName.charAt(0)}
              </button>
            </div>
          </header>

          {/* Tablet and computer: round logo, a floating icon rail, and your account at the bottom. */}
          <div className="hidden md:block">
            <NavLink
              to="/"
              aria-label="ProjectRMT home"
              className={cn('fixed top-5 left-5 z-10 block size-14 overflow-hidden rounded-full shadow-[0_10px_24px_-12px_rgb(7_71_94/0.6)]', focusRing)}
            >
              <Logo className="size-full" />
            </NavLink>
            <nav aria-label="Main" className={cn('fixed top-24 left-5 z-10 flex w-14 flex-col items-center gap-1.5 rounded-full py-2', floating)}>
              <RailLink item={HOME} />
              <RailLink item={PRACTICE} />
              <RailLink item={MOCK} />
              <RailLink item={FLASHCARDS} />
              <RailLink item={BOARD} />
              <RailLink item={QUESTIONS} />
              <RailLink item={COMMUNITY} />
            </nav>
            {/* Your account, bottom-left (like most sidebar apps): tap the avatar to see your full name, email and Log out. */}
            <div className="fixed bottom-5 left-5 z-30">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label={`Account: ${displayName}`}
                className={cn('group relative flex size-14 items-center justify-center rounded-full', floating, focusRing)}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-deep font-heading text-lg font-bold text-white uppercase">
                  {displayName.charAt(0)}
                </span>
                {!profileOpen && <Tooltip>Account</Tooltip>}
              </button>
              {profileOpen && (
                <>
                  {/* Click anywhere else to close. */}
                  <button type="button" aria-label="Close menu" tabIndex={-1} className="fixed inset-0 -z-10 cursor-default" onClick={() => setProfileOpen(false)} />
                  {/* Opens to the right of the avatar, lined up with its bottom. */}
                  <div
                    role="menu"
                    aria-label="Account"
                    onKeyDown={(e) => e.key === 'Escape' && setProfileOpen(false)}
                    className="animate-in fade-in slide-in-from-left-2 absolute bottom-0 left-full ml-3 w-72 rounded-xl border bg-card p-2 shadow-lg duration-150"
                  >
                    <div className="flex items-center gap-3 px-2 pt-2 pb-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-deep font-heading text-lg font-bold text-white uppercase">
                        {displayName.charAt(0)}
                      </span>
                      <div className="min-w-0 leading-tight">
                        {/* Full name and email, not cut off ("break-all" lets a long email wrap). */}
                        <p className="font-heading font-bold break-all">{displayName}</p>
                        <p className="mt-0.5 text-sm break-all text-muted-foreground">{email}</p>
                        <p className="mt-1 text-xs font-semibold text-primary">MTLE reviewer</p>
                      </div>
                    </div>
                    <div className="space-y-0.5 border-t pt-2">
                      <NavLink
                        to="/settings"
                        role="menuitem"
                        onClick={() => setProfileOpen(false)}
                        className={cn('flex h-10 w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-secondary', focusRing)}
                      >
                        <Settings className="size-4" aria-hidden />
                        Settings
                      </NavLink>
                      <button
                        type="button"
                        role="menuitem"
                        autoFocus
                        onClick={logOut}
                        className={cn('flex h-10 w-full items-center gap-2 rounded-lg px-2 text-sm font-semibold text-wrong hover:bg-wrong-soft', focusRing)}
                      >
                        <LogOut className="size-4" aria-hidden />
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* "Add to Home Screen" tip. Only in the browser, never during a quiz (this whole block hides in focus mode). */}
          <InstallHint />
        </>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 lg:px-8">
        {/* No top bar on tablet/computer (search lives on the Questions page). The one-screen pages
            (Home, Practice) count on this padding: pt-5 + pb-5 = 2.5rem. */}
        <main className={cn('pb-6 md:pb-5', focusMode ? 'pt-[calc(1rem+env(safe-area-inset-top))] lg:pt-6' : 'pt-2 md:pt-5')}>
          {/* Pages are lazy-loaded; this shows while a page's code downloads. */}
          <Suspense fallback={<FullPageMessage>Loading…</FullPageMessage>}>
            <Outlet context={{ setFocusMode } satisfies LayoutContext} />
          </Suspense>
        </main>
      </div>

      {!focusMode && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
          <ul className="grid grid-cols-5">
            <li>
              <BarTab item={HOME} />
            </li>
            <li>
              <BarTab item={FLASHCARDS} />
            </li>
            <li className="flex justify-center">
              {/* The main action: a raised gold button in the middle of the bar. */}
              <NavLink to="/practice" className={cn('group -mt-5 flex flex-col items-center gap-1 rounded-full text-xs', focusRing)}>
                {({ isActive }) => (
                  <>
                    <span className="flex size-14 items-center justify-center rounded-full bg-highlight text-foreground shadow-[0_6px_16px_-6px_rgb(7_71_94/0.6)] ring-4 ring-background group-active:translate-y-px">
                      <Play className="size-6 fill-current" aria-hidden />
                    </span>
                    <span className={cn(isActive ? 'font-bold text-primary' : 'font-semibold text-foreground')}>Practice</span>
                  </>
                )}
              </NavLink>
            </li>
            <li>
              <BarTab item={MOCK} />
            </li>
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={cn('flex h-16 w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground', focusRing)}
              >
                <Ellipsis className="size-5" strokeWidth={1.8} aria-hidden />
                More
              </button>
            </li>
          </ul>
        </nav>
      )}

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} labelledBy="more-heading" variant="sheet">
        <div className="space-y-4">
          <div>
            <h2 id="more-heading" className="text-xl font-bold">
              More
            </h2>
            {email && <p className="text-sm text-muted-foreground">Logged in as {email}</p>}
          </div>
          {/* Board Review lives here on phones: the bottom bar is full. */}
          <NavLink
            to="/board"
            onClick={() => setMoreOpen(false)}
            className={cn('flex h-12 w-full items-center gap-3 rounded-md border px-4 font-semibold hover:bg-secondary', focusRing)}
          >
            <Dices className="size-5" aria-hidden />
            Board Review
          </NavLink>
          <NavLink
            to="/community"
            onClick={() => setMoreOpen(false)}
            className={cn('flex h-12 w-full items-center gap-3 rounded-md border px-4 font-semibold hover:bg-secondary', focusRing)}
          >
            <Users className="size-5" aria-hidden />
            Community
          </NavLink>
          <NavLink
            to="/settings"
            onClick={() => setMoreOpen(false)}
            className={cn('flex h-12 w-full items-center gap-3 rounded-md border px-4 font-semibold hover:bg-secondary', focusRing)}
          >
            <Settings className="size-5" aria-hidden />
            Settings
          </NavLink>
          <NavLink
            to="/questions"
            onClick={() => setMoreOpen(false)}
            className={cn('flex h-12 w-full items-center gap-3 rounded-md border px-4 font-semibold hover:bg-secondary', focusRing)}
          >
            <Library className="size-5" aria-hidden />
            Questions
          </NavLink>
          <button
            type="button"
            onClick={logOut}
            className={cn('flex h-12 w-full items-center gap-3 rounded-md border px-4 font-semibold text-wrong hover:bg-wrong-soft', focusRing)}
          >
            <LogOut className="size-5" aria-hidden />
            Log out
          </button>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className={cn('h-11 w-full rounded-md text-sm font-semibold text-muted-foreground hover:bg-secondary', focusRing)}
          >
            Close
          </button>
        </div>
      </Dialog>
    </div>
  )
}
