import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MIN_PASSWORD_LENGTH, signInWithGoogle, signUpErrorMessage, takeOAuthError } from '@/lib/access'
import { supabase } from '@/lib/supabase'
import { AuthShell, PhoneStrip, ReportSlip, Stamp } from './AuthShell'
import { useAuth } from './authContext'

// Ways in:
// - Email + password (not magic link: on iPhone, a magic link opens in Safari instead of the installed
//   home-screen app, which is confusing).
// - Create an account with email + password, on the same card ("New here? Create an account").
// - Continue with Google.
// Every new account, email or Google, lands on the "waiting for approval" page until the admin accepts it in
// Settings (migration 0033 makes each new account pending).
//
// Supabase "Confirm email" is OFF for now (small private group; the admin's approval is the gate), so sign-up
// logs her in right away. If it's turned on later (with a custom email sender), sign-up returns no session
// and the "Check your email" screen shows instead. No code change needed for that switch.

/** "Good morning / afternoon / evening", based on the device's clock. */
function greeting(hour = new Date().getHours()) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Sample rows for the decorative report card on the brand panel (not her real scores). */
const SAMPLE_RESULTS = [
  { subject: 'Clinical Chemistry', result: 84 },
  { subject: 'Hematology', result: 79 },
  { subject: 'Microbiology', result: 88 },
]

/** The decorative report slip on the brand side (sample numbers, not her real scores). */
const SAMPLE_SLIP = (
  <ReportSlip
    title="MTLE readiness report"
    head={['Subject', 'Result']}
    rows={SAMPLE_RESULTS.map((row) => ({ label: row.subject, value: row.result, big: true }))}
    footLabel="Ref range 60–100"
    stamp={
      <Stamp tone="passed" className="text-xl">
        PASSED
      </Stamp>
    }
  />
)

const SAMPLE_STRIP = (
  <PhoneStrip>
    <span className="text-sm">
      Result <b className="font-heading text-lg tabular-nums">84</b>
      <span className="text-muted-foreground"> · Ref 60–100</span>
    </span>
    <Stamp tone="passed" className="text-sm">
      PASSED
    </Stamp>
  </PhoneStrip>
)

/** Google's "G" mark (their sign-in button guidelines ask for the standard colors on a white button). */
function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // A Google sign-in that failed on the way back shows a message here once. Always our own words, never the
  // text from the address: anyone can send a link with "#error_description=<their message>" in it.
  const [error, setError] = useState<string | null>(() =>
    takeOAuthError() ? 'Google sign-in didn’t finish. Please try again.' : null,
  )
  const [openingGoogle, setOpeningGoogle] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  /** the email a confirmation link was sent to (only when "Confirm email" is on in Supabase) */
  const [checkEmail, setCheckEmail] = useState<string | null>(null)
  const signingUp = mode === 'signup'

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (session) return <Navigate to={from} replace />

  /** Log in ⇄ Create an account. Keeps the email she typed, clears the password and any message. */
  function switchMode(next: 'login' | 'signup') {
    setMode(next)
    setPassword('')
    setShowPassword(false)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    if (signingUp) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        // where the confirmation link opens, if "Confirm email" is turned on later
        options: { emailRedirectTo: window.location.origin },
      })
      setSubmitting(false)
      if (error) setError(signUpErrorMessage(error))
      // No session = Supabase sent a confirmation link first.
      else if (!data.session) setCheckEmail(email)
      // With a session, AuthProvider picks it up and the <Navigate> above goes on to the waiting page.
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) setError('Wrong email or password. Please try again.')
    // On success, AuthProvider gets the new session and the <Navigate> above redirects.
  }

  async function handleGoogle() {
    setOpeningGoogle(true)
    setError(null)
    try {
      await signInWithGoogle() // leaves this page for Google's account picker
    } catch {
      setOpeningGoogle(false)
      setError('Couldn’t open Google. Check your internet connection and try again.')
    }
  }

  if (checkEmail) {
    return (
      <AuthShell slip={SAMPLE_SLIP} strip={SAMPLE_STRIP}>
        <div className="space-y-5 p-6 md:p-9">
          <span aria-hidden className="grid size-14 place-items-center rounded-full bg-secondary text-primary">
            <Mail className="size-7" />
          </span>
          <div className="space-y-1">
            <h2 className="text-3xl font-bold">Check your email</h2>
            <p className="text-muted-foreground">
              We sent a link to <b className="break-all text-foreground">{checkEmail}</b>. Open it on this device to finish creating your
              account. Then your admin accepts you.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-md px-4 font-bold"
            onClick={() => {
              setCheckEmail(null)
              switchMode('login')
            }}
          >
            Back to log in
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell slip={SAMPLE_SLIP} strip={SAMPLE_STRIP}>
      <form onSubmit={handleSubmit} className="space-y-5 p-6 md:p-9">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold">{signingUp ? 'Create an account' : greeting()}</h2>
          <p className="text-muted-foreground">{signingUp ? 'Your admin accepts new accounts before you can start.' : 'Log in to continue your review.'}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="font-semibold">
            Email
          </Label>
          <div className="relative">
            <Mail
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 pl-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="font-semibold">
            Password
          </Label>
          <div className="relative">
            <LockKeyhole
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={signingUp ? 'new-password' : 'current-password'}
              minLength={signingUp ? MIN_PASSWORD_LENGTH : undefined}
              aria-describedby={signingUp ? 'password-hint' : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 pr-12 pl-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
          {signingUp && (
            <p id="password-hint" className="text-sm text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
            {error}
          </p>
        )}

        <Button type="submit" className="h-12 w-full rounded-md font-heading text-lg font-bold" disabled={submitting}>
          {signingUp ? (submitting ? 'Creating account…' : 'Create account') : submitting ? 'Logging in…' : 'Log in'}
        </Button>

        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span aria-hidden className="h-px flex-1 bg-border" />
          or
          <span aria-hidden className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          disabled={openingGoogle}
          className="h-12 w-full gap-2.5 rounded-md border-input bg-card text-base font-semibold text-foreground"
        >
          <GoogleMark />
          {openingGoogle ? 'Opening Google…' : 'Continue with Google'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {signingUp ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            onClick={() => switchMode(signingUp ? 'login' : 'signup')}
            className="rounded-sm font-bold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            {signingUp ? 'Log in' : 'Create an account'}
          </button>
        </p>

        <p className="text-center text-sm">
          <Link to="/privacy" className="font-semibold text-primary hover:underline">
            Privacy policy
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
