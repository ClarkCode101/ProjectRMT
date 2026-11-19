import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/authContext'
import { useTopicPerformance } from '@/features/dashboard/api'
import { reviewStatesOptions } from '@/features/flashcards/api'
import { useAttemptHistory, useLastMockDay } from '@/features/home/api'
import { useStudySettings } from '@/features/settings/api'
import { readPlanProgress, readSavedPlan, saveTodaysPlan, type PlanProgress } from '@/lib/planProgress'
import { summarizePerformance, type SubjectSummary } from '@/lib/quiz'
import { useSubjects, useTopics } from '@/lib/referenceData'
import { modeFor } from '@/lib/studyDays'
import { buildPlan, previewTomorrow, swapSubject, type PlanInput, type StudyPlan, type TomorrowPreview } from '@/lib/studyPlan'
import { planRows, type PlanRow } from './planText'

export type TodaysPlan = {
  /** null while loading, or when it couldn't be made (her answers or settings didn't load) */
  plan: StudyPlan | null
  /** still loading what the plan needs */
  loading: boolean
  rows: PlanRow[]
  /** what she did today on this device (counts, studied questions, results) */
  progress: PlanProgress
  /** the first task not done yet; undefined once all are done */
  current: PlanRow | undefined
  /** every task done (never on a rest day, which has none) */
  allDone: boolean
  /** today is a rest day (her choice): no tasks */
  rest: boolean
  /** she has done something from today's plan (then today can't be changed to another mode) */
  started: boolean
  /** tomorrow in short */
  preview: TomorrowPreview | null
  /** everything the plan was made from (her answers, scores…), for the Plan page's extras */
  input: PlanInput | null
  summary: SubjectSummary[]
  lastMockDay: string | null
  /** she picked another subject for the focus task at `index` */
  swap: (index: number, subject: SubjectSummary) => void
}

/**
 * Today's plan (lib/studyPlan.ts), shared by the bar on Home and the Plan page.
 * Made on the first visit of the day and kept on this device, so it doesn't change while she works through it.
 * How much of each task is done comes from lib/planProgress.ts (Practice and Flashcards add to it).
 */
export function useTodaysPlan(): TodaysPlan {
  const performance = useTopicPerformance()
  const subjects = useSubjects()
  const topics = useTopics()
  const attempts = useAttemptHistory()
  const settings = useStudySettings()
  const reviewStates = useQuery(reviewStatesOptions)
  const lastMock = useLastMockDay()
  const userId = useAuth().session?.user?.id ?? null

  // Read the clock once when the page opens, not on every re-render.
  const [now] = useState(() => new Date())
  const [savedPlan, setSavedPlan] = useState<StudyPlan | null>(() => (userId ? readSavedPlan(userId, now) : null))
  const [progress] = useState(() => readPlanProgress(now))
  const lastMockDay = lastMock.data ?? null

  const summary = performance.data && subjects.data && topics.data ? summarizePerformance(performance.data, subjects.data, topics.data) : []
  // Everything the plan needs. Flashcards and the last Mock exam may fail to load (offline): the plan then skips them.
  const ready = performance.data && subjects.data && attempts.isSuccess && settings.isSuccess && !reviewStates.isPending && !lastMock.isPending
  const input: PlanInput | null =
    ready && topics.data && attempts.data && settings.data
      ? {
          today: now,
          examDate: settings.data.examDate,
          dailyTarget: settings.data.dailyTarget,
          summary,
          topics: topics.data,
          attempts: attempts.data,
          flashcardsDue: (reviewStates.data ?? []).filter((r) => new Date(r.due).getTime() <= now.getTime()).length,
          lastMockDay,
          studyDays: settings.data.studyDays,
        }
      : null

  // Nothing done yet today: she can still change today to a full, light or rest day (the plan is made again).
  const started = Object.keys(progress.done).length > 0
  const wantedMode = input ? modeFor(input.studyDays, now) : null
  const modeChanged = savedPlan !== null && wantedMode !== null && savedPlan.mode !== wantedMode && !started

  // The first visit of the day makes the plan (React's "update state when data arrives" pattern, so it's made once),
  // and so does changing today's mode before starting.
  if (userId && input && (!savedPlan || modeChanged)) {
    const fresh = buildPlan(input)
    if (fresh.tasks.length > 0 || fresh.mode === 'rest') setSavedPlan(fresh)
  }
  // Keep it on this device (a side effect, so after the screen is drawn).
  useEffect(() => {
    if (savedPlan && userId) saveTodaysPlan(userId, savedPlan)
  }, [savedPlan, userId])

  const rows = savedPlan ? planRows(savedPlan, progress, lastMockDay) : []
  const allDone = rows.length > 0 && rows.every((r) => r.complete)
  const failed = performance.isError || subjects.isError || topics.isError || attempts.isError || settings.isError

  return {
    plan: savedPlan,
    loading: savedPlan === null && input === null && !failed,
    rows,
    progress,
    current: rows.find((r) => !r.complete),
    allDone,
    rest: savedPlan?.mode === 'rest',
    started,
    preview: input ? previewTomorrow(input) : null,
    input,
    summary,
    lastMockDay,
    swap: (index, subject) => {
      if (savedPlan) setSavedPlan(swapSubject(savedPlan, index, subject, topics.data ?? []))
    },
  }
}
