import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
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
export default function LoginPage() {
  const { session } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <main className="min-h-dvh md:grid md:grid-cols-2">
      {/* Brand panel: top band on phones, left half on computers. */}
      <div className="flex flex-col justify-end bg-primary-deep px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-14 text-white md:justify-center md:px-12 md:pb-12">
        <div className="max-w-md space-y-3">
          <Logo className="size-14 rounded-2xl ring-2 ring-white/25 md:size-16" />
          <h1 className="font-heading text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Project<span className="text-highlight">RMT</span>
          </h1>
          <p className="text-lg text-white/85">Your MTLE review, one result at a time.</p>
        </div>
      </div>

      <div className="-mt-8 flex justify-center px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:mt-0 md:items-center md:py-12">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-[0_18px_40px_-24px_rgb(7_71_94/0.45)] md:border-0 md:shadow-none"
        >
          <div>
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Log in to continue your review.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="font-bold">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="font-bold">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
              {error}
            </p>
          )}
          <Button type="submit" className="h-12 w-full rounded-md font-heading text-lg font-bold" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </main>
  )
}
