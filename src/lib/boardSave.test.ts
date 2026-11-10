import { describe, expect, it } from 'vitest'
import { newGame } from './board'
import { parseSavedBoard, type SavedBoard } from './boardSave'

const saved: SavedBoard = {
  version: 1,
  sessionId: 's1',
  game: { ...newGame(new Date('2026-11-11T08:00:00Z')), position: 26, pending: { kind: 'snake', from: 26, to: 15 }, bySubject: { HEMA: { answered: 3, correct: 2 } } },
}

describe('parseSavedBoard', () => {
  it('reads back what was saved', () => {
    expect(parseSavedBoard(JSON.stringify(saved))).toEqual(saved)
  })

  it('gives null for nothing saved or broken text', () => {
    expect(parseSavedBoard(null)).toBeNull()
    expect(parseSavedBoard('')).toBeNull()
    expect(parseSavedBoard('{not json')).toBeNull()
    expect(parseSavedBoard('[]')).toBeNull()
  })

  it('keeps the layout, and puts an old save without one on the first layout', () => {
    expect(parseSavedBoard(JSON.stringify({ ...saved, game: { ...saved.game, layoutId: 2 } }))?.game.layoutId).toBe(2)
    const { layoutId: _dropped, ...oldGame } = saved.game
    expect(parseSavedBoard(JSON.stringify({ ...saved, game: oldGame }))?.game.layoutId).toBe(0)
    expect(parseSavedBoard(JSON.stringify({ ...saved, game: { ...saved.game, layoutId: 7 } }))).toBeNull()
  })

  it('gives null for an unknown version', () => {
    expect(parseSavedBoard(JSON.stringify({ ...saved, version: 2 }))).toBeNull()
  })

  it('gives null when the game is not shaped right', () => {
    const bad = (game: object) => parseSavedBoard(JSON.stringify({ ...saved, game: { ...saved.game, ...game } }))
    expect(bad({ position: 0 })).toBeNull()
    expect(bad({ position: 61 })).toBeNull()
    expect(bad({ turns: -1 })).toBeNull()
    expect(bad({ pending: { kind: 'move', roll: 7 } })).toBeNull()
    expect(bad({ pending: { kind: 'teleport' } })).toBeNull()
    expect(bad({ usedQuestionIds: [1] })).toBeNull()
    expect(bad({ bySubject: { CC: { answered: 'x', correct: 0 } } })).toBeNull()
  })
})
