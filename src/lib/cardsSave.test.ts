import { describe, expect, it } from 'vitest'
import { answerPlay, newCardGame, playableCards, startPlay, type CardGame } from './cards'
import { parseSavedCards, type SavedCards } from './cardsSave'

/** A repeatable random (mulberry32). */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A game a few moves in, with a question waiting, so the save has some of everything. */
function midGame(): CardGame {
  const random = seeded(3)
  let g = newCardGame(random, new Date('2026-11-12T08:00:00Z'))
  const first = playableCards(g, 0)[0] ?? g.players[0].hand[0]
  g = answerPlay(startPlay(g, first.id), { questionId: 'q1', subjectCode: 'HEMA', isCorrect: false }, random)
  return { ...g, turn: 0, pending: { kind: 'draw2', subject: 'MICRO', left: 2 } }
}

const saved: SavedCards = { version: 1, sessionId: 's1', game: midGame() }
const bad = (game: object) => parseSavedCards(JSON.stringify({ ...saved, game: { ...saved.game, ...game } }))

describe('parseSavedCards', () => {
  it('reads back what was saved', () => {
    expect(parseSavedCards(JSON.stringify(saved))).toEqual(saved)
  })

  it('reads back a brand-new game and a finished one', () => {
    const fresh: SavedCards = { version: 1, sessionId: 's2', game: newCardGame(seeded(9), new Date(0)) }
    expect(parseSavedCards(JSON.stringify(fresh))).toEqual(fresh)
    const done = { ...saved, game: { ...saved.game, pending: null, finished: true, winner: 2, endReason: 'emptied' } }
    expect(parseSavedCards(JSON.stringify(done))?.game.winner).toBe(2)
  })

  it('gives null for nothing saved or broken text', () => {
    expect(parseSavedCards(null)).toBeNull()
    expect(parseSavedCards('')).toBeNull()
    expect(parseSavedCards('{not json')).toBeNull()
    expect(parseSavedCards('[]')).toBeNull()
  })

  it('gives null for an unknown version or a missing session', () => {
    expect(parseSavedCards(JSON.stringify({ ...saved, version: 2 }))).toBeNull()
    expect(parseSavedCards(JSON.stringify({ ...saved, sessionId: 5 }))).toBeNull()
  })

  it('gives null when a card is lost, doubled, or made up', () => {
    const [, ...lessPile] = saved.game.drawPile
    expect(bad({ drawPile: lessPile })).toBeNull()
    expect(bad({ drawPile: [...saved.game.drawPile, saved.game.drawPile[0]] })).toBeNull()
    expect(bad({ drawPile: [...lessPile, { id: 'CC-10', kind: 'number', subject: 'CC', number: 10 }] })).toBeNull()
    expect(bad({ drawPile: [...lessPile, { ...saved.game.drawPile[0], subject: 'XX' }] })).toBeNull()
  })

  it('gives null when the table is not shaped right', () => {
    expect(bad({ discard: [] })).toBeNull()
    expect(bad({ subject: 'PHARMA' })).toBeNull()
    expect(bad({ direction: 2 })).toBeNull()
    expect(bad({ turn: 4 })).toBeNull()
    expect(bad({ turn: -1 })).toBeNull()
    expect(bad({ winner: 9 })).toBeNull()
    expect(bad({ answered: -1 })).toBeNull()
    expect(bad({ endReason: 'gave up' })).toBeNull()
    expect(bad({ usedQuestionIds: [1] })).toBeNull()
    expect(bad({ bySubject: { CC: { answered: 'x' } } })).toBeNull()
    expect(bad({ log: 'nope' })).toBeNull()
  })

  it('gives null when the players are not shaped right', () => {
    const players = saved.game.players
    expect(bad({ players: players.map((p) => ({ ...p, isHuman: false })) })).toBeNull()
    expect(bad({ players: players.map((p) => ({ ...p, isHuman: true })) })).toBeNull()
    expect(bad({ players: [{ ...players[0], name: 7 }, ...players.slice(1)] })).toBeNull()
  })

  it('gives null when what she is waiting on is not shaped right', () => {
    expect(bad({ pending: { kind: 'teleport' } })).toBeNull()
    expect(bad({ pending: { kind: 'draw2', subject: 'MICRO', left: 0 } })).toBeNull()
    expect(bad({ pending: { kind: 'play' } })).toBeNull()
    expect(bad({ pending: { kind: 'chooseSubject' } })?.game.pending).toEqual({ kind: 'chooseSubject' })
  })
})
