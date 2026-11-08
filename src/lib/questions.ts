// Plain functions for the Questions page (add / edit / verify / coverage), kept here so they can be tested.

import { parseQuestions } from './parsers/questionParser'

export const CHOICE_COUNT = 4

/** What the add/edit form holds. */
export type QuestionDraft = {
  topicId: number | null
  stem: string
  choices: string[]
  correctIndex: number | null
  explanation: string
  difficulty: 1 | 2 | 3
}

export function emptyDraft(topicId: number | null = null): QuestionDraft {
  return { topicId, stem: '', choices: Array(CHOICE_COUNT).fill(''), correctIndex: null, explanation: '', difficulty: 2 }
}

export type DraftErrors = Partial<Record<'topic' | 'stem' | 'choices' | 'correct', string>>

/** Checks the form before saving. Returns an empty object when everything is fine. */
export function validateDraft(draft: QuestionDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (draft.topicId === null) errors.topic = 'Choose a topic.'
  if (draft.stem.trim() === '') errors.stem = 'Write the question.'

  const choices = draft.choices.map((c) => c.trim())
  if (choices.length !== CHOICE_COUNT) {
    errors.choices = 'Each question needs exactly four choices.'
  } else if (choices.some((c) => c === '')) {
    errors.choices = 'Fill in all four choices.'
  } else if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) {
    errors.choices = 'Two choices are the same. Make each one different.'
  }

  if (draft.correctIndex === null) errors.correct = 'Mark the correct answer.'
  return errors
}

/** The row to save, with extra spaces trimmed. Only call after validateDraft() found no errors. */
export function draftToRow(draft: QuestionDraft) {
  const explanation = draft.explanation.trim()
  return {
    topic_id: draft.topicId!,
    stem: draft.stem.trim(),
    choices: draft.choices.map((c) => c.trim()),
    correct_index: draft.correctIndex!,
    explanation: explanation === '' ? null : explanation,
    difficulty: draft.difficulty,
  }
}

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D']

/** What's left to fill in, in plain words, for the live "Still needed" line on the form. Empty = ready to save. */
export function stillNeeded(draft: QuestionDraft): string[] {
  const needed: string[] = []
  if (draft.topicId === null) needed.push('a topic')
  if (draft.stem.trim() === '') needed.push('the question')

  const emptyLetters = CHOICE_LETTERS.filter((_, i) => (draft.choices[i] ?? '').trim() === '')
  if (emptyLetters.length === CHOICE_COUNT) needed.push('the four choices')
  else if (emptyLetters.length > 0) needed.push(`${emptyLetters.length === 1 ? 'choice' : 'choices'} ${emptyLetters.join(', ')}`)
  else if (validateDraft(draft).choices) needed.push('four different choices')

  if (draft.correctIndex === null) needed.push('the correct answer (tap ○)')
  return needed
}

// ---------- Pasting a whole question into the form ----------

export type PastedQuestion =
  | { kind: 'plain' } // just text: paste it as usual
  | { kind: 'many'; count: number } // several questions: those belong in Upload
  | { kind: 'one'; stem: string; choices: string[]; correctIndex: number | null; explanation: string }

// "1. Which..." but not "2.5 mg/dL is..." (a number that is part of the question).
const STARTS_NUMBERED = /^\s*(?:q(?:uestion)?\s*)?\d{1,3}\s*[.):]\s*(?=\D)/i
const CHOICE_A_MARK = /(^|\s)\*?\(?a[.)]\s/gi

/** Reads pasted text with the same parser as Upload. Only a complete four-choice question counts as "one". */
export function readPastedQuestion(text: string): PastedQuestion {
  const choiceSets = text.match(CHOICE_A_MARK)?.length ?? 0
  if (choiceSets === 0) return { kind: 'plain' }

  // The parser finds questions by their numbers; one copied from notes often has none.
  const { questions } = parseQuestions(STARTS_NUMBERED.test(text) ? text : `1. ${text}`)
  const withChoices = questions.filter((q) => q.choices.length > 0)
  if (withChoices.length > 1 || choiceSets > 1) return { kind: 'many', count: Math.max(withChoices.length, choiceSets) }

  const question = withChoices[0]
  if (!question || !question.stem || question.choices.length !== CHOICE_COUNT) return { kind: 'plain' }
  return { kind: 'one', stem: question.stem, choices: question.choices, correctIndex: question.correctIndex, explanation: question.explanation }
}

// ---------- Coverage map ----------

/** A topic with at least this many questions has "enough" for practice. */
export const ENOUGH_QUESTIONS = 10

export type CoverageLevel = 'none' | 'few' | 'enough'

export function coverageLevel(count: number): CoverageLevel {
  if (count <= 0) return 'none'
  if (count < ENOUGH_QUESTIONS) return 'few'
  return 'enough'
}

export type SubjectCoverage = {
  subjectId: number
  code: string
  name: string
  total: number
  topics: { topicId: number; name: string; count: number; level: CoverageLevel }[]
}

/** Question count per topic, grouped by subject. Topics with the fewest questions come first. */
export function summarizeCoverage(
  questions: { topic_id: number }[],
  subjects: { id: number; code: string; name: string }[],
  topics: { id: number; subject_id: number; name: string }[],
): SubjectCoverage[] {
  const countByTopic = new Map<number, number>()
  for (const q of questions) countByTopic.set(q.topic_id, (countByTopic.get(q.topic_id) ?? 0) + 1)

  return subjects.map((s) => {
    const subjectTopics = topics
      .filter((t) => t.subject_id === s.id)
      .map((t) => {
        const count = countByTopic.get(t.id) ?? 0
        return { topicId: t.id, name: t.name, count, level: coverageLevel(count) }
      })
      .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name))
    return {
      subjectId: s.id,
      code: s.code,
      name: s.name,
      total: subjectTopics.reduce((sum, t) => sum + t.count, 0),
      topics: subjectTopics,
    }
  })
}

// ---------- Browse filters ----------

export type BankFilters = {
  search: string
  subjectTopicIds: number[] | null // null = all subjects
  status: 'all' | 'unverified' | 'verified'
  source: 'all' | 'builtin' | 'mine'
}

type FilterableQuestion = {
  topic_id: number
  owner_id: string | null
  stem: string
  choices: string[]
  status: 'unverified' | 'verified'
}

/** Filters the question list. Search looks in the question and its choices, ignoring case. */
export function filterQuestions<Q extends FilterableQuestion>(questions: Q[], filters: BankFilters): Q[] {
  const needle = filters.search.trim().toLowerCase()
  const topicIds = filters.subjectTopicIds ? new Set(filters.subjectTopicIds) : null
  return questions.filter((q) => {
    if (topicIds && !topicIds.has(q.topic_id)) return false
    if (filters.status !== 'all' && q.status !== filters.status) return false
    if (filters.source === 'builtin' && q.owner_id !== null) return false
    if (filters.source === 'mine' && q.owner_id === null) return false
    if (needle && ![q.stem, ...q.choices].some((text) => text.toLowerCase().includes(needle))) return false
    return true
  })
}
