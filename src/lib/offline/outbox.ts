// The outbox: answers (Practice, Mock exam) and flashcard ratings wait here on the device until they reach Supabase.
//
// Everything goes through the outbox, online or not, so there is only one way to save:
//   1. put it in the outbox (on the device, instantly)
//   2. try to send everything in the outbox, oldest first
//   3. whatever was sent leaves the outbox; the rest waits for the next try (back online, app opened again)
//
// Each row gets its id here on the device, so sending the same row twice (e.g. the connection dropped
// right after the server saved it) doesn't make a copy: the server skips an id it already has.

import { useSyncExternalStore } from 'react'
import type { Json, SessionMode } from '@/lib/database.types'
import type { ReviewRow } from '@/lib/fsrs'
import { supabase } from '@/lib/supabase'
import { getOfflineUserId, isOnline } from './storage'

export type OutboxSession = {
  id: string
  mode: SessionMode
  total_items: number
  filters: Json
  started_at: string
}

export type OutboxAttempt = {
  id: string
  session_id: string
  question_id: string
  /** index in the ORIGINAL choices order */
  selected_index: number
  is_correct: boolean
  /** null for the mock exam (it doesn't time each item) */
  time_ms: number | null
  /** when she answered (not when it was sent), so her streak and history count the right day */
  created_at: string
  /** a Board Review lifeline helped (migration 0032): saved, but left out of her scores */
  assisted?: boolean
  /** answered in a solo game (Board Review, Last Card): kept on the device only, never sent (the server knows from the session) */
  from_game?: boolean
}

export type OutboxItem =
  | { kind: 'session'; row: OutboxSession }
  | { kind: 'attempt'; row: OutboxAttempt }
  | { kind: 'finish'; sessionId: string; score: number; durationSec: number; finishedAt: string }
  /** a flashcard's new schedule after she rated it */
  | { kind: 'review'; row: ReviewRow }

/** What reached the server in one send round. */
export type Synced = { attempts: OutboxAttempt[]; reviews: ReviewRow[] }

const KINDS = ['session', 'attempt', 'finish', 'review']

// ---------- Pure helpers (tested in outbox.test.ts) ----------

/**
 * What to send next: answers in a row go together in one request, and so do flashcard ratings in a row;
 * a session start or finish goes alone. Order matters: a session must be saved before its answers (they point to it).
 */
export function takeBatch(items: readonly OutboxItem[]): OutboxItem[] {
  if (items.length === 0) return []
  const kind = items[0].kind
  if (kind !== 'attempt' && kind !== 'review') return [items[0]]
  const end = items.findIndex((item) => item.kind !== kind)
  return items.slice(0, end === -1 ? items.length : end)
}

/**
 * A card rated twice in one batch: only its latest schedule is sent.
 * (The database refuses one request that changes the same row twice.)
 */
export function latestPerCard(rows: readonly ReviewRow[]): ReviewRow[] {
  const latest = new Map<string, ReviewRow>()
  for (const row of rows) {
    latest.delete(row.question_id) // so the card moves to where its latest rating was
    latest.set(row.question_id, row)
  }
  return [...latest.values()]
}

/**
 * The answers of a batch as rows for the database. `assisted` is only sent when one of them was helped by a lifeline,
 * and then on every row (one request needs the same columns on every row, or the others would get null).
 * So ordinary answers never depend on that column existing (migration 0032). `from_game` is never sent (no such column).
 */
export function attemptRows(batch: readonly OutboxItem[]): Omit<OutboxAttempt, 'from_game'>[] {
  const rows = batch.flatMap((item) => (item.kind === 'attempt' ? [item.row] : []))
  const anyAssisted = rows.some((row) => row.assisted === true)
  return rows.map(({ assisted, from_game: _fromGame, ...row }) => (anyAssisted ? { ...row, assisted: assisted === true } : row))
}

/**
 * After a failed send: 'retry' = keep it and try later (no internet, login expired, server busy);
 * 'drop' = the server will never accept it (bad data, deleted question), so don't block the rest behind it.
 */
export function failureAction(status: number): 'retry' | 'drop' {
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return 'retry'
  return status >= 400 ? 'drop' : 'retry'
}

/** Reads a saved outbox, skipping anything that doesn't look right instead of crashing. */
export function parseOutbox(raw: string | null): OutboxItem[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(
      (item): item is OutboxItem =>
        typeof item === 'object' && item !== null && KINDS.includes((item as { kind?: unknown }).kind as string),
    )
  } catch {
    return []
  }
}

// ---------- Saved on the device (localStorage, one list per account) ----------

const keyFor = (userId: string) => `projectrmt:outbox:${userId}`

function read(userId: string): OutboxItem[] {
  try {
    return parseOutbox(localStorage.getItem(keyFor(userId)))
  } catch {
    return []
  }
}

function write(userId: string, items: OutboxItem[]) {
  try {
    if (items.length === 0) localStorage.removeItem(keyFor(userId))
    else localStorage.setItem(keyFor(userId), JSON.stringify(items))
  } catch {
    // Storage full or blocked: nothing more we can do here.
  }
  notify()
}

// ---------- Listeners (for the "waiting to sync" count, and refreshing pages after a sync) ----------

const listeners = new Set<() => void>()
const syncedListeners = new Set<(sent: Synced) => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Runs `listener` with what just reached the server. Returns a function that stops listening. */
export function onSynced(listener: (sent: Synced) => void) {
  syncedListeners.add(listener)
  return () => {
    syncedListeners.delete(listener)
  }
}

// ---------- Adding to the outbox ----------

function add(item: OutboxItem) {
  const userId = getOfflineUserId()
  if (!userId) return
  write(userId, [...read(userId), item])
  void flushOutbox()
}

export function queueSession(row: OutboxSession) {
  add({ kind: 'session', row })
}

export function queueAttempt(row: OutboxAttempt) {
  add({ kind: 'attempt', row })
}

export function queueFinish(sessionId: string, score: number, durationSec: number) {
  add({ kind: 'finish', sessionId, score, durationSec, finishedAt: new Date().toISOString() })
}

export function queueReview(row: ReviewRow) {
  add({ kind: 'review', row })
}

function pendingItems(): OutboxItem[] {
  const userId = getOfflineUserId()
  return userId ? read(userId) : []
}

/** Answers still on the device only (for offline history and mistakes). */
export function pendingAttempts(): OutboxAttempt[] {
  return pendingItems().flatMap((item) => (item.kind === 'attempt' ? [item.row] : []))
}

/** Flashcard ratings still on the device only (for offline due dates). */
export function pendingReviews(): ReviewRow[] {
  return pendingItems().flatMap((item) => (item.kind === 'review' ? [item.row] : []))
}

/** Forget everything waiting (after Reset progress, so old answers don't come back). */
export function clearOutbox() {
  const userId = getOfflineUserId()
  if (userId) write(userId, [])
}

// ---------- Sending ----------

/** Sends one batch. Returns what to do with it. */
async function send(batch: OutboxItem[]): Promise<'sent' | 'retry' | 'drop'> {
  const first = batch[0]
  let result: { error: unknown; status: number }
  try {
    if (first.kind === 'session') {
      result = await supabase.from('quiz_sessions').upsert(first.row, { onConflict: 'id', ignoreDuplicates: true })
    } else if (first.kind === 'attempt') {
      const rows = attemptRows(batch)
      result = await supabase.from('attempts').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      // Refused, and a row carries `assisted`: maybe migration 0032 isn't run yet. Better saved without the flag than lost.
      if (result.error && failureAction(result.status) === 'drop' && rows.some((row) => 'assisted' in row)) {
        const plain = rows.map(({ assisted: _assisted, ...row }) => row)
        result = await supabase.from('attempts').upsert(plain, { onConflict: 'id', ignoreDuplicates: true })
      }
    } else if (first.kind === 'review') {
      // One row per card (user_id is filled in by the database): sending it again just saves the same schedule.
      const rows = latestPerCard(batch.flatMap((item) => (item.kind === 'review' ? [item.row] : [])))
      result = await supabase.from('review_states').upsert(rows, { onConflict: 'user_id,question_id' })
    } else {
      result = await supabase
        .from('quiz_sessions')
        .update({ score: first.score, duration_sec: first.durationSec, finished_at: first.finishedAt })
        .eq('id', first.sessionId)
    }
  } catch {
    return 'retry' // no answer from the server at all
  }
  return result.error ? failureAction(result.status) : 'sent'
}

let flushing: Promise<void> | null = null
/** Asked to send again while a send was running: go around once more, so nothing new is left behind. */
let flushAgain = false

/** Sends everything waiting, oldest first. Safe to call often: only one send runs at a time. */
export function flushOutbox(): Promise<void> {
  if (flushing) {
    flushAgain = true
    return flushing
  }
  flushing = (async () => {
    do {
      flushAgain = false
      await runFlush()
    } while (flushAgain)
  })().finally(() => {
    flushing = null
  })
  return flushing
}

async function runFlush() {
  const userId = getOfflineUserId()
  if (!userId || !isOnline()) return
  const sent: Synced = { attempts: [], reviews: [] }
  // After a refused group of answers: send one at a time, so one bad answer doesn't take the good ones down with it.
  let oneByOne = false
  for (;;) {
    const group = takeBatch(read(userId))
    const batch = oneByOne ? group.slice(0, 1) : group
    if (batch.length === 0) break
    const outcome = await send(batch)
    if (outcome === 'retry') break
    if (outcome === 'drop' && batch.length > 1) {
      oneByOne = true
      continue
    }
    if (outcome === 'sent') {
      for (const item of batch) {
        if (item.kind === 'attempt') sent.attempts.push(item.row)
        if (item.kind === 'review') sent.reviews.push(item.row)
      }
    }
    // New items are only ever added at the end, so the batch is still the first part of the list.
    write(userId, read(userId).slice(batch.length))
  }
  if (sent.attempts.length > 0 || sent.reviews.length > 0) syncedListeners.forEach((listener) => listener(sent))
}

// ---------- For screens ----------

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** How many answers and flashcard ratings are still waiting to reach the server, kept up to date. */
export function usePendingAnswerCount(): number {
  return useSyncExternalStore(subscribe, () => pendingAttempts().length + pendingReviews().length, () => 0)
}
