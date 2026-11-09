import { draftToRow, type QuestionDraft } from '@/lib/questions'
import { supabase } from '@/lib/supabase'
import type { Match } from '@/lib/uploadReview'
import { findSimilar, saveOverride } from './api'
import { addToBook } from './booksApi'

/**
 * Runs the duplicate check for many questions, a few at a time (not hundreds of requests at once).
 * Calls onResult as each one finishes so the screen can fill in. Returns how many checks failed.
 */
export async function checkDuplicates(
  questions: { key: number; stem: string }[],
  onResult: (key: number, matches: Match[]) => void,
): Promise<number> {
  const queue = [...questions]
  let failed = 0
  async function worker() {
    for (let q = queue.shift(); q; q = queue.shift()) {
      try {
        onResult(q.key, q.stem.trim() ? await findSimilar(q.stem) : [])
      } catch {
        failed++
        onResult(q.key, []) // couldn't check; treat as no look-alikes but tell her (see the page)
      }
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker))
  return failed
}

/**
 * Saves the reviewed questions:
 * 1. an `uploads` record for the file (the file itself is not stored, migration 0003),
 * 2. the new questions in one insert, marked as from this upload and "verified" (she reviewed them before saving),
 * 3. each replaced question overwritten with the new text (also "verified"),
 * 4. uploading into one of her books (`bookId`): the new ones live only in that book (in_subject false), and every
 *    saved question goes into the book, under its topic there (chapter); except a replaced built-in question,
 *    which stays in its subject book only (built-in questions can't go into her books, migration 0014).
 */
export async function saveUpload(
  fileName: string,
  writes: { inserts: QuestionDraft[]; insertChapters: (string | null)[]; replacements: { id: string; draft: QuestionDraft; chapter: string | null }[] },
  bookId: string | null = null,
): Promise<{ added: number; replaced: number }> {
  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .insert({ file_name: fileName, status: 'done', question_count: writes.inserts.length })
    .select('id')
    .single()
  if (uploadError) throw uploadError

  // The new questions' ids, in the same order as the inserts (to put them in her book).
  let newIds: string[] = []
  if (writes.inserts.length > 0) {
    const rows = writes.inserts.map((draft) => ({
      ...draftToRow(draft),
      source: 'upload' as const,
      upload_id: upload.id,
      status: 'verified' as const, // she reviewed them before saving, so they're ready to use (not "Needs a look")
      ...(bookId !== null && { in_subject: false }),
    }))
    const { data, error } = await supabase.from('questions').insert(rows).select('id')
    if (error) throw error
    newIds = data.map((r) => r.id)
  }

  let replaced = 0
  // Built-in questions she replaced: they stay in their subject book and don't go into hers (migration 0014).
  const builtinIds = new Set<string>()
  const partlySaved = () => new Error(`Added ${writes.inserts.length} questions, but only ${replaced} of ${writes.replacements.length} replacements were saved.`)
  for (const { id, draft } of writes.replacements) {
    const { data, error } = await supabase
      .from('questions')
      .update({ ...draftToRow(draft), status: 'verified' })
      .eq('id', id)
      .select('id')
    if (error) throw partlySaved()
    // Nothing changed = it's a built-in question (read-only since migration 0009): save it as her own version instead.
    if (data.length === 0) {
      builtinIds.add(id)
      try {
        await saveOverride({ question_id: id, ...draftToRow(draft), status: 'verified' })
      } catch {
        throw partlySaved()
      }
    }
    replaced++
  }

  if (bookId !== null) {
    // Into her book, one call per topic there (questions that share a topic go in together).
    const byChapter = new Map<string | null, string[]>()
    const put = (id: string, chapter: string | null) => byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), id])
    newIds.forEach((id, i) => put(id, writes.insertChapters[i] ?? null))
    writes.replacements.filter((r) => !builtinIds.has(r.id)).forEach((r) => put(r.id, r.chapter))
    for (const [chapter, ids] of byChapter) await addToBook(bookId, ids, chapter)
  }
  return { added: writes.inserts.length, replaced }
}
