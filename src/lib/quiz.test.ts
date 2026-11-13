import { describe, expect, it } from 'vitest'
import {
  closestToPassing,
  formatPercent,
  generalAverage,
  latestMistakes,
  markGameAnswers,
  overallStats,
  parseChoiceNotes,
  parseChoices,
  passesBoard,
  shuffle,
  shuffledChoiceOrder,
  smartPick,
  summarizePerformance,
  withoutGameAnswers,
} from './quiz'

/** Simple seeded random number generator so shuffles are repeatable in tests. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('shuffle', () => {
  it('keeps every item exactly once and does not change the input', () => {
    const input = [1, 2, 3, 4, 5, 6]
    const result = shuffle(input, seeded(42))
    expect([...result].sort()).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('handles empty and single-item lists', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle(['a'])).toEqual(['a'])
  })
})

describe('shuffledChoiceOrder', () => {
  it('maps every display position back to a unique original index', () => {
    const order = shuffledChoiceOrder(4, seeded(7))
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })
})

describe('parseChoices', () => {
  it('accepts a list of strings', () => {
    expect(parseChoices(['A', 'B', 'C', 'D'])).toEqual(['A', 'B', 'C', 'D'])
  })
  it('returns [] for anything else', () => {
    expect(parseChoices({ a: 1 })).toEqual([])
    expect(parseChoices(['A', 2])).toEqual([])
    expect(parseChoices(null)).toEqual([])
  })
})

describe('parseChoiceNotes', () => {
  it('returns one trimmed note per choice', () => {
    expect(parseChoiceNotes([' a ', 'b', '', 'd'], 4)).toEqual(['a', 'b', '', 'd'])
  })
  it('returns null when the question has no notes', () => {
    expect(parseChoiceNotes(null, 4)).toBeNull()
    expect(parseChoiceNotes(undefined, 4)).toBeNull()
  })
  it('returns null when the notes do not match the choices', () => {
    expect(parseChoiceNotes(['a', 'b', 'c'], 4)).toBeNull() // wrong length
    expect(parseChoiceNotes(['a', 2, 'c', 'd'], 4)).toBeNull() // not all text
    expect(parseChoiceNotes({ a: 'x' }, 4)).toBeNull()
  })
  it('returns null when every note is empty', () => {
    expect(parseChoiceNotes(['', ' ', '', ''], 4)).toBeNull()
  })
})

describe('latestMistakes', () => {
  const attempt = (question_id: string, is_correct: boolean, created_at: string) => ({
    question_id,
    is_correct,
    selected_index: 0,
    created_at,
  })

  it('keeps questions whose latest attempt was wrong', () => {
    const result = latestMistakes([
      attempt('q1', false, '2026-01-01T00:00:00Z'),
      attempt('q2', false, '2026-01-02T00:00:00Z'),
    ])
    expect(result.map((a) => a.question_id)).toEqual(['q2', 'q1']) // newest first
  })

  it('drops a question once it is answered correctly later', () => {
    const result = latestMistakes([
      attempt('q1', false, '2026-01-01T00:00:00Z'),
      attempt('q1', true, '2026-01-03T00:00:00Z'),
    ])
    expect(result).toEqual([])
  })

  it('puts a question back if she gets it wrong again', () => {
    const result = latestMistakes([
      attempt('q1', false, '2026-01-01T00:00:00Z'),
      attempt('q1', true, '2026-01-02T00:00:00Z'),
      attempt('q1', false, '2026-01-03T00:00:00Z'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].created_at).toBe('2026-01-03T00:00:00Z')
  })

  it('works with no attempts', () => {
    expect(latestMistakes([])).toEqual([])
  })
})

describe('game answers and Review again', () => {
  const row = (question_id: string, is_correct: boolean, created_at: string, session_id: string | null) => ({
    question_id,
    is_correct,
    selected_index: 0,
    created_at,
    session_id,
  })
  const games = new Set(['board-1', 'cards-1'])

  it('marks only the answers from a game session', () => {
    const marked = markGameAnswers([row('q1', false, '2026-01-01', 'board-1'), row('q2', false, '2026-01-01', 'practice-1'), row('q3', true, '2026-01-01', null)], games)
    expect(marked.map((a) => a.from_game)).toEqual([true, false, false])
    expect(marked[0]).not.toHaveProperty('session_id')
  })

  it('a wrong game answer does not go to Review again', () => {
    const attempts = markGameAnswers([row('q1', false, '2026-01-01', 'cards-1')], games)
    expect(latestMistakes(withoutGameAnswers(attempts))).toEqual([])
  })

  it('a right game answer does not clear a Practice mistake', () => {
    const attempts = markGameAnswers([row('q1', false, '2026-01-01', 'practice-1'), row('q1', true, '2026-01-02', 'board-1')], games)
    expect(latestMistakes(withoutGameAnswers(attempts)).map((a) => a.question_id)).toEqual(['q1'])
  })

  it('answers waiting on the device count as games by their own flag', () => {
    expect(withoutGameAnswers([{ question_id: 'q1', from_game: true }, { question_id: 'q2' }]).map((a) => a.question_id)).toEqual(['q2'])
  })
})

describe('summarizePerformance', () => {
  const subjects = [
    { id: 2, code: 'HEMA', name: 'Hematology', sort_order: 3 },
    { id: 1, code: 'CC', name: 'Clinical Chemistry', sort_order: 1 },
  ]
  const topics = [
    { id: 10, subject_id: 1, name: 'Enzymes' },
    { id: 11, subject_id: 1, name: 'Lipids' },
  ]

  it('weights subject accuracy by number of attempts', () => {
    const [cc] = summarizePerformance(
      [
        { subject_id: 1, topic_id: 10, attempts: 8, accuracy: 1 }, // 8 correct
        { subject_id: 1, topic_id: 11, attempts: 2, accuracy: 0 }, // 0 correct
      ],
      subjects,
      topics,
    )
    expect(cc.code).toBe('CC')
    expect(cc.attempts).toBe(10)
    expect(cc.accuracy).toBeCloseTo(0.8)
    expect(cc.belowPassing).toBe(false)
  })

  it('flags subjects and topics below 75%, weakest topic first', () => {
    const [cc] = summarizePerformance(
      [
        { subject_id: 1, topic_id: 10, attempts: 5, accuracy: 0.75 },
        { subject_id: 1, topic_id: 11, attempts: 5, accuracy: 0.25 },
      ],
      subjects,
      topics,
    )
    expect(cc.accuracy).toBeCloseTo(0.5)
    expect(cc.belowPassing).toBe(true)
    expect(cc.topics.map((t) => [t.name, t.belowPassing])).toEqual([
      ['Lipids', true],
      ['Enzymes', false], // exactly 75% passes
    ])
  })

  it('includes subjects with no attempts as null accuracy, sorted by sort_order', () => {
    const result = summarizePerformance([], subjects, topics)
    expect(result.map((s) => s.code)).toEqual(['CC', 'HEMA'])
    expect(result[1]).toMatchObject({ attempts: 0, accuracy: null, belowPassing: false, topics: [] })
  })
})

describe('overallStats', () => {
  const subject = (code: string, attempts: number, accuracy: number | null) => ({
    subjectId: code.length,
    code,
    name: code,
    attempts,
    accuracy,
    belowPassing: accuracy !== null && accuracy < 0.75,
    belowFloor: accuracy !== null && accuracy < 0.5,
    topics: [],
  })

  it('weights the overall score like the board (by subject, not by attempts) and counts passing subjects', () => {
    // CC and HEMA weigh 20% each; CM (10%) isn't answered, so it's left out instead of counting as 0.
    const stats = overallStats([subject('CC', 30, 0.8), subject('HEMA', 10, 0.4), subject('CM', 0, null)])
    expect(stats.accuracy).toBeCloseTo((0.8 * 0.2 + 0.4 * 0.2) / 0.4)
    expect(stats.answered).toBe(40)
    expect(stats.passingSubjects).toBe(1)
    expect(stats.totalSubjects).toBe(3)
    expect(stats.weakest?.code).toBe('HEMA')
    expect(stats.belowFloor.map((s) => s.code)).toEqual(['HEMA'])
    expect(stats.passes).toBe(false)
  })

  it('gives a 20% subject twice the say of a 10% one', () => {
    const stats = overallStats([subject('CC', 10, 0.9), subject('CM', 50, 0.6)])
    expect(stats.accuracy).toBeCloseTo((0.9 * 0.2 + 0.6 * 0.1) / 0.3) // 0.8, not the attempts-weighted 0.65
  })

  it('picks the lowest subject below 75% as weakest', () => {
    const stats = overallStats([subject('CC', 5, 0.5), subject('HEMA', 5, 0.2), subject('BBIS', 5, 0.9)])
    expect(stats.weakest?.code).toBe('HEMA')
  })

  it('handles no answers at all', () => {
    const stats = overallStats([subject('CC', 0, null)])
    expect(stats).toMatchObject({ accuracy: null, answered: 0, passingSubjects: 0, weakest: null })
  })

  it('handles an empty subject list', () => {
    expect(overallStats([])).toMatchObject({ accuracy: null, answered: 0, passingSubjects: 0, totalSubjects: 0 })
  })
})

describe('passesBoard (RA 5527: 75% weighted average, no subject below 50%, failed subjects under 60% of the weight)', () => {
  const subject = (code: string, accuracy: number | null) => ({
    subjectId: code.length,
    code,
    name: code,
    attempts: accuracy === null ? 0 : 10,
    accuracy,
    belowPassing: accuracy !== null && accuracy < 0.75,
    belowFloor: accuracy !== null && accuracy < 0.5,
    topics: [],
  })
  const all = (cc: number, micro: number, hema: number, bbis: number, cm: number, htmle: number) => [
    subject('CC', cc),
    subject('MICRO', micro),
    subject('HEMA', hema),
    subject('BBIS', bbis),
    subject('CM', cm),
    subject('HTMLE', htmle),
  ]

  it('passes at exactly 75% in every subject', () => {
    expect(passesBoard(all(0.75, 0.75, 0.75, 0.75, 0.75, 0.75))).toBe(true)
  })

  it('fails when the weighted average is under 75%', () => {
    expect(generalAverage(all(0.74, 0.74, 0.74, 0.74, 0.74, 0.74))).toBeCloseTo(0.74)
    expect(passesBoard(all(0.74, 0.74, 0.74, 0.74, 0.74, 0.74))).toBe(false)
  })

  it('fails with one subject below 50%, even with a high average', () => {
    const scores = all(0.95, 0.95, 0.95, 0.95, 0.95, 0.45)
    expect(generalAverage(scores)!).toBeGreaterThan(0.75)
    expect(passesBoard(scores)).toBe(false)
  })

  it('fails when the subjects below 75% weigh 60% or more', () => {
    // CC, MICRO, HEMA at 70% (60% of the weight) fail the rule, even though the average is 80.5%.
    const scores = all(0.7, 0.7, 0.7, 0.95, 0.95, 0.95)
    expect(generalAverage(scores)!).toBeGreaterThan(0.75)
    expect(passesBoard(scores)).toBe(false)
    // Two 20% subjects below 75% is only 40%: passes.
    expect(passesBoard(all(0.7, 0.7, 0.95, 0.95, 0.95, 0.95))).toBe(true)
  })

  it('is null with nothing answered', () => {
    expect(passesBoard([subject('CC', null)])).toBeNull()
    expect(generalAverage([])).toBeNull()
  })
})

describe('closestToPassing', () => {
  const subject = (code: string, accuracy: number | null) => ({
    subjectId: code.length,
    code,
    name: code,
    attempts: accuracy === null ? 0 : 10,
    accuracy,
    belowPassing: accuracy !== null && accuracy < 0.75,
    belowFloor: accuracy !== null && accuracy < 0.5,
    topics: [],
  })

  it('picks the highest subject that is still below 75%', () => {
    const result = closestToPassing([subject('CC', 0.4), subject('CM', 0.72), subject('BBIS', 0.78), subject('HEMA', 0.14)])
    expect(result?.subject.code).toBe('CM')
    expect(result?.pointsToGo).toBe(3)
  })

  it('rounds the points to go up, and never says 0', () => {
    expect(closestToPassing([subject('CC', 0.705)])?.pointsToGo).toBe(5)
    expect(closestToPassing([subject('CC', 0.7499)])?.pointsToGo).toBe(1)
  })

  it('skips subjects with no answers yet', () => {
    expect(closestToPassing([subject('CC', null), subject('HEMA', 0.2)])?.subject.code).toBe('HEMA')
  })

  it('returns null when nothing answered is below 75%', () => {
    expect(closestToPassing([subject('CC', 0.8), subject('HEMA', null)])).toBeNull()
    expect(closestToPassing([])).toBeNull()
  })
})

describe('formatPercent', () => {
  it('rounds to a whole percent', () => {
    expect(formatPercent(0.756)).toBe('76%')
    expect(formatPercent(0)).toBe('0%')
    expect(formatPercent(1)).toBe('100%')
  })
})

describe('smartPick', () => {
  const topic = (topicId: number, accuracy: number, attempts = 5) => ({ topicId, name: `T${topicId}`, attempts, accuracy, belowPassing: accuracy < 0.75 })
  const subject = (subjectId: number, code: string, topics: ReturnType<typeof topic>[], accuracy: number | null = 0.5) => ({
    subjectId,
    code,
    name: code,
    attempts: topics.reduce((sum, t) => sum + t.attempts, 0),
    accuracy,
    belowPassing: accuracy !== null && accuracy < 0.75,
    belowFloor: accuracy !== null && accuracy < 0.5,
    topics,
  })

  it('picks the weakest topic below 75% across all subjects', () => {
    const pick = smartPick([subject(1, 'CC', [topic(10, 0.4), topic(11, 0.9)]), subject(2, 'HEMA', [topic(20, 0.2)])])
    expect(pick).toEqual({ kind: 'topic', subjectId: 2, subjectCode: 'HEMA', topicId: 20, topicName: 'T20', accuracy: 0.2 })
  })

  it('breaks a tie with the topic that has more answers', () => {
    const pick = smartPick([subject(1, 'CC', [topic(10, 0, 1), topic(11, 0, 6)])])
    expect(pick).toMatchObject({ kind: 'topic', topicId: 11 })
  })

  it('falls back to a subject not started yet, then to nothing', () => {
    const passing = subject(1, 'CC', [topic(10, 0.8)], 0.8)
    expect(smartPick([passing, subject(2, 'CM', [], null)])).toEqual({ kind: 'subject', subjectId: 2, subjectCode: 'CM' })
    expect(smartPick([passing])).toBeNull()
    expect(smartPick([])).toBeNull()
  })
})
