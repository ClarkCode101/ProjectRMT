import { useQuery, useQueryClient } from '@tanstack/react-query'
import { libraryNames } from '@/lib/books'
import type { BookColor } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'

// Her books (migration 0004): named collections of questions, like playlists. RLS keeps them to her own.

export type Book = {
  id: string
  title: string
  color: BookColor
  /** which library it stands in (1–3) */
  library: number
  createdAt: string
  /** when she shared it to Community (migration 0010); null = private */
  publishedAt: string | null
  /** the shared book this is her copy of; null = she made it herself (or the original was deleted) */
  copiedFrom: string | null
  /** the questions in it, for quick "is this question in that book?" checks */
  questionIds: ReadonlySet<string>
  /** each question's chapter in this book (null = no chapter) */
  chapters: ReadonlyMap<string, string | null>
}

type Link = { book_id: string; question_id: string; chapter: string | null }

/** Postgres's "this column doesn't exist" error: migration 0005 (chapters) hasn't been run yet. */
const UNDEFINED_COLUMN = '42703'

const PAGE_SIZE = 1000

/** Every book she made, oldest first (so a new one lands at the end of the shelf), with its questions. */
export function useBooks({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['books'],
    enabled,
    queryFn: async (): Promise<Book[]> => {
      const { data: books, error } = await supabase
        .from('books')
        .select('id, title, color, library, created_at, published_at, copied_from')
        .order('created_at')
        .order('id')
      if (error) throw error

      // Which question is in which book (and its chapter), loaded in pages (Supabase returns at most 1000 rows per request).
      let links: Link[]
      try {
        links = await loadLinks(true)
      } catch (linkError) {
        // Chapters not set up yet (migration 0005): still show the books, just without chapters.
        if ((linkError as { code?: string }).code !== UNDEFINED_COLUMN) throw linkError
        links = await loadLinks(false)
      }

      const chaptersByBook = new Map<string, Map<string, string | null>>()
      for (const link of links) {
        const chapters = chaptersByBook.get(link.book_id) ?? new Map<string, string | null>()
        chapters.set(link.question_id, link.chapter)
        chaptersByBook.set(link.book_id, chapters)
      }
      return books.map((b) => {
        const chapters = chaptersByBook.get(b.id) ?? new Map<string, string | null>()
        return {
          id: b.id,
          title: b.title,
          color: b.color,
          library: b.library,
          createdAt: b.created_at,
          publishedAt: b.published_at,
          copiedFrom: b.copied_from,
          questionIds: new Set(chapters.keys()),
          chapters,
        }
      })
    },
  })
}

/** Every book–question link, in pages. `withChapters` = false before migration 0005 (every chapter is then null). */
async function loadLinks(withChapters: boolean): Promise<Link[]> {
  const links: Link[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('book_questions')
      .select(withChapters ? 'book_id, question_id, chapter' : 'book_id, question_id')
      .order('book_id')
      .order('question_id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const rows = data as unknown as { book_id: string; question_id: string; chapter?: string | null }[]
    links.push(...rows.map((r) => ({ book_id: r.book_id, question_id: r.question_id, chapter: r.chapter ?? null })))
    if (rows.length < PAGE_SIZE) return links
  }
}

/** After any change to her books, load them again. */
export function useRefreshBooks() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['books'] })
    void queryClient.invalidateQueries({ queryKey: ['libraries'] })
  }
}

/** Makes a new, empty book in a library and returns its id. */
export async function createBook(title: string, color: BookColor, library: number): Promise<string> {
  const { data, error } = await supabase.from('books').insert({ title, color, library }).select('id').single()
  if (error) throw error
  return data.id
}

/** Renames, recolors, or moves a book to another library. */
export async function updateBook(id: string, changes: { title: string; color: BookColor; library: number }) {
  const { error } = await supabase.from('books').update(changes).eq('id', id)
  if (error) throw error
}

/** Deletes the book. Its questions stay in their subjects (only the links go, see migration 0004). */
export async function deleteBook(id: string) {
  const { error } = await supabase.from('books').delete().eq('id', id)
  if (error) throw error
}

/** Puts questions in a book (optionally in a chapter). Ones already in it are skipped, so this is safe to repeat. */
export async function addToBook(bookId: string, questionIds: string[], chapter: string | null = null) {
  if (questionIds.length === 0) return
  // chapter only when there is one, so adding still works before migration 0005
  const rows = questionIds.map((questionId) => ({ book_id: bookId, question_id: questionId, ...(chapter !== null && { chapter }) }))
  const { error } = await supabase.from('book_questions').upsert(rows, { onConflict: 'book_id,question_id', ignoreDuplicates: true })
  if (error) throw error
}

/** The three library names in order (defaults for any she hasn't renamed). */
export function useLibraryNames() {
  return useQuery({
    queryKey: ['libraries'],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('libraries').select('slot, name')
      if (error) throw error
      return libraryNames(data)
    },
  })
}

/** Renames a library (stored the first time she renames it). */
export async function renameLibrary(slot: number, name: string) {
  const { error } = await supabase.from('libraries').upsert({ slot, name }, { onConflict: 'owner_id,slot' })
  if (error) throw error
}

/** Moves a question to another chapter of a book (null = no chapter). */
export async function setChapter(bookId: string, questionId: string, chapter: string | null) {
  const { error } = await supabase.from('book_questions').update({ chapter }).eq('book_id', bookId).eq('question_id', questionId)
  if (error) throw error
}

/** Takes a question out of a book (the question itself stays). */
export async function removeFromBook(bookId: string, questionId: string) {
  const { error } = await supabase.from('book_questions').delete().eq('book_id', bookId).eq('question_id', questionId)
  if (error) throw error
}
