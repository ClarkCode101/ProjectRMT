import { describe, expect, it } from 'vitest'
import { answerQuestion, layoutOf, LAYOUTS, moveBy, newGame } from './board'
import { devBoardAnswerLetter, devFinishBoard, devLifelinesBack, devNearEnd, devRollOnto } from './boardDev'

const right = { questionId: 'q1', subjectCode: 'CC', isCorrect: true }

describe('Board Review DEV shortcuts (solo)', () => {
  for (const layout of LAYOUTS) {
    for (const kind of ['ladder', 'snake'] as const) {
      it(`a right answer walks onto a ${kind} on board ${layout.name}, and its question comes next`, () => {
        const set = devRollOnto(newGame(new Date(), layout.id), kind)
        expect(set.pending?.kind).toBe('move')
        const after = answerQuestion(set, right)
        expect(after.pending?.kind).toBe(kind)
        const jumps = kind === 'ladder' ? layoutOf(layout.id).ladders : layoutOf(layout.id).snakes
        expect(jumps.some((j) => j.from === moveBy(set.position, set.pending?.kind === 'move' ? set.pending.roll : 0))).toBe(true)
      })
    }
  }

  it('near the end, lifelines back, finish', () => {
    const g = { ...newGame(), lifelinesUsed: ['rule_out' as const], pending: { kind: 'move' as const, roll: 2 } }
    expect(devNearEnd(g)).toMatchObject({ position: 54, pending: null })
    expect(devLifelinesBack(g).lifelinesUsed).toEqual([])
    expect(devFinishBoard(g)).toMatchObject({ position: 60, pending: null, finished: true })
  })

  it('the answer letter follows the order on screen', () => {
    expect(devBoardAnswerLetter(2, [3, 2, 0, 1])).toBe('B')
    expect(devBoardAnswerLetter(9, [0, 1])).toBe('?')
  })
})
