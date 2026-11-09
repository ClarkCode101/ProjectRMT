import { CalendarClock, Flame } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '@/components/Dialog'
import { FullPageMessage } from '@/components/FullPageMessage'
import { NoteCard } from '@/components/NoteCard'
import { Button } from '@/components/ui/button'
import { NOTES } from '@/data/encouragements'
import { useTopicPerformance } from '@/features/dashboard/api'
import { DEFAULT_DAILY_TARGET, useStudySettings } from '@/features/settings/api'
import { currentStreak, dailyActivity } from '@/lib/activity'
import { countdownLabel, daysUntil, milestoneKey, milestoneReached, pickNote } from '@/lib/planner'
import { overallStats, summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { verseOfTheDay } from '@/lib/verses'
import { useAttemptHistory } from './api'
import { BodyStage, SubjectInfoCard } from './BodyExplorer'
import { ReadinessCard, TodayAndVerse } from './HomeCards'

function greeting(hour: number) {
  if (hour < 12) return 'Good morning!'
  if (hour < 18) return 'Good afternoon!'
  return 'Good evening!'
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
  // null = nothing tapped yet, so show the subject that needs the most work.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [seenMilestones, setSeenMilestones] = useState(readSeen)

  if (performance.isPending || subjects.isPending || topics.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (performance.isError || subjects.isError || topics.isError) {
    return <FullPageMessage>Couldn’t load your progress. Check your internet connection, then refresh.</FullPageMessage>
  }

  const summary = summarizePerformance(performance.data, subjects.data, topics.data)
  const stats = overallStats(summary)
  const selected = summary.find((s) => s.subjectId === selectedId) ?? pickFocus(summary)
  const selectedTopicIds = topics.data.filter((t) => t.subject_id === selected?.subjectId).map((t) => t.id)

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

  return (
    // Tablet and up: two columns that exactly fill the screen height, so nothing scrolls.
    // (2.75rem = the page's top/bottom padding in AppLayout, 2.5rem, plus a little room to spare.)
    // On a very short window it stops shrinking at min-h and the page scrolls instead of squeezing.
    // Phone: one column that scrolls as usual.
    <div className="grid gap-5 md:h-[calc(100dvh-2.75rem)] md:min-h-[34rem] md:grid-cols-2 md:grid-rows-[minmax(0,1fr)] lg:gap-6">
      <div className="flex flex-col gap-2 md:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div>
            <h1 className="text-2xl leading-tight font-bold">{greeting(now.getHours())}</h1>
            <p className="text-sm text-muted-foreground">Turn the body and tap an organ to explore a subject.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {/* Planner: the countdown, or a nudge to set the exam date */}
          {settings.isSuccess && (
            <Link
              to="/settings"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-[0_8px_20px_-14px_rgb(7_71_94/0.5)] outline-none hover:ring-1 hover:ring-primary focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <CalendarClock className="size-4 text-primary" aria-hidden />
              {countdown ?? (examDate ? 'Set your next exam date' : 'Set your exam date')}
            </Link>
          )}
          {/* Review again lives on Practice (and after each quiz), not here: Home stays about the body and one next step. */}
          </div>
        </div>
        <BodyStage summary={summary} selected={selected} onSelect={setSelectedId} />
      </div>

      <div className="flex flex-col gap-4 md:min-h-0">
        {selected && <SubjectInfoCard subject={selected} subjectTopicIds={selectedTopicIds} />}
        <TodayAndVerse
          days={days}
          target={settings.data?.dailyTarget ?? DEFAULT_DAILY_TARGET}
          streak={streak}
          verse={verseOfTheDay(now)}
        />
        {/* Picking a subject here only changes the card above (and its Practice button), so Home keeps one way to practice. */}
        <ReadinessCard
          stats={stats}
          summary={summary}
          selectedId={selected?.subjectId ?? null}
          onSelect={(id) => {
            setSelectedId(id)
            // Phones: the subject card is far above, so bring it into view. Laptops: it's already in view, nothing moves.
            requestAnimationFrame(() => document.getElementById('subject-info')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
          }}
        />
      </div>

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
