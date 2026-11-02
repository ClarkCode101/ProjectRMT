import { describe, expect, it } from 'vitest'
import {
  coverageLevel,
  draftToRow,
  emptyDraft,
  ENOUGH_QUESTIONS,
  filterQuestions,
  summarizeCoverage,
  validateDraft,
  type QuestionDraft,
} from './questions'

function goodDraft(): QuestionDraft {
  return {
    topicId: 3,
    stem: '  Which factor is the stable factor?  ',
    choices: ['Factor V', ' Factor VII ', 'Factor VIII', 'Factor X'],
    correctIndex: 1,
    explanation: '   ',
    difficulty: 2,
  }
}

describe('validateDraft', () => {
  it('accepts a complete question', () => {
    expect(validateDraft(goodDraft())).toEqual({})
  })

  it('reports every missing part of an empty form', () => {
    expect(Object.keys(validateDraft(emptyDraft())).sort()).toEqual(['choices', 'correct', 'stem', 'topic'])
  })

  it('treats spaces-only text as empty', () => {
    const draft = { ...goodDraft(), stem: '   ', choices: ['a', 'b', '  ', 'd'] }
    const errors = validateDraft(draft)
    expect(errors.stem).toBeDefined()
    expect(errors.choices).toBe('Fill in all four choices.')
  })

  it('needs exactly four choices (uploads can bring three or five)', () => {
    expect(validateDraft({ ...goodDraft(), choices: ['a', 'b', 'c'], correctIndex: 0 }).choices).toMatch(/exactly four/)
    expect(validateDraft({ ...goodDraft(), choices: ['a', 'b', 'c', 'd', 'e'] }).choices).toMatch(/exactly four/)
  })

  it('catches two choices that are the same, ignoring case and spaces', () => {
    const draft = { ...goodDraft(), choices: ['Factor V', 'factor v ', 'Factor VIII', 'Factor X'] }
    expect(validateDraft(draft).choices).toMatch(/same/)
  })
})

describe('draftToRow', () => {
  it('trims text and saves an empty explanation as null', () => {
    expect(draftToRow(goodDraft())).toEqual({
      topic_id: 3,
      stem: 'Which factor is the stable factor?',
      choices: ['Factor V', 'Factor VII', 'Factor VIII', 'Factor X'],
      correct_index: 1,
      explanation: null,
      difficulty: 2,
    })
  })
})

describe('coverageLevel', () => {
  it('splits counts into none / few / enough', () => {
    expect(coverageLevel(0)).toBe('none')
    expect(coverageLevel(1)).toBe('few')
    expect(coverageLevel(ENOUGH_QUESTIONS - 1)).toBe('few')
    expect(coverageLevel(ENOUGH_QUESTIONS)).toBe('enough')
  })
})

describe('summarizeCoverage', () => {
  const subjects = [
    { id: 1, code: 'HEMA', name: 'Hematology' },
    { id: 2, code: 'CC', name: 'Clinical Chemistry' },
  ]
  const topics = [
    { id: 10, subject_id: 1, name: 'Coagulation' },
    { id: 11, subject_id: 1, name: 'Anemias' },
    { id: 20, subject_id: 2, name: 'Enzymes' },
  ]

  it('counts questions per topic and totals them per subject, fewest first', () => {
    const questions = [{ topic_id: 10 }, { topic_id: 10 }, { topic_id: 11 }]
    const result = summarizeCoverage(questions, subjects, topics)
    expect(result[0].total).toBe(3)
    expect(result[0].topics.map((t) => [t.name, t.count, t.level])).toEqual([
      ['Anemias', 1, 'few'],
      ['Coagulation', 2, 'few'],
    ])
    expect(result[1]).toMatchObject({ code: 'CC', total: 0, topics: [{ name: 'Enzymes', count: 0, level: 'none' }] })
  })

  it('works with no questions at all', () => {
    expect(summarizeCoverage([], subjects, topics).every((s) => s.total === 0)).toBe(true)
  })
})

describe('filterQuestions', () => {
  const questions = [
    { id: 'a', topic_id: 10, owner_id: null, stem: 'Stable factor?', choices: ['VII', 'V'], status: 'unverified' as const },
    { id: 'b', topic_id: 11, owner_id: 'me', stem: 'Iron deficiency', choices: ['Microcytic', 'Macrocytic'], status: 'verified' as const },
    { id: 'c', topic_id: 20, owner_id: null, stem: 'ALT is found in', choices: ['Liver', 'Heart'], status: 'verified' as const },
  ]
  const all = { search: '', subjectTopicIds: null, status: 'all', source: 'all' } as const

  it('returns everything with no filters', () => {
    expect(filterQuestions(questions, all)).toHaveLength(3)
  })

  it('searches the question and its choices, ignoring case', () => {
    expect(filterQuestions(questions, { ...all, search: 'LIVER' }).map((q) => q.id)).toEqual(['c'])
    expect(filterQuestions(questions, { ...all, search: ' stable ' }).map((q) => q.id)).toEqual(['a'])
  })

  it('filters by subject topics, status and source together', () => {
    expect(filterQuestions(questions, { ...all, subjectTopicIds: [10, 11] }).map((q) => q.id)).toEqual(['a', 'b'])
    expect(filterQuestions(questions, { ...all, status: 'verified', source: 'builtin' }).map((q) => q.id)).toEqual(['c'])
    expect(filterQuestions(questions, { ...all, source: 'mine' }).map((q) => q.id)).toEqual(['b'])
  })
})
