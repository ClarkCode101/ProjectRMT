import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    if (error) setError('Mali ang email o password. Subukan ulit.')
    // On success, AuthProvider gets the new session and the <Navigate> above redirects.
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">MTLE Reviewer</CardTitle>
          <CardDescription>Mag-login para magsimulang mag-review.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Password</Label>
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
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
