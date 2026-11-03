import { useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Check, Target } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { FullPageMessage } from '@/components/FullPageMessage'
import { PageHeader } from '@/components/dashboard'
import { Button } from '@/components/ui/button'
import { countdownLabel, daysUntil, isValidDate } from '@/lib/planner'
import { cn } from '@/lib/utils'
import { DAILY_TARGET_CHOICES, saveStudySettings, useStudySettings, type StudySettings } from './api'

/** One settings block: an icon, a title + hint, and its control. */
function Section({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</span>
        <div>
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div>{children}</div>
    </section>
  )
}

/** The form, shown once the saved settings are loaded (so it starts with her real values). */
function SettingsForm({ initial }: { initial: StudySettings }) {
  const queryClient = useQueryClient()
  const [now] = useState(() => new Date())
  const [examDate, setExamDate] = useState(initial.examDate ?? '')
  const [dailyTarget, setDailyTarget] = useState(initial.dailyTarget)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const dateOk = examDate === '' || isValidDate(examDate)
  const preview = examDate && dateOk ? countdownLabel(daysUntil(examDate, now)) : null
  const changed = examDate !== (initial.examDate ?? '') || dailyTarget !== initial.dailyTarget

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!dateOk) return
    setStatus('saving')
    try {
      await saveStudySettings({ examDate: examDate || null, dailyTarget })
      await queryClient.invalidateQueries({ queryKey: ['study-settings'] })
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Section icon={<CalendarClock className="size-5" aria-hidden />} title="Board exam date" hint="Home counts down the days to it.">
        <label htmlFor="exam-date" className="sr-only">
          Board exam date
        </label>
        <div className="flex gap-2">
          <input
            id="exam-date"
            type="date"
            value={examDate}
            min={`${now.getFullYear()}-01-01`}
            onChange={(e) => {
              setExamDate(e.target.value)
              setStatus('idle')
            }}
            aria-invalid={!dateOk}
            className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {examDate && (
            <Button type="button" variant="outline" className="h-12 rounded-lg" onClick={() => setExamDate('')}>
              Clear
            </Button>
          )}
        </div>
        <p className={cn('mt-1.5 text-sm', dateOk ? 'text-muted-foreground' : 'text-destructive')} aria-live="polite">
          {!dateOk ? 'That isn’t a real date.' : preview ?? (examDate ? 'This date has passed.' : 'Not set yet.')}
        </p>
      </Section>

      <Section icon={<Target className="size-5" aria-hidden />} title="Daily goal" hint="Questions to answer each day (Practice and Mock exam).">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Questions a day">
          {DAILY_TARGET_CHOICES.map((n) => (
            <label
              key={n}
              className={cn(
                'flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-lg border px-3 font-heading font-bold tabular-nums has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                dailyTarget === n ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
              )}
            >
              <input
                type="radio"
                name="daily-target"
                checked={dailyTarget === n}
                onChange={() => {
                  setDailyTarget(n)
                  setStatus('idle')
                }}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-12 rounded-lg px-6 font-heading text-base font-bold" disabled={!changed || !dateOk || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save changes'}
        </Button>
        <p role="status" className="text-sm">
          {status === 'saved' && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-correct">
              <Check className="size-4" aria-hidden />
              Saved
            </span>
          )}
          {status === 'error' && <span className="text-destructive">Couldn’t save. Check your internet connection and try again.</span>}
        </p>
      </div>
    </form>
  )
}

export default function SettingsPage() {
  const settings = useStudySettings()
  if (settings.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (settings.isError) return <FullPageMessage>Couldn’t load your settings. Check your internet connection, then refresh.</FullPageMessage>
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Your study plan." />
      <SettingsForm initial={settings.data} />
    </div>
  )
}
