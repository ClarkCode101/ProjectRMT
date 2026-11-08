import { useQuery } from '@tanstack/react-query'
import { Check, Play, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
import { SubjectPopup } from './SubjectPopup'
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

/** What she picked: nothing yet (just the rack), one subject, or a mix of all. */
type Choice = { kind: 'none' } | { kind: 'all' } | { kind: 'subject'; subjectId: number }

/** The small secondary button under "Choose" (tinted, not gold; same as the ones on Home's subject card). */
const smallButtonClass =
  'flex h-10 items-center justify-center gap-2 rounded-lg bg-primary/[0.08] px-4 text-sm font-bold text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-px'

/**
 * A topic choice (a real radio button, styled as a pill).
 * Selected = solid blue with a check, so it can't be mistaken for the hover border.
 */
function TopicChip({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label
      className={cn(
        'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary text-white' : 'bg-card hover:border-primary/50',
      )}
    >
      <input type="radio" name="topic" checked={checked} onChange={onChange} className="sr-only" />
      {checked && <Check className="-ml-0.5 size-4" aria-hidden />}
      {children}
    </label>
  )
}

export function PracticeSetup({ onStart, starting, initialSubjectId = null, initialTopicId = null }: Props) {
  const subjects = useSubjects()
  const topics = useTopics()
  const performance = useTopicPerformance()
  const mistakes = useMistakes()

  const [choice, setChoice] = useState<Choice>(initialSubjectId === null ? { kind: 'none' } : { kind: 'subject', subjectId: initialSubjectId })
  const [topicId, setTopicId] = useState<number | null>(initialSubjectId === null ? null : initialTopicId)
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>(DEFAULT_SOURCE)
  const [itemCount, setItemCount] = useState(10)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [pouring, setPouring] = useState(false)
  // The tube in the middle of the carousel (not chosen yet, just in focus). null = start on Smart pick's subject.
  const [focusKey, setFocusKey] = useState<string | null>(initialSubjectId === null ? null : String(initialSubjectId))

  const subjectId = choice.kind === 'subject' ? choice.subjectId : null
  const topicsInSubject = (topics.data ?? []).filter((t) => t.subject_id === subjectId)
  const summary = summarizePerformance(performance.data ?? [], subjects.data ?? [], topics.data ?? [])
  const chosenSubject = summary.find((s) => s.subjectId === subjectId)
  const chosenTopic = topicsInSubject.find((t) => t.id === topicId)
  const pick = smartPick(summary)
  const mistakeCount = mistakes.data?.length ?? 0
  const optionsChanged = sourceChoice.source !== 'all' || sourceChoice.verifiedOnly

  // The whole subject's questions; the session uses only the chosen topic (if any).
  const pool = useQuery({
    ...questionPoolOptions(
      { ...sourceChoice, subjectId, topicId: null },
      topicsInSubject.map((t) => t.id),
    ),
    enabled: choice.kind !== 'none' && (subjectId === null || topics.isSuccess),
  })
  const attempts = useQuery(attemptHistoryOptions)
  const history = useMemo(() => buildHistory(attempts.data ?? []), [attempts.data])

  const candidates = pool.data && (topicId === null ? pool.data : pool.data.filter((q) => q.topic_id === topicId))
  const total = candidates?.length ?? null
  const mix = candidates && attempts.data ? sessionMix(candidates, history, itemCount) : null
  const unseen = candidates && attempts.data ? countUnseen(candidates, history) : null
  const sessionItems = total === null ? itemCount : Math.min(itemCount, total)

  // Topic chips grouped by status, so she can see where to focus at a glance.
  // Weakest first inside "Needs work" and "Passing"; A–Z inside "Not started".
  const topicChips = topicsInSubject.map((t) => ({ ...t, performance: chosenSubject?.topics.find((p) => p.topicId === t.id) }))
  const byScore = (a: (typeof topicChips)[number], b: (typeof topicChips)[number]) => (a.performance?.accuracy ?? 0) - (b.performance?.accuracy ?? 0)
  const topicGroups = [
    { label: 'Needs work', topics: topicChips.filter((t) => t.performance?.belowPassing).sort(byScore) },
    { label: 'Passing', topics: topicChips.filter((t) => t.performance && !t.performance.belowPassing).sort(byScore) },
    { label: 'Not started', topics: topicChips.filter((t) => !t.performance).sort((a, b) => a.name.localeCompare(b.name)) },
  ].filter((g) => g.topics.length > 0)

  // The tubes she can swipe through on the carousel: every subject, then the mix.
  const overall = overallStats(summary)
  const items: CarouselItem[] = [
    ...summary.map((s) => ({ key: String(s.subjectId), code: s.code, name: s.name, accuracy: s.accuracy, belowPassing: s.belowPassing })),
    { key: MIX_KEY, code: 'MIX', name: 'All six subjects', accuracy: overall.accuracy, belowPassing: overall.accuracy !== null && overall.accuracy < 0.6 },
  ]
  const indexOf = (key: string | null) => items.findIndex((p) => p.key === key)
  const focusIndex = Math.max(0, indexOf(focusKey ?? (pick ? String(pick.subjectId) : null)))
  // The chosen one (popup open), for the popup and the pour scene.
  const currentItem = items[Math.max(0, indexOf(subjectId === null ? MIX_KEY : String(subjectId)))]
  // Show the carousel once the scores are in, so the tubes don't jump from empty to full.
  const ready = subjects.isSuccess && !performance.isPending

  // If starting fails (e.g. no internet), close the popup so the error message on the page can be seen.
  const wasStarting = useRef(starting)
  useEffect(() => {
    if (wasStarting.current && !starting) {
      setPouring(false)
      setChoice({ kind: 'none' })
    }
    wasStarting.current = starting
  }, [starting])

  const pourTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(pourTimer.current), [])

  // What the pour scene shows: this subject's tube (or the overall score for a mix), labelled with the topic.
  const pourLabel = choice.kind === 'all' ? 'Mix' : (chosenTopic?.name ?? chosenSubject?.code ?? '')

  function chooseSubject(id: number) {
    setChoice({ kind: 'subject', subjectId: id })
    setTopicId(null) // topic list changes with the subject
  }

  function chooseMix() {
    setChoice({ kind: 'all' })
    setTopicId(null)
  }

  /** Open the tube in the middle of the carousel. */
  function openFocused() {
    const target = items[focusIndex]
    if (!target) return
    if (target.key === MIX_KEY) chooseMix()
    else chooseSubject(Number(target.key))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (starting || pouring) return
    const filters = { ...sourceChoice, subjectId, topicId }
    // Reduced motion: no pour scene, start right away.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onStart(filters, itemCount)
    setPouring(true)
    pourTimer.current = window.setTimeout(() => onStart(filters, itemCount), POUR_MS)
  }

  const busy = starting || pouring

  return (
    // Header, the carousel, the gold button under it (+ Review again), then one quiet line at the bottom.
    // One screen tall, no scrolling (like Home): the carousel takes whatever height is left.
    // Phone: minus the top bar (3.5rem), main's padding (0.5 + 1.5rem) and the bottom nav (5.5rem).
    // Tablet/computer: minus main's padding (pt-5 + pb-5 = 2.5rem). min-h: on a very short screen it scrolls instead of squashing.
    <div className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[30rem] max-w-5xl flex-col gap-4 md:h-[calc(100dvh-2.5rem)] md:min-h-[32rem] md:gap-5">
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

      {/* ---------- The carousel: one big tube in the middle, swipe to switch ---------- */}
      {ready ? (
        <SubjectCarousel
          items={items}
          index={focusIndex}
          onIndexChange={(i) => setFocusKey(items[i].key)}
          onOpen={openFocused}
        />
      ) : (
        // Takes the carousel's place (same flexible height) while the scores load.
        <div aria-hidden className="min-h-0 flex-1 animate-pulse rounded-3xl bg-primary/[0.04]" />
      )}

      {/* ---------- One gold button: open the tube in the middle. Review again is the smaller way in. ---------- */}
      <div className="flex shrink-0 flex-col items-center gap-3">
        <button type="button" onClick={openFocused} disabled={!ready} className={cn(heroButtonClass, 'w-auto max-w-full px-8 focus-visible:ring-ring/50')}>
          <Play className="size-5 shrink-0 fill-current" aria-hidden />
          <span className="truncate">Choose {items[focusIndex]?.code ?? ''}</span>
        </button>
        {mistakeCount > 0 && (
          <Link to="/practice?from=mistakes" className={smallButtonClass}>
            <RotateCcw className="size-4" aria-hidden />
            Review again
            <span className="rounded-full bg-wrong px-1.5 text-xs font-bold text-white tabular-nums">{mistakeCount}</span>
          </Link>
        )}
      </div>

      {/* ---------- How to read the tubes: one quiet line at the bottom (like the run protocol on Mock exam) ---------- */}
      <div className="shrink-0 border-t border-dashed pt-3">
        <TubeKey />
      </div>

      {/* ---------- The popup: topics + Start for the chosen tube ---------- */}
      <SubjectPopup
        open={choice.kind !== 'none'}
        onClose={() => setChoice({ kind: 'none' })}
        item={currentItem}
        disabled={busy}
        overlay={pouring && currentItem && <PourScene status={tubeStatus(currentItem.accuracy, currentItem.belowPassing)} level={currentItem.accuracy ?? 0} label={pourLabel} />}
      >
        {/* flex-1 + mt-auto on the Start bar: Start always sits at the bottom of the popup, lined up with the tube side. */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
          {choice.kind === 'all' && (
            <p className="text-sm text-muted-foreground">Questions from every subject. New ones and your old mistakes come first.</p>
          )}

          {/* ---------- Topic ---------- */}
          {chosenSubject && (
            <fieldset key={chosenSubject.subjectId} className="animate-in fade-in space-y-4 duration-300">
              <legend className="sr-only">Topic in {chosenSubject.name}</legend>
              <p className="font-heading text-lg leading-tight font-bold">Choose a topic</p>

              {/* One row per status (plus "All" first). Narrow: label above its chips. Wider: label in a column on the left. */}
              <div className="space-y-3">
                <div className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3">
                  <p className="text-sm font-semibold text-muted-foreground sm:pt-2.5">Everything</p>
                  <div className="flex flex-wrap gap-2">
                    <TopicChip checked={topicId === null} onChange={() => setTopicId(null)}>
                      All topics
                    </TopicChip>
                  </div>
                </div>
                {topicGroups.map((group) => (
                  <div key={group.label} className="grid gap-1.5 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-3">
                    <p className={cn('text-sm font-semibold sm:pt-2.5', group.label === 'Needs work' ? 'text-wrong' : 'text-muted-foreground')}>{group.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.topics.map((t) => (
                        <TopicChip key={t.id} checked={topicId === t.id} onChange={() => setTopicId(t.id)}>
                          {t.name}
                          {t.performance && (
                            <span className={cn('tabular-nums', t.performance.belowPassing ? 'text-wrong' : 'text-correct', topicId === t.id && 'text-white')}>
                              {formatPercent(t.performance.accuracy)}
                            </span>
                          )}
                        </TopicChip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {/* ---------- Start: at the bottom of the popup; sticks there if the topic list is long ---------- */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 mt-auto bg-card px-5 pt-1 pb-5">
            <div className="flex flex-col gap-3 rounded-2xl bg-primary-deep p-3 text-white sm:flex-row sm:items-center sm:gap-4 sm:p-3.5 sm:pl-5">
              {/* what this session is */}
              <div className="min-w-0 flex-1" aria-live="polite">
                <p className="truncate font-bold">
                  {chosenSubject?.code ?? 'All subjects'}
                  <span className="font-normal text-white/80"> · {chosenSubject ? (chosenTopic?.name ?? 'all topics') : 'a mix'}</span>
                </p>
                <p className="line-clamp-2 text-sm text-white/70">
                  {total === 0
                    ? 'No questions here yet · '
                    : mix
                      ? [mix.fresh > 0 && `${mix.fresh} new`, mix.review > 0 && `${mix.review} to review`, mix.repeat > 0 && `${mix.repeat} seen before`].filter(Boolean).join(' · ')
                      : 'Counting questions…'}
                  {/* Running out of fresh questions (PROJECT_PLAN.md §6) */}
                  {total !== null && unseen !== null && unseen < itemCount && (
                    <>
                      {total > 0 && (unseen === 0 ? ' · no new ones left · ' : ' · few new left · ')}
                      <Link to="/questions" className="font-semibold text-white underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-white/60">
                        Add more
                      </Link>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* items: a small segmented control */}
                <fieldset className="flex rounded-lg bg-white/10 p-1">
                  <legend className="sr-only">Number of items</legend>
                  {ITEM_COUNTS.map((n) => (
                    <label
                      key={n}
                      className={cn(
                        'flex h-9 min-w-10 cursor-pointer items-center justify-center rounded-md px-2 text-sm font-bold tabular-nums transition-colors has-focus-visible:ring-2 has-focus-visible:ring-white/70',
                        itemCount === n ? 'bg-white text-primary-deep' : 'text-white/80 hover:text-white',
                      )}
                    >
                      <input type="radio" name="count" checked={itemCount === n} onChange={() => setItemCount(n)} className="sr-only" />
                      {n}
                    </label>
                  ))}
                </fieldset>

                <button
                  type="button"
                  onClick={() => setOptionsOpen(true)}
                  aria-label={optionsChanged ? 'Question options (changed)' : 'Question options'}
                  className="relative flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/10 outline-none hover:bg-white/15 focus-visible:ring-3 focus-visible:ring-white/60"
                >
                  <SlidersHorizontal className="size-5" aria-hidden />
                  {optionsChanged && <span className="absolute top-2 right-2 size-2 rounded-full bg-highlight" aria-hidden />}
                </button>

                <button type="submit" className={cn(heroButtonClass, 'h-11 flex-1 px-5 text-base whitespace-nowrap sm:flex-none')} disabled={busy || total === 0}>
                  <Play className="size-4 fill-current" aria-hidden />
                  {busy ? 'Starting…' : `Start ${sessionItems}`}
                </button>
              </div>
            </div>
          </div>
        </form>
      </SubjectPopup>

      <Dialog open={optionsOpen} onClose={() => setOptionsOpen(false)} labelledBy="options-heading" variant="sheet">
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
