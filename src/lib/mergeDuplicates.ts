// The duplicate check for merging two of her books (migration 0017), kept here so it can be tested.
// It works like the upload's check (find_similar_questions in the database): the same cleanup of the question
// text, and the same "60% alike" line, but it only compares the two books, so it runs right in the browser.

import { normalizeStem } from './parsers/questionParser'

/** How alike two questions must be to count as "possibly the same" (same as the upload check). */
export const SIMILAR_AT = 0.6

/** The 3-letter pieces of a text, the way Postgres's pg_trgm makes them (each word padded with spaces). */
function trigrams(normalized: string): Set<string> {
  const pieces = new Set<string>()
  for (const word of normalized.split(' ')) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) pieces.add(padded.slice(i, i + 3))
  }
  return pieces
}

/** How alike two question texts are, from 0 (nothing alike) to 1 (the same), like pg_trgm's similarity(). */
export function similarity(a: string, b: string): number {
  const ta = trigrams(normalizeStem(a))
  const tb = trigrams(normalizeStem(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / (ta.size + tb.size - shared)
}

export type MergeDuplicate = {
  /** the question coming in from the book being merged */
  incomingId: string
  incomingStem: string
  /** the question already in the other book that it looks like */
  existingId: string
  existingStem: string
  /** true = the same question (same text after cleanup); false = only alike */
  exact: boolean
  score: number
}

/**
 * The questions coming in from `incoming` that look like one already in `existing`: the best match for each
 * (the same text first, then the most alike), the same ones first. A question in both books isn't listed
 * (merging already skips it).
 */
export function findMergeDuplicates(incoming: readonly { id: string; stem: string }[], existing: readonly { id: string; stem: string }[]): MergeDuplicate[] {
  const existingIds = new Set(existing.map((q) => q.id))
  const prepared = existing.map((q) => ({ ...q, normalized: normalizeStem(q.stem) }))
  const found: MergeDuplicate[] = []
  for (const q of incoming) {
    if (existingIds.has(q.id)) continue
    const normalized = normalizeStem(q.stem)
    let best: MergeDuplicate | null = null
    for (const e of prepared) {
      const exact = normalized !== '' && normalized === e.normalized
      const score = exact ? 1 : similarity(q.stem, e.stem)
      if (!exact && score < SIMILAR_AT) continue
      if (!best || score > best.score) best = { incomingId: q.id, incomingStem: q.stem, existingId: e.id, existingStem: e.stem, exact, score }
      if (exact) break
    }
    if (best) found.push(best)
  }
  return found.sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
}
