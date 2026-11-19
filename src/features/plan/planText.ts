// The words and numbers for Today's plan (the bar on Home and the Plan page). Pure, so they can be tested.
import { taskKey } from '@/lib/planLinks'
import type { PlanProgress } from '@/lib/planProgress'
import { FLOOR_LABEL, MIN_ANSWERED, PASSING_LABEL, PASSING_RATE } from '@/lib/quiz'
import {
  COMEBACK_FLASHCARD_CAP,
  LEARN_BELOW,
  MOCK_EVERY_DAYS,
  type FocusReason,
  type FocusTask,
  type Phase,
  type PlanTask,
  type StudyPlan,
  type TomorrowPreview,
} from '@/lib/studyPlan'

/** Shorter names that fit a small task tile ("20 Blood Banking questions"). */
const SHORT_NAMES: Record<string, string> = {
  CC: 'Clinical Chemistry',
  MICRO: 'Microbiology',
  HEMA: 'Hematology',
  BBIS: 'Blood Banking',
  CM: 'Clinical Microscopy',
  HTMLE: 'HTMLE',
}

export function shortName(code: string, name: string): string {
  return SHORT_NAMES[code] ?? name
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const PHASE_LABEL: Record<Phase, string> = { build: 'Build', strengthen: 'Strengthen', simulate: 'Simulate' }

/** What a focus task is about: its topic, or (no topic) the subject's short name. */
const focusLabel = (task: FocusTask) => task.topicName ?? shortName(task.code, task.name)

/**
 * The task's name, e.g. "20 Coagulation questions" or "Learn Coagulation".
 * `count` = how many to show (the remaining ones on the button); a "Learn" task's name has no number.
 */
export function taskTitle(task: PlanTask, count = itemsOf(task)): string {
  switch (task.kind) {
    case 'flashcards':
      return `Review ${plural(count, 'flashcard')}`
    case 'subject':
      return `${count} ${focusLabel(task)} ${count === 1 ? 'question' : 'questions'}`
    case 'learn':
      return `Learn ${focusLabel(task)}`
    case 'mistakes':
      return `Fix ${plural(count, 'past mistake')}`
    case 'mixed':
      return `${count} mixed ${count === 1 ? 'question' : 'questions'}`
    case 'mock':
      return 'Mock exam'
  }
}

/** red = needs work, gold = past mistakes, blue = everything else (matches the mockup's tags). */
export type Tone = 'red' | 'gold' | 'blue'
export type Note = { text: string; tone: Tone }

/**
 * A whole percent, rounded DOWN, so a score just under a line never shows as the line itself
 * ("49.6%" says 49%, not "50% · below the 50% line").
 */
const percent = (rate: number) => Math.floor(rate * 100)

/** Why a subject is in the plan, in a few words. */
export function reasonNote(reason: FocusReason): Note {
  switch (reason.kind) {
    case 'below-floor':
      return { text: `${percent(reason.accuracy)}% · below the ${FLOOR_LABEL} line`, tone: 'red' }
    case 'below-passing':
      // Within 5 points of passing: say how close, it's a win in sight.
      return { text: `${percent(reason.accuracy)}% · ${reason.accuracy >= PASSING_RATE - 0.05 ? 'close to' : 'below'} ${PASSING_LABEL}`, tone: 'red' }
    case 'not-tried':
      return { text: 'Not tried yet', tone: 'blue' }
    case 'getting-started':
      // No percent yet: on a few answers it says little (the same "3/10" as the subject card on Home).
      return { text: `${reason.attempts}/${MIN_ANSWERED} answered · getting started`, tone: 'blue' }
    case 'keep-sharp':
      return { text: `${percent(reason.accuracy)}% · keep it sharp`, tone: 'blue' }
  }
}

/** The small tag under each task: why it's there. */
export function taskNote(task: PlanTask, plan: StudyPlan): Note {
  switch (task.kind) {
    case 'flashcards':
      return task.later > 0
        ? { text: `${task.later} more spread over ${plural(Math.ceil(task.later / COMEBACK_FLASHCARD_CAP), 'day')}`, tone: 'blue' }
        : { text: 'Due today', tone: 'blue' }
    case 'subject':
    case 'learn':
      return focusNote(task)
    case 'mistakes':
      return { text: plan.comeback ? 'The oldest ones first' : 'Due again today', tone: 'gold' }
    case 'mixed':
      return { text: 'Keeps every subject fresh', tone: 'blue' }
    case 'mock':
      return { text: `Every ${MOCK_EVERY_DAYS} days now`, tone: 'blue' }
  }
}

/**
 * The tag on a focus task. The title already names the topic, so the tag names the subject and its score:
 * "Hematology 14% · below the 50% line". Without a topic the title is the subject, so just the score.
 */
function focusNote(task: FocusTask): Note {
  const note = reasonNote(task.reason)
  if (task.topicName === null) return note
  const subject = shortName(task.code, task.name)
  if (task.reason.kind === 'not-tried') return { ...note, text: `${subject} · not tried yet` }
  if (task.reason.kind === 'getting-started') return { ...note, text: `${subject} · ${task.reason.attempts}/${MIN_ANSWERED} answered` }
  return { ...note, text: `${subject} ${note.text}` }
}

/** One line on WHY a task is in the plan (the Plan page shows it, so she learns how the plan thinks). */
export function taskWhy(task: PlanTask): string {
  switch (task.kind) {
    case 'flashcards':
      return task.later > 0
        ? `Only ${task.count} today after your days away. The other ${task.later} come over the next few days.`
        : 'Each card comes back right before you’d forget it.'
    case 'subject':
      return `${subjectWhy(task.reason)}${topicLine(task)}`
    case 'learn':
      return `${learnWhy(task)}${topicLine(task)}`
    case 'mistakes':
      return 'Questions you missed, back at the right time. Right again, and it waits longer next time.'
    case 'mixed':
      return 'Questions from every subject, so the strong ones don’t fade.'
    case 'mock':
      return `In the last weeks, a full Mock exam every ${MOCK_EVERY_DAYS} days gets you used to the real thing.`
  }
}

function subjectWhy(reason: FocusReason): string {
  switch (reason.kind) {
    case 'below-floor':
      return `One subject below ${FLOOR_LABEL} fails the whole exam, so it comes first.`
    case 'below-passing':
      return `Each subject needs ${PASSING_LABEL} to pass. This is the one that needs it most.`
    case 'not-tried':
      return 'You haven’t tried this one yet. Seeing every subject early shows where you stand.'
    case 'getting-started':
      return `Only a few answers here so far. ${MIN_ANSWERED} give it a real score, so you see where you stand.`
    case 'keep-sharp':
      return 'Everything is passing. This keeps your lowest one sharp.'
  }
}

/** Why "study, then test" instead of questions. */
function learnWhy(task: FocusTask): string {
  const how = `so you see the answers with the why first, then try the same ${task.count}.`
  if (task.reason.kind === 'not-tried') return `New to you, ${how}`
  if (task.reason.kind === 'getting-started') return `Only a few answers here so far, ${how}`
  if (task.reason.accuracy < LEARN_BELOW) return `Below ${Math.round(LEARN_BELOW * 100)}% is close to guessing, ${how}`
  return `Only a few answers here so far, ${how}`
}

/** " Today's topic: Coagulation (10%)." — empty without a topic. */
function topicLine(task: FocusTask): string {
  if (task.topicName === null) return ''
  return ` Today’s topic: ${task.topicName}${task.startAccuracy === null ? ', new to you' : ` (${percent(task.startAccuracy)}%)`}.`
}

/** What each phase is for, under its name on the road to the exam. */
export const PHASE_ABOUT: Record<Phase, string> = {
  build: 'see every subject',
  strengthen: 'weak ones first',
  simulate: `Mock every ${MOCK_EVERY_DAYS} days`,
}

export type PlanRow = {
  task: PlanTask
  index: number
  /** how many items the task has */
  items: number
  /** how many of them are done today */
  done: number
  complete: boolean
}

/** Each task with how much of it is done. */
export function planRows(plan: StudyPlan, progress: PlanProgress, lastMockDay: string | null): PlanRow[] {
  return plan.tasks.map((task, index) => {
    const items = itemsOf(task)
    const done = doneOf(task, progress, lastMockDay)
    return { task, index, items, done, complete: done >= items }
  })
}

/**
 * How many items the task has. The Mock exam counts as one; a "Learn" task as two steps (study, then test).
 */
export function itemsOf(task: PlanTask): number {
  if (task.kind === 'mock') return 1
  if (task.kind === 'learn') return 2
  return task.count
}

/** How many of the task's items are done today (never more than it has). The Mock exam: done once she finished one today. */
export function doneOf(task: PlanTask, progress: PlanProgress, lastMockDay: string | null): number {
  if (task.kind === 'mock') return lastMockDay === progress.date ? 1 : 0
  return Math.min(progress.done[taskKey(task)] ?? 0, itemsOf(task))
}

/** "5 of 20 done", or for a "Learn" task halfway, "Studied. Next: the test." */
export function progressText(row: PlanRow): string {
  if (row.task.kind === 'learn' && row.done === 1) return 'Studied. Next: the test.'
  return `${row.done} of ${row.items} done`
}

/**
 * About how long a task takes: ~25 s a flashcard, ~45 s a question; "Learn" ~30 s to study one plus ~45 s to test it.
 * `count` = items left (for "Learn": steps left, 2 = study and test, 1 = only the test). null for the Mock exam.
 */
export function minutesFor(task: PlanTask, count = itemsOf(task)): number | null {
  if (task.kind === 'mock') return null
  const seconds = task.kind === 'learn' ? task.count * (count >= 2 ? 75 : 45) : count * (task.kind === 'flashcards' ? 25 : 45)
  return Math.max(1, Math.round(seconds / 60))
}

/** "Tomorrow" once today's plan is done: the focus task, past mistakes in the plan, and a Mock exam day. */
export function tomorrowLine(preview: TomorrowPreview): string {
  if (preview.mode === 'rest') return 'Rest day. Your streak stays safe.'
  const parts: string[] = preview.mode === 'light' ? ['Light day'] : []
  const task = preview.task
  if (task) {
    const subject = shortName(task.code, task.name)
    const what = task.topicName ? `${task.topicName} (${subject})` : subject
    parts.push(task.kind === 'learn' ? `Learn ${what}` : `${what} · ${reasonNote(task.reason).text}`)
  }
  if (preview.mistakes > 0) parts.push(plural(preview.mistakes, 'past mistake'))
  if (preview.mock) parts.push('Mock exam day')
  return parts.length > 0 ? parts.join(' · ') : 'A fresh plan, picked from your scores'
}

/** A task in a few words, for a day's tile in "This week": "Learn MICRO", "CC questions", "Past mistakes". */
export function taskTileLabel(task: PlanTask): string {
  switch (task.kind) {
    case 'learn':
      return `Learn ${task.code}`
    case 'subject':
      return `${task.code} questions`
    case 'flashcards':
      return 'Flashcards'
    case 'mistakes':
      return 'Past mistakes'
    case 'mixed':
      return 'Mixed questions'
    case 'mock':
      return 'Mock exam'
  }
}

/** Tomorrow's tile in "This week": "Learn MICRO", "Mock exam", "Rest". */
export function dayTileLabel(preview: TomorrowPreview): string {
  if (preview.mode === 'rest') return 'Rest'
  if (preview.mock) return 'Mock exam'
  if (preview.task) return taskTileLabel(preview.task)
  if (preview.mistakes > 0) return 'Past mistakes'
  return preview.mode === 'light' ? 'Light day' : 'Full day'
}
