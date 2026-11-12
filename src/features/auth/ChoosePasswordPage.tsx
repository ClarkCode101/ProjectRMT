import { useState, type FormEvent } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { finishPasswordChange } from '@/lib/access'
import { MIN_PASSWORD_LENGTH } from '@/lib/profile'
import { supabase } from '@/lib/supabase'
import { AuthShell, PhoneStrip, ReportSlip, Stamp } from './AuthShell'
import { useAuth } from './authContext'

// Shown instead of the app when she logged in with a temporary password from the admin (migration 0038):
// she picks her own before anything else. Only way out besides saving: Log out.
// No "current password" box: she just logged in with it.

const stamp = (size: string) => (
  <Stamp tone="pending" className={size}>
    NEW PASSWORD
  </Stamp>
)

/** What's wrong with the form, or null when it's ready to send. */
function problem(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  if (confirm !== next) return 'The passwords don’t match.'
  return null
}

export default function ChoosePasswordPage() {
  const { recheckAccess } = useAuth()
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The new password is saved but the last step failed: a retry only does the last step
  // (saving the same password again would be refused as "same password").
  const [passwordSaved, setPasswordSaved] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const wrong = passwordSaved ? null : problem(next, confirm)
    if (wrong) return setError(wrong)
    setSaving(true)
    setError(null)
    const { error: updateError } = passwordSaved ? { error: null } : await supabase.auth.updateUser({ password: next })
    if (updateError) {
      setSaving(false)
      setError(
        updateError.code === 'same_password'
          ? 'Pick a password different from the temporary one.'
          : updateError.code === 'weak_password'
            ? `Use a stronger password, at least ${MIN_PASSWORD_LENGTH} characters.`
            : 'Couldn’t save. Check your internet connection and try again.',
      )
      return
    }
    setPasswordSaved(true)
    try {
      await finishPasswordChange()
    } catch {
      // Her new password is saved; only the reminder couldn't be cleared. Pressing the button again clears it.
      setSaving(false)
      setError('Your new password is saved, but we couldn’t finish. Press Save and continue again.')
      return
    }
    // RequireAuth sees the flag is gone and opens the app.
    await recheckAccess()
  }

  return (
    <AuthShell
      slip={
        <ReportSlip
          title="Account"
          rows={[
            { label: 'Temporary password', value: 'Used' },
            { label: 'Your own password', value: 'Needed' },
          ]}
          footLabel="Status"
          stamp={stamp('text-lg')}
        />
      }
      strip={
        <PhoneStrip>
          <span className="text-sm">Account</span>
          {stamp('text-sm')}
        </PhoneStrip>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6 md:p-9" noValidate>
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-highlight-soft text-[#9A5B00]">
          <LockKeyhole className="size-7" />
        </span>
        <div className="space-y-1">
          <h2 className="text-3xl font-bold">Choose a new password</h2>
          <p className="text-muted-foreground">You logged in with a temporary password from your admin. Pick your own before you continue.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="choose-new" className="font-semibold">
            New password
          </Label>
          <Input
            id="choose-new"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={passwordSaved}
            aria-describedby="choose-new-hint"
            className="h-12"
          />
          <p id="choose-new-hint" className="text-sm text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="choose-confirm" className="font-semibold">
            Confirm new password
          </Label>
          <Input
            id="choose-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={passwordSaved}
            className="h-12"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-wrong-soft px-3 py-2 text-sm font-bold text-wrong">
            {error}
          </p>
        )}

        <Button type="submit" className="h-12 w-full rounded-md font-heading text-lg font-bold" disabled={saving}>
          {saving ? 'Saving…' : 'Save and continue'}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="h-11 rounded-md px-3 font-bold text-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Log out
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
