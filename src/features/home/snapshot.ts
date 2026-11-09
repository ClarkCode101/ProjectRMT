import type { SubjectSummary } from '@/lib/quiz'

// "Since last time": Home remembers the scores it showed last (on this device), so the next visit
// can count the numbers up from there and she SEES what her practice changed.

export type ScoreSnapshot = { attempts: number; accuracy: number | null }
export type HomeSnapshot = { overall: number | null; subjects: Record<string, ScoreSnapshot> }

const KEY = 'projectrmt:home-snapshot'

export function makeSnapshot(summary: readonly SubjectSummary[], overall: number | null): HomeSnapshot {
  return {
    overall,
    subjects: Object.fromEntries(summary.map((s) => [s.code, { attempts: s.attempts, accuracy: s.accuracy }])),
  }
}

/**
 * The subjects she has answered more in since the snapshot, with their old numbers (to count up from).
 * Fewer answers than before (e.g. after Reset progress) is not "progress", so it's left out.
 */
export function changedSince(previous: HomeSnapshot | null, summary: readonly SubjectSummary[]): Record<string, ScoreSnapshot> {
  if (!previous) return {}
  const changed: Record<string, ScoreSnapshot> = {}
  for (const s of summary) {
    const before = previous.subjects[s.code]
    if (before && s.attempts > before.attempts) changed[s.code] = before
  }
  return changed
}

function isScore(value: unknown): value is ScoreSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.attempts === 'number' && (v.accuracy === null || typeof v.accuracy === 'number')
}

/** The saved snapshot, or null if none / unreadable (then nothing animates, that's all). */
export function readSnapshot(): HomeSnapshot | null {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (typeof data !== 'object' || data === null) return null
    const { overall, subjects } = data as Record<string, unknown>
    if (!(overall === null || typeof overall === 'number') || typeof subjects !== 'object' || subjects === null) return null
    const clean = Object.fromEntries(Object.entries(subjects).filter(([, v]) => isScore(v))) as Record<string, ScoreSnapshot>
    return { overall, subjects: clean }
  } catch {
    return null
  }
}

export function writeSnapshot(snapshot: HomeSnapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot))
  } catch {
    // storage blocked: next visit just won't animate
  }
}
