// The Full Board run on Mock exam (PROJECT_PLAN.md §3, decided 2026-11-13).
// Like the real MTLE: six papers, one subject each, the same number of items in every paper.
// She takes one paper at a time (each is a normal timed mock); the run remembers the scores in between,
// and after the sixth paper the board's verdict comes from the three rules in lib/quiz.ts (passesBoard).
// Pure functions: no Supabase or React here, so it is easy to unit test.
import { generalAverage, passesBoard, PASSING_RATE, SUBJECT_FLOOR, subjectWeight, type SubjectSummary } from './quiz'

/** Items per paper she can choose. 100 = the real exam. */
export const BOARD_ITEM_COUNTS = [10, 25, 100] as const

/** Kept on this device (localStorage), so she can take the papers over several days. */
export const BOARD_RUN_KEY = 'projectrmt:board-run'

export type PaperResult = { sessionId: string; correct: number; total: number; finishedAt: number }

export type BoardPaper = { subjectId: number; code: string; name: string; result: PaperResult | null }

/** Where the questions come from (the ⚙ options), the same for every paper. */
export type BoardSource = { source: string; uploadId: string | null; bookId: string | null; verifiedOnly: boolean }

export type BoardRun = {
  version: 1
  id: string
  /** items in each paper */
  perSubject: number
  source: BoardSource
  /** ms since 1970 */
  startedAt: number
  /** in exam order (the subjects' order) */
  papers: BoardPaper[]
}

/** A new run: one paper per subject, none taken yet. */
export function newBoardRun(
  subjects: readonly { subjectId: number; code: string; name: string }[],
  perSubject: number,
  source: BoardSource,
  id: string,
  now: number,
): BoardRun {
  return {
    version: 1,
    id,
    perSubject,
    source,
    startedAt: now,
    papers: subjects.map((s) => ({ subjectId: s.subjectId, code: s.code, name: s.name, result: null })),
  }
}

/** The paper to take next (the first one not taken yet), or null when all are done. */
export function nextPaperIndex(run: BoardRun): number | null {
  const i = run.papers.findIndex((p) => p.result === null)
  return i === -1 ? null : i
}

export function papersDone(run: BoardRun): number {
  return run.papers.filter((p) => p.result !== null).length
}

/** The run with one paper's score saved. A paper already taken keeps its first score. */
export function recordPaper(run: BoardRun, index: number, result: PaperResult): BoardRun {
  if (!run.papers[index] || run.papers[index].result !== null) return run
  return { ...run, papers: run.papers.map((p, i) => (i === index ? { ...p, result } : p)) }
}

/** The finished papers as subject scores, so lib/quiz.ts can apply the board's rules to them. */
export function paperSummaries(run: BoardRun): SubjectSummary[] {
  return run.papers.map((p) => {
    const accuracy = p.result && p.result.total > 0 ? p.result.correct / p.result.total : null
    return {
      subjectId: p.subjectId,
      code: p.code,
      name: p.name,
      attempts: p.result?.total ?? 0,
      accuracy,
      belowPassing: accuracy !== null && accuracy < PASSING_RATE,
      belowFloor: accuracy !== null && accuracy < SUBJECT_FLOOR,
      topics: [],
    }
  })
}

export type BoardVerdict = {
  /** weighted general average of the papers taken so far (null before the first) */
  average: number | null
  /** all papers taken? Only then is `passed` the real verdict. */
  complete: boolean
  /** the board's verdict on the papers taken (all three rules) */
  passed: boolean | null
  /** rule 1: average at least 75% */
  averageOk: boolean
  /** rule 2: the papers below 50% (none = ok) */
  belowFloor: string[]
  /** rule 3: share of the exam's weight in papers below 75% (must stay under 60%) */
  failedWeight: number
}

export function boardVerdict(run: BoardRun): BoardVerdict {
  const summary = paperSummaries(run)
  const taken = summary.filter((s) => s.accuracy !== null)
  const average = generalAverage(summary)
  const totalWeight = taken.reduce((sum, s) => sum + subjectWeight(s.code), 0)
  const failedWeight =
    totalWeight === 0 ? 0 : taken.filter((s) => s.belowPassing).reduce((sum, s) => sum + subjectWeight(s.code), 0) / totalWeight
  return {
    average,
    complete: taken.length === run.papers.length && run.papers.length > 0,
    passed: passesBoard(summary),
    averageOk: average !== null && average >= PASSING_RATE - 1e-9,
    belowFloor: taken.filter((s) => s.belowFloor).map((s) => s.code),
    failedWeight,
  }
}

// ---------- The topics on a paper's cover ----------

/** One topic of a paper's subject, with her Practice score in it (null = not answered yet). */
export type CoverTopic = { name: string; accuracy: number | null }

/**
 * Weakest first, so the topics she most needs to watch are the ones the cover shows: the ones she answered from the
 * lowest score up, then the ones she hasn't tried yet (in the order given). Ties keep the order given.
 */
export function weakestFirst(topics: readonly CoverTopic[]): CoverTopic[] {
  const tried = topics.filter((t) => t.accuracy !== null).sort((a, b) => a.accuracy! - b.accuracy!)
  return [...tried, ...topics.filter((t) => t.accuracy === null)]
}

// ---------- Reading a saved run back (anything broken → null, so the page never crashes) ----------

function isPaperResult(v: unknown): v is PaperResult {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.sessionId === 'string' &&
    Number.isInteger(r.correct) &&
    Number.isInteger(r.total) &&
    (r.total as number) > 0 &&
    (r.correct as number) >= 0 &&
    (r.correct as number) <= (r.total as number) &&
    typeof r.finishedAt === 'number'
  )
}

function isPaper(v: unknown): v is BoardPaper {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return Number.isInteger(p.subjectId) && typeof p.code === 'string' && typeof p.name === 'string' && (p.result === null || isPaperResult(p.result))
}

function isSource(v: unknown): v is BoardSource {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    typeof s.source === 'string' &&
    (s.uploadId === null || typeof s.uploadId === 'string') &&
    (s.bookId === null || typeof s.bookId === 'string') &&
    typeof s.verifiedOnly === 'boolean'
  )
}

export function parseBoardRun(raw: unknown): BoardRun | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const ok =
    r.version === 1 &&
    typeof r.id === 'string' &&
    Number.isInteger(r.perSubject) &&
    (r.perSubject as number) > 0 &&
    isSource(r.source) &&
    typeof r.startedAt === 'number' &&
    Array.isArray(r.papers) &&
    r.papers.length > 0 &&
    r.papers.every(isPaper)
  return ok ? (raw as BoardRun) : null
}
