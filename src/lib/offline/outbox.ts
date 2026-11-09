// The outbox: Practice answers wait here on the device until they reach Supabase.
//
// Every answer goes through the outbox, online or not, so there is only one way to save:
//   1. put it in the outbox (on the device, instantly)
//   2. try to send everything in the outbox, oldest first
//   3. whatever was sent leaves the outbox; the rest waits for the next try (back online, app opened again)
//
// Each row gets its id here on the device, so sending the same row twice (e.g. the connection dropped
// right after the server saved it) doesn't make a copy: the server skips an id it already has.

import { useSyncExternalStore } from 'react'
import type { Json, SessionMode } from '@/lib/database.types'
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
  time_ms: number
  /** when she answered (not when it was sent), so her streak and history count the right day */
  created_at: string
}

export type OutboxItem =
  | { kind: 'session'; row: OutboxSession }
  | { kind: 'attempt'; row: OutboxAttempt }
  | { kind: 'finish'; sessionId: string; score: number; durationSec: number; finishedAt: string }

// ---------- Pure helpers (tested in outbox.test.ts) ----------

/**
 * What to send next: answers in a row go together in one request; anything else goes alone.
 * Order matters: a session must be saved before its answers (they point to it).
 */
export function takeBatch(items: readonly OutboxItem[]): OutboxItem[] {
  if (items.length === 0) return []
  if (items[0].kind !== 'attempt') return [items[0]]
  const end = items.findIndex((item) => item.kind !== 'attempt')
  return items.slice(0, end === -1 ? items.length : end)
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
        typeof item === 'object' && item !== null && ['session', 'attempt', 'finish'].includes((item as { kind?: unknown }).kind as string),
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
const syncedListeners = new Set<(sent: OutboxAttempt[]) => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Runs `listener` with the answers that just reached the server. Returns a function that stops listening. */
export function onSynced(listener: (sent: OutboxAttempt[]) => void) {
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

/** Answers still on the device only (for offline history and mistakes). */
export function pendingAttempts(): OutboxAttempt[] {
  const userId = getOfflineUserId()
  if (!userId) return []
  return read(userId).flatMap((item) => (item.kind === 'attempt' ? [item.row] : []))
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
      const rows = batch.flatMap((item) => (item.kind === 'attempt' ? [item.row] : []))
      result = await supabase.from('attempts').upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
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
  const sentAttempts: OutboxAttempt[] = []
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
    if (outcome === 'sent') sentAttempts.push(...batch.flatMap((item) => (item.kind === 'attempt' ? [item.row] : [])))
    // New items are only ever added at the end, so the batch is still the first part of the list.
    write(userId, read(userId).slice(batch.length))
  }
  if (sentAttempts.length > 0) syncedListeners.forEach((listener) => listener(sentAttempts))
}

// ---------- For screens ----------

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** How many answers are still waiting to reach the server, kept up to date. */
export function usePendingAnswerCount(): number {
  return useSyncExternalStore(subscribe, () => pendingAttempts().length, () => 0)
}
