import { CalendarClock, CircleCheck, Flame, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { NoteCard } from '@/components/NoteCard'
import { Button } from '@/components/ui/button'
import { NOTES } from '@/data/encouragements'
import { useTopicPerformance } from '@/features/dashboard/api'
import { useAuth } from '@/features/auth/authContext'
import { DEFAULT_DAILY_TARGET, useStudySettings } from '@/features/settings/api'
import { currentStreak, dailyActivity } from '@/lib/activity'
import { firstName } from '@/lib/profile'
import { countdownLabel, daysUntil, milestoneKey, milestoneReached, pickNote } from '@/lib/planner'
import { overallStats, PASSING_RATE, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { useCountUp } from '@/lib/useCountUp'
import { cn } from '@/lib/utils'
import { useAttemptHistory } from './api'
import { BodyStage, NextUpBar } from './BodyExplorer'
import { readinessGoal, STATUS_COLOR } from './organs'
import { changedSince, makeSnapshot, readSnapshot, writeSnapshot } from './snapshot'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The subject to show first: the weakest one below 60%, else one not tried yet, else the lowest score. */
function pickFocus(summary: SubjectSummary[]): SubjectSummary | undefined {
  const byScore = (a: SubjectSummary, b: SubjectSummary) => (a.accuracy ?? 0) - (b.accuracy ?? 0)
  return (
    summary.filter((s) => s.belowPassing).sort(byScore)[0] ??
    summary.find((s) => s.accuracy === null) ??
    [...summary].sort(byScore)[0]
  )
}

// Streak milestones she has already seen, on this device (so each note shows once).
const SEEN_MILESTONES_KEY = 'projectrmt:seen-milestones'

function readSeen(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(SEEN_MILESTONES_KEY) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
function markSeen(key: string) {
  try {
    localStorage.setItem(SEEN_MILESTONES_KEY, JSON.stringify([...readSeen(), key].slice(-30)))
  } catch {
    // storage blocked: the note may show again, that's all
  }
}

export default function HomePage() {
  const performance = useTopicPerformance()
  const subjects = useSubjects()
  const topics = useTopics()
  // Read the clock once when the page opens, not on every re-render.
  const [now] = useState(() => new Date())
  const attempts = useAttemptHistory()
  const settings = useStudySettings()
  const name = firstName(useAuth().session?.user)
  // The subject she tapped (card or organ); null = nothing tapped yet, so Next up shows the "Start here" one.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [seenMilestones, setSeenMilestones] = useState(readSeen)
  // "Since last time": the scores Home showed on her last visit (read once), so what changed can count up.
  const [lastVisit] = useState(readSnapshot)

  // Remember today's scores for the next visit (right away, so a refresh doesn't replay the count-up).
  useEffect(() => {
    if (!performance.data || !subjects.data || !topics.data) return
    const latest = summarizePerformance(performance.data, subjects.data, topics.data)
    writeSnapshot(makeSnapshot(latest, overallStats(latest).accuracy))
  }, [performance.data, subjects.data, topics.data])

  if (performance.isPending || subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (performance.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load your progress. Check your internet connection, then refresh.</FullPageMessage>
  }

  const summary = summarizePerformance(performance.data, subjects.data, topics.data)
  const stats = overallStats(summary)
  // "Start here": the subject that needs the most work.
  const startHere = pickFocus(summary)
  const selected = summary.find((s) => s.subjectId === selectedId) ?? startHere
  const selectedTopicIds = topics.data.filter((t) => t.subject_id === selected?.subjectId).map((t) => t.id)
  // Subjects she practiced since her last visit (their labels count up), and where the readiness number starts.
  const changed = changedSince(lastVisit, summary)
  const readinessFrom = Object.keys(changed).length > 0 ? (lastVisit?.overall ?? null) : null

  // Planner: days to the board exam.
  const examDate = settings.data?.examDate ?? null
  const countdown = examDate ? countdownLabel(daysUntil(examDate, now)) : null

  // Streak milestone reached today (3, 7, 14, 30…): show her note once.
  const days = dailyActivity(attempts.data ?? [], now)
  const streak = currentStreak(attempts.data ?? [], now)
  const milestone = milestoneReached(streak, (days.at(-1)?.answered ?? 0) > 0)
  const milestoneSeenKey = milestone === null ? null : milestoneKey(milestone, now)
  const showMilestone = milestoneSeenKey !== null && !seenMilestones.includes(milestoneSeenKey)
  const milestoneNote = milestoneSeenKey ? pickNote(NOTES, 'streak', milestoneSeenKey) : null

  function closeMilestone() {
    if (!milestoneSeenKey) return
    markSeen(milestoneSeenKey)
    setSeenMilestones((list) => [...list, milestoneSeenKey])
  }

  const done = days.at(-1)?.answered ?? 0
  const target = settings.data?.dailyTarget ?? DEFAULT_DAILY_TARGET

  return (
    // Home is the body: greeting, readiness and stats on top, the body with a card per subject in the middle,
    // and the Next up bar with the Practice button at the bottom.
    // Tablet and up: at least one screen tall; laptops: exactly one screen (2.5rem = AppLayout's top + bottom padding),
    // stopping at min-h on a very short window so it scrolls instead of squeezing. Phones: scrolls as usual.
    <div className="flex flex-col gap-3 md:min-h-[calc(100dvh-2.5rem)] lg:h-[calc(100dvh-2.5rem)] lg:min-h-[36rem]">
      {/* The body is the star, so the top is ONE light line: the greeting, and the small stats on the same line.
          The overall score sits with the body (its "scan readout", bottom right of the stage).
          The next step lives in ONE place only, the Next up bar at the bottom. */}
      <header>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
          <h1 className="text-2xl leading-tight font-bold">
            {greeting(now.getHours())}
            {name ? `, ${name}!` : '!'}
          </h1>

          {/* Quiet stats: icon + words, no boxes. Review again lives on Practice (and after each quiz), not here. */}
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground" aria-label="Your stats">
            <li className="flex items-center gap-1.5">
              <Flame className={cn('size-4', streak > 0 ? 'text-highlight' : 'text-muted-foreground')} aria-hidden />
              {streak > 0 ? (
                <span>
                  <span className="font-bold text-foreground tabular-nums">{streak}-day</span> streak
                </span>
              ) : (
                'No streak yet'
              )}
            </li>
            {/* Today's goal: turns green with a check once it's reached, so the day has a clear finish line. */}
            <li className="flex items-center gap-1.5">
              {done >= target ? <CircleCheck className="size-4 text-correct" aria-hidden /> : <Target className="size-4 text-primary" aria-hidden />}
              <span>
                <span className={cn('font-bold tabular-nums', done >= target ? 'text-correct' : 'text-foreground')}>
                  {done}/{target}
                </span>{' '}
                {done >= target ? 'done today' : 'today'}
              </span>
            </li>
            {/* Planner: once the date is set, the countdown sits on the overall readout instead.
                Until then (or once it has passed), a nudge to set it. Padding makes it easy to tap on an iPad. */}
            {settings.isSuccess && !countdown && (
              <li>
                <Link
                  to="/settings"
                  className="-my-2 flex items-center gap-1.5 rounded-md py-2 font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/40"
                >
                  <CalendarClock className="size-4" aria-hidden />
                  {examDate ? 'Set next exam date' : 'Set exam date'}
                </Link>
              </li>
            )}
          </ul>
        </div>
      </header>

      <BodyStage
        summary={summary}
        selected={selected}
        previous={changed}
        onSelect={setSelectedId}
        readout={<ReadinessLine rate={stats.accuracy} from={readinessFrom} countdown={countdown} />}
      />

      {/* Practice is always one tap away; tapping a card or organ above changes which subject it's for.
          At the bottom: most use an iPad, held in both hands, and the bottom edge is where the thumbs reach. */}
      {selected && <NextUpBar subject={selected} subjectTopicIds={selectedTopicIds} />}

      {/* Streak milestone: a celebration with her note (once per milestone, on this device). */}
      <Dialog open={showMilestone} onClose={closeMilestone} labelledBy="milestone-heading">
        <div className="space-y-4 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-highlight-soft">
            <Flame className="size-7 text-highlight" aria-hidden />
          </span>
          <div>
            <h2 id="milestone-heading" className="font-heading text-2xl font-bold">
              {milestone}-day streak!
            </h2>
            <p className="text-muted-foreground">You’ve studied {milestone} days in a row.</p>
          </div>
          {milestoneNote && <NoteCard message={milestoneNote} className="text-left" />}
          <Button className="h-11 w-full rounded-lg font-heading text-base font-bold" onClick={closeMilestone}>
            Keep going
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

/**
 * The overall score as the body's "scan readout" (it sits under the body, bottom right of the stage):
 * the score, the distance to the goal ("32% to go to passing"), a bar with a marker at the 60% passing line,
 * and the days left once the exam date is set.
 * "Overall", not "board-ready": with only a few answers per subject, it's a score, not a verdict.
 * `from`: last visit's score, so it counts up to today's (same as the subject cards).
 */
function ReadinessLine({ rate, from, countdown }: { rate: number | null; from: number | null; countdown: string | null }) {
  const pct = rate === null ? 0 : Math.min(100, Math.round(rate * 100))
  const shown = useCountUp(from === null ? pct : Math.min(100, Math.round(from * 100)), pct)
  const isPassing = rate !== null && rate >= PASSING_RATE

  if (rate === null) {
    return <p className="text-sm text-muted-foreground">Answer a few questions to see your overall score.</p>
  }
  return (
    <section aria-label="Overall score" className="w-full pb-3">
      <p className="flex items-baseline justify-between gap-3">
        <span>
          <span className={cn('font-heading text-2xl font-bold tabular-nums', isPassing ? 'text-correct' : STATUS_COLOR.low)}>{shown}%</span>{' '}
          <span className="text-sm text-muted-foreground">overall</span>
        </span>
        <span className={cn('text-right text-xs font-semibold', isPassing ? 'text-correct' : 'text-foreground')}>{readinessGoal(rate)}</span>
      </p>

      {/* The bar (fills along with the counting number), with a labelled marker at the 60% passing line */}
      <div
        role="meter"
        aria-label="Overall score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%, passing is 60%`}
        className="relative mt-1.5 h-2 rounded-full bg-secondary"
      >
        <div className={cn('h-full rounded-full', isPassing ? 'bg-correct' : 'bg-highlight')} style={{ width: `${shown}%` }} />
        <span aria-hidden className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/60" style={{ left: `${PASSING_RATE * 100}%` }} />
        <span aria-hidden className="absolute top-full mt-1 -translate-x-1/2 text-[10px] leading-none font-semibold text-muted-foreground" style={{ left: `${PASSING_RATE * 100}%` }}>
          60%
        </span>
      </div>

      {countdown && <p className="mt-4 text-xs text-muted-foreground">{countdown}</p>}
    </section>
  )
}
