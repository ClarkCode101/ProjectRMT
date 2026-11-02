import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { TubeRack } from '@/components/specimen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuth } from './authContext'

// One tube per board subject, in exam order.
const SUBJECT_TUBES = ['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE'].map((code) => ({
  state: 'empty' as const,
  subjectCode: code,
}))

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
    if (error) setError('Mali ang email o password. Subukan ulit.')
    // On success, AuthProvider gets the new session and the <Navigate> above redirects.
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-4">
          <TubeRack size="lg" tubes={SUBJECT_TUBES} />
          <h1 className="text-3xl font-extrabold">
            MTLE <span className="font-normal text-muted-foreground">Reviewer</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-5">
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
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-12 w-full rounded-lg text-base font-bold" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </div>
    </main>
  )
}
