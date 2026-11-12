import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newGame } from '@/lib/board'
import { newCardGame } from '@/lib/cards'
import { boardStatus, cardsStatus, dragTarget, readLastGame, saveLastGame } from './games'

describe('boardStatus', () => {
  it('a new game when there is none, or the last one is over', () => {
    expect(boardStatus(null)).toEqual({ paused: false, line: '60 squares, one zone per subject' })
    expect(boardStatus({ ...newGame(new Date(0)), finished: true }).paused).toBe(false)
  })

  it('a game in progress: where she is and how it is going', () => {
    const game = { ...newGame(new Date(0)), position: 23, answered: 8, correct: 6 }
    expect(boardStatus(game)).toEqual({ paused: true, line: 'Square 23 · HEMA zone · 6/8 correct · 37 to go' })
  })
})

describe('cardsStatus', () => {
  it('a new game when there is none, or the last one is over', () => {
    expect(cardsStatus(null).paused).toBe(false)
    expect(cardsStatus({ ...newCardGame(() => 0.5, new Date(0)), finished: true }).paused).toBe(false)
  })

  it('a game in progress: her cards and how it is going', () => {
    const base = newCardGame(() => 0.5, new Date(0))
    const game = { ...base, answered: 5, correct: 4, players: base.players.map((p, i) => (i === 0 ? { ...p, hand: p.hand.slice(0, 1) } : p)) }
    expect(cardsStatus(game)).toEqual({ paused: true, line: 'You have 1 card · 4/5 correct' })
  })
})

describe('the last game she looked at', () => {
  // Tests run in Node (no browser), so give them a tiny in-memory localStorage.
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is Board Review the first time', () => {
    expect(readLastGame()).toBe('board')
  })

  it('remembers the one she picked, and ignores anything unknown', () => {
    saveLastGame('cards')
    expect(readLastGame()).toBe('cards')
    localStorage.setItem('projectrmt:last-game', 'chess')
    expect(readLastGame()).toBe('board')
  })
})

describe('dragTarget (letting go of a mouse drag)', () => {
  it('a long drag to the left goes to the next game, to the right the one before', () => {
    expect(dragTarget(0, -120, 0, 2)).toBe(1)
    expect(dragTarget(1, 120, 1, 2)).toBe(0)
  })

  it('never goes past the first or last game', () => {
    expect(dragTarget(1, -200, 1, 2)).toBe(1)
    expect(dragTarget(0, 200, 0, 2)).toBe(0)
  })

  it('a short drag settles on whichever game is nearest the middle', () => {
    expect(dragTarget(0, -30, 0, 2)).toBe(0)
    expect(dragTarget(0, 40, 1, 2)).toBe(1)
  })
})
