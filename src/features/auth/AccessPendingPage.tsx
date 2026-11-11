import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { AuthShell, PhoneStrip, ReportSlip, Stamp } from './AuthShell'
import { useAuth } from './authContext'

// Shown instead of the app while a logged-in account is not an approved member (migration 0033):
// "pending" right after the first Google sign-in, or "declined" if the admin said no.
// Same card as the login page, so signing in and waiting feel like one flow.

/** How often the page asks "am I accepted yet?" by itself. */
const CHECK_EVERY_MS = 15_000

/** "Today, 2:14 PM" or "Nov 11, 2:14 PM". */
function formatRequested(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday ? `Today, ${time}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words">{children}</dd>
    </div>
  )
}

export default function AccessPendingPage() {
  const { session, access, recheckAccess } = useAuth()
  const [checking, setChecking] = useState(false)
  const [checkedOnce, setCheckedOnce] = useState(false)
  const declined = access?.status === 'declined'

  // While waiting: ask again every few seconds, and right away when she comes back to this tab.
  // The moment the admin accepts, RequireAuth swaps this page for the app.
  useEffect(() => {
    if (declined) return
    const ask = () => {
      if (document.visibilityState === 'visible') void recheckAccess()
    }
    const timer = window.setInterval(ask, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', ask)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', ask)
    }
  }, [declined, recheckAccess])

  async function handleCheck() {
    setChecking(true)
    await recheckAccess()
    setChecking(false)
    setCheckedOnce(true)
  }

  const stamp = (size: string) => (
    <Stamp tone={declined ? 'declined' : 'pending'} className={size}>
      {declined ? 'DECLINED' : 'PENDING'}
    </Stamp>
  )
  const requested = formatRequested(access?.requestedAt ?? null)

  return (
    <AuthShell
      slip={
        <ReportSlip
          title="Access request"
          rows={[
            { label: 'Specimen', value: 'Received' },
            { label: 'Reviewed by', value: 'Admin' },
          ]}
          footLabel="Result"
          stamp={stamp('text-xl')}
        />
      }
      strip={
        <PhoneStrip>
          <span className="text-sm">Access request</span>
          {stamp('text-sm')}
        </PhoneStrip>
      }
    >
      <div className="space-y-5 p-6 md:p-9">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold">{declined ? 'Request declined' : 'Request sent'}</h2>
          <p className="text-muted-foreground">
            {declined
              ? 'Your request was declined. If you think this is a mistake, message your admin.'
              : 'Your admin needs to accept you before you can start reviewing.'}
          </p>
        </div>

        <dl className="rounded-xl border bg-background px-4 py-2.5 text-[15px]">
          <Detail label="Signed in as">{session?.user.email}</Detail>
          {requested && <Detail label="Requested">{requested}</Detail>}
          <Detail label="Status">
            <span className={declined ? 'text-wrong' : 'text-[#8A5A10]'}>{declined ? 'Declined' : 'Waiting for admin'}</span>
          </Detail>
        </dl>

        {!declined && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-highlight" />
            This page opens the app by itself once you’re accepted.
          </p>
        )}

        <Button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="h-12 w-full rounded-md font-heading text-lg font-bold"
        >
          {checking ? 'Checking…' : 'Check again'}
        </Button>

        <p role="status" className="min-h-5 text-center text-sm text-muted-foreground">
          {checkedOnce && !checking && (declined ? 'Still declined.' : 'Not accepted yet.')}
        </p>

        <div className="text-center">
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="h-11 rounded-md px-3 font-bold text-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Use a different account
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
