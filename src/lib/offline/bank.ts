// The question bank saved on the device, so Practice, Mock exam and Flashcards work without internet.
//
// While online, a copy of what they need is downloaded and kept in IndexedDB: subjects, topics,
// every question she can see, her past answers, her scores per topic, her flashcard schedule and exam date.
// When Supabase can't be reached, the app reads this copy instead (see withOfflineFallback).
// The copy is refreshed when it's older than BANK_MAX_AGE_MS (or after she edits questions).

import { useSyncExternalStore } from 'react'
import type { QuizFilters, QuizQuestion } from '@/features/quiz/api'
import type { VerifyStatus } from '@/lib/database.types'
import type { ReviewRow } from '@/lib/fsrs'
import { parseChoiceNotes, parseChoices, type SubjectInfo, type TopicInfo, type TopicPerformanceRow } from '@/lib/quiz'
import { supabase } from '@/lib/supabase'
import { pendingAttempts, pendingReviews, type Synced } from './outbox'
import { getOfflineUserId, idbDelete, idbGet, idbSet, isOnline } from './storage'

/** A question plus the extra details the source filters need (Built-in, Mine, one upload, verified only). */
export type BankQuestion = QuizQuestion & {
  owner_id: string | null
  upload_id: string | null
  status: VerifyStatus
  in_subject: boolean
}

/** One past answer: enough for smart selection, Review again, and the streak. */
export type BankAttempt = { question_id: string; is_correct: boolean; selected_index: number | null; created_at: string | null }

/** Her planner row (exam date, daily goal); null until she saves one. */
export type BankStudySettings = { exam_date: string | null; daily_target: number | null } | null

export type OfflineBank = {
  /** 2: added the flashcard schedule and study settings (older copies are downloaded again) */
  version: 2
  /** whose copy this is: another account on the same device never sees it */
  userId: string
  /** when it was downloaded (ms) */
  savedAt: number
  subjects: SubjectInfo[]
  topics: TopicInfo[]
  questions: BankQuestion[]
  attempts: BankAttempt[]
  topicPerformance: TopicPerformanceRow[]
  reviewStates: ReviewRow[]
  studySettings: BankStudySettings
}

/** Download a fresh copy when the saved one is older than this. */
export const BANK_MAX_AGE_MS = 6 * 60 * 60 * 1000

// ---------- Pure helpers (tested in bank.test.ts) ----------

export function isBankStale(savedAt: number, now: number): boolean {
  return now - savedAt > BANK_MAX_AGE_MS
}

/**
 * The same filters as fetchQuestions in features/quiz/api.ts, done on the saved copy.
 * Books aren't in the saved copy, so a book as the source gives nothing offline.
 */
export function filterBankQuestions(questions: readonly BankQuestion[], filters: QuizFilters, subjectTopicIds: readonly number[]): QuizQuestion[] {
  if (filters.questionIds) {
    const wanted = new Set(filters.questionIds)
    return questions.filter((q) => wanted.has(q.id))
  }
  if (filters.source === 'book') return []
  if (filters.source === 'upload' && !filters.uploadId) return []

  return questions.filter((q) => {
    // Book-only questions come up only under "Mine" (same rule as online).
    if (filters.source !== 'mine' && !q.in_subject) return false
    if (filters.topicId !== null) {
      if (q.topic_id !== filters.topicId) return false
    } else if (filters.subjectId !== null && !subjectTopicIds.includes(q.topic_id)) {
      return false
    }
    if (filters.source === 'builtin' && q.owner_id !== null) return false
    if (filters.source === 'mine' && q.owner_id === null) return false
    if (filters.source === 'upload' && q.upload_id !== filters.uploadId) return false
    if (filters.verifiedOnly && q.status !== 'verified') return false
    return true
  })
}

/** An outbox answer in the saved copy's shape. */
export function toBankAttempt(row: Synced['attempts'][number]): BankAttempt {
  return { question_id: row.question_id, is_correct: row.is_correct, selected_index: row.selected_index, created_at: row.created_at }
}

/** Flashcard schedules with newer ones on top: one row per card, the latest wins. */
export function mergeReviewStates(saved: readonly ReviewRow[], newer: readonly ReviewRow[]): ReviewRow[] {
  const byCard = new Map(saved.map((row) => [row.question_id, row]))
  for (const row of newer) byCard.set(row.question_id, row)
  return [...byCard.values()]
}

// ---------- The saved copy ----------

const BANK_KEY = 'bank'
const PAGE_SIZE = 1000 // Supabase returns at most 1000 rows per request

/** The copy in memory, so it's read from IndexedDB only once. */
let memory: OfflineBank | null = null
let downloading: Promise<boolean> | null = null

/**
 * Logging out: delete the saved copy (questions and answers), so the next person on a shared iPad can't open it.
 * Answers still waiting in the outbox stay, so nothing she did is lost: they're sent the next time she logs in.
 */
export async function forgetBank() {
  memory = null
  await idbDelete(BANK_KEY)
  notify()
}

/** The saved copy for whoever is logged in, or null if there isn't one yet. */
export async function getBank(): Promise<OfflineBank | null> {
  const userId = getOfflineUserId()
  if (!userId) return null
  if (memory?.userId === userId) return memory
  const saved = await idbGet<OfflineBank>(BANK_KEY)
  if (saved?.version !== 2 || saved.userId !== userId) return null
  memory = saved
  notify()
  return saved
}

/** Her past answers: the saved ones plus the ones still waiting in the outbox. */
export function allAttempts(bank: OfflineBank): BankAttempt[] {
  return [...bank.attempts, ...pendingAttempts().map(toBankAttempt)]
}

/** Her flashcard schedule: the saved one, with ratings still waiting in the outbox on top. */
export function allReviewStates(bank: OfflineBank): ReviewRow[] {
  return mergeReviewStates(bank.reviewStates, pendingReviews())
}

/**
 * Tries Supabase first. If that fails (no internet, login expired), answers from the saved copy instead.
 * With no saved copy yet, the original error stands ("Check your internet connection").
 */
export async function withOfflineFallback<T>(online: () => Promise<T>, offline: (bank: OfflineBank) => T): Promise<T> {
  if (isOnline()) {
    try {
      return await online()
    } catch (error) {
      const bank = await getBank()
      if (!bank) throw error
      return offline(bank)
    }
  }
  const bank = await getBank()
  if (!bank) throw new Error('Offline, and nothing is saved on this device yet.')
  return offline(bank)
}

/** Loads every page of a list (Supabase sends at most 1000 rows at a time). */
async function fetchAllPages<T>(getPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getPage(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return all
  }
}

async function runDownload(): Promise<boolean> {
  const userId = getOfflineUserId()
  if (!userId || !isOnline()) return false
  try {
    const [subjects, topics, questionRows, attempts, performance, reviewStates, settings] = await Promise.all([
      fetchAllPages((from, to) => supabase.from('subjects').select('id, code, name, sort_order').order('sort_order').range(from, to)),
      fetchAllPages((from, to) => supabase.from('topics').select('id, subject_id, name').order('name').range(from, to)),
      fetchAllPages((from, to) =>
        supabase
          .from('my_questions')
          .select('id, topic_id, source, stem, choices, correct_index, explanation, choice_notes, owner_id, upload_id, status, in_subject')
          .order('id')
          .range(from, to),
      ),
      fetchAllPages((from, to) => supabase.from('attempts').select('question_id, is_correct, selected_index, created_at').order('id').range(from, to)),
      fetchAllPages((from, to) => supabase.from('topic_performance').select('subject_id, topic_id, attempts, accuracy').range(from, to)),
      fetchAllPages((from, to) =>
        supabase
          .from('review_states')
          .select('question_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review')
          .order('question_id')
          .range(from, to),
      ),
      supabase.from('study_settings').select('exam_date, daily_target').maybeSingle(),
    ])
    if (settings.error) throw settings.error

    const questions: BankQuestion[] = questionRows.flatMap((row) => {
      const choices = parseChoices(row.choices)
      if (choices.length < 2) return [] // same rule as the quiz: skip broken rows
      return [{ ...row, choices, choice_notes: parseChoiceNotes(row.choice_notes, choices.length) }]
    })

    // She may have logged out while this was downloading.
    if (getOfflineUserId() !== userId) return false

    memory = {
      version: 2,
      userId,
      savedAt: Date.now(),
      subjects,
      topics,
      questions,
      attempts,
      // Postgres numbers can arrive as strings; make sure they are numbers (same as dashboard/api.ts).
      topicPerformance: performance.map((r) => ({ ...r, attempts: Number(r.attempts), accuracy: Number(r.accuracy) })),
      reviewStates,
      studySettings: settings.data,
    }
    await idbSet(BANK_KEY, memory)
    return true
  } catch {
    return false
  } finally {
    notify()
  }
}

/** Downloads a fresh copy now. Only one download runs at a time. Returns true if it worked. */
export function downloadBank(): Promise<boolean> {
  if (!downloading) {
    downloading = runDownload().finally(() => {
      downloading = null
      notify()
    })
    notify() // so Settings can show "Saving…"
  }
  return downloading
}

/** true after her questions changed, so the next refresh downloads even if the copy is new. */
let changedSinceSave = false

/** Downloads a copy if there isn't one yet, the saved one is old, or her questions changed. */
export async function refreshBankIfStale() {
  const bank = await getBank()
  if (bank && !changedSinceSave && !isBankStale(bank.savedAt, Date.now())) return
  if (await downloadBank()) changedSinceSave = false
}

/** Her questions changed (edited, added, deleted): get a new copy at the next chance. */
export function markBankStale() {
  changedSinceSave = true
}

/** What just reached the server: add it to the saved copy, so offline history and due dates stay complete. */
export async function addSyncedToBank(sent: Synced) {
  const bank = await getBank()
  if (!bank) return
  memory = {
    ...bank,
    attempts: [...bank.attempts, ...sent.attempts.map(toBankAttempt)],
    reviewStates: mergeReviewStates(bank.reviewStates, sent.reviews),
  }
  await idbSet(BANK_KEY, memory)
}

// ---------- For screens (Settings shows what's saved) ----------

export type BankStatus = { questionCount: number | null; savedAt: number | null; downloading: boolean }

let status: BankStatus = { questionCount: null, savedAt: null, downloading: false }
const listeners = new Set<() => void>()

function notify() {
  const current = memory?.userId === getOfflineUserId() ? memory : null
  status = { questionCount: current?.questions.length ?? null, savedAt: current?.savedAt || null, downloading: downloading !== null }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** What's saved on this device, kept up to date. */
export function useBankStatus(): BankStatus {
  return useSyncExternalStore(subscribe, () => status, () => status)
}
