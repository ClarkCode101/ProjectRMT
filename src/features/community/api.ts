import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CommunityBook } from '@/lib/community'
import { supabase } from '@/lib/supabase'
import { useRefreshBank } from '@/features/questions/api'
import { useRefreshBooks } from '@/features/questions/booksApi'

// The Community shelf (migration 0010). Everything goes through the database functions, which only ever show
// SHARED books and only ever copy INTO her own account. Her own books are still read from `books` (booksApi).

/** Every shared book (hers too), newest first. */
export function useCommunityBooks() {
  return useQuery({
    queryKey: ['community'],
    queryFn: async (): Promise<CommunityBook[]> => {
      const { data, error } = await supabase.rpc('community_books')
      if (error) throw error
      return data.map((b) => ({
        id: b.id,
        title: b.title,
        color: b.color,
        authorName: b.author_name,
        publishedAt: b.published_at,
        questionCount: b.question_count,
        subjectCodes: b.subject_codes,
        timesAdded: b.times_added,
        isMine: b.is_mine,
        myCopyId: b.my_copy_id,
      }))
    },
  })
}

/** A few questions from a shared book, so she can see what's inside before adding it. */
export function useCommunityPreview(bookId: string | null) {
  return useQuery({
    queryKey: ['community', 'preview', bookId],
    enabled: bookId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_book_preview', { p_book_id: bookId!, p_limit: 5 })
      if (error) throw error
      return data.map((q) => ({ id: q.question_id, stem: q.stem, subjectCode: q.subject_code, chapter: q.chapter }))
    },
  })
}

/**
 * Every question's text in a shared book (migration 0020), for the duplicate check before adding it.
 * Fails quietly if 0020 hasn't been run yet (the sheet then just skips the check).
 */
export function useCommunityStems(bookId: string | null) {
  return useQuery({
    queryKey: ['community', 'stems', bookId],
    enabled: bookId !== null,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_book_stems', { p_book_id: bookId! })
      if (error) throw error
      return data.map((q) => ({ id: q.question_id, stem: q.stem }))
    },
  })
}

/** After sharing, unsharing or adding: load the Community list, her books and her questions again. */
export function useRefreshCommunity() {
  const queryClient = useQueryClient()
  const refreshBooks = useRefreshBooks()
  const refreshBank = useRefreshBank()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['community'] })
    refreshBooks()
    refreshBank() // a copy's questions are new rows in her question bank
  }
}

/** Shares one of her books to Community (or stops sharing it). */
export async function setBookShared(bookId: string, shared: boolean) {
  const { error } = await supabase.rpc('publish_book', { p_book_id: bookId, p_publish: shared })
  if (error) throw error
}

/**
 * Makes her own copy of a shared book in one of her libraries, leaving out the questions in `skip`. Returns the
 * new book's id. p_skip is only sent when she skips something, so adding still works before migration 0021.
 */
export async function addCommunityBook(bookId: string, library: number, skip: string[] = []): Promise<string> {
  const { data, error } = await supabase.rpc('add_community_book', { p_book_id: bookId, p_library: library, ...(skip.length > 0 && { p_skip: skip }) })
  if (error) throw error
  return data
}
