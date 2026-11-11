import { useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Dialog } from '@/components/Dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/authContext'
import { saveStudySettings, type StudySettings } from '@/features/settings/api'
import { countdownLabel, daysUntil, isValidDate } from '@/lib/planner'
import { finishWelcome, suggestedFirstName } from '@/lib/profile'
import { cn } from '@/lib/utils'

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

/**
 * First visit to Home: two optional questions (name, board exam date), so Home can greet her
 * and count down to the exam. Skip (or Esc) closes it for good; both live in Settings too.
 * Slides up from the bottom so Skip and Save sit where the thumbs are on an iPad.
 */
export function WelcomeDialog({ open, settings, onDone }: { open: boolean; settings: StudySettings; onDone: () => void }) {
  const queryClient = useQueryClient()
  const user = useAuth().session?.user
  const [now] = useState(() => new Date())
  const [name, setName] = useState(() => suggestedFirstName(user))
  const [examDate, setExamDate] = useState('')
  const [unsure, setUnsure] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')

  const date = unsure ? '' : examDate
  const dateOk = date === '' || isValidDate(date)
  const preview = !dateOk
    ? 'That isn’t a real date.'
    : date
      ? (countdownLabel(daysUntil(date, now)) ?? 'This date has passed.')
      : 'We count down the days and pace your daily goal.'

  function skip() {
    onDone()
    // Best effort: if it can't be saved (offline), it simply shows once more next time.
    finishWelcome('').catch(() => undefined)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!dateOk) return
    setStatus('saving')
    try {
      if (date) {
        await saveStudySettings({ examDate: date, dailyTarget: settings.dailyTarget })
        await queryClient.invalidateQueries({ queryKey: ['study-settings'] })
      }
      await finishWelcome(name)
      // her shared books on Community show her name
      void queryClient.invalidateQueries({ queryKey: ['community'] })
      onDone()
    } catch {
      setStatus('error')
    }
  }

  return (
    <Dialog open={open} onClose={skip} labelledBy="welcome-heading" variant="bottom" closeOnBackdrop={false}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1">
          <h2 id="welcome-heading" className="font-heading text-2xl font-bold">
            Welcome to ProjectRMT
          </h2>
          <p className="text-muted-foreground">Two quick things so we can plan with you. Both are optional.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="welcome-name" className="block text-sm font-semibold">
            First name or nickname
          </label>
          <input
            id="welcome-name"
            value={name}
            maxLength={40}
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
            className={INPUT_CLASS}
          />
          <p className="text-sm text-muted-foreground">Home greets you with it.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="welcome-exam-date" className="block text-sm font-semibold">
            Board exam date
          </label>
          <input
            id="welcome-exam-date"
            type="date"
            value={date}
            min={`${now.getFullYear()}-01-01`}
            disabled={unsure}
            onChange={(e) => setExamDate(e.target.value)}
            aria-invalid={!dateOk}
            aria-describedby="welcome-exam-date-preview"
            className={INPUT_CLASS}
          />
          <p id="welcome-exam-date-preview" className={cn('text-sm', dateOk ? 'text-muted-foreground' : 'text-destructive')} aria-live="polite">
            {preview}
          </p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" checked={unsure} onChange={(e) => setUnsure(e.target.checked)} className="size-5 shrink-0 accent-primary" />
            <span className="font-semibold">I don’t know yet</span>
          </label>
        </div>

        <p className="rounded-lg bg-secondary px-3 py-2 text-sm">You can change these anytime in Settings.</p>

        {status === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            Couldn’t save. Check your internet connection and try again.
          </p>
        )}

        <div className="flex gap-3 border-t pt-4">
          <Button type="button" variant="outline" className="h-12 flex-1 rounded-lg font-heading text-base font-bold" onClick={skip}>
            Skip for now
          </Button>
          <Button type="submit" className="h-12 flex-1 rounded-lg font-heading text-base font-bold" disabled={!dateOk || status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
