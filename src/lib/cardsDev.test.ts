import { describe, expect, it } from 'vitest'
import { answerPlay, canPlay, newCardGame, playableCards, startPlay, type CardGame } from './cards'
import { devAnswerLetter, devDraw2OnMe, devEmptyDrawPile, devFinish, devGiveActionCards, devLeaveOneCard, devNextBot } from './cardsDev'
import { parseSavedCards } from './cardsSave'

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
const fresh = (seed = 5) => newCardGame(seeded(seed), new Date(0))
/** Still all 78 real cards, each once, and loads as a saved game. */
function stillWhole(g: CardGame) {
  expect(parseSavedCards(JSON.stringify({ version: 1, sessionId: 's', game: g }))?.game).toEqual(g)
}

describe('DEV shortcuts for testing Last Card', () => {
  it('Me: 1 card left leaves her one card that fits, on her move', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = devLeaveOneCard({ ...fresh(seed), turn: 2 }, 0)
      expect(g.players[0].hand).toHaveLength(1)
      expect(canPlay(g.players[0].hand[0], g)).toBe(true)
      expect(g.turn).toBe(0)
      stillWhole(g)
    }
  })

  it('then one right answer wins', () => {
    const g = devLeaveOneCard(fresh(), 0)
    const won = answerPlay(startPlay(g, g.players[0].hand[0].id), { questionId: 'q', subjectCode: 'CC', isCorrect: true })
    expect(won).toMatchObject({ finished: true, winner: 0 })
  })

  it('Next computer: 1 card left leaves the player after her one card that fits', () => {
    const g = devLeaveOneCard(fresh(), devNextBot(fresh()))
    expect(devNextBot(fresh())).toBe(1)
    expect(devNextBot({ ...fresh(), direction: -1 })).toBe(3)
    expect(g.players[1].hand).toHaveLength(1)
    expect(canPlay(g.players[1].hand[0], g)).toBe(true)
    stillWhole(g)
  })

  it('Give me action cards adds a Skip, Reverse and Draw 2 of the subject in play, and a Wild', () => {
    const g = devGiveActionCards(fresh())
    const mine = g.players[0].hand
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      expect(mine.some((c) => c.kind === kind && c.subject === g.subject)).toBe(true)
    }
    expect(mine.some((c) => c.kind === 'wild')).toBe(true)
    expect(playableCards(g, 0).length).toBeGreaterThanOrEqual(4)
    stillWhole(g)
  })

  it('Draw 2 on me waits on two questions from the subject in play', () => {
    const g = devDraw2OnMe({ ...fresh(), turn: 3 })
    expect(g.turn).toBe(0)
    expect(g.pending).toEqual({ kind: 'draw2', subject: g.subject, left: 2 })
    stillWhole(g)
  })

  it('Empty draw pile moves it under the top card, so the next draw shuffles it back', () => {
    const before = fresh()
    const g = devEmptyDrawPile(before)
    expect(g.drawPile).toHaveLength(0)
    expect(g.discard.at(-1)).toEqual(before.discard.at(-1))
    stillWhole(g)
  })

  it('Finish ends the game with that winner', () => {
    const iWin = devFinish(fresh(), 0)
    expect(iWin).toMatchObject({ finished: true, winner: 0, endReason: 'emptied', pending: null })
    expect(iWin.players[0].hand).toHaveLength(0)
    stillWhole(iWin)
    expect(devFinish(fresh(), 2).winner).toBe(2)
  })

  it('the answer letter is where the right choice sits on screen', () => {
    expect(devAnswerLetter(1, [3, 1, 0, 2])).toBe('B')
    expect(devAnswerLetter(5, [0, 1])).toBe('?')
  })
})
