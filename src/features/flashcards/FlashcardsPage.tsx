import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Play, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { PageHeader } from '@/components/dashboard'
import { useFocusMode } from '@/components/layoutContext'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { DEFAULT_SOURCE, questionPoolOptions, type QuizQuestion, type SourceChoice } from '@/features/quiz/api'
import { SourcePicker } from '@/features/quiz/SourcePicker'
import { localDateKey } from '@/lib/activity'
import { buildDeck, dueByTomorrow } from '@/lib/fsrs'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { reviewStatesOptions } from './api'
import { FlashcardSession, type SessionStats } from './FlashcardSession'

// ---------- Settings kept on this device: new cards per day, and how many new ones she has done today ----------

const SETTINGS_KEY = 'projectrmt:flashcards'
const NEW_PER_DAY_CHOICES = [10, 20, 50]

type DeviceSettings = { newPerDay: number; date: string; newDoneToday: number }

function readSettings(today: string): DeviceSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as Partial<DeviceSettings> | null
    const newPerDay = NEW_PER_DAY_CHOICES.includes(Number(s?.newPerDay)) ? Number(s?.newPerDay) : 20
    // A new day resets the count of new cards done.
    const newDoneToday = s?.date === today && Number.isInteger(s?.newDoneToday) ? Number(s?.newDoneToday) : 0
    return { newPerDay, date: today, newDoneToday }
  } catch {
    return { newPerDay: 20, date: today, newDoneToday: 0 }
  }
}
function writeSettings(s: DeviceSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // storage blocked: settings just won't be remembered
  }
}

type Stage = { name: 'setup' } | { name: 'session'; deck: QuizQuestion[] } | { name: 'done'; stats: SessionStats }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function FlashcardsPage() {
  const queryClient = useQueryClient()
  const subjects = useSubjects()
  const topics = useTopics()
  const [now] = useState(() => new Date())
  const today = localDateKey(now)

  const [stage, setStage] = useState<Stage>({ name: 'setup' })
  const [subjectId, setSubjectId] = useState<number | null>(null)
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>(DEFAULT_SOURCE)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [settings, setSettings] = useState(() => readSettings(today))
  // Remember the settings on this device whenever they change.
  useEffect(() => writeSettings(settings), [settings])
  useFocusMode(stage.name === 'session')

  // Every subject's questions, loaded once; the subject chips just filter this list.
  const pool = useQuery(questionPoolOptions({ ...sourceChoice, subjectId: null, topicId: null }, []))
  const reviewStates = useQuery(reviewStatesOptions)
  const states = useMemo(() => new Map((reviewStates.data ?? []).map((r) => [r.question_id, r])), [reviewStates.data])
  const subjectOfTopic = useMemo(() => new Map((topics.data ?? []).map((t) => [t.id, t.subject_id])), [topics.data])

  const newLeftToday = Math.max(0, settings.newPerDay - settings.newDoneToday)
  const inSubject = (q: QuizQuestion, id: number | null) => id === null || subjectOfTopic.get(q.topic_id) === id
  const deckFor = (id: number | null) => buildDeck((pool.data ?? []).filter((q) => inSubject(q, id)), states, now, newLeftToday)
  const deck = deckFor(subjectId)
  const total = deck.due.length + deck.fresh.length
  const optionsChanged = sourceChoice.source !== 'all' || sourceChoice.verifiedOnly

  function updateSettings(change: Partial<DeviceSettings>) {
    setSettings((s) => ({ ...s, ...change }))
  }

  function finish(stats: SessionStats, done: boolean) {
    // New due dates were saved: reload them next time.
    void queryClient.invalidateQueries({ queryKey: ['review-states'] })
    setStage(done ? { name: 'done', stats } : { name: 'setup' })
  }

  if (stage.name === 'session') {
    return (
      <FlashcardSession
        deck={stage.deck}
        states={states}
        onNewStudied={() => setSettings((s) => ({ ...s, newDoneToday: s.newDoneToday + 1 }))}
        onDone={(stats) => finish(stats, true)}
        onExit={(stats) => finish(stats, false)}
      />
    )
  }

  if (stage.name === 'done') {
    const tomorrow = dueByTomorrow(reviewStates.data ?? [], now)
    return (
      <div className="mx-auto max-w-xl space-y-4 sm:pt-6">
        <HeroPanel labelledBy="done-heading" className="space-y-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/15">
            <Check className="size-6" aria-hidden />
          </span>
          <div>
            <h1 id="done-heading" className="font-heading text-3xl font-bold">
              Done for now
            </h1>
            <p className="mt-1 text-white/85">
              You reviewed {plural(stage.stats.reviewed, 'card')}
              {stage.stats.newStudied > 0 && <>, {stage.stats.newStudied} of them new</>}. Each one is scheduled to come back right before you’d forget it.
            </p>
          </div>
          {reviewStates.isSuccess && <p className="rounded-md bg-white/10 px-3 py-2 text-sm">{plural(tomorrow, 'card')} due by the end of tomorrow.</p>}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <Link to="/" className={heroButtonClass}>
              Back to Home
            </Link>
            <button
              type="button"
              onClick={() => setStage({ name: 'setup' })}
              className="rounded-md px-2 py-2.5 text-sm font-semibold text-white/85 underline-offset-4 outline-none hover:text-white hover:underline focus-visible:ring-3 focus-visible:ring-white/60"
            >
              See today’s deck
            </button>
          </div>
        </HeroPanel>
      </div>
    )
  }

  if (pool.isPending || reviewStates.isPending || subjects.isPending) return <FullPageMessage>Loading your cards…</FullPageMessage>
  if (pool.isError || reviewStates.isError) return <FullPageMessage>Couldn’t load your cards. Check your internet connection, then refresh.</FullPageMessage>

  const minutes = Math.max(1, Math.round(total * 0.4)) // about 25 seconds a card

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Flashcards" subtitle="Cards come back right before you’d forget them." />

      {/* ---------- Subject filter, with how many cards each has today ---------- */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
        {[{ id: null as number | null, code: 'All' }, ...(subjects.data ?? []).map((s) => ({ id: s.id as number | null, code: s.code }))].map((s) => {
          const count = s.id === subjectId ? total : (() => {
            const d = deckFor(s.id)
            return d.due.length + d.fresh.length
          })()
          const active = subjectId === s.id
          return (
            <button
              key={s.code}
              type="button"
              onClick={() => setSubjectId(s.id)}
              aria-pressed={active}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                active ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
              )}
            >
              {s.code}
              <span className={cn('tabular-nums', active ? 'text-white/80' : 'text-muted-foreground')}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ---------- Today's deck: the one colored thing on this screen ---------- */}
      <HeroPanel labelledBy="deck-heading" className="space-y-5">
        <div className="flex items-start gap-5">
          {/* A small stack of index cards, just decoration */}
          <div className="relative hidden h-20 w-16 shrink-0 sm:block" aria-hidden>
            <span className="absolute inset-0 translate-x-2 -translate-y-2 rotate-6 rounded-lg bg-white/20" />
            <span className="absolute inset-0 translate-x-1 -translate-y-1 rotate-3 rounded-lg bg-white/35" />
            <span className="absolute inset-0 rounded-lg bg-white" />
          </div>
          <div className="min-w-0">
            <h2 id="deck-heading" className="text-sm font-semibold text-white/70">
              Today’s deck
            </h2>
            <p className="font-heading text-4xl leading-tight font-bold tabular-nums">
              {deck.due.length} <span className="text-xl font-semibold text-white/80">due</span>
              <span className="mx-2 text-white/40">·</span>
              {deck.fresh.length} <span className="text-xl font-semibold text-white/80">new</span>
            </p>
            <p className="text-white/80">
              {total === 0
                ? settings.newDoneToday >= settings.newPerDay
                  ? 'All caught up, and you’ve done today’s new cards. Come back tomorrow.'
                  : 'All caught up here. Try another subject or source.'
                : `About ${plural(minutes, 'minute')}.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-white/80">New cards a day</span>
          <div className="flex rounded-lg bg-white/10 p-1" role="group" aria-label="New cards a day">
            {NEW_PER_DAY_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => updateSettings({ newPerDay: n })}
                aria-pressed={settings.newPerDay === n}
                className={cn(
                  'h-8 min-w-10 rounded-md px-2 font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                  settings.newPerDay === n ? 'bg-white text-primary-deep' : 'text-white/80 hover:text-white',
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {settings.newDoneToday > 0 && <span className="text-white/60">{settings.newDoneToday} done today</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label={optionsChanged ? 'Question options (changed)' : 'Question options'}
            className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-white/10 outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/60"
          >
            <SlidersHorizontal className="size-5" aria-hidden />
            {optionsChanged && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-highlight" aria-hidden />}
          </button>
          <button
            type="button"
            className={cn(heroButtonClass, 'flex-1 sm:flex-none')}
            disabled={total === 0}
            onClick={() => setStage({ name: 'session', deck: [...deck.due, ...deck.fresh] })}
          >
            <Play className="size-5 fill-current" aria-hidden />
            Start {plural(total, 'card')}
          </button>
        </div>
      </HeroPanel>

      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">How it works:</span> read the question, think of the answer, then flip the card and rate how well you knew it. “Again”
        brings it back in a few minutes; “Easy” pushes it days or weeks away.
      </p>

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="fc-options-heading" variant="sheet">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="fc-options-heading" className="font-heading text-lg font-bold">
              Question options
            </h2>
            <button
              type="button"
              onClick={() => setOptionsOpen(false)}
              aria-label="Close"
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <SourcePicker value={sourceChoice} onChange={setSourceChoice} />
          <button
            type="button"
            onClick={() => setOptionsOpen(false)}
            className="h-11 w-full rounded-lg bg-primary font-heading font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            Done
          </button>
        </div>
      </Dialog>
    </div>
  )
}
