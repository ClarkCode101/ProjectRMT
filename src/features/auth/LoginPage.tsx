import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Logo } from '@/components/report'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from './authContext'

// Email + password (not magic link): on iPhone, a magic link opens in Safari
// instead of the installed home-screen app, which is confusing.
// There is no sign-up form on purpose. The app is private; create her account in
// Supabase Dashboard → Authentication → Users (see README).

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

/** Faint graph-paper lines, like the grid on a lab chart. Pure CSS, no image file. */
const GRAPH_PAPER = {
  backgroundImage:
    'linear-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

/** Same grid, in faint blue, for the light page behind the card. */
const LIGHT_GRAPH_PAPER = {
  backgroundImage:
    'linear-gradient(rgb(7 71 94 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(7 71 94 / 0.05) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

/** The "PASSED" stamp, same look as on the real results screens. */
function PassedStamp({ className = '' }: { className?: string }) {
  return (
    <span
      className={`stamp inline-block rounded-md border-[3px] border-correct px-2.5 py-1 font-heading leading-none font-bold text-correct ${className}`}
    >
      PASSED
    </span>
  )
}

/** A preview of a lab-report result card. Decoration only, so screen readers skip it. */
function SpecimenCard() {
  return (
    <div
      aria-hidden
      className="w-full -rotate-2 rounded-xl bg-card p-4 text-sm text-card-foreground shadow-[0_24px_48px_-18px_rgb(0_0_0/0.6)]"
    >
      <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">MTLE readiness report</p>
      <div className="my-3 border-t-2 border-dashed" />
      <div className="flex justify-between text-xs font-bold tracking-wider text-muted-foreground uppercase">
        <span>Subject</span>
        <span>Result</span>
      </div>
      <ul className="mt-2 space-y-2">
        {SAMPLE_RESULTS.map((row) => (
          <li key={row.subject} className="flex items-baseline justify-between gap-4">
            <span>{row.subject}</span>
            <span className="font-heading text-xl font-bold tabular-nums">{row.result}</span>
          </li>
        ))}
      </ul>
      <div className="my-3 border-t-2 border-dashed" />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Ref range 60–100</span>
        <PassedStamp className="text-xl" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (session) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) setError('Wrong email or password. Please try again.')
    // On success, AuthProvider gets the new session and the <Navigate> above redirects.
  }

  return (
    // Light graph-paper page with ONE compact card floating in the middle
    // (not a full-screen split), so the eye goes straight to the form.
    <main
      className="flex min-h-dvh items-center justify-center bg-background px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      style={LIGHT_GRAPH_PAPER}
    >
      <div className="grid w-full max-w-sm overflow-hidden rounded-2xl border bg-card shadow-[0_30px_60px_-30px_rgb(7_71_94/0.5)] md:max-w-[820px] md:grid-cols-[5fr_6fr]">
        {/* Brand side: short band on top on phones, left half of the card on bigger screens. */}
        <div className="relative overflow-hidden bg-primary-deep text-white">
          <div aria-hidden className="absolute inset-0" style={GRAPH_PAPER} />
          <div className="relative flex h-full flex-col gap-5 p-6 md:justify-between md:gap-8 md:p-8">
            <div className="flex items-center gap-3">
              <Logo className="size-10 rounded-xl ring-2 ring-white/25" />
              <h1 className="font-heading text-2xl font-bold tracking-tight">
                Project<span className="text-highlight">RMT</span>
              </h1>
            </div>

            {/* Bigger screens: the small report card. */}
            <div className="hidden md:block">
              <SpecimenCard />
            </div>

            {/* Phones: a short result strip, so the form stays near the top. */}
            <div
              aria-hidden
              className="flex w-fit items-center gap-4 rounded-lg bg-card px-4 py-2.5 text-card-foreground shadow-lg md:hidden"
            >
              <span className="text-sm">
                Result <b className="font-heading text-lg tabular-nums">84</b>
                <span className="text-muted-foreground"> · Ref 60–100</span>
              </span>
              <PassedStamp className="text-sm" />
            </div>

            <p className="font-heading text-lg leading-snug font-semibold text-white/90 md:text-xl">
              Your MTLE review, <span className="text-highlight">one result at a time.</span>
            </p>
          </div>
        </div>

        {/* Form side: the one task on this screen. */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6 md:p-9">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold">{greeting()}</h2>
            <p className="text-muted-foreground">Log in to continue your review.</p>
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
                autoComplete="current-password"
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
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
              {error}
            </p>
          )}

          <Button type="submit" className="h-12 w-full rounded-md font-heading text-lg font-bold" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">Forgot your password? Ask your admin to reset it.</p>
        </form>
      </div>
    </main>
  )
}
