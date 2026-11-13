import { describe, expect, it } from 'vitest'
import { canPlay, type CardGame } from './cards'
import { liveTimeout, newLiveGame, withQuestion, type LiveGame } from './cardsLive'
import { liveDev, liveDevAnswer } from './cardsLiveDev'

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
const T0 = new Date('2026-11-13T08:00:00Z')
const ana = { userId: 'u-ana', name: 'Ana' }
const ben = { userId: 'u-ben', name: 'Ben' }
const totalCards = (g: CardGame) => g.drawPile.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length, 0)
const fresh = (): LiveGame => newLiveGame([ana, ben], seeded(9), T0)
const question = { id: 'q1', stem: 'Q?', choices: ['A', 'B', 'C'], correctIndex: 2, explanation: null, choiceNotes: null, topicId: 1, subjectCode: 'CC' }

function run(live: LiveGame, userId: string, op: Parameters<typeof liveDev>[2]) {
  const r = liveDev(live, userId, op, T0)
  if (!r.ok) throw new Error(r.error)
  expect(totalCards(r.live.game)).toBe(78) // never makes up or loses a card
  return r
}

describe('live DEV shortcuts (server side, dev key only)', () => {
  it('Me: 1 card left works for Ben in seat 1, and it becomes his turn with a fresh clock', () => {
    const r = run(fresh(), 'u-ben', 'oneCard')
    expect(r.live.game.players[1].hand).toHaveLength(1)
    expect(canPlay(r.live.game.players[1].hand[0], r.live.game)).toBe(true)
    expect(r.live.game.turn).toBe(1)
    expect(r.live.deadline).toBe(new Date(T0.getTime() + 90_000).toISOString())
  })

  it('Next player: 1 card left is the player after me', () => {
    expect(run(fresh(), 'u-ana', 'nextOneCard').live.game.players[1].hand).toHaveLength(1)
  })

  it('Give me action cards and Draw 2 on me, for Ben', () => {
    const actions = run(fresh(), 'u-ben', 'actions').live
    expect(actions.game.players[1].hand.some((c) => c.kind === 'wild')).toBe(true)
    expect(actions.game.turn).toBe(1)
    const draw2 = run(fresh(), 'u-ben', 'draw2')
    expect(draw2.live.game.pending).toEqual({ kind: 'draw2', subject: draw2.live.game.subject, left: 2 })
    expect(draw2.need).toEqual({ kind: 'subject', subject: draw2.live.game.subject }) // the server then puts up a question
  })

  it('a shortcut clears the question that was up', () => {
    const asked = withQuestion({ ...fresh(), game: { ...fresh().game, pending: { kind: 'draw2', subject: 'CC', left: 2 } } }, question, T0)
    expect(run(asked, 'u-ana', 'actions').live.question).toBeNull()
  })

  it('Time’s up now: the next timeout passes the turn', () => {
    const r = run(fresh(), 'u-ana', 'timeUp')
    expect(Date.parse(r.live.deadline!)).toBeLessThan(T0.getTime())
    const passed = liveTimeout(r.live, seeded(1), T0)
    expect(passed?.game.turn).not.toBe(0)
  })

  it('Finish: I win / the next player wins', () => {
    expect(run(fresh(), 'u-ben', 'finishMe').live.game).toMatchObject({ finished: true, winner: 1 })
    expect(run(fresh(), 'u-ana', 'finishNext').live.game).toMatchObject({ finished: true, winner: 1 })
  })

  it('refuses someone who isn’t playing, and a finished game', () => {
    expect(liveDev(fresh(), 'u-stranger', 'oneCard', T0)).toEqual({ ok: false, error: 'You’re not playing in this game.' })
    const over = run(fresh(), 'u-ana', 'finishMe').live
    expect(liveDev(over, 'u-ana', 'oneCard', T0)).toEqual({ ok: false, error: 'The game is over.' })
  })

  it('Show answers: the answer of the question up now (nothing else)', () => {
    expect(liveDevAnswer(fresh())).toBeNull()
    expect(liveDevAnswer(withQuestion(fresh(), question, T0))).toEqual({ questionId: 'q1', correctIndex: 2 })
  })
})
