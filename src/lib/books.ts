// Plain functions for her books and libraries on the Questions page (migration 0004), kept here so they can be tested.

import type { BookColor } from './database.types'

export const BOOK_TITLE_MAX = 60
export const LIBRARY_NAME_MAX = 40

/** How many libraries (rooms of shelves) she has. Keep in step with migration 0004. */
export const LIBRARY_COUNT = 3
/** How many books fit in one library (Library 1's six subject books count too). */
export const LIBRARY_SLOTS = 12

/** The colors she can pick, in the order the picker shows them. Keep in step with migration 0004. */
export const BOOK_COLORS: BookColor[] = ['teal', 'red', 'green', 'gold', 'purple', 'slate']

/** What each color looks like on a cover (white text on all of them passes WCAG AA). */
export const BOOK_SPINE: Record<BookColor, string> = {
  teal: '#0B6382',
  red: '#A8303F',
  green: '#1F7A4D',
  gold: '#8C5A12',
  purple: '#5E3B9C',
  slate: '#3E5566',
}

/** Each subject book's color, tinted like its stain on the Flashcards lens (dark enough for white text). */
export const SUBJECT_COLOR: Record<string, string> = {
  CC: '#8A6410',
  MICRO: '#5E3B9C',
  HEMA: '#9C3A68',
  BBIS: '#A8303F',
  CM: '#7E5410',
  HTMLE: '#A2406F',
}

/** Text with extra spaces removed, or an error to show under the box. */
function cleanName(raw: string, max: number, emptyError: string): { title: string } | { error: string } {
  const title = raw.replace(/\s+/g, ' ').trim()
  if (title === '') return { error: emptyError }
  if (title.length > max) return { error: `Keep the name to ${max} letters or fewer.` }
  return { title }
}

export function cleanBookTitle(raw: string) {
  return cleanName(raw, BOOK_TITLE_MAX, 'Give your book a name.')
}

export function cleanLibraryName(raw: string) {
  return cleanName(raw, LIBRARY_NAME_MAX, 'Give the library a name.')
}

/** The name a library shows before she renames it. */
export function defaultLibraryName(slot: number) {
  return slot === 1 ? 'Main library' : `Library ${slot}`
}

/** All library names in order (slot 1 first): her saved names, or the default for any she hasn't renamed. */
export function libraryNames(saved: readonly { slot: number; name: string }[]): string[] {
  return Array.from({ length: LIBRARY_COUNT }, (_, i) => saved.find((l) => l.slot === i + 1)?.name ?? defaultLibraryName(i + 1))
}

/**
 * How many more books fit in a library. Library 1 also holds the subject books.
 * Never below 0 (e.g. if a book was moved in while it was already full on another device).
 */
export function roomLeft(slot: number, booksInLibrary: number, subjectCount: number) {
  return Math.max(0, LIBRARY_SLOTS - booksInLibrary - (slot === 1 ? subjectCount : 0))
}

// ---------- Stars: the "level" of a book, from her score on its questions ----------

/** The score needed for 1, 2 and 3 stars. 60% is the board's passing mark. */
export const STAR_THRESHOLDS = [0.6, 0.75, 0.9] as const
export const MAX_STARS = STAR_THRESHOLDS.length

/** 0–3 stars for a score from 0 to 1. No score yet (not started) = 0. */
export function starsFor(accuracy: number | null): number {
  if (accuracy === null) return 0
  return STAR_THRESHOLDS.filter((t) => accuracy >= t).length
}

/**
 * Her score on a book: right answers ÷ all answers to the questions in it (the same way a subject's score
 * is counted). null = she hasn't answered any of them yet.
 */
export function bookAccuracy(questionIds: ReadonlySet<string>, attempts: readonly { question_id: string; is_correct: boolean }[]): number | null {
  let answered = 0
  let correct = 0
  for (const a of attempts) {
    if (!questionIds.has(a.question_id)) continue
    answered++
    if (a.is_correct) correct++
  }
  return answered === 0 ? null : correct / answered
}

// ---------- Chapters: her own names for groups of questions inside a book (migration 0005) ----------
// On screen they are called "topics" (the same word as a subject's topics, so every book's Contents reads alike);
// in the code and the database they stay "chapter", so they never get mixed up with the board topics (topic_id).

export const CHAPTER_MAX = 40

/** In the address and the Contents: the value that means "the questions with no chapter". */
export const NO_CHAPTER = '__none'

/** The topic every subject has for questions that don't fit a specific one (migration 0005). */
export const GENERAL_TOPIC = 'General'

/** A chapter name with extra spaces removed; empty = no chapter (null). Too long = an error to show. */
export function cleanChapter(raw: string): { chapter: string | null } | { error: string } {
  const chapter = raw.replace(/\s+/g, ' ').trim()
  if (chapter === '') return { chapter: null }
  if (chapter.length > CHAPTER_MAX) return { error: `Keep the topic name to ${CHAPTER_MAX} letters or fewer.` }
  return { chapter }
}

/**
 * A book's chapters for its Contents: each name with how many questions it has, A–Z
 * (ignoring capitals), plus how many questions have no chapter.
 */
export function chapterList(chapters: ReadonlyMap<string, string | null>): { chapters: { name: string; count: number }[]; unfiled: number } {
  const counts = new Map<string, number>()
  let unfiled = 0
  for (const chapter of chapters.values()) {
    if (chapter === null) unfiled++
    else counts.set(chapter, (counts.get(chapter) ?? 0) + 1)
  }
  const list = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
  return { chapters: list, unfiled }
}

/** Which books a question is in, from the list of every book and its questions. */
export function booksContaining<T extends { id: string; questionIds: ReadonlySet<string> }>(books: readonly T[], questionId: string): T[] {
  return books.filter((b) => b.questionIds.has(questionId))
}
