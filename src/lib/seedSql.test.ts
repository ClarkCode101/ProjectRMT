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
  it('creates each topic once and inserts every question as builtin + verified', () => {
    const sql = questionsToSql([valid, { ...valid, stem: 'Another question?' }])
    expect(sql.match(/insert into topics/g)).toHaveLength(1)
    expect(sql.match(/insert into questions/g)).toHaveLength(2)
    expect(sql).toContain("'builtin'")
    expect(sql).toContain("'verified'")
    expect(sql).toContain(`'["V","VII","VIII","X"]'::jsonb`)
    expect(sql.startsWith('--')).toBe(true)
    expect(sql).toContain('begin;')
    expect(sql).toContain('commit;')
  })

  it('writes null when there is no explanation and defaults difficulty to 2', () => {
    const sql = questionsToSql([{ ...valid, explanation: undefined, difficulty: undefined }])
    expect(sql).toContain(", 1, null, null, 2, 'verified'")
  })

  it('writes no notes update for a question without choice notes', () => {
    const sql = questionsToSql([valid])
    expect(sql).not.toContain('update questions')
  })

  it('inserts choice notes and fills them into existing built-ins that have none and the same choices', () => {
    const sql = questionsToSql([{ ...valid, choice_notes: ['Labile', "It's stable", 'Antihemophilic', 'Stuart-Prower'] }])
    const notes = `'["Labile","It''s stable","Antihemophilic","Stuart-Prower"]'::jsonb`
    expect(sql).toContain(`'Factor VII.', ${notes}, 2, 'verified'`)
    expect(sql).toContain(`update questions set choice_notes = ${notes}`)
    expect(sql).toContain(`choice_notes is null and choices = '["V","VII","VIII","X"]'::jsonb`)
  })
})

describe('validateSeedQuestion choice_notes', () => {
  it('accepts 4 notes, empty ones included', () => {
    expect(validateSeedQuestion({ ...valid, choice_notes: ['a', '', 'c', 'd'] })).toEqual([])
  })
  it('rejects the wrong number of notes or non-text notes', () => {
    expect(validateSeedQuestion({ ...valid, choice_notes: ['a', 'b'] })).toEqual(['choice_notes must be 4 strings, one per choice'])
    expect(validateSeedQuestion({ ...valid, choice_notes: ['a', 'b', 'c', 4] })).toHaveLength(1)
  })
})
