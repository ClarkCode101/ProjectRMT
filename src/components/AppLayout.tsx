import { useQueryClient } from '@tanstack/react-query'
import {
  Ellipsis,
  Gamepad2,
  House,
  Layers,
  Library,
  ListChecks,
  LogOut,
  NotebookPen,
  Play,
  Settings,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/features/auth/authContext'
import { leaveLobbyBeforeLogout, useBoardAlert } from '@/features/board/teamApi'
import { useAppUpdate } from '@/lib/appUpdate'
import { forgetBank } from '@/lib/offline/bank'
import { useOfflineSync } from '@/lib/offline/useOfflineSync'
import { useAnnouncePresence } from '@/lib/presence'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { Dialog } from './Dialog'
import { FullPageMessage } from './FullPageMessage'
import { InstallHint } from './InstallHint'
import type { LayoutContext } from './layoutContext'
import { Brand, Logo } from './report'
import { UpdateBanner } from './UpdateBanner'

/** alsoFor: other addresses that light this item up (e.g. a game opened from the Games page) */
type NavItem = { to: string; label: string; icon: LucideIcon; alsoFor?: string[] }

const HOME: NavItem = { to: '/', label: 'Home', icon: House }
/** Today's plan in full (Home has a slim bar for it). On phones it's in More: the bottom bar is full. */
const PLAN: NavItem = { to: '/plan', label: 'Plan', icon: ListChecks }
const PRACTICE: NavItem = { to: '/practice', label: 'Practice', icon: NotebookPen }
const MOCK: NavItem = { to: '/mock', label: 'Mock exam', icon: Timer }
const FLASHCARDS: NavItem = { to: '/flashcards', label: 'Flashcards', icon: Layers }
/** Board Review and Last Card, picked on the Games page (PROJECT_PLAN.md §16). Lit up inside either game too. */
const GAMES: NavItem = { to: '/games', label: 'Games', icon: Gamepad2, alsoFor: ['/board', '/cards'] }
const QUESTIONS: NavItem = { to: '/questions', label: 'Questions', icon: Library }
const COMMUNITY: NavItem = { to: '/community', label: 'Community', icon: Users }
// Quick reference (/reference) is off the menus for now; the page and its address still work.

const focusRing = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/40'
// The rail and the account button float on the page as "stickers": ink outline, hard shadow.
const floating = 'border-[2.5px] border-ink bg-card shadow-toon'
/** A big white button in the phone's More sheet (pressing pushes it down onto its shadow). */
const sheetButtonClass =
  'flex h-12 w-full items-center gap-3 rounded-2xl border-2 border-ink bg-card px-4 font-heading font-semibold shadow-toon-sm transition-[transform,box-shadow,background-color] duration-75 active:translate-y-[3px] active:shadow-none'

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

/** The short line between two groups on the rail (just for the eye; screen readers skip it). */
function RailDivider() {
  return <span aria-hidden className="my-1 h-0.5 w-6 rounded-full bg-border" />
}

/** A small heading over a group in the phone's More sheet. */
function SheetGroupLabel({ children }: { children: string }) {
  return <p className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{children}</p>
}

/** A small red dot on a nav icon: something is waiting there (e.g. a Board Review invite or turn). */
function AlertDot() {
  return <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full border-2 border-ink bg-wrong" aria-hidden />
}

/** One round icon in the floating rail. `alert` = show the red dot. */
function RailLink({ item, alert = false }: { item: NavItem; alert?: boolean }) {
  const Icon = item.icon
  const { pathname } = useLocation()
  const alsoActive = item.alsoFor?.some((path) => pathname.startsWith(path)) ?? false
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={alert ? `${item.label} (something is waiting)` : item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex size-11 items-center justify-center rounded-full border-2 transition-colors',
          focusRing,
          isActive || alsoActive
            ? 'border-ink bg-primary text-primary-foreground shadow-toon-sm'
            : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className="size-5" strokeWidth={isActive || alsoActive ? 2.4 : 1.8} aria-hidden />
          {alert && <AlertDot />}
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
  // A Board Review team invite or turn is waiting: red dot on its nav icon (and on "More" on phones).
  const boardAlert = useBoardAlert(session?.user.id ?? null)
  // "I have the app open": the Board Review invite list shows only classmates who are online.
  useAnnouncePresence(session?.user.id ?? null)
  // A new version was pushed and is downloaded: the "New version ready" banner.
  const appUpdate = useAppUpdate()

  const email = session?.user.email ?? ''
  const displayName = email.split('@')[0] || 'Reviewer'

  async function logOut() {
    setMoreOpen(false)
    setProfileOpen(false)
    await leaveLobbyBeforeLogout() // while still logged in: free her seat in a team lobby
    await supabase.auth.signOut()
    queryClient.clear() // forget cached quiz data from this account
    await forgetBank() // and the offline copy on this device (shared iPads)
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
                className={cn('flex size-9 items-center justify-center rounded-full border-2 border-ink bg-highlight font-heading font-bold text-foreground uppercase shadow-toon-sm', focusRing)}
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
              className={cn('fixed top-5 left-5 z-10 block size-14 overflow-hidden rounded-full border-[2.5px] border-ink shadow-toon', focusRing)}
            >
              <Logo className="size-full" />
            </NavLink>
            {/* Three groups, split by a short line: start your day | study tools | extra (same groups as the phone's More sheet). */}
            <nav aria-label="Main" className={cn('fixed top-24 left-5 z-10 flex w-14 flex-col items-center gap-1.5 rounded-full py-2', floating)}>
              <RailLink item={HOME} />
              <RailLink item={PLAN} />
              <RailDivider />
              <RailLink item={PRACTICE} />
              <RailLink item={MOCK} />
              <RailLink item={FLASHCARDS} />
              <RailDivider />
              <RailLink item={GAMES} alert={boardAlert} />
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
                <span className="flex size-10 items-center justify-center rounded-full border-2 border-ink bg-highlight font-heading text-lg font-bold text-foreground uppercase">
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
                    className="animate-in fade-in slide-in-from-left-2 absolute bottom-0 left-full ml-3 w-72 rounded-2xl border-[2.5px] border-ink bg-card p-2 shadow-toon duration-150"
                  >
                    <div className="flex items-center gap-3 px-2 pt-2 pb-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-highlight font-heading text-lg font-bold text-foreground uppercase">
                        {displayName.charAt(0)}
                      </span>
                      {/* Just the email: the name was only the part before "@", so it said the same thing twice.
                          Not cut off ("break-all" lets a long email wrap). */}
                      <p className="min-w-0 font-heading leading-tight font-bold break-all">{email}</p>
                    </div>
                    <div className="space-y-0.5 border-t-2 border-dashed pt-2">
                      <NavLink
                        to="/settings"
                        role="menuitem"
                        onClick={() => setProfileOpen(false)}
                        className={cn('flex h-10 w-full items-center gap-2 rounded-xl px-2 font-heading text-sm font-semibold hover:bg-secondary', focusRing)}
                      >
                        <Settings className="size-4" aria-hidden />
                        Settings
                      </NavLink>
                      <button
                        type="button"
                        role="menuitem"
                        autoFocus
                        onClick={logOut}
                        className={cn('flex h-10 w-full items-center gap-2 rounded-xl px-2 font-heading text-sm font-semibold text-wrong hover:bg-wrong-soft', focusRing)}
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

          {/* Never during a quiz (this whole block hides in focus mode), so the update banner waits until she's done.
              The banner and the "Add to Home Screen" tip share the top spot on phones, so only one shows: the update first. */}
          {appUpdate.ready ? <UpdateBanner onRefresh={appUpdate.refresh} onLater={appUpdate.later} /> : <InstallHint />}
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
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 border-t-[2.5px] border-ink bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
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
                    <span className="flex size-14 items-center justify-center rounded-full border-[2.5px] border-ink bg-highlight text-foreground shadow-toon-sm ring-4 ring-background group-active:translate-y-[3px] group-active:shadow-none">
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
                <span className="relative">
                  <Ellipsis className="size-5" strokeWidth={1.8} aria-hidden />
                  {boardAlert && <span className="absolute -top-1 -right-1.5 size-3 rounded-full border-2 border-ink bg-wrong" aria-hidden />}
                </span>
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
          {/*
            What doesn't fit in the phone's bottom bar, in the same groups and order as the rail on a tablet:
            Today (Plan), Extra (Games, Questions, Community), then Account (Settings, Log out).
          */}
          <div className="space-y-2">
            <SheetGroupLabel>Today</SheetGroupLabel>
            <NavLink to="/plan" onClick={() => setMoreOpen(false)} className={cn(sheetButtonClass, 'hover:bg-secondary/40', focusRing)}>
              <ListChecks className="size-5" aria-hidden />
              Plan
            </NavLink>
          </div>
          <div className="space-y-2">
            <SheetGroupLabel>Extra</SheetGroupLabel>
            <NavLink to="/games" onClick={() => setMoreOpen(false)} className={cn(sheetButtonClass, 'hover:bg-secondary/40', focusRing)}>
              <Gamepad2 className="size-5" aria-hidden />
              Games
              {boardAlert && <span className="ml-auto rounded-full border-2 border-ink bg-wrong px-2 text-xs font-bold text-white">Waiting</span>}
            </NavLink>
            <NavLink to="/questions" onClick={() => setMoreOpen(false)} className={cn(sheetButtonClass, 'hover:bg-secondary/40', focusRing)}>
              <Library className="size-5" aria-hidden />
              Questions
            </NavLink>
            <NavLink to="/community" onClick={() => setMoreOpen(false)} className={cn(sheetButtonClass, 'hover:bg-secondary/40', focusRing)}>
              <Users className="size-5" aria-hidden />
              Community
            </NavLink>
          </div>
          <div className="space-y-2">
            <SheetGroupLabel>Account</SheetGroupLabel>
            <NavLink to="/settings" onClick={() => setMoreOpen(false)} className={cn(sheetButtonClass, 'hover:bg-secondary/40', focusRing)}>
              <Settings className="size-5" aria-hidden />
              Settings
            </NavLink>
            <button type="button" onClick={logOut} className={cn(sheetButtonClass, 'text-wrong hover:bg-wrong-soft', focusRing)}>
              <LogOut className="size-5" aria-hidden />
              Log out
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className={cn('h-11 w-full rounded-xl font-heading text-sm font-semibold text-muted-foreground hover:bg-secondary', focusRing)}
          >
            Close
          </button>
        </div>
      </Dialog>
    </div>
  )
}
