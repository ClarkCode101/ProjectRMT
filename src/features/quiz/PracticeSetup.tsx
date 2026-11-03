import { useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, Play, RotateCcw, Shuffle, SlidersHorizontal, X } from 'lucide-react'
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
import { RackKey, SpecimenRack } from './SpecimenRack'
import { SubjectPopup, type PopupItem } from './SubjectPopup'
import { tubeStatus } from './tube'

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

const ACTION_TONE = {
  primary: { box: 'border-primary/25 bg-primary/[0.07] hover:border-primary/45 hover:bg-primary/[0.11]', icon: 'bg-primary' },
  wrong: { box: 'border-wrong/25 bg-wrong-soft/70 hover:border-wrong/45 hover:bg-wrong-soft', icon: 'bg-wrong' },
} as const

const actionCardClass =
  'group flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left shadow-[0_8px_18px_-12px_rgb(7_71_94/0.5)] outline-none transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-0 sm:w-72'

/**
 * The inside of a "start another way" button: a colored icon, a name + one-line hint, and an arrow.
 * Tinted, raised and with an arrow so it clearly reads as a button (the stats in the header are plain text, so they don't).
 */
function ActionCardBody({ icon, title, hint, tone, badge }: { icon: ReactNode; title: string; hint: string; tone: keyof typeof ACTION_TONE; badge?: number }) {
  return (
    <>
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-white', ACTION_TONE[tone].icon)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-heading leading-tight font-bold">
          {title}
          {badge !== undefined && <span className="rounded-full bg-wrong px-1.5 text-xs font-bold text-white tabular-nums">{badge}</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </>
  )
}

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

  // The tubes she can swipe through in the popup: every subject, then the mix.
  const overall = overallStats(summary)
  const popupItems: PopupItem[] = [
    ...summary.map((s) => ({ key: String(s.subjectId), code: s.code, name: s.name, accuracy: s.accuracy, belowPassing: s.belowPassing })),
    { key: MIX_KEY, code: 'MIX', name: 'All six subjects', accuracy: overall.accuracy, belowPassing: overall.accuracy !== null && overall.accuracy < 0.6 },
  ]
  const popupIndex = Math.max(0, popupItems.findIndex((p) => p.key === (subjectId === null ? MIX_KEY : String(subjectId))))

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
  const currentItem = popupItems[popupIndex]
  const pourLabel = choice.kind === 'all' ? 'Mix' : (chosenTopic?.name ?? chosenSubject?.code ?? '')

  function chooseSubject(id: number) {
    setChoice({ kind: 'subject', subjectId: id })
    setTopicId(null) // topic list changes with the subject
  }

  function chooseMix() {
    setChoice({ kind: 'all' })
    setTopicId(null)
  }

  function chooseSmartPick() {
    if (!pick) return chooseMix()
    setChoice({ kind: 'subject', subjectId: pick.subjectId })
    setTopicId(pick.kind === 'topic' ? pick.topicId : null)
  }

  function swipeTo(index: number) {
    const target = popupItems[index]
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

  // What Smart pick ("Start here" on the rack) would open.
  const smartPickLabel = pick?.kind === 'topic' ? `${pick.subjectCode} · ${pick.topicName}` : (pick?.subjectCode ?? 'a mix')

  return (
    // Wide on tablets and laptops so the rack (the one focal point here) can use the space.
    // Tablets and laptops: exactly one screen tall (100dvh minus AppLayout's top and bottom padding = 2.5rem),
    // and the rack shrinks to fit, so the page never scrolls. Phones: normal scrolling page.
    <div className="mx-auto flex max-w-5xl flex-col gap-6 md:h-[calc(100dvh-2.5rem)] md:min-h-[24rem]">
      <PageHeader
        title="Practice"
        subtitle={
          <>
            Tap a tube to choose a subject.
            <RackKey />
          </>
        }
        actions={
          // A quick read of where she stands (the same numbers as Home's Board readiness).
          // Plain text on purpose (no pill or border), so it can't be mistaken for a button.
          overall.answered > 0 && (
            <p className="text-sm text-muted-foreground sm:text-right">
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
            </p>
          )
        }
      />

      {/* ---------- The rack, always on the page (the other ways to start are centered under it) ---------- */}
      <div className="flex min-h-0 flex-col gap-3">
        <SpecimenRack
          summary={summary}
          selectedId={subjectId}
          onSelect={chooseSubject}
          recommendedId={performance.isPending ? null : (pick?.subjectId ?? null)}
          recommendedLabel={smartPickLabel}
          onRecommendedClick={chooseSmartPick}
          footerActions={
            <div className="space-y-2">
              <p className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">Or start another way</p>
              <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
                <button type="button" onClick={chooseMix} className={cn(actionCardClass, ACTION_TONE.primary.box)}>
                  <ActionCardBody icon={<Shuffle className="size-4.5" aria-hidden />} title="Mix all subjects" hint="A bit of everything" tone="primary" />
                </button>
                {mistakeCount > 0 && (
                  <Link to="/practice?from=mistakes" className={cn(actionCardClass, ACTION_TONE.wrong.box)}>
                    <ActionCardBody icon={<RotateCcw className="size-4.5" aria-hidden />} title="Review again" hint="Questions you got wrong" tone="wrong" badge={mistakeCount} />
                  </Link>
                )}
              </div>
            </div>
          }
        />
      </div>

      {/* ---------- The popup: big tube on the left, topics + Start on the right ---------- */}
      <SubjectPopup
        open={choice.kind !== 'none'}
        onClose={() => setChoice({ kind: 'none' })}
        items={popupItems}
        index={popupIndex}
        onIndexChange={swipeTo}
        disabled={busy}
        overlay={pouring && currentItem && <PourScene status={tubeStatus(currentItem.accuracy, currentItem.belowPassing)} level={currentItem.accuracy ?? 0} label={pourLabel} />}
      >
        {/* flex-1 + mt-auto on the Start bar: Start always sits at the bottom of the popup, lined up with the tube side. */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-5">
          {choice.kind === 'all' && (
            <div className="pr-10">
              <p className="font-heading text-xl leading-tight font-bold">A mix of all six subjects</p>
              <p className="mt-1 text-sm text-muted-foreground">Questions from every subject. New ones and your old mistakes come first.</p>
            </div>
          )}

          {/* ---------- Topic ---------- */}
          {chosenSubject && (
            <fieldset key={chosenSubject.subjectId} className="animate-in fade-in space-y-4 duration-300">
              <legend className="sr-only">Topic in {chosenSubject.name}</legend>
              {/* pr-10 leaves room for the popup's ✕ in the corner */}
              <p className="pr-10 font-heading text-xl leading-tight font-bold">Choose a topic</p>

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
