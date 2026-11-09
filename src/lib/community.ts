// Plain functions for the Community shelf (migration 0010), kept here so they can be tested.
// The page itself is features/community; the database does the sharing and copying.

import type { BookColor } from './database.types'

/** One shared book, as the Community page shows it. */
export type CommunityBook = {
  id: string
  title: string
  color: BookColor
  authorName: string
  publishedAt: string
  questionCount: number
  /** board subjects its questions are from, e.g. ['HEMA', 'CC'] (empty = only book-only questions) */
  subjectCodes: string[]
  /** how many accounts have added a copy */
  timesAdded: number
  /** she shared this one herself */
  isMine: boolean
  /** her copy of it, if she already added it */
  myCopyId: string | null
}

export type CommunitySort = 'newest' | 'popular'

/** Lowercase, single spaces, no spaces at the ends: so "  hema  WEEK" finds "Hema week 3". */
function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * The books to show: matching the search (title or author, every word must match, any order),
 * from the chosen subject (null = any subject).
 */
export function filterCommunityBooks(books: readonly CommunityBook[], { search, subject }: { search: string; subject: string | null }): CommunityBook[] {
  const words = normalize(search).split(' ').filter(Boolean)
  return books.filter((b) => {
    if (subject !== null && !b.subjectCodes.includes(subject)) return false
    const haystack = normalize(`${b.title} ${b.authorName}`)
    return words.every((w) => haystack.includes(w))
  })
}

/** Newest first, or most added first (ties: newest first). Doesn't change the list it's given. */
export function sortCommunityBooks(books: readonly CommunityBook[], sort: CommunitySort): CommunityBook[] {
  const newestFirst = (a: CommunityBook, b: CommunityBook) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id)
  return [...books].sort(sort === 'popular' ? (a, b) => b.timesAdded - a.timesAdded || newestFirst(a, b) : newestFirst)
}

/** The subjects that at least one shared book has, in the order given (the app's subject order). */
export function subjectsInUse(books: readonly CommunityBook[], subjectOrder: readonly string[]): string[] {
  const used = new Set(books.flatMap((b) => b.subjectCodes))
  return subjectOrder.filter((code) => used.has(code))
}

/** "Added 3 times" / "Added once" / "Not added yet". */
export function timesAddedLabel(n: number) {
  if (n <= 0) return 'Not added yet'
  if (n === 1) return 'Added once'
  return `Added ${n} times`
}

/**
 * The messages the database functions raise on purpose (migration 0010). They are written for her already,
 * so they can be shown as they are. Anything else (no internet, a bug) gets the general message.
 */
const KNOWN_MESSAGES = [
  'Add at least one question before sharing this book.',
  'This book is no longer shared.',
  'This is your own book.',
  'This book is already in your library.',
  'Pick one of your libraries.',
  'That library is full. Pick another one or make room first.',
]

export const GENERAL_ERROR = 'Couldn’t save. Check your internet connection and try again.'

/** A message to show for an error from the Community functions. */
export function communityErrorMessage(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : ''
  return KNOWN_MESSAGES.includes(message) ? message : GENERAL_ERROR
}
