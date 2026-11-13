import { describe, expect, it } from 'vitest'
import { boardVerdict, newBoardRun, nextPaperIndex, papersDone, parseBoardRun, recordPaper, weakestFirst, type BoardRun } from './boardRun'

const SUBJECTS = [
  { subjectId: 1, code: 'CC', name: 'Clinical Chemistry' },
  { subjectId: 2, code: 'MICRO', name: 'Microbiology' },
  { subjectId: 3, code: 'HEMA', name: 'Hematology' },
  { subjectId: 4, code: 'BBIS', name: 'Blood Banking' },
  { subjectId: 5, code: 'CM', name: 'Clinical Microscopy' },
  { subjectId: 6, code: 'HTMLE', name: 'Histopath & Laws' },
]
const SOURCE = { source: 'all', uploadId: null, bookId: null, verifiedOnly: false }

const fresh = () => newBoardRun(SUBJECTS, 10, SOURCE, 'run-1', 1000)

/** A run with every paper taken, scores out of 100 (in the SUBJECTS order). */
function finished(scores: number[]): BoardRun {
  return scores.reduce((run, correct, i) => recordPaper(run, i, { sessionId: `s${i}`, correct, total: 100, finishedAt: 2000 + i }), fresh())
}

describe('newBoardRun / nextPaperIndex / recordPaper', () => {
  it('starts with six papers, none taken, the first one next', () => {
    const run = fresh()
    expect(run.papers.map((p) => p.code)).toEqual(['CC', 'MICRO', 'HEMA', 'BBIS', 'CM', 'HTMLE'])
    expect(nextPaperIndex(run)).toBe(0)
    expect(papersDone(run)).toBe(0)
  })

  it('moves on to the next paper once one is recorded, and ends with null', () => {
    const run = recordPaper(fresh(), 0, { sessionId: 's', correct: 8, total: 10, finishedAt: 1 })
    expect(nextPaperIndex(run)).toBe(1)
    expect(papersDone(run)).toBe(1)
    expect(nextPaperIndex(finished([80, 80, 80, 80, 80, 80]))).toBeNull()
  })

  it('keeps the first score if a paper is recorded twice, and ignores a wrong index', () => {
    const once = recordPaper(fresh(), 0, { sessionId: 'a', correct: 8, total: 10, finishedAt: 1 })
    expect(recordPaper(once, 0, { sessionId: 'b', correct: 1, total: 10, finishedAt: 2 })).toBe(once)
    expect(recordPaper(once, 9, { sessionId: 'c', correct: 1, total: 10, finishedAt: 2 })).toBe(once)
  })
})

describe('boardVerdict', () => {
  it('has no verdict before the first paper', () => {
    expect(boardVerdict(fresh())).toMatchObject({ average: null, complete: false, passed: null, averageOk: false, belowFloor: [] })
  })

  it('passes with every paper at 75%', () => {
    expect(boardVerdict(finished([75, 75, 75, 75, 75, 75]))).toMatchObject({ complete: true, passed: true, averageOk: true, belowFloor: [] })
  })

  it('weights the papers like the board (CC 20% counts twice as much as CM 10%)', () => {
    const v = boardVerdict(finished([90, 80, 80, 80, 60, 80]))
    expect(v.average).toBeCloseTo((90 * 0.2 + 80 * 0.6 + 60 * 0.1 + 80 * 0.1) / 100)
  })

  it('fails with a paper below 50%, even with a high average', () => {
    const v = boardVerdict(finished([95, 95, 95, 95, 95, 45]))
    expect(v.averageOk).toBe(true)
    expect(v.belowFloor).toEqual(['HTMLE'])
    expect(v.passed).toBe(false)
  })

  it('fails when the papers below 75% weigh 60% or more', () => {
    const v = boardVerdict(finished([70, 70, 70, 95, 95, 95]))
    expect(v.averageOk).toBe(true)
    expect(v.failedWeight).toBeCloseTo(0.6)
    expect(v.passed).toBe(false)
  })

  it('judges only the papers taken while the run is still going', () => {
    const run = recordPaper(fresh(), 0, { sessionId: 's', correct: 80, total: 100, finishedAt: 1 })
    expect(boardVerdict(run)).toMatchObject({ complete: false, passed: true })
    expect(boardVerdict(run).average).toBeCloseTo(0.8)
  })
})

describe('weakestFirst', () => {
  it('puts answered topics first, lowest score up, then the untried ones in their order', () => {
    const topics = [
      { name: 'Lipids', accuracy: null },
      { name: 'Enzymes', accuracy: 0.8 },
      { name: 'Proteins', accuracy: null },
      { name: 'Carbs', accuracy: 0.2 },
    ]
    expect(weakestFirst(topics).map((t) => t.name)).toEqual(['Carbs', 'Enzymes', 'Lipids', 'Proteins'])
  })

  it('handles an empty list', () => {
    expect(weakestFirst([])).toEqual([])
  })
})

describe('parseBoardRun', () => {
  it('reads back a saved run (JSON round trip)', () => {
    const run = recordPaper(fresh(), 0, { sessionId: 's', correct: 8, total: 10, finishedAt: 1 })
    expect(parseBoardRun(JSON.parse(JSON.stringify(run)))).toEqual(run)
  })

  it('returns null for missing or broken data', () => {
    expect(parseBoardRun(null)).toBeNull()
    expect(parseBoardRun('x')).toBeNull()
    expect(parseBoardRun({ ...fresh(), version: 2 })).toBeNull()
    expect(parseBoardRun({ ...fresh(), papers: [] })).toBeNull()
    expect(parseBoardRun({ ...fresh(), perSubject: 0 })).toBeNull()
    const badResult = { ...fresh(), papers: [{ ...fresh().papers[0], result: { sessionId: 's', correct: 11, total: 10, finishedAt: 1 } }] }
    expect(parseBoardRun(badResult)).toBeNull()
  })
})
