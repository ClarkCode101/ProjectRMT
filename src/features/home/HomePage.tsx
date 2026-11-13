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
import { currentStreak, dailyActivity, type DayActivity } from '@/lib/activity'
import { firstName, needsWelcome } from '@/lib/profile'
import { countdownLabel, daysUntil, milestoneKey, milestoneReached, pickNote } from '@/lib/planner'
import { overallStats, PASSING_LABEL, PASSING_RATE, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { useCountUp } from '@/lib/useCountUp'
import { cn } from '@/lib/utils'
import { useAttemptHistory } from './api'
import { BodyStage, NextUpBar } from './BodyExplorer'
import { WelcomeDialog } from './WelcomeDialog'
import { readinessGoal, STATUS_COLOR } from './organs'
import { changedSince, makeSnapshot, readSnapshot, writeSnapshot } from './snapshot'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The subject to show first: the weakest one below 75%, else one not tried yet, else the lowest score. */
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

// The day the body last danced for reaching the daily goal, on this device (so it dances once a day).
const GOAL_DANCE_KEY = 'projectrmt:goal-dance-day'

function readDanceDay(): string | null {
  try {
    return localStorage.getItem(GOAL_DANCE_KEY)
  } catch {
    return null
  }
}
function markDanceDay(day: string) {
  try {
    localStorage.setItem(GOAL_DANCE_KEY, day)
  } catch {
    // storage blocked: it may dance again on the next visit, that's all
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
  const user = useAuth().session?.user
  const name = firstName(user)
  // Welcome popup: once, for a new member with no name and no exam date yet (closed = hidden right away).
  const [welcomeClosed, setWelcomeClosed] = useState(false)
  const showWelcome = settings.isSuccess && !welcomeClosed && needsWelcome(user, settings.data.examDate)
  // The subject she tapped (card or organ); null = nothing tapped yet, so Next up shows the "Start here" one.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [seenMilestones, setSeenMilestones] = useState(readSeen)
  // "Since last time": the scores Home showed on her last visit (read once), so what changed can count up.
  const [lastVisit] = useState(readSnapshot)

  // Daily goal reached: the body does a little dance, once a day (the first Home visit after reaching it).
  // Waits for both her answers and her goal to load, so it never dances on a placeholder goal.
  const [dancedOn] = useState(readDanceDay)
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
  const goalReached =
    attempts.isSuccess &&
    settings.isSuccess &&
    (dailyActivity(attempts.data, now).at(-1)?.answered ?? 0) >= (settings.data?.dailyTarget ?? DEFAULT_DAILY_TARGET)
  const celebrate = goalReached && dancedOn !== today
  useEffect(() => {
    if (celebrate) markDanceDay(today)
  }, [celebrate, today])

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
  // Never two popups at once: the welcome goes first.
  const showMilestone = !showWelcome && milestoneSeenKey !== null && !seenMilestones.includes(milestoneSeenKey)
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
    <div className="flex flex-col gap-3 md:min-h-[calc(100dvh-2.5rem)] lg:h-[calc(100dvh-2.5rem)] lg:min-h-144">
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
            {/* Laptops show it bigger, with the week, beside the body (TodayLine), so it's left out of this line there. */}
            <li className="flex items-center gap-1.5 lg:hidden">
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
        celebrate={celebrate}
        readout={<ReadinessLine rate={stats.accuracy} passes={stats.passes === true} floorCodes={stats.belowFloor.map((s) => s.code)} from={readinessFrom} countdown={countdown} />}
        today={<TodayLine days={days} target={target} />}
      />

      {/* Practice is always one tap away; tapping a card or organ above changes which subject it's for.
          At the bottom: most use an iPad, held in both hands, and the bottom edge is where the thumbs reach. */}
      {selected && <NextUpBar subject={selected} subjectTopicIds={selectedTopicIds} />}

      {settings.isSuccess && <WelcomeDialog open={showWelcome} settings={settings.data} onDone={() => setWelcomeClosed(true)} />}

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
 * Today's goal and the last 7 days, bottom left of the stage on laptops (it mirrors the overall score on the right):
 * "12/25 today", how many are left, and one small bar per day, each filling toward the daily goal
 * (green once that day reached it). Today is the last bar, with its letter in bold.
 */
function TodayLine({ days, target }: { days: DayActivity[]; target: number }) {
  const done = days.at(-1)?.answered ?? 0
  const reached = done >= target
  const studiedDays = days.filter((d) => d.answered > 0).length

  return (
    <section aria-label="Today and this week" className="w-full pb-3">
      <p className="flex items-baseline justify-between gap-3">
        <span>
          <span className={cn('font-heading text-2xl font-bold tabular-nums', reached ? 'text-correct' : 'text-foreground')}>
            {done}/{target}
          </span>{' '}
          <span className="text-sm text-muted-foreground">today</span>
        </span>
        <span className={cn('text-right text-xs font-semibold', reached ? 'text-correct' : 'text-foreground')}>
          {reached ? 'Daily goal reached' : `${target - done} more to reach today’s goal`}
        </span>
      </p>

      {/* One bar per day, oldest first. The words for screen readers are in the line below. */}
      <div aria-hidden className="mt-1.5 flex gap-1.5">
        {days.map((d, i) => {
          const isToday = i === days.length - 1
          const fill = target > 0 ? Math.min(1, d.answered / target) : 0
          return (
            <span key={d.date} className="flex-1">
              <span className="block h-2 overflow-hidden rounded-full bg-secondary">
                <span className={cn('block h-full rounded-full', fill >= 1 ? 'bg-correct' : 'bg-primary')} style={{ width: `${fill * 100}%` }} />
              </span>
              <span className={cn('mt-1 block text-center text-[10px] leading-none font-semibold', isToday ? 'text-foreground' : 'text-muted-foreground')}>
                {d.label.charAt(0)}
              </span>
            </span>
          )
        })}
      </div>
      <p className="sr-only">
        Studied on {studiedDays} of the last {days.length} days.
      </p>
    </section>
  )
}

/**
 * The overall score as the body's "scan readout" (it sits under the body, bottom right of the stage):
 * her general average (weighted like the board), the distance to the goal ("32% to go to passing"),
 * a bar with a marker at the 75% passing line, and the days left once the exam date is set.
 * "Overall", not "board-ready": with only a few answers per subject, it's a score, not a verdict.
 * `passes`: all three board rules hold (an average of 75% with a subject below 50% is still not passing).
 * `floorCodes`: subjects below 50%. `from`: last visit's score, so it counts up to today's (same as the subject cards).
 */
function ReadinessLine({
  rate,
  passes,
  floorCodes,
  from,
  countdown,
}: {
  rate: number | null
  passes: boolean
  floorCodes: string[]
  from: number | null
  countdown: string | null
}) {
  const pct = rate === null ? 0 : Math.min(100, Math.round(rate * 100))
  const shown = useCountUp(from === null ? pct : Math.min(100, Math.round(from * 100)), pct)
  const isPassing = rate !== null && passes

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
        <span className={cn('text-right text-xs font-semibold', isPassing ? 'text-correct' : 'text-foreground')}>{readinessGoal(rate, floorCodes)}</span>
      </p>

      {/* The bar (fills along with the counting number), with a labelled marker at the 75% passing line */}
      <div
        role="meter"
        aria-label="Overall score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%, passing is ${PASSING_LABEL}`}
        className="relative mt-1.5 h-2 rounded-full bg-secondary"
      >
        <div className={cn('h-full rounded-full', isPassing ? 'bg-correct' : 'bg-highlight')} style={{ width: `${shown}%` }} />
        <span aria-hidden className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground/60" style={{ left: `${PASSING_RATE * 100}%` }} />
        <span aria-hidden className="absolute top-full mt-1 -translate-x-1/2 text-[10px] leading-none font-semibold text-muted-foreground" style={{ left: `${PASSING_RATE * 100}%` }}>
          {PASSING_LABEL}
        </span>
      </div>

      {countdown && <p className="mt-4 text-xs text-muted-foreground">{countdown}</p>}
    </section>
  )
}
