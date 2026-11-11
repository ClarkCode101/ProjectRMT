import { useQuery } from '@tanstack/react-query'
import { Play, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import { useTopicPerformance } from '@/features/dashboard/api'
import { useMistakes } from '@/features/mistakes/api'
import { formatPercent, overallStats, smartPick, summarizePerformance } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { buildHistory, countUnseen, sessionMix } from '@/lib/selection'
import { cn } from '@/lib/utils'
import { attemptHistoryOptions, DEFAULT_SOURCE, questionPoolOptions, type QuizFilters, type SourceChoice } from './api'
import { PourScene } from './PourScene'
import { SourcePicker } from './SourcePicker'
import { SubjectCarousel, type CarouselItem } from './SubjectCarousel'
import { tubeStatus } from './tube'
import { TubeKey } from './TubeFigure'

const ITEM_COUNTS = [10, 20, 50]
const MIX_KEY = 'mix'
/** How long the pour scene plays before the quiz starts (matches PourScene + index.css). */
const POUR_MS = 1100

type Props = {
  onStart: (filters: QuizFilters, itemCount: number) => void
  starting: boolean
  /** Subject to pre-select, e.g. when she taps a subject on Home. */
  initialSubjectId?: number | null
  /** Topic to pre-select, e.g. "Practice <weakest topic>" on Home. Only used with initialSubjectId. */
  initialTopicId?: number | null
}

/** The small secondary button under Start (tinted, not gold; same as the ones on Home's subject card). */
const smallButtonClass =
  'flex h-10 items-center justify-center gap-2 rounded-lg bg-primary/8 px-4 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px'

/**
 * Practice: swipe the tubes to a subject (or the mix), then Start, right on the page, the same way as Mock exam
 * and Flashcards. No topic step: a session is the whole subject (smart pick puts new ones and mistakes first).
 * A topic still comes along when she starts from somewhere that chose one (Home's weakest topic, a subject's
 * topic on Questions): it shows as a small chip she can clear.
 */
export function PracticeSetup({ onStart, starting, initialSubjectId = null, initialTopicId = null }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()
  const mistakes = useMistakes()

  const [topicId, setTopicId] = useState<number | null>(initialSubjectId === null ? null : initialTopicId)
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>(DEFAULT_SOURCE)
  const [itemCount, setItemCount] = useState(10)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [pouring, setPouring] = useState(false)
  // The tube in the middle of the carousel: the one Start practices. null = start on Smart pick's subject.
  const [focusKey, setFocusKey] = useState<string | null>(initialSubjectId === null ? null : String(initialSubjectId))

  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])
  const pick = smartPick(summary)
  const mistakeCount = mistakes.data?.length ?? 0
  const optionsChanged = sourceChoice.source !== 'all' || sourceChoice.verifiedOnly

  // The tubes she can swipe through on the carousel: every subject, then the mix.
  const overall = overallStats(summary)
  const items: CarouselItem[] = [
    ...summary.map((s) => ({ key: String(s.subjectId), code: s.code, name: s.name, accuracy: s.accuracy, belowPassing: s.belowPassing })),
    { key: MIX_KEY, code: 'MIX', name: 'All six subjects', accuracy: overall.accuracy, belowPassing: overall.accuracy !== null && overall.accuracy < 0.6 },
  ]
  const indexOf = (key: string | null) => items.findIndex((p) => p.key === key)
  const focusIndex = Math.max(0, indexOf(focusKey ?? (pick ? String(pick.subjectId) : null)))
  const current = items[focusIndex]
  // Show the carousel once the scores are in, so the tubes don't jump from empty to full.
  const ready = subjects.isSuccess && !performance.isPending

  // What Start practices: the subject in the middle (null = the mix), and a topic only if it's in that subject.
  const subjectId = current && current.key !== MIX_KEY ? Number(current.key) : null
  const topicsInSubject = (topics.data ?? []).filter((t) => t.subject_id === subjectId)
  const chosenTopic = topicsInSubject.find((t) => t.id === topicId) ?? null

  // The whole subject's questions (for the counts under Start); the session uses only the topic, if one came along.
  const pool = useQuery({
    ...questionPoolOptions(
      { ...sourceChoice, subjectId, topicId: null },
      topicsInSubject.map((t) => t.id),
    ),
    enabled: ready && (subjectId === null || topics.isSuccess),
  })
  const attempts = useQuery(attemptHistoryOptions)
  const history = useMemo(() => buildHistory(attempts.data ?? []), [attempts.data])

  const candidates = pool.data && (chosenTopic === null ? pool.data : pool.data.filter((q) => q.topic_id === chosenTopic.id))
  const total = candidates?.length ?? null
  const mix = candidates && attempts.data ? sessionMix(candidates, history, itemCount) : null
  const unseen = candidates && attempts.data ? countUnseen(candidates, history) : null
  const sessionItems = total === null ? itemCount : Math.min(itemCount, total)

  // If starting fails (e.g. no internet), stop the pour scene so the error message on the page can be seen.
  const wasStarting = useRef(starting)
  useEffect(() => {
    if (wasStarting.current && !starting) setPouring(false)
    wasStarting.current = starting
  }, [starting])

  const pourTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pourTimer.current), [])

  /**
   * Mine or one of her books: go to the mix, so she can start right away, even with one question.
   * (Its book-only questions have no subject, so a subject would leave them out.) She can still swipe to a subject.
   */
  function chooseSource(next: SourceChoice) {
    const switched = next.source !== sourceChoice.source || next.bookId !== sourceChoice.bookId
    setSourceChoice(next)
    if (switched && (next.source === 'mine' || next.source === 'book')) setFocusKey(MIX_KEY)
  }

  function start() {
    if (starting || pouring || !ready || total === 0) return
    const filters = { ...sourceChoice, subjectId, topicId: chosenTopic?.id ?? null }
    // Reduced motion: no pour scene, start right away.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onStart(filters, itemCount)
    setPouring(true)
    pourTimer.current = window.setTimeout(() => onStart(filters, itemCount), POUR_MS)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    start()
  }

  const busy = starting || pouring

  return (
    // Header, the carousel, Items + Start under it (+ Review again), then one quiet line at the bottom.
    // One screen tall, no scrolling (like Home): the carousel takes whatever height is left.
    // Phone: minus the top bar (3.5rem), main's padding (0.5 + 1.5rem) and the bottom nav (5.5rem).
    // Tablet/computer: minus main's padding (pt-5 + pb-5 = 2.5rem). min-h: on a very short screen it scrolls instead of squashing.
    <div className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-120 max-w-5xl flex-col gap-4 md:h-[calc(100dvh-2.5rem)] md:min-h-128 md:gap-5">
      <PageHeader
        title="Practice"
        subtitle={
          <>
            Swipe the tubes to choose a subject.
            {/* A quick read of where she stands (the same numbers as Home's Board readiness), as part of the subtitle. */}
            {overall.answered > 0 && (
              <>
                {' '}
                <span className={cn('font-bold tabular-nums', overall.passingSubjects < overall.totalSubjects ? 'text-wrong' : 'text-correct')}>
                  {overall.passingSubjects} of {overall.totalSubjects}
                </span>{' '}
                subjects passing
                {overall.accuracy !== null && (
                  <>
                    {' · '}Overall{' '}
                    <span className={cn('font-bold tabular-nums', overall.accuracy < 0.6 ? 'text-wrong' : 'text-correct')}>{formatPercent(overall.accuracy)}</span>
                  </>
                )}
                .
              </>
            )}
          </>
        }
      />

      {/* ---------- The carousel: one big tube in the middle, swipe to switch; tapping it starts ---------- */}
      {ready ? (
        <SubjectCarousel items={items} index={focusIndex} onIndexChange={(i) => setFocusKey(items[i].key)} onOpen={start} />
      ) : (
        // Takes the carousel's place (same flexible height) while the scores load.
        <div aria-hidden className="min-h-0 flex-1 animate-pulse rounded-3xl bg-primary/4" />
      )}

      {/* ---------- Items + Start, right on the page (like Mock exam), then how many are new ---------- */}
      <form onSubmit={handleSubmit} className="flex shrink-0 flex-col items-center gap-2">
        {/* A topic that came along from Home or Questions: shown, and easy to clear (then it's the whole subject). */}
        {chosenTopic && (
          <button
            type="button"
            onClick={() => setTopicId(null)}
            disabled={busy}
            aria-label={`Only ${chosenTopic.name}. Remove to practice all of ${current?.code ?? 'the subject'}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-white outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            {chosenTopic.name}
            <X className="size-4" aria-hidden />
          </button>
        )}

        {/* Items and Start: one row on laptops, stacked on phones (too narrow). */}
        <div className="flex flex-col items-center gap-3 lg:flex-row lg:gap-6">
          <fieldset disabled={busy} className="flex items-center gap-3">
            <legend className="sr-only">Items</legend>
            <span aria-hidden className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">
              Items
            </span>
            <div className="flex gap-2">
              {ITEM_COUNTS.map((n) => (
                <label
                  key={n}
                  className={cn(
                    'flex h-10 min-w-14 cursor-pointer items-center justify-center rounded-lg border font-mono font-bold tabular-nums transition-[translate,box-shadow,background-color] has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
                    itemCount === n
                      ? 'translate-y-0.5 border-primary-deep bg-primary text-white shadow-[inset_0_2px_3px_rgb(0_0_0/0.25)]'
                      : 'border-primary/20 bg-card text-foreground shadow-[0_3px_0_rgb(7_71_94/0.18)] hover:border-primary/50',
                  )}
                >
                  <input type="radio" name="practice-count" checked={itemCount === n} onChange={() => setItemCount(n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOptionsOpen(true)}
              disabled={busy}
              aria-label={optionsChanged ? 'Question options (changed)' : 'Question options'}
              className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground outline-none hover:border-primary/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <SlidersHorizontal className="size-5" aria-hidden />
              {optionsChanged && <span className="absolute top-2.5 right-2.5 size-2 rounded-full bg-highlight" aria-hidden />}
            </button>
            <button type="submit" disabled={!ready || busy || total === 0} className={cn(heroButtonClass, 'w-auto max-w-full px-7 focus-visible:ring-ring/50')}>
              <Play className="size-5 shrink-0 fill-current" aria-hidden />
              <span className="truncate">{busy ? 'Starting…' : `Start ${current?.code ?? ''} · ${sessionItems}`}</span>
            </button>
          </div>
        </div>

        {/* What this session is: ALWAYS one line, so the carousel above doesn't grow and shrink. */}
        <p className="flex h-4 items-center gap-1 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {total === 0
            ? 'No questions here yet · '
            : mix
              ? [mix.fresh > 0 && `${mix.fresh} new`, mix.review > 0 && `${mix.review} to review`, mix.repeat > 0 && `${mix.repeat} seen before`].filter(Boolean).join(' · ')
              : 'Counting questions…'}
          {/* Running out of fresh questions (PROJECT_PLAN.md §6) */}
          {total !== null && unseen !== null && unseen < itemCount && (
            <>
              {total > 0 && (unseen === 0 ? ' · no new ones left · ' : ' · few new left · ')}
              <Link to="/questions" className="font-semibold text-primary underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
                Add more
              </Link>
            </>
          )}
        </p>

        {mistakeCount > 0 && (
          <Link to="/practice?from=mistakes" className={smallButtonClass}>
            <RotateCcw className="size-4" aria-hidden />
            Review again
            <span className="rounded-full bg-wrong px-1.5 text-xs font-bold text-white tabular-nums">{mistakeCount}</span>
          </Link>
        )}
      </form>

      {/* ---------- How to read the tubes: one quiet line at the bottom (like the run protocol on Mock exam) ---------- */}
      <div className="shrink-0 border-t border-dashed pt-3">
        <TubeKey />
      </div>

      {/* ---------- After Start: the pour scene over the page for a moment, then the quiz ---------- */}
      {pouring && current && (
        <div aria-hidden className="animate-in fade-in fixed inset-0 z-50 grid place-items-center bg-background/90 backdrop-blur-[2px] duration-150">
          <PourScene status={tubeStatus(current.accuracy, current.belowPassing)} level={current.accuracy ?? 0} label={chosenTopic?.name ?? (current.key === MIX_KEY ? 'Mix' : current.code)} />
        </div>
      )}

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="options-heading" variant="sheet" closeOnBackdrop={false}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="options-heading" className="font-heading text-lg font-bold">
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
          <SourcePicker value={sourceChoice} onChange={chooseSource} />
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
