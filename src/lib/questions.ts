// Plain functions for the Questions page (add / edit / verify / coverage), kept here so they can be tested.

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
  if (choices.some((c) => c === '')) {
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
