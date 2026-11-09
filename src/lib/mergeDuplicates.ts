// The duplicate check for merging (migrations 0017, 0019), kept here so it can be tested.
// It works like the upload's check (find_similar_questions in the database): the same cleanup of the question
// text, the same "60% alike" line, and it looks at EVERY question she has (all subjects, built-in ones too, and
// all her books), not just where the questions are going. It runs right in the browser.

import { normalizeStem } from './parsers/questionParser'

/** How alike two questions must be to count as "possibly the same" (same as the upload check). */
export const SIMILAR_AT = 0.6

/** The 3-letter pieces of a cleaned-up text, the way Postgres's pg_trgm makes them (each word padded with spaces). */
function trigrams(normalized: string): Set<string> {
  const pieces = new Set<string>()
  for (const word of normalized.split(' ')) {
    if (!word) continue
    const padded = `  ${word} `
    for (let i = 0; i + 3 <= padded.length; i++) pieces.add(padded.slice(i, i + 3))
  }
  return pieces
}

/** How alike two sets of pieces are, from 0 to 1 (shared ÷ all). */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / (a.size + b.size - shared)
}

/** How alike two question texts are, from 0 (nothing alike) to 1 (the same), like pg_trgm's similarity(). */
export function similarity(a: string, b: string): number {
  return overlap(trigrams(normalizeStem(a)), trigrams(normalizeStem(b)))
}

/**
 * Makes the "where does this question live" label for a duplicate: "CC · Ewan" (in a subject, under her topic or
 * the board topic), "book “Test”" (only in one of her books), or "your questions".
 * Used by the merge dialogs and by Community's check before adding a book.
 */
export function makePlaceOf(
  topics: readonly { id: number; subject_id: number; name: string }[],
  subjects: readonly { id: number; code: string }[],
  books: readonly { title: string; questionIds: ReadonlySet<string> }[],
) {
  const topicById = new Map(topics.map((t) => [t.id, t]))
  const codeById = new Map(subjects.map((s) => [s.id, s.code]))
  return (q: { id: string; topic_id: number; in_subject: boolean; subject_topic?: string | null }) => {
    const t = topicById.get(q.topic_id)
    const code = t ? codeById.get(t.subject_id) : undefined
    if (q.in_subject && code) return `${code} · ${q.subject_topic ?? t?.name ?? ''}`
    const inBook = books.find((b) => b.questionIds.has(q.id))
    return inBook ? `book “${inBook.title}”` : 'your questions'
  }
}

export type MergeDuplicate = {
  /** the question coming in from the book being merged */
  incomingId: string
  incomingStem: string
  /** the question she already has that it looks like */
  existingId: string
  existingStem: string
  /** where that one lives, e.g. "CC · Ewan" or "book “Test”" (empty when not given) */
  existingPlace: string
  /** true = the same question (same text after cleanup); false = only alike */
  exact: boolean
  score: number
}

/**
 * The questions coming in that look like one she already has in `existing` (pass every question she has except
 * the incoming ones): the best match for each (the same text first, then the most alike), the same ones first.
 */
export function findMergeDuplicates(
  incoming: readonly { id: string; stem: string }[],
  existing: readonly { id: string; stem: string; place?: string }[],
): MergeDuplicate[] {
  const incomingIds = new Set(incoming.map((q) => q.id))
  // Each existing question's cleaned text and pieces, worked out once (not once per incoming question).
  const prepared = existing
    .filter((q) => !incomingIds.has(q.id))
    .map((q) => {
      const normalized = normalizeStem(q.stem)
      return { ...q, normalized, pieces: trigrams(normalized) }
    })
  const byText = new Map<string, (typeof prepared)[number]>()
  for (const e of prepared) if (e.normalized !== '' && !byText.has(e.normalized)) byText.set(e.normalized, e)

  const found: MergeDuplicate[] = []
  for (const q of incoming) {
    const normalized = normalizeStem(q.stem)
    const same = byText.get(normalized)
    if (same) {
      found.push({ incomingId: q.id, incomingStem: q.stem, existingId: same.id, existingStem: same.stem, existingPlace: same.place ?? '', exact: true, score: 1 })
      continue
    }
    const pieces = trigrams(normalized)
    let best: MergeDuplicate | null = null
    for (const e of prepared) {
      const score = overlap(pieces, e.pieces)
      if (score >= SIMILAR_AT && (!best || score > best.score)) {
        best = { incomingId: q.id, incomingStem: q.stem, existingId: e.id, existingStem: e.stem, existingPlace: e.place ?? '', exact: false, score }
      }
    }
    if (best) found.push(best)
  }
  return found.sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
}
