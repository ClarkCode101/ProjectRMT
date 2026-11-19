// Today's plan: three small tasks picked for her each day (PROJECT_PLAN.md, "Today's plan").
// Pure logic: no Supabase or React here, so it is easy to unit test.
//
//   Task 1: due flashcards (or a second subject when none are due)
//   Task 2: her focus subject (the one that needs the most work)
//   Task 3: past mistakes that are due again (or a mixed set, or a Mock exam in the last weeks)
//
// A missed day never piles up: after days away the plan is SMALLER, not bigger.
import { localDateKey } from './activity'
import { daysUntil } from './planner'
import { hasRealScore, MIN_ANSWERED, PASSING_RATE, subjectWeight, type SubjectSummary, type TopicInfo } from './quiz'
import { modeFor, type DayMode, type StudyDays } from './studyDays'

// ---------- Days ----------

/** "YYYY-MM-DD" plus n days (n can be negative), in her own time zone. */
export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  return localDateKey(new Date(y, m - 1, d + n))
}

/** Whole days from one "YYYY-MM-DD" to another (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / (24 * 60 * 60 * 1000))
}

// ---------- Phases ----------

export type Phase = 'build' | 'strengthen' | 'simulate'

/** Strengthen starts this many days before the exam. Before that: Build. */
export const STRENGTHEN_FROM_DAYS = 60
/** Simulate (Mock exams in the plan) starts this many days before the exam. */
export const SIMULATE_FROM_DAYS = 21

/** The phase for the days left to the exam; null when there is no exam date (or it has passed). */
export function phaseFor(daysLeft: number | null): Phase | null {
  if (daysLeft === null || daysLeft < 0) return null
  if (daysLeft <= SIMULATE_FROM_DAYS) return 'simulate'
  if (daysLeft <= STRENGTHEN_FROM_DAYS) return 'strengthen'
  return 'build'
}

// ---------- Past mistakes, spaced out ----------

/**
 * When a mistake comes back: 1 day after she missed it, then 3, 7 and 14 days after each right answer.
 * Right at the 14-day step = fixed (it leaves the list). Wrong at any step = back to 1 day.
 */
export const MISTAKE_STEPS = [1, 3, 7, 14] as const

export type PlanAttempt = {
  question_id: string
  is_correct: boolean
  created_at: string | null
  /** answered in a game (Board Review, Last Card): doesn't move a mistake, same rule as Review again */
  from_game?: boolean
}

export type DueMistake = {
  questionId: string
  /** the day it came due, "YYYY-MM-DD" */
  due: string
  /** 0 = first comeback (1 day), 3 = the last one (14 days) */
  step: number
}

/**
 * Her past mistakes that are due on `today` or earlier, the oldest due first.
 * A right answer only moves a mistake to the next step if it came on or after its due day:
 * answering it again early (say, in Review again the same evening) doesn't skip the wait.
 */
export function dueMistakes(attempts: readonly PlanAttempt[], today: Date): DueMistake[] {
  const todayKey = localDateKey(today)
  const { tracks } = trackMistakes(attempts)
  const due: DueMistake[] = []
  for (const [questionId, track] of tracks) {
    const dueDay = addDays(track.from, MISTAKE_STEPS[track.step])
    if (dueDay <= todayKey) due.push({ questionId, due: dueDay, step: track.step })
  }
  return due.sort((a, b) => a.due.localeCompare(b.due) || a.questionId.localeCompare(b.questionId))
}

/**
 * Walks through her answers, oldest first, and follows each missed question up the steps.
 * tracks: the questions still coming back (their next step, and the day the wait started from).
 * fixed: the ones that made it past the 14-day step.
 */
function trackMistakes(attempts: readonly PlanAttempt[]) {
  const oldestFirst = attempts
    .filter((a) => a.created_at !== null && a.from_game !== true)
    .sort((a, b) => a.created_at!.localeCompare(b.created_at!))

  const tracks = new Map<string, { step: number; from: string }>()
  const fixed = new Set<string>()
  for (const a of oldestFirst) {
    const day = localDateKey(new Date(a.created_at!))
    if (!a.is_correct) {
      tracks.set(a.question_id, { step: 0, from: day })
      fixed.delete(a.question_id) // missed again after it was fixed: it's back on the ladder
      continue
    }
    const track = tracks.get(a.question_id)
    if (!track) continue // never missed (or already fixed)
    if (day < addDays(track.from, MISTAKE_STEPS[track.step])) continue // early: doesn't count
    if (track.step + 1 >= MISTAKE_STEPS.length) {
      tracks.delete(a.question_id)
      fixed.add(a.question_id)
    } else tracks.set(a.question_id, { step: track.step + 1, from: day })
  }
  return { tracks, fixed }
}

export type MistakeLadder = {
  /** how many past mistakes wait at each step: [1 day, 3 days, 7 days, 14 days] */
  waiting: number[]
  /** how many made it past the 14-day step */
  fixed: number
}

/** Her past mistakes on the ladder (for the Plan page): how many at each step, and how many are fixed. */
export function mistakeLadder(attempts: readonly PlanAttempt[]): MistakeLadder {
  const { tracks, fixed } = trackMistakes(attempts)
  const waiting = MISTAKE_STEPS.map(() => 0)
  for (const track of tracks.values()) waiting[track.step]++
  return { waiting, fixed: fixed.size }
}

// ---------- Focus subject ----------

/** Why a subject was picked. The screen turns this into words ("46% · below the 50% line"). */
export type FocusReason =
  | { kind: 'below-floor'; accuracy: number }
  | { kind: 'below-passing'; accuracy: number }
  | { kind: 'not-tried' }
  /** some answers, but fewer than MIN_ANSWERED: too few for a real score, so no percent is shown */
  | { kind: 'getting-started'; attempts: number }
  | { kind: 'keep-sharp'; accuracy: number }

export type Focus = { subject: SubjectSummary; reason: FocusReason }

/** Where a subject stands, as a reason (used when she swaps the focus subject for another). */
export function reasonFor(subject: SubjectSummary): FocusReason {
  if (subject.accuracy === null || subject.attempts === 0) return { kind: 'not-tried' }
  if (!hasRealScore(subject)) return { kind: 'getting-started', attempts: subject.attempts }
  if (subject.belowFloor) return { kind: 'below-floor', accuracy: subject.accuracy }
  if (subject.belowPassing) return { kind: 'below-passing', accuracy: subject.accuracy }
  return { kind: 'keep-sharp', accuracy: subject.accuracy }
}

/**
 * The same plan with the focus task at `index` switched to another subject. Its topic, and whether it's
 * "Learn" or questions, are worked out again for the new subject (same rules as buildPlan).
 */
export function swapSubject(plan: StudyPlan, index: number, subject: SubjectSummary, topics: readonly TopicInfo[]): StudyPlan {
  const tasks = plan.tasks.map((t, i) => {
    if (i !== index || !isFocusTask(t)) return t
    // A "Learn" task is about two sets of 10; as questions that's about 20.
    const questionCount = t.kind === 'subject' ? t.count : LEARN_COUNT * 2
    return focusTask({ subject, reason: reasonFor(subject) }, questionCount, topics)
  })
  return { ...plan, tasks }
}

// ---------- Focus topic, and "Learn" (study, then test) ----------

/** Below this, a subject's score is close to guessing (25% with 4 choices): she studies before being quizzed. */
export const LEARN_BELOW = 0.35
/** With fewer answers than this in a subject, its score says little yet: she studies first too (same as a real score). */
export const LEARN_MIN_ANSWERS = MIN_ANSWERED
/** Questions in a "Learn" task: she studies these, then is tested on the same ones. */
export const LEARN_COUNT = 10
/** A topic needs this many answers before its score is trusted for picking the weakest one. */
export const TOPIC_MIN_ANSWERS = 3

/** Does this subject need "study, then test" instead of plain questions? */
export function needsLearning(subject: SubjectSummary): boolean {
  return subject.attempts < LEARN_MIN_ANSWERS || subject.accuracy === null || subject.accuracy < LEARN_BELOW
}

export type FocusTopic = { topicId: number; name: string; attempts: number; accuracy: number | null }

/**
 * The topic inside a subject to work on: a small piece is easier to learn than a whole subject.
 * 1. The lowest-scoring topic below 75% (with at least a few answers, so the score means something).
 * 2. Else the topic she has seen the least (not tried first): something new.
 * 3. Else (every topic passing) the lowest one.
 * null when the subject has no topics.
 */
export function pickTopic(subject: SubjectSummary, topics: readonly TopicInfo[]): FocusTopic | null {
  const scored = new Map(subject.topics.map((t) => [t.topicId, t]))
  const all: FocusTopic[] = topics
    .filter((t) => t.subject_id === subject.subjectId)
    .map((t) => ({ topicId: t.id, name: t.name, attempts: scored.get(t.id)?.attempts ?? 0, accuracy: scored.get(t.id)?.accuracy ?? null }))
  if (all.length === 0) return null

  const byScore = (a: FocusTopic, b: FocusTopic) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || a.name.localeCompare(b.name)
  const trusted = all.filter((t) => t.attempts >= TOPIC_MIN_ANSWERS)
  const weak = trusted.filter((t) => (t.accuracy ?? 0) < PASSING_RATE).sort(byScore)[0]
  if (weak) return weak
  const leastSeen = [...all].sort((a, b) => a.attempts - b.attempts || a.name.localeCompare(b.name))[0]
  if (leastSeen.attempts < TOPIC_MIN_ANSWERS) return leastSeen
  return [...trusted].sort(byScore)[0]
}

/** The task for a focus subject: "Learn" (study, then test) when it's close to guessing, else questions; both on one topic. */
function focusTask(focus: Focus, questionCount: number, topics: readonly TopicInfo[]): FocusTask {
  const { subject, reason } = focus
  const topic = pickTopic(subject, topics)
  const fields = {
    subjectId: subject.subjectId,
    code: subject.code,
    name: subject.name,
    reason,
    topicId: topic?.topicId ?? null,
    topicName: topic?.name ?? null,
    // Where it stood this morning, so the end of the day can show "10% → 43%".
    startAccuracy: topic ? topic.accuracy : subject.accuracy,
  }
  return needsLearning(subject) ? { kind: 'learn', count: LEARN_COUNT, ...fields } : { kind: 'subject', count: questionCount, ...fields }
}

/** Lowest score first; on a tie, the subject that counts more on the board (20% before 10%). */
function byNeed(a: SubjectSummary, b: SubjectSummary): number {
  return (a.accuracy ?? 0) - (b.accuracy ?? 0) || subjectWeight(b.code) - subjectWeight(a.code)
}
/** The subject that counts more on the board first; otherwise keep the usual subject order. */
function byWeight(a: SubjectSummary, b: SubjectSummary): number {
  return subjectWeight(b.code) - subjectWeight(a.code)
}

/**
 * The subject that needs the most work.
 * Only a real score (MIN_ANSWERED answers) counts as "below 50%" or "below 75%"; fewer answers count as new.
 * - Always first: a subject below 50% (alone, it fails the whole exam).
 * - Build phase (or no exam date): new subjects (none or only a few answers) come next, so she sees everything early.
 * - Strengthen and Simulate: subjects below 75% come before new ones.
 * - All passing: the lowest one, to keep it sharp.
 * `skip`: subject ids already used in today's plan.
 */
export function pickFocus(summary: readonly SubjectSummary[], phase: Phase | null, skip: ReadonlySet<number> = new Set()): Focus | null {
  const open = summary.filter((s) => !skip.has(s.subjectId))
  const tried = open.filter(hasRealScore)

  const floor = tried.filter((s) => s.belowFloor).sort(byNeed)[0]
  if (floor) return { subject: floor, reason: { kind: 'below-floor', accuracy: floor.accuracy! } }

  const below = tried.filter((s) => s.belowPassing).sort(byNeed)[0]
  // New: the subject that counts more on the board first; on a tie, the one with fewer answers.
  const untried = open.filter((s) => !hasRealScore(s)).sort((a, b) => byWeight(a, b) || a.attempts - b.attempts)[0]
  const belowFocus: Focus | null = below ? { subject: below, reason: { kind: 'below-passing', accuracy: below.accuracy! } } : null
  const untriedFocus: Focus | null = untried ? { subject: untried, reason: reasonFor(untried) } : null
  const first = phase === 'strengthen' || phase === 'simulate' ? (belowFocus ?? untriedFocus) : (untriedFocus ?? belowFocus)
  if (first) return first

  const lowest = [...tried].sort(byNeed)[0]
  return lowest ? { subject: lowest, reason: { kind: 'keep-sharp', accuracy: lowest.accuracy! } } : null
}

// ---------- The plan ----------

/** Days since she last studied before she counts as "back": 3 = she missed at least 2 whole days. */
export const COMEBACK_AFTER_DAYS = 3
/** In the last weeks, a Mock exam every this many days. */
export const MOCK_EVERY_DAYS = 3
/** Most flashcards in one day's plan (more than this waits for the next days). */
export const FLASHCARD_CAP = 30
/** On a comeback day: smaller, so getting back in is easy. */
export const COMEBACK_FLASHCARD_CAP = 10
export const COMEBACK_MISTAKE_CAP = 5

/** What a focus task (questions or "Learn") knows about its subject and topic. */
type FocusFields = {
  subjectId: number
  code: string
  name: string
  reason: FocusReason
  /** the topic to work on; null when the subject has no topics (then the whole subject) */
  topicId: number | null
  topicName: string | null
  /** the topic's score (or the subject's, without a topic) when the plan was made; null = not tried */
  startAccuracy: number | null
}

export type PlanTask =
  /** `later`: due cards left for the next days (comeback day only) */
  | { kind: 'flashcards'; count: number; later: number }
  /** questions on her focus topic */
  | ({ kind: 'subject'; count: number } & FocusFields)
  /** study `count` questions (answers shown), then a test on the same ones */
  | ({ kind: 'learn'; count: number } & FocusFields)
  | { kind: 'mistakes'; count: number; questionIds: string[] }
  | { kind: 'mixed'; count: number }
  | { kind: 'mock' }

/** The tasks about her focus subject: questions or "Learn". */
export type FocusTask = Extract<PlanTask, { kind: 'subject' | 'learn' }>

export function isFocusTask(task: PlanTask): task is FocusTask {
  return task.kind === 'subject' || task.kind === 'learn'
}

export type StudyPlan = {
  /** the day this plan is for, "YYYY-MM-DD" */
  date: string
  /** full = the usual tasks; light = 1 small task; rest = no tasks (her choice in "This week") */
  mode: DayMode
  phase: Phase | null
  /** null when there is no exam date */
  daysLeft: number | null
  /** she is back after days away: a lighter plan, with a "Welcome back" */
  comeback: boolean
  tasks: PlanTask[]
}

export type PlanInput = {
  today: Date
  /** "YYYY-MM-DD" or null */
  examDate: string | null
  /** questions a day (her daily goal) */
  dailyTarget: number
  summary: readonly SubjectSummary[]
  /** every topic (with its subject), to pick the topic to work on */
  topics: readonly TopicInfo[]
  /** all her answers (games included: any study keeps her "not away") */
  attempts: readonly PlanAttempt[]
  /** flashcards due today */
  flashcardsDue: number
  /** the day of her last finished Mock exam, "YYYY-MM-DD", or null */
  lastMockDay: string | null
  /** which days are full, light or rest */
  studyDays: StudyDays
}

/** A light day's one task: about this many questions or cards (about 10 minutes). */
export const LIGHT_COUNT = 10

/** Rounded to a multiple of 5, at least 5 (sets of 20 or 35 look planned; 23 looks random). */
export function roundToFive(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5)
}

/** Days since the last day she studied before today; null if she never has (a new member is not "back"). */
export function daysAway(attempts: readonly { created_at: string | null }[], today: Date): number | null {
  const todayKey = localDateKey(today)
  let last: string | null = null
  for (const a of attempts) {
    if (!a.created_at) continue
    const day = localDateKey(new Date(a.created_at))
    if (day < todayKey && (last === null || day > last)) last = day
  }
  return last === null ? null : daysBetween(last, todayKey)
}

/** Is a Mock exam due in the plan today? Only in Simulate, not on a comeback day, and not on exam day itself. */
function mockDue(phase: Phase | null, daysLeft: number | null, comeback: boolean, lastMockDay: string | null, todayKey: string): boolean {
  if (phase !== 'simulate' || comeback || daysLeft === null || daysLeft < 1) return false
  return lastMockDay === null || daysBetween(lastMockDay, todayKey) >= MOCK_EVERY_DAYS
}

/**
 * Today's plan: three tasks on a full day, one small one on a light day, none on a rest day.
 * Empty when there are no subjects at all.
 */
export function buildPlan(input: PlanInput): StudyPlan {
  const { today, examDate, dailyTarget, summary, topics, attempts, flashcardsDue, lastMockDay } = input
  const date = localDateKey(today)
  const mode = modeFor(input.studyDays, today)
  const daysLeft = examDate ? daysUntil(examDate, today) : null
  const phase = phaseFor(daysLeft)
  const away = daysAway(attempts, today)
  const comeback = mode === 'full' && away !== null && away >= COMEBACK_AFTER_DAYS
  const plan = { date, mode, phase, daysLeft, comeback }
  if (mode === 'rest') return { ...plan, tasks: [] }

  const focus = pickFocus(summary, phase)
  if (!focus) return { ...plan, tasks: [] }

  // Light day: ONE small task of questions: past mistakes that are due, else her focus.
  // Not flashcards: they aren't saved as answers, so they wouldn't keep her streak going (the cards wait for tomorrow).
  if (mode === 'light') {
    const due = dueMistakes(attempts, today)
    if (due.length > 0) {
      const picked = due.slice(0, LIGHT_COUNT).map((m) => m.questionId)
      return { ...plan, tasks: [{ kind: 'mistakes', count: picked.length, questionIds: picked }] }
    }
    return { ...plan, tasks: [focusTask(focus, LIGHT_COUNT, topics)] }
  }

  const mock = mockDue(phase, daysLeft, comeback, lastMockDay, date)
  // Her daily goal is split between the subject task (about 2/3) and task 3 (the rest).
  // Lighter days (comeback, Mock exam day): the subject task is about 1/3.
  const subjectCount = roundToFive(comeback || mock ? dailyTarget / 3 : (dailyTarget * 2) / 3)
  const thirdCount = comeback ? COMEBACK_MISTAKE_CAP : roundToFive(dailyTarget - subjectCount)

  const tasks: PlanTask[] = []

  // Task 1 and 2: flashcards + the focus subject, or (no cards due) two subjects that share the subject count.
  // Each focus task is on one topic, and is "Learn" (study, then test) when the subject is close to guessing.
  if (flashcardsDue > 0) {
    const cap = comeback ? COMEBACK_FLASHCARD_CAP : FLASHCARD_CAP
    const count = Math.min(flashcardsDue, cap)
    tasks.push({ kind: 'flashcards', count, later: comeback ? flashcardsDue - count : 0 })
    tasks.push(focusTask(focus, subjectCount, topics))
  } else {
    const second = pickFocus(summary, phase, new Set([focus.subject.subjectId]))
    if (second) {
      const each = roundToFive(subjectCount / 2)
      tasks.push(focusTask(focus, each, topics), focusTask(second, each, topics))
    } else {
      tasks.push(focusTask(focus, subjectCount, topics))
    }
  }

  // Task 3: a Mock exam when one is due, else past mistakes that are due (oldest first), else a mixed set.
  const due = dueMistakes(attempts, today)
  if (mock) tasks.push({ kind: 'mock' })
  else if (due.length > 0) {
    const picked = due.slice(0, thirdCount).map((m) => m.questionId)
    tasks.push({ kind: 'mistakes', count: picked.length, questionIds: picked })
  } else tasks.push({ kind: 'mixed', count: thirdCount })

  return { ...plan, tasks }
}

// ---------- Tomorrow ----------

export type TomorrowPreview = {
  /** full, light or rest (her choice for tomorrow) */
  mode: DayMode
  /** tomorrow's first focus task: its subject, topic, and whether it's "Learn" (with today's answers counted) */
  task: FocusTask | null
  /** past mistakes in tomorrow's plan (what she'll do, not the whole waiting list) */
  mistakes: number
  /** a Mock exam is in tomorrow's plan */
  mock: boolean
}

/**
 * A peek at tomorrow, shown once today's plan is done (a reason to come back).
 * Made with the same rules as buildPlan, so what it promises is what tomorrow's plan shows.
 */
export function previewTomorrow(input: PlanInput): TomorrowPreview {
  const tomorrow = new Date(input.today.getFullYear(), input.today.getMonth(), input.today.getDate() + 1, 12)
  // Flashcards due tomorrow aren't known yet; with none, the plan picks two focus tasks, and the first is the one shown.
  const plan = buildPlan({ ...input, today: tomorrow, flashcardsDue: 0 })
  const mistakes = plan.tasks.find((t) => t.kind === 'mistakes')
  return {
    mode: plan.mode,
    task: plan.tasks.find(isFocusTask) ?? null,
    mistakes: mistakes?.kind === 'mistakes' ? mistakes.count : 0,
    mock: plan.tasks.some((t) => t.kind === 'mock'),
  }
}
