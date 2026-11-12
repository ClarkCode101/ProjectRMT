import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/authContext'
import { saveFirstName, suggestedFirstName } from '@/lib/profile'

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

type Props = {
  /** after the name is saved: go on to what she was doing (host, join, accept an invite) */
  onSaved: () => void
  headingId: string
}

/**
 * Team games need a name: classmates see it on the seats, in the chat and on invites, and only accounts with a name
 * show up in the Invite list. A member without one (useNeedsTeamName) is asked here, just in time, before she joins
 * or hosts, instead of being sent to Settings. Google sign-ups get their first name filled in.
 */
export function TeamNameStep({ onSaved, headingId }: Props) {
  const queryClient = useQueryClient()
  const user = useAuth().session?.user
  const [name, setName] = useState(() => suggestedFirstName(user))
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const ready = name.trim() !== ''

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!ready || status === 'saving') return
    setStatus('saving')
    try {
      await saveFirstName(name)
      // the name also shows on her shared books in Community
      void queryClient.invalidateQueries({ queryKey: ['community'] })
      onSaved()
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <h2 id={headingId} className="font-heading text-xl font-bold">
          What should classmates call you?
        </h2>
        <p className="text-sm text-muted-foreground">They’ll see this name in team games. You can change it anytime in Settings.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${headingId}-input`} className="block text-sm font-semibold">
          First name or nickname
        </label>
        <input
          id={`${headingId}-input`}
          value={name}
          maxLength={40}
          autoComplete="given-name"
          autoFocus
          onChange={(e) => {
            setName(e.target.value)
            if (status === 'error') setStatus('idle')
          }}
          className={INPUT_CLASS}
        />
      </div>

      {status === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t save. Check your internet connection and try again.
        </p>
      )}

      {/* bottom of the sheet: in thumb reach on an iPad */}
      <div className="border-t pt-4">
        <Button type="submit" className="h-12 w-full rounded-lg font-heading text-base font-bold" disabled={!ready || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Continue'}
        </Button>
      </div>
    </form>
  )
}
