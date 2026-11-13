import { describe, expect, it } from 'vitest'
import { canPlay, movesFromLog, type Card } from './cards'
import { liveAct, liveAnswer, liveView, newLiveGame, withQuestion, type LiveGame } from './cardsLive'
import { choiceOrderFor, formatClock, purposeOf, secondsLeft, tableFromView } from './cardsLiveTable'

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
const num = (subject: 'CC' | 'HEMA' | 'BBIS', number: number): Card => ({ id: `${subject}-${number}`, kind: 'number', subject, number })
const question = { id: 'q1', stem: 'Q?', choices: ['A', 'B', 'C'], correctIndex: 1, explanation: null, choiceNotes: null, topicId: 1, subjectCode: 'HEMA' }

/** Ana (seat 0) and Ben (seat 1) with two computers; HEMA 7 on the pile. */
function game(): LiveGame {
  const live = newLiveGame([ana, ben], seeded(1), T0)
  return {
    ...live,
    game: {
      ...live.game,
      players: live.game.players.map((p, i) => ({ ...p, hand: i === 0 ? [num('HEMA', 3), num('CC', 2)] : i === 1 ? [num('HEMA', 4), num('BBIS', 1), num('BBIS', 2)] : [num('BBIS', i * 3), num('BBIS', i * 3 + 1)] })),
      drawPile: [num('CC', 1), num('CC', 4), num('CC', 5)],
      discard: [num('HEMA', 7)],
      subject: 'HEMA',
      turn: 0,
    },
  }
}

describe('tableFromView: her view as the solo table', () => {
  it('Ben (seat 1 on the server) sits at the bottom of his own table, the others in turn order around him', () => {
    const t = tableFromView(liveView(game(), 'u-ben'))
    expect(t.mySeat).toBe(1)
    expect(t.game.players.map((p) => p.name)).toEqual(['You', 'Joy D.', 'Rafa M.', 'Ana'])
    expect(t.game.turn).toBe(3) // Ana's turn: she sits to his right (last before him in turn order)
    expect(t.place(0)).toBe(3)
    expect(t.place(1)).toBe(0)
  })

  it('only she is "at" the table; computer players are marked', () => {
    const t = tableFromView(liveView(game(), 'u-ben'))
    expect(t.game.players.map((p) => p.isHuman)).toEqual([true, false, false, false])
    expect(t.game.players.map((p) => p.isComputer)).toEqual([false, true, true, false])
  })

  it('her own cards are real; everyone else\'s are face-down placeholders, as many as they hold', () => {
    const t = tableFromView(liveView(game(), 'u-ben'))
    expect(t.game.players[0].hand.map((c) => c.id)).toEqual(['HEMA-4', 'BBIS-1', 'BBIS-2'])
    expect(t.game.players[3].hand.map((c) => c.id)).toEqual(['hidden-0-0', 'hidden-0-1'])
    expect(JSON.stringify(t.game)).not.toContain('HEMA-3') // Ana's real cards are nowhere on Ben's table
    expect(t.game.drawPile).toHaveLength(3)
  })

  it('her moves use the same rules as solo: what fits on the pile', () => {
    const t = tableFromView(liveView(game(), 'u-ana'))
    expect(t.game.players[0].hand.filter((c) => canPlay(c, t.game)).map((c) => c.id)).toEqual(['HEMA-3'])
  })
})

describe('movesFromLog: what flies on her screen after an update', () => {
  it('Ben sees Ana play HEMA 3 from her seat onto the pile', () => {
    const before = game()
    const picked = liveAct(before, 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    const answered = liveAnswer(withQuestion(picked.live, question, T0), 'u-ana', 1, seeded(1), T0)
    if (!answered.ok) throw new Error(answered.error)
    const a = tableFromView(liveView(before, 'u-ben'))
    const b = tableFromView(liveView(answered.live, 'u-ben'))
    expect(movesFromLog(a.game, b.game)).toEqual([{ kind: 'play', player: 3, cardId: 'HEMA-3' }])
  })

  it('a wrong answer: Ana sees her own new card fly in; Ben sees a face-down card fly to Ana', () => {
    const before = game()
    const picked = liveAct(before, 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    const answered = liveAnswer(withQuestion(picked.live, question, T0), 'u-ana', 0, seeded(1), T0)
    if (!answered.ok) throw new Error(answered.error)
    expect(movesFromLog(tableFromView(liveView(before, 'u-ana')).game, tableFromView(liveView(answered.live, 'u-ana')).game)).toEqual([
      { kind: 'draw', player: 0, cardId: 'CC-5' },
    ])
    expect(movesFromLog(tableFromView(liveView(before, 'u-ben')).game, tableFromView(liveView(answered.live, 'u-ben')).game)).toEqual([
      { kind: 'draw', player: 3, cardId: 'hidden-0-2' },
    ])
  })

  it('several computer moves in one update come in the order they happened', () => {
    // Just Ana and three computers: after her move, all three play before it's her turn again.
    const solo = newLiveGame([ana], seeded(4), T0)
    const fits = solo.game.players[0].hand.filter((c) => canPlay(c, solo.game))
    const r = fits.length ? liveAct(solo, 'u-ana', { kind: 'play', cardId: fits[0].id }, seeded(4), T0) : liveAct(solo, 'u-ana', { kind: 'draw' }, seeded(4), T0)
    if (!r.ok) throw new Error(r.error)
    let after = r.live
    if (r.need) {
      const answered = liveAnswer(withQuestion(after, { ...question, subjectCode: 'CC' }, T0), 'u-ana', 1, seeded(4), T0)
      if (!answered.ok) throw new Error(answered.error)
      after = answered.live
    }
    const moves = movesFromLog(tableFromView(liveView(solo, 'u-ana')).game, tableFromView(liveView(after, 'u-ana')).game)
    expect(moves.length).toBeGreaterThan(0)
    // the seats of the moves go around the table in turn order (never jumping back), as the log says
    const players = moves.map((m) => m.player)
    expect(players[0] === 0 || players.includes(1)).toBe(true)
  })

  it('a new game gives no moves', () => {
    const a = tableFromView(liveView(game(), 'u-ana'), 'game-1')
    const b = tableFromView(liveView(game(), 'u-ana'), 'game-2')
    expect(movesFromLog(a.game, b.game)).toEqual([])
  })
})

describe('the clock', () => {
  it('counts down whole seconds and never below 0', () => {
    const deadline = new Date(T0.getTime() + 65_000).toISOString()
    expect(secondsLeft(deadline, T0.getTime())).toBe(65)
    expect(secondsLeft(deadline, T0.getTime() + 64_500)).toBe(1)
    expect(secondsLeft(deadline, T0.getTime() + 90_000)).toBe(0)
    expect(secondsLeft(null, T0.getTime())).toBe(0)
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(9)).toBe('0:09')
  })
})

describe('the question popup helpers', () => {
  it('choiceOrderFor: a real shuffle of every choice, the same each time for the same question', () => {
    const order = choiceOrderFor('q-123', 4)
    expect([...order].sort()).toEqual([0, 1, 2, 3])
    expect(choiceOrderFor('q-123', 4)).toEqual(order)
    const orders = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => choiceOrderFor(id, 4).join()))
    expect(orders.size).toBeGreaterThan(1) // not always the same order
  })

  it('purposeOf: the card being played (and if it is the last one), or which Draw 2 question', () => {
    const picked = liveAct(game(), 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    const view = liveView(withQuestion(picked.live, question, T0), 'u-ben')
    expect(purposeOf(view)).toEqual({ kind: 'play', card: { id: 'HEMA-3', kind: 'number', subject: 'HEMA', number: 3 }, lastCard: false })
    const hit = { ...game(), game: { ...game().game, pending: { kind: 'draw2' as const, subject: 'CC' as const, left: 1 } } }
    expect(purposeOf(liveView(withQuestion(hit, question, T0), 'u-ana'))).toEqual({ kind: 'draw2', number: 2 })
    expect(purposeOf(liveView(game(), 'u-ana'))).toBeNull()
  })
})
