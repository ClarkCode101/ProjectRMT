import { describe, expect, it } from 'vitest'
import { questionsToSql, sqlString, validateSeedQuestion, type SeedQuestion } from './seedSql'

const valid: SeedQuestion = {
  subject: 'HEMA',
  topic: 'Coagulation',
  stem: 'Which factor is the stable factor?',
  choices: ['V', 'VII', 'VIII', 'X'],
  correct_index: 1,
  explanation: 'Factor VII.',
  difficulty: 2,
}

describe('validateSeedQuestion', () => {
  it('accepts a valid question', () => {
    expect(validateSeedQuestion(valid)).toEqual([])
  })

  it('rejects bad subject, choices, correct_index and difficulty', () => {
    const errors = validateSeedQuestion({
      ...valid,
      subject: 'XYZ',
      choices: ['only', 'three', 'choices'],
      correct_index: 4,
      difficulty: 5,
    })
    expect(errors).toHaveLength(4)
  })

  it('rejects non-objects', () => {
    expect(validateSeedQuestion(null)).toEqual(['not an object'])
    expect(validateSeedQuestion('hello')).toEqual(['not an object'])
  })
})

describe('sqlString', () => {
  it('escapes single quotes', () => {
    expect(sqlString("Bouin's solution")).toBe("'Bouin''s solution'")
  })
})

describe('questionsToSql', () => {
  it('creates each topic once and inserts every question as builtin + unverified', () => {
    const sql = questionsToSql([valid, { ...valid, stem: 'Another question?' }])
    expect(sql.match(/insert into topics/g)).toHaveLength(1)
    expect(sql.match(/insert into questions/g)).toHaveLength(2)
    expect(sql).toContain("'builtin'")
    expect(sql).toContain("'unverified'")
    expect(sql).toContain(`'["V","VII","VIII","X"]'::jsonb`)
    expect(sql.startsWith('--')).toBe(true)
    expect(sql).toContain('begin;')
    expect(sql).toContain('commit;')
  })

  it('writes null when there is no explanation and defaults difficulty to 2', () => {
    const sql = questionsToSql([{ ...valid, explanation: undefined, difficulty: undefined }])
    expect(sql).toContain(", 1, null, 2, 'unverified'")
  })
})
