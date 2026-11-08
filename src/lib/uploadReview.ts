// The review step of an upload (PROJECT_PLAN.md §8): what each found question's status is,
// what happens to it by default, and what gets saved. Plain functions so they can be tested.
import { normalizeStem, type ParsedQuestion } from './parsers/questionParser'
import { validateDraft, type DraftErrors, type QuestionDraft } from './questions'

/** A question already in the bank that looks like this one (from find_similar_questions). */
export type Match = { id: string; stem: string; score: number; exact: boolean }

/** save = add as a new question, skip = leave it out, replace = overwrite the matching question with this one */
export type Decision = 'save' | 'skip' | 'replace'

export type ReviewItem = {
  /** position in the file, used as a stable id on screen */
  key: number
  /** topicId null = use the topic chosen for the whole upload */
  draft: QuestionDraft
  /** null while the duplicate check is still running */
  matches: Match[] | null
  /** key of an earlier question in the same upload with the same text */
  repeatOf: number | null
  decision: Decision
  /** which existing question "Replace" overwrites */
  replaceId: string | null
  /** uploading into her own book: its topic there (her own name); null = the one chosen for the whole upload */
  chapter: string | null
}

export type ReviewStatus = 'fix' | 'repeat' | 'checking' | 'duplicate' | 'ready'

/** Problems with the question itself (the topic is checked for the whole upload instead). */
export function contentErrors(item: ReviewItem): DraftErrors {
  // Any topic id stands in here; it is only the content that matters.
  return validateDraft({ ...item.draft, topicId: item.draft.topicId ?? -1 })
}

export function isContentValid(item: ReviewItem) {
  return Object.keys(contentErrors(item)).length === 0
}

/** Turns parser output into review items. Good, unrepeated questions start as "save"; the rest as "skip". */
export function toReviewItems(parsed: ParsedQuestion[]): ReviewItem[] {
  const firstWithText = new Map<string, number>()
  return parsed.map((q, key) => {
    const normalized = normalizeStem(q.stem)
    const repeatOf = normalized && firstWithText.has(normalized) ? firstWithText.get(normalized)! : null
    if (normalized && repeatOf === null) firstWithText.set(normalized, key)

    const item: ReviewItem = {
      key,
      draft: { topicId: null, stem: q.stem, choices: q.choices, correctIndex: q.correctIndex, explanation: q.explanation, choiceNotes: q.choices.map(() => ''), difficulty: 2 },
      matches: null,
      repeatOf,
      decision: 'skip',
      replaceId: null,
      chapter: null,
    }
    item.decision = isContentValid(item) && repeatOf === null ? 'save' : 'skip'
    return item
  })
}

/** Adds the duplicate-check result. Anything that looks like an existing question switches to "skip" until she decides. */
export function withMatches(item: ReviewItem, matches: Match[]): ReviewItem {
  return {
    ...item,
    matches,
    replaceId: matches[0]?.id ?? null,
    decision: matches.length > 0 && item.decision === 'save' ? 'skip' : item.decision,
  }
}

export function itemStatus(item: ReviewItem): ReviewStatus {
  if (!isContentValid(item)) return 'fix'
  if (item.repeatOf !== null) return 'repeat'
  if (item.matches === null) return 'checking'
  if (item.matches.length > 0) return 'duplicate'
  return 'ready'
}

/** Will this item be written to the bank when she presses Save? */
export function willSave(item: ReviewItem) {
  if (!isContentValid(item)) return false
  if (item.decision === 'save') return true
  return item.decision === 'replace' && item.replaceId !== null
}

export function summarize(items: ReviewItem[]) {
  const count = (status: ReviewStatus) => items.filter((i) => itemStatus(i) === status).length
  return {
    total: items.length,
    ready: count('ready'),
    fix: count('fix'),
    duplicates: count('duplicate') + count('repeat'),
    checking: count('checking'),
    toAdd: items.filter((i) => willSave(i) && i.decision === 'save').length,
    toReplace: items.filter((i) => willSave(i) && i.decision === 'replace').length,
  }
}

/**
 * What to write: new questions, and existing ones to overwrite. Each gets its own topic or the upload's topic,
 * and (uploading into her own book) its own topic in the book or the upload's: `insertChapters[i]` goes with `inserts[i]`.
 */
export function plannedWrites(items: ReviewItem[], uploadTopicId: number, uploadChapter: string | null = null) {
  const withTopic = (item: ReviewItem): QuestionDraft => ({ ...item.draft, topicId: item.draft.topicId ?? uploadTopicId })
  const chapterOf = (item: ReviewItem) => item.chapter ?? uploadChapter
  const chosen = items.filter(willSave)
  const added = chosen.filter((i) => i.decision === 'save')
  return {
    inserts: added.map(withTopic),
    insertChapters: added.map(chapterOf),
    replacements: chosen.filter((i) => i.decision === 'replace').map((i) => ({ id: i.replaceId!, draft: withTopic(i), chapter: chapterOf(i) })),
  }
}
