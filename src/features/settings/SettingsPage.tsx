import { useQueryClient } from '@tanstack/react-query'
import { Check, CloudUpload, Eye, EyeOff } from 'lucide-react'
import { useId, useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { FullPageMessage } from '@/components/FullPageMessage'
import { ShareKey } from '@/components/InstallHint'
import { PageHeader } from '@/components/dashboard'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/authContext'
import { useInstall } from '@/lib/install'
import { downloadBank, useBankStatus } from '@/lib/offline/bank'
import { clearOutbox, usePendingAnswerCount } from '@/lib/offline/outbox'
import { useOnline } from '@/lib/offline/useOfflineSync'
import { countdownLabel, daysUntil, isValidDate } from '@/lib/planner'
import {
  changePassword,
  firstName,
  MIN_PASSWORD_LENGTH,
  passwordProblem,
  saveFirstName,
  type PasswordChangeError,
} from '@/lib/profile'
import { cn } from '@/lib/utils'
import { DAILY_TARGET_CHOICES, resetProgress, saveStudySettings, useStudySettings, type StudySettings } from './api'

// Layout: like the iPad Settings app, in the lab-report look. Settings are grouped
// (Account / Study plan / This device), one row per setting: label, current value, and an
// "Edit" that opens a small form right under that row. Every row saves on its own, so
// there's no page-wide "Save changes" to wonder about. Only one row is open at a time.

/** Which row's form is open. */
type Editing = 'name' | 'exam' | 'password' | null

const INPUT_CLASS =
  'h-12 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

/** A group: small caps heading on the page, then a white sheet with its rows split by gray rules. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 px-1 text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">{children}</div>
    </section>
  )
}

/**
 * One setting. Big screens: label | value | action in a line. Phones: label and action on top, value under.
 * `children` (the open form) sits under the value column, so the fields line up with what they change.
 */
function Row({
  label,
  hint,
  value,
  action,
  children,
}: {
  label: string
  hint?: string
  value: ReactNode
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="px-5 py-3">
      <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
        <div className="col-start-1 row-start-1">
          <p className="font-semibold">{label}</p>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        <div className="col-span-2 row-start-2 text-muted-foreground sm:col-span-1 sm:col-start-2 sm:row-start-1">{value}</div>
        {action && <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">{action}</div>}
      </div>
      {children && <div className="pt-2 pb-3 sm:pl-52">{children}</div>}
    </div>
  )
}

/** The blue text button on the right of a row (Edit, Cancel, Update now…). */
function RowButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'h-11 rounded-md px-3 font-bold text-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:text-muted-foreground disabled:hover:bg-transparent',
        className,
      )}
      {...props}
    />
  )
}

/** The value of a row, in ink (not gray), when there's something set. */
function Strong({ children }: { children: ReactNode }) {
  return <span className="font-heading text-lg font-bold text-foreground">{children}</span>
}

/** Green "Saved" after a row saves. */
function SavedNote({ children = 'Saved' }: { children?: ReactNode }) {
  return (
    <span role="status" className="ml-2 inline-flex items-center gap-1 text-sm font-semibold text-correct">
      <Check className="size-4" aria-hidden />
      {children}
    </span>
  )
}

const SAVE_FAILED = 'Couldn’t save. Check your internet connection and try again.'

/* ---------------------------------- Account ---------------------------------- */

function NameRow({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  // Her name is saved on her login account, not with the study settings (see lib/profile.ts).
  const saved = firstName(useAuth().session?.user) ?? ''
  const [name, setName] = useState(saved)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function toggle() {
    setName(saved)
    setStatus('idle')
    onToggle(!open)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('saving')
    try {
      await saveFirstName(name)
      // her shared books on Community show this name (read live, migration 0011)
      void queryClient.invalidateQueries({ queryKey: ['community'] })
      setStatus('saved')
      onToggle(false)
    } catch {
      setStatus('error')
    }
  }

  return (
    <Row
      label="Name"
      value={
        <>
          {saved ? <Strong>{saved}</Strong> : 'Not set'}
          {status === 'saved' && !open && <SavedNote />}
        </>
      }
      action={
        <RowButton aria-expanded={open} onClick={toggle}>
          {open ? 'Cancel' : 'Edit'}
        </RowButton>
      }
    >
      {open && (
        <form onSubmit={handleSubmit} className="max-w-md space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="first-name" className="block text-sm font-semibold">
              First name or nickname
            </label>
            <input
              id="first-name"
              value={name}
              maxLength={40}
              autoComplete="given-name"
              autoFocus
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
            <p className="text-sm text-muted-foreground">Home greets you with it.</p>
          </div>
          {status === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              {SAVE_FAILED}
            </p>
          )}
          <Button type="submit" className="h-11 rounded-lg px-5 font-heading font-bold" disabled={name.trim() === saved || status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}
    </Row>
  )
}

/** A password box with a show/hide button, like the one on the login page. */
function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
  describedBy,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
  describedBy?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-describedby={describedBy}
          className={cn(INPUT_CLASS, 'pr-12')}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
    </div>
  )
}

const PASSWORD_ERRORS: Record<PasswordChangeError, string> = {
  'wrong-current': 'Your current password isn’t right. Try again.',
  weak: 'That password is too easy to guess. Try a longer one.',
  failed: 'Couldn’t change your password. Check your internet connection and try again.',
}

/** Change password: checks the current one first (lib/profile.ts), can log out her other devices. */
function PasswordRow({ open, onToggle }: { open: boolean; onToggle: (open: boolean) => void }) {
  const email = useAuth().session?.user.email ?? ''
  const online = useOnline()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [signOutOthers, setSignOutOthers] = useState(true)
  const [tried, setTried] = useState(false) // only point out problems after she presses the button
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | PasswordChangeError>('idle')

  const problem = passwordProblem(current, next, confirm)

  function toggle() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setTried(false)
    setStatus('idle')
    onToggle(!open)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (problem || !online) return
    setStatus('saving')
    const error = await changePassword(email, current, next, signOutOthers)
    if (error) {
      setStatus(error)
      return
    }
    setCurrent('')
    setNext('')
    setConfirm('')
    setStatus('done')
    onToggle(false)
  }

  const errorText = !online
    ? 'Connect to the internet to change your password.'
    : tried && problem
      ? problem
      : status === 'wrong-current' || status === 'weak' || status === 'failed'
        ? PASSWORD_ERRORS[status]
        : null

  return (
    <Row
      label="Password"
      value={
        <>
          <span aria-hidden className="tracking-widest">
            ••••••••
          </span>
          {status === 'done' && !open && <SavedNote>Password changed</SavedNote>}
        </>
      }
      action={
        <RowButton aria-expanded={open} onClick={toggle}>
          {open ? 'Cancel' : 'Change'}
        </RowButton>
      }
    >
      {open && (
        <form onSubmit={handleSubmit} className="max-w-md space-y-3" noValidate>
          <PasswordInput id="current-password" label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
          <div className="space-y-1">
            <PasswordInput id="new-password" label="New password" value={next} onChange={setNext} autoComplete="new-password" describedBy="new-password-hint" />
            <p id="new-password-hint" className="text-sm text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>
          <PasswordInput id="confirm-password" label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={signOutOthers}
              onChange={(e) => setSignOutOthers(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-primary"
            />
            <span>
              <span className="font-semibold">Log out my other devices</span>
              <span className="block text-muted-foreground">You stay logged in here.</span>
            </span>
          </label>

          {errorText && (
            <p role="alert" className="text-sm text-destructive">
              {errorText}
            </p>
          )}

          <Button type="submit" className="h-11 rounded-lg px-5 font-heading font-bold" disabled={!online || status === 'saving'}>
            {status === 'saving' ? 'Changing…' : 'Change password'}
          </Button>
        </form>
      )}
    </Row>
  )
}

/* --------------------------------- Study plan --------------------------------- */

/** "2027-03-14" → "Mar 14, 2027" (read as a local date, so it never shifts a day). */
function formatDate(value: string) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function ExamDateRow({ settings, open, onToggle }: { settings: StudySettings; open: boolean; onToggle: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [now] = useState(() => new Date())
  const saved = settings.examDate ?? ''
  const [examDate, setExamDate] = useState(saved)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const dateOk = examDate === '' || isValidDate(examDate)

  function toggle() {
    setExamDate(saved)
    setStatus('idle')
    onToggle(!open)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!dateOk) return
    setStatus('saving')
    try {
      await saveStudySettings({ examDate: examDate || null, dailyTarget: settings.dailyTarget })
      await queryClient.invalidateQueries({ queryKey: ['study-settings'] })
      setStatus('saved')
      onToggle(false)
    } catch {
      setStatus('error')
    }
  }

  const preview = !dateOk
    ? 'That isn’t a real date.'
    : examDate
      ? (countdownLabel(daysUntil(examDate, now)) ?? 'This date has passed.')
      : 'Not set. Home won’t show a countdown.'

  return (
    <Row
      label="Board exam date"
      value={
        <>
          {saved ? (
            <>
              <Strong>{formatDate(saved)}</Strong>
              <span className="text-sm"> · {countdownLabel(daysUntil(saved, now)) ?? 'This date has passed'}</span>
            </>
          ) : (
            'Not set'
          )}
          {status === 'saved' && !open && <SavedNote />}
        </>
      }
      action={
        <RowButton aria-expanded={open} onClick={toggle}>
          {open ? 'Cancel' : 'Edit'}
        </RowButton>
      }
    >
      {open && (
        <form onSubmit={handleSubmit} className="max-w-md space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="exam-date" className="block text-sm font-semibold">
              Board exam date
            </label>
            <div className="flex gap-2">
              <input
                id="exam-date"
                type="date"
                value={examDate}
                min={`${now.getFullYear()}-01-01`}
                autoFocus
                onChange={(e) => setExamDate(e.target.value)}
                aria-invalid={!dateOk}
                aria-describedby="exam-date-preview"
                className={INPUT_CLASS}
              />
              {examDate && (
                <Button type="button" variant="outline" className="h-12 rounded-lg" onClick={() => setExamDate('')}>
                  Clear
                </Button>
              )}
            </div>
            <p id="exam-date-preview" className={cn('text-sm', dateOk ? 'text-muted-foreground' : 'text-destructive')} aria-live="polite">
              {preview}
            </p>
          </div>
          {status === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              {SAVE_FAILED}
            </p>
          )}
          <Button type="submit" className="h-11 rounded-lg px-5 font-heading font-bold" disabled={!dateOk || examDate === saved || status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </Button>
        </form>
      )}
    </Row>
  )
}

/** Daily goal: tap a number and it's saved (no Edit step; it's one tap either way). */
function DailyGoalRow({ settings }: { settings: StudySettings }) {
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<number | null>(null) // shown while saving, before the refetch
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const current = picked ?? settings.dailyTarget

  async function pick(n: number) {
    if (n === current) return
    setPicked(n)
    setStatus('saving')
    try {
      await saveStudySettings({ examDate: settings.examDate, dailyTarget: n })
      await queryClient.invalidateQueries({ queryKey: ['study-settings'] })
      setStatus('saved')
    } catch {
      setStatus('error')
    }
    setPicked(null) // back to the saved value (the new one, or the old one if it failed)
  }

  return (
    <Row
      label="Daily goal"
      hint="Questions a day"
      value={
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Daily goal, questions a day">
            {DAILY_TARGET_CHOICES.map((n) => (
              <label
                key={n}
                className={cn(
                  'flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-lg border px-3 font-heading font-bold text-foreground tabular-nums has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                  current === n ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
                )}
              >
                <input type="radio" name="daily-target" checked={current === n} onChange={() => pick(n)} className="sr-only" />
                {n}
              </label>
            ))}
            {status === 'saved' && <SavedNote />}
          </div>
          {status === 'error' && (
            <p role="alert" className="text-sm text-destructive">
              {SAVE_FAILED}
            </p>
          )}
        </div>
      }
    />
  )
}

/* -------------------------------- This device -------------------------------- */

/** Install app: what to do depends on the device (see lib/install.ts). The same help as the tip on top. */
function InstallRow() {
  const { mode, promptInstall } = useInstall()
  const [showSteps, setShowSteps] = useState(false)

  const value =
    mode === 'installed' ? (
      <span className="inline-flex items-center gap-1.5 font-semibold text-correct">
        <Check className="size-4" aria-hidden />
        Installed
      </span>
    ) : mode === 'manual' ? (
      <span className="text-sm">
        In your browser’s menu, choose <span className="font-semibold text-foreground">Install app</span> or{' '}
        <span className="font-semibold text-foreground">Add to Home Screen</span>.
      </span>
    ) : (
      <span className="text-sm">Opens like an app from your Home Screen.</span>
    )

  const action =
    mode === 'prompt' ? (
      <RowButton onClick={promptInstall}>Install</RowButton>
    ) : mode === 'ios' ? (
      <RowButton aria-expanded={showSteps} onClick={() => setShowSteps((s) => !s)}>
        {showSteps ? 'Hide' : 'Show me how'}
      </RowButton>
    ) : undefined

  return (
    <Row label="Install app" value={value} action={action}>
      {mode === 'ios' && showSteps && (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>
            Tap <ShareKey /> in Safari’s toolbar. On iPhone, if you don’t see it, tap the More button (three dots) first.
          </li>
          <li>
            Choose <span className="font-semibold">Add to Home Screen</span>, then tap <span className="font-semibold">Add</span>.
          </li>
          <li>Open ProjectRMT from its new icon on your Home Screen.</li>
        </ol>
      )}
    </Row>
  )
}

/** "just now", "5 min ago", "3 h ago", or the date. */
function timeAgo(time: number, now: number) {
  const minutes = Math.round((now - time) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `on ${new Date(time).toLocaleDateString()}`
}

/** Offline practice: what's saved on this device, and answers still waiting to reach the server (lib/offline). */
function OfflineRow() {
  const bank = useBankStatus()
  const pending = usePendingAnswerCount()
  const online = useOnline()
  const [failed, setFailed] = useState(false)
  const [now] = useState(() => Date.now()) // when the page opened, for "updated 2 h ago"

  async function update() {
    setFailed(false)
    setFailed(!(await downloadBank()))
  }

  return (
    <Row
      label="Offline practice"
      hint="Practice, Mock exam and Flashcards work without internet."
      value={
        <div className="space-y-0.5 text-sm" aria-live="polite">
          <p>
            {bank.downloading ? (
              'Saving questions…'
            ) : bank.questionCount !== null && bank.savedAt !== null ? (
              <>
                <span className="font-heading text-lg font-bold text-foreground tabular-nums">{bank.questionCount.toLocaleString()}</span> questions
                saved · updated {timeAgo(bank.savedAt, now)}
              </>
            ) : (
              'Nothing saved yet. It saves by itself while you’re online.'
            )}
          </p>
          {pending > 0 ? (
            <p className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <CloudUpload className="size-4 text-primary" aria-hidden />
              {pending} {pending === 1 ? 'answer' : 'answers'} waiting to sync
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5">
              <Check className="size-4 text-correct" aria-hidden />
              All answers synced
            </p>
          )}
          {failed && <p className="text-destructive">Couldn’t update. Check your internet connection and try again.</p>}
        </div>
      }
      action={
        <RowButton disabled={!online || bank.downloading} onClick={update}>
          {online ? 'Update now' : 'Offline'}
        </RowButton>
      }
    />
  )
}

/* -------------------------------- Danger zone -------------------------------- */

const CONFIRM_WORD = 'RESET'

/** Wipes her progress after she types RESET. Kept apart from the groups, with a red border, so it can't be hit by accident. */
function ResetProgress() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState<'idle' | 'resetting' | 'done' | 'error'>('idle')

  function close() {
    setOpen(false)
    setTyped('')
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault()
    if (typed.trim() !== CONFIRM_WORD) return
    setStatus('resetting')
    try {
      await resetProgress()
      // Answers waiting on this device would bring old progress back, and the offline copy still has it.
      clearOutbox()
      void downloadBank()
      // Every page's stats come from these tables, so refetch everything except her settings.
      await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'study-settings' })
      setStatus('done')
      close()
    } catch {
      setStatus('error')
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-destructive/40 bg-card px-5 py-4" aria-labelledby="reset-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id="reset-title" className="font-semibold text-destructive">
            Reset progress
          </h2>
          <p className="text-sm text-muted-foreground">
            Deletes quiz and mock exam history, scores, streak and flashcard schedule. Keeps your own questions, books, uploads and study plan.
            Can’t be undone.
          </p>
        </div>
        {!open && (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg border-destructive/50 px-4 font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setOpen(true)
              setStatus('idle')
            }}
          >
            Reset…
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={handleReset} className="space-y-3 rounded-xl bg-destructive/5 p-4">
          <label htmlFor="reset-confirm" className="block text-sm font-semibold">
            Type {CONFIRM_WORD} to confirm
          </label>
          <input
            id="reset-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
            className={cn(INPUT_CLASS, 'max-w-xs')}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="h-11 rounded-lg px-4" onClick={close} disabled={status === 'resetting'}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 rounded-lg bg-destructive px-4 font-heading font-bold text-white hover:bg-destructive/85"
              disabled={typed.trim() !== CONFIRM_WORD || status === 'resetting'}
            >
              {status === 'resetting' ? 'Deleting…' : 'Delete all progress'}
            </Button>
          </div>
        </form>
      )}

      {(status === 'done' || status === 'error') && (
        <p role="status" className="text-sm">
          {status === 'done' ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-correct">
              <Check className="size-4" aria-hidden />
              Progress reset. You’re starting fresh.
            </span>
          ) : (
            <span className="text-destructive">Couldn’t reset. Check your internet connection and try again.</span>
          )}
        </p>
      )}
    </section>
  )
}

export default function SettingsPage() {
  const settings = useStudySettings()
  const email = useAuth().session?.user.email
  const [editing, setEditing] = useState<Editing>(null)

  if (settings.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (settings.isError) return <FullPageMessage>Couldn’t load your settings. Check your internet connection, then refresh.</FullPageMessage>

  /** Opening one row's form closes any other. */
  const toggle = (row: Exclude<Editing, null>) => (open: boolean) => setEditing(open ? row : null)

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Settings" subtitle="You and your study plan." />

      <Group title="Account">
        <NameRow open={editing === 'name'} onToggle={toggle('name')} />
        <Row label="Email" value={<span className="break-all">{email}</span>} />
        <PasswordRow open={editing === 'password'} onToggle={toggle('password')} />
      </Group>

      <Group title="Study plan">
        <ExamDateRow settings={settings.data} open={editing === 'exam'} onToggle={toggle('exam')} />
        <DailyGoalRow settings={settings.data} />
      </Group>

      <Group title="This device">
        <InstallRow />
        <OfflineRow />
      </Group>

      <ResetProgress />
    </div>
  )
}
