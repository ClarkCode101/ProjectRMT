import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, House, Microscope, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { PageHeader } from '@/components/dashboard'
import { SwipeCarousel } from '@/components/SwipeCarousel'
import { useFocusMode } from '@/components/layoutContext'
import { HeroPanel, heroButtonClass } from '@/components/report'
import { DEFAULT_SOURCE, questionPoolOptions, type QuizQuestion, type SourceChoice } from '@/features/quiz/api'
import { SourcePicker } from '@/features/quiz/SourcePicker'
import { localDateKey } from '@/lib/activity'
import { buildDeck, dueByTomorrow, maxIntervalForExam } from '@/lib/fsrs'
import { daysUntil } from '@/lib/planner'
import { useStudySettings } from '@/features/settings/api'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { cn } from '@/lib/utils'
import { reviewStatesOptions } from './api'
import { FlashcardSession, type SessionStats } from './FlashcardSession'
import { FieldOfView } from './FieldOfView'

/** One lens on the carousel: a subject (or All), what it looks like under the microscope, and its card counts. */
type Lens = { key: string; code: string; name: string; picture: string; due: number; fresh: number }

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

/** How long the "look into the lens" scene plays before the session (matches .lens-look in index.css). */
const LOOK_MS = 1000

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
  // The board exam date: no card is scheduled to come back after it.
  const study = useStudySettings()
  const examDate = study.data?.examDate ?? null
  const daysToExam = examDate ? daysUntil(examDate, now) : null
  const maxIntervalDays = maxIntervalForExam(daysToExam)
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

  // Look: the middle lens focuses and dives in, then the session starts.
  const [looking, setLooking] = useState(false)
  const lookTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(lookTimer.current), [])

  function look() {
    if (looking) return
    const start = () => {
      setLooking(false)
      setStage({ name: 'session', deck: [...deck.due, ...deck.fresh] })
    }
    // Reduced motion: no scene, start right away.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return start()
    setLooking(true)
    lookTimer.current = window.setTimeout(start, LOOK_MS)
  }

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
        maxIntervalDays={maxIntervalDays}
      />
    )
  }

  if (stage.name === 'done') {
    const tomorrow = dueByTomorrow(reviewStates.data ?? [], now)
    return (
      <div className="mx-auto max-w-xl space-y-4 sm:pt-6">
        <HeroPanel labelledBy="done-heading" className="space-y-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/15">
            <Microscope className="size-6" aria-hidden />
          </span>
          <div>
            <h1 id="done-heading" className="font-heading text-3xl font-bold">
              All slides read
            </h1>
            <p className="mt-1 text-white/85">
              You reviewed {plural(stage.stats.reviewed, 'card')}
              {stage.stats.newStudied > 0 && <>, {stage.stats.newStudied} of them new</>}. Each one is scheduled to come back right before you’d forget it.
            </p>
          </div>
          {reviewStates.isSuccess && <p className="rounded-md bg-white/10 px-3 py-2 text-sm">{plural(tomorrow, 'card')} due by the end of tomorrow.</p>}
          {/* Same pair as the mock exam results: gold main button + a see-through secondary one of the same size. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Link to="/" className={heroButtonClass}>
              <House className="size-5" aria-hidden />
              Back to Home
            </Link>
            <button
              type="button"
              onClick={() => setStage({ name: 'setup' })}
              className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white/10 px-5 font-heading text-base font-bold text-white outline-none hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/60 active:translate-y-px"
            >
              Back to the slides
            </button>
          </div>
        </HeroPanel>
      </div>
    )
  }

  if (pool.isPending || reviewStates.isPending || subjects.isPending) return <FullPageMessage>Loading your cards…</FullPageMessage>
  if (pool.isError || reviewStates.isError) return <FullPageMessage>Couldn’t load your cards. Check your internet connection, then refresh.</FullPageMessage>

  const minutes = Math.max(1, Math.round(total * 0.4)) // about 25 seconds a card
  // One lens per subject, plus All first. Each shows what that subject looks like under the microscope.
  const lenses: Lens[] = [{ key: 'all', code: 'ALL', name: 'All six subjects', picture: 'All' }, ...(subjects.data ?? []).map((s) => ({ key: String(s.id), code: s.code, name: s.name, picture: s.code }))].map(
    (l) => {
      const d = deckFor(l.key === 'all' ? null : Number(l.key))
      return { ...l, due: d.due.length, fresh: d.fresh.length }
    },
  )
  const lensIndex = Math.max(0, lenses.findIndex((l) => l.key === (subjectId === null ? 'all' : String(subjectId))))

  return (
    // One screen tall, no scrolling (same as Practice and Mock exam): the lenses take whatever height is left.
    // Phone: minus the top bar (3.5rem), main's padding (0.5 + 1.5rem) and the bottom nav (5.5rem).
    // Tablet/computer: minus main's padding (pt-5 + pb-5 = 2.5rem). min-h: on a very short screen it scrolls instead of squashing.
    <div className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[30rem] max-w-5xl flex-col gap-3 md:h-[calc(100dvh-2.5rem)] md:min-h-[32rem]">
      <PageHeader title="Flashcards" subtitle="Swipe the lens to choose a slide." />

      {/* ---------- The lenses: one big view in the middle, swipe to switch (the same picker as Practice) ---------- */}
      <SwipeCarousel
        items={lenses}
        index={lensIndex}
        onIndexChange={(i) => setSubjectId(lenses[i].key === 'all' ? null : Number(lenses[i].key))}
        onOpen={look}
        label="Slides"
        align="center"
        bench={false}
        disabled={looking}
        renderFigure={(l, { centered }) => (
          // Side lenses carry their due count (the middle one has it in the name plate). Nothing due = dimmer.
          <div className={cn('w-60 md:w-80', !centered && l.due === 0 && 'opacity-60 grayscale-[35%]')}>
            <FieldOfView code={l.picture} label={centered ? undefined : l.due === 0 ? 'Caught up' : `${l.due} due`} looking={centered && looking} />
          </div>
        )}
        renderDetail={(l) =>
          l.due + l.fresh === 0 ? (
            <span className="font-bold text-correct">All caught up</span>
          ) : (
            <span className="font-bold text-primary tabular-nums">
              {l.due} due{l.fresh > 0 && ` · ${l.fresh} new`}
            </span>
          )
        }
      />

      {/* ---------- Start: ⚙ + the gold Look button, centered under the lenses ---------- */}
      <section aria-label="Start" className="flex shrink-0 flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOptionsOpen(true)}
            aria-label={optionsChanged ? 'Flashcard options (changed)' : 'Flashcard options'}
            className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <SlidersHorizontal className="size-5" aria-hidden />
            {optionsChanged && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-highlight" aria-hidden />}
          </button>
          <button
            type="button"
            className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}
            disabled={total === 0 || looking}
            onClick={look}
          >
            <Microscope className="size-5" aria-hidden />
            {looking ? 'Focusing…' : total === 0 ? 'Nothing to look at' : `Look · ${plural(total, 'card')}`}
          </button>
        </div>
        {/* always one line (h-4), so the lenses above don't change size */}
        <p className="h-4 text-xs text-muted-foreground" aria-live="polite">
          {total === 0
            ? settings.newDoneToday >= settings.newPerDay
              ? 'All caught up. Come back tomorrow.'
              : 'Nothing due here. Try another slide.'
            : `About ${plural(minutes, 'minute')}`}
        </p>
      </section>

      {/* Why the intervals may look shorter near the exam, or a nudge to set the date so they can. One quiet line at the bottom. */}
      {study.isSuccess && (
        <p className="shrink-0 border-t border-dashed pt-3 text-center text-sm text-muted-foreground">
          <CalendarClock className="mr-1 inline size-4 align-[-3px] text-primary" aria-hidden />
          {maxIntervalDays !== undefined ? (
            <>
              No card is scheduled after your board exam
              {daysToExam !== null && daysToExam > 0 && <> ({plural(daysToExam, 'day')} away)</>}.
            </>
          ) : (
            <>
              <Link to="/settings" className="font-semibold text-primary hover:underline">
                Set your exam date
              </Link>{' '}
              so no card is scheduled after it.
            </>
          )}
        </p>
      )}

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="fc-options-heading" variant="sheet">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="fc-options-heading" className="font-heading text-lg font-bold">
              Flashcard options
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
          {/* Changed rarely, so it lives here instead of next to Start. */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">New cards a day</legend>
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg bg-secondary p-1">
                {NEW_PER_DAY_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateSettings({ newPerDay: n })}
                    aria-pressed={settings.newPerDay === n}
                    className={cn(
                      'h-9 min-w-12 rounded-md px-2 font-bold tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                      settings.newPerDay === n ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {settings.newDoneToday > 0 && <span className="text-sm text-muted-foreground tabular-nums">{settings.newDoneToday} done today</span>}
            </div>
          </fieldset>
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
