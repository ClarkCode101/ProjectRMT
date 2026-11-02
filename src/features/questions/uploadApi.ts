import { draftToRow, type QuestionDraft } from '@/lib/questions'
import { supabase } from '@/lib/supabase'
import type { Match } from '@/lib/uploadReview'
import { findSimilar } from './api'

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
 * 2. the new questions in one insert, marked as from this upload and "unverified",
 * 3. each replaced question overwritten with the new text (also back to "unverified").
 */
export async function saveUpload(
  fileName: string,
  writes: { inserts: QuestionDraft[]; replacements: { id: string; draft: QuestionDraft }[] },
): Promise<{ added: number; replaced: number }> {
  const { data: upload, error: uploadError } = await supabase
    .from('uploads')
    .insert({ file_name: fileName, status: 'done', question_count: writes.inserts.length })
    .select('id')
    .single()
  if (uploadError) throw uploadError

  if (writes.inserts.length > 0) {
    const rows = writes.inserts.map((draft) => ({ ...draftToRow(draft), source: 'upload' as const, upload_id: upload.id, status: 'unverified' as const }))
    const { error } = await supabase.from('questions').insert(rows)
    if (error) throw error
  }

  let replaced = 0
  for (const { id, draft } of writes.replacements) {
    const { error } = await supabase
      .from('questions')
      .update({ ...draftToRow(draft), status: 'unverified' })
      .eq('id', id)
    if (error) throw new Error(`Added ${writes.inserts.length} questions, but only ${replaced} of ${writes.replacements.length} replacements were saved.`)
    replaced++
  }
  return { added: writes.inserts.length, replaced }
}
