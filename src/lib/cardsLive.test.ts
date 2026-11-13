import { describe, expect, it } from 'vitest'
import { canPlay, playableCards, type Card, type CardGame } from './cards'
import {
  LIVE_SEATS,
  liveAct,
  liveAnswer,
  liveLeave,
  liveNeed,
  liveTimeout,
  liveView,
  newLiveGame,
  seatOf,
  withQuestion,
  type LiveGame,
  type LiveQuestion,
} from './cardsLive'

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
const T0 = new Date('2026-11-13T08:00:00Z')
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000)
const ana = { userId: 'u-ana', name: 'Ana' }
const ben = { userId: 'u-ben', name: 'Ben' }
const num = (subject: 'CC' | 'MICRO' | 'HEMA' | 'BBIS' | 'CM' | 'HTMLE', number: number): Card => ({ id: `${subject}-${number}`, kind: 'number', subject, number })
const question = (id = 'q1', subjectCode = 'HEMA'): LiveQuestion => ({
  id,
  stem: 'Which anticoagulant for PT/aPTT?',
  choices: ['EDTA', 'Citrate', 'Heparin'],
  correctIndex: 1,
  explanation: 'Citrate binds calcium.',
  choiceNotes: null,
  topicId: 7,
  subjectCode,
})
const totalCards = (g: CardGame) => g.drawPile.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length, 0)

/**
 * A hand-made table for Ana (seat 0) and Ben (seat 1) with two computer players: HEMA 7 on the pile,
 * Ana holds HEMA 3 + CC 2, everyone else BBIS cards; the draw pile ends with CC 5 (drawn first).
 */
function table(overrides: Partial<CardGame> = {}): LiveGame {
  const live = newLiveGame([ana, ben], seeded(1), T0)
  const filler = (n: number) => [num('BBIS', n), num('BBIS', n + 1), num('BBIS', n + 2)]
  const game: CardGame = {
    ...live.game,
    players: live.game.players.map((p, i) => ({ ...p, hand: i === 0 ? [num('HEMA', 3), num('CC', 2)] : filler(i * 3 - 2) })),
    drawPile: [num('CC', 1), num('CC', 4), num('CC', 5)],
    discard: [num('HEMA', 7)],
    subject: 'HEMA',
    turn: 0,
    pending: null,
    ...overrides,
  }
  return { ...live, game, question: null, reveal: null, deadline: later(90).toISOString() }
}

describe('newLiveGame', () => {
  const live = newLiveGame([ana, ben], seeded(7), T0)

  it('seats the people first, then computer players fill the table to 4', () => {
    expect(live.seats.map((s) => s.name)).toEqual(['Ana', 'Ben', 'Joy D.', 'Rafa M.'])
    expect(live.seats.map((s) => s.userId)).toEqual(['u-ana', 'u-ben', null, null])
    expect(live.game.players.map((p) => p.isHuman)).toEqual([true, true, false, false])
    expect(live.game.players).toHaveLength(LIVE_SEATS)
  })

  it('deals all 78 cards, 7 each, and the host (seat 0) goes first with a 90-second clock', () => {
    expect(totalCards(live.game)).toBe(78)
    expect(live.game.players.map((p) => p.hand.length)).toEqual([7, 7, 7, 7])
    expect(live.game.turn).toBe(0)
    expect(live.deadline).toBe(later(90).toISOString())
  })

  it('4 people: no computer players', () => {
    const full = newLiveGame([ana, ben, { userId: 'u-cy', name: 'Cy' }, { userId: 'u-di', name: 'Di' }], seeded(2), T0)
    expect(full.seats.every((s) => s.userId !== null)).toBe(true)
  })
})

describe('a person’s move', () => {
  it('only the person whose turn it is can move', () => {
    const live = table()
    expect(liveAct(live, 'u-ben', { kind: 'play', cardId: 'BBIS-1' }, seeded(1), T0)).toEqual({ ok: false, error: 'It’s not your turn.' })
    expect(liveAct(live, 'u-stranger', { kind: 'draw' }, seeded(1), T0)).toEqual({ ok: false, error: 'You’re not playing in this game.' })
    expect(liveAct(live, 'u-ana', { kind: 'play', cardId: 'CC-2' }, seeded(1), T0)).toEqual({ ok: false, error: 'That card doesn’t fit.' })
  })

  it('picking a card asks for a question from its subject; the answer plays it and the turn passes', () => {
    const picked = liveAct(table(), 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    expect(picked.need).toEqual({ kind: 'subject', subject: 'HEMA' })

    const asked = withQuestion(picked.live, question(), later(5))
    expect(asked.game.pending).toEqual({ kind: 'play', cardId: 'HEMA-3', questionId: 'q1' })
    expect(asked.deadline).toBe(later(95).toISOString())
    expect(liveAct(asked, 'u-ana', { kind: 'draw' }, seeded(1), T0)).toEqual({ ok: false, error: 'Answer the question first.' })

    const answered = liveAnswer(asked, 'u-ana', 1, seeded(1), later(10))
    if (!answered.ok) throw new Error(answered.error)
    expect(answered.attempt).toEqual({ userId: 'u-ana', questionId: 'q1', selectedIndex: 1, isCorrect: true })
    expect(answered.live.game.discard.at(-1)?.id).toBe('HEMA-3')
    expect(answered.live.game.turn).toBe(1) // Ben, a person: no computer turns in between
    expect(answered.live.question).toBeNull()
    expect(answered.live.reveal).toMatchObject({ seat: 0, selected: 1, correct: true })
    expect(answered.live.stats[0]).toEqual({ answered: 1, correct: 1, drawnForMistakes: 0, bySubject: { HEMA: { answered: 1, correct: 1 } } })
    expect(answered.live.deadline).toBe(later(100).toISOString())
  })

  it('a wrong answer: the card stays, she draws 1, and it counts as a miss in her own score', () => {
    const picked = liveAct(table(), 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    const answered = liveAnswer(withQuestion(picked.live, question(), T0), 'u-ana', 0, seeded(1), T0)
    if (!answered.ok) throw new Error(answered.error)
    expect(answered.live.game.players[0].hand.map((c) => c.id)).toEqual(['HEMA-3', 'CC-2', 'CC-5'])
    expect(answered.live.stats[0]).toMatchObject({ answered: 1, correct: 0, drawnForMistakes: 1 })
    expect(answered.live.stats[1].answered).toBe(0) // Ben's score is his own
  })

  it('an answer out of range is refused', () => {
    const picked = liveAct(table(), 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    expect(liveAnswer(withQuestion(picked.live, question(), T0), 'u-ana', 9, seeded(1), T0)).toEqual({ ok: false, error: 'Pick one of the choices.' })
  })

  it('computer players take their turns right away, so it comes back to a person', () => {
    // One person and three computer players: after her move, it's her turn again (or the game ended).
    const solo = newLiveGame([ana], seeded(3), T0)
    const fits = playableCards(solo.game, 0)
    const moved = fits.length > 0 ? liveAct(solo, 'u-ana', { kind: 'play', cardId: fits[0].id }, seeded(3), T0) : liveAct(solo, 'u-ana', { kind: 'draw' }, seeded(3), T0)
    if (!moved.ok) throw new Error(moved.error)
    let live = moved.live
    if (moved.need) {
      const answered = liveAnswer(withQuestion(live, question('q1', 'CC'), T0), 'u-ana', 1, seeded(3), T0)
      if (!answered.ok) throw new Error(answered.error)
      live = answered.live
    }
    expect(live.game.finished || live.game.turn === 0).toBe(true)
    expect(totalCards(live.game)).toBe(78)
  })

  it('a computer player’s Draw 2 on a person: the server must show a question for it', () => {
    const live = table({ turn: 0, pending: { kind: 'draw2', subject: 'MICRO', left: 2 } })
    expect(liveNeed(live)).toEqual({ kind: 'subject', subject: 'MICRO' })
    expect(liveNeed(withQuestion(live, question('q1', 'MICRO'), T0))).toBeNull()
  })
})

describe('the 90-second clock', () => {
  it('does nothing before time is up', () => {
    expect(liveTimeout(table(), seeded(1), later(60))).toBeNull()
  })

  it('time up: she draws 1, the turn passes, and it counts as a missed turn', () => {
    const next = liveTimeout(table(), seeded(1), later(91))
    expect(next).not.toBeNull()
    expect(next!.game.players[0].hand).toHaveLength(3)
    expect(next!.game.turn).toBe(1)
    expect(next!.seats[0].missed).toBe(1)
  })

  it('any move of hers resets the missed count', () => {
    const live = table()
    const missedTwice = { ...live, seats: live.seats.map((s, i) => (i === 0 ? { ...s, missed: 2 } : s)) }
    const moved = liveAct(missedTwice, 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!moved.ok) throw new Error(moved.error)
    expect(moved.live.seats[0].missed).toBe(0)
  })

  it('3 missed turns in a row: a computer player takes her seat and her cards', () => {
    const live = table()
    const missedTwice = { ...live, seats: live.seats.map((s, i) => (i === 0 ? { ...s, missed: 2 } : s)) }
    const next = liveTimeout(missedTwice, seeded(1), later(91))!
    expect(next.seats[0]).toMatchObject({ missed: 3, gone: true })
    expect(next.game.players[0].isHuman).toBe(false)
    expect(next.game.players[0].hand.length).toBeGreaterThan(0)
    expect(seatOf(next, 'u-ana')).toBe(-1)
  })
})

describe('leaving', () => {
  it('a computer player takes the seat; the game goes on for the others', () => {
    const next = liveLeave(table(), 'u-ben', seeded(1), T0)
    expect(next.seats[1].gone).toBe(true)
    expect(next.game.players[1].isHuman).toBe(false)
    expect(next.game.finished).toBe(false)
  })

  it('leaving on your own turn in the middle of a question ends it with no answer', () => {
    const picked = liveAct(table(), 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
    if (!picked.ok) throw new Error(picked.error)
    const next = liveLeave(withQuestion(picked.live, question(), T0), 'u-ana', seeded(1), T0)
    expect(next.question).toBeNull()
    expect(next.stats[0].answered).toBe(0)
  })

  it('when every person is gone, the game ends', () => {
    const oneLeft = liveLeave(table(), 'u-ben', seeded(1), T0)
    const empty = liveLeave(oneLeft, 'u-ana', seeded(1), T0)
    expect(empty.game).toMatchObject({ finished: true, winner: null, endReason: 'everyoneLeft' })
    expect(empty.deadline).toBeNull()
  })
})

describe('liveView: what each person sees', () => {
  const picked = liveAct(table(), 'u-ana', { kind: 'play', cardId: 'HEMA-3' }, seeded(1), T0)
  if (!picked.ok) throw new Error(picked.error)
  const live = withQuestion(picked.live, question(), T0)

  it('her own cards, and the others only as counts', () => {
    const anaView = liveView(live, 'u-ana')
    expect(anaView.seat).toBe(0)
    expect(anaView.hand.map((c) => c.id)).toEqual(['HEMA-3', 'CC-2'])
    expect(anaView.seats.map((s) => s.cards)).toEqual([2, 3, 3, 3])
    expect(anaView.drawPileCount).toBe(3)
    expect(JSON.stringify(anaView)).not.toContain('BBIS-1') // Ben's card is nowhere in Ana's view
    const benView = liveView(live, 'u-ben')
    expect(benView.hand.map((c) => c.id)).toEqual(['BBIS-1', 'BBIS-2', 'BBIS-3'])
    expect(JSON.stringify(benView)).not.toContain('CC-2') // and Ana's cards aren't in Ben's
  })

  it('the question up now has no answer in it (for anyone), until it’s answered', () => {
    for (const userId of ['u-ana', 'u-ben']) {
      const view = liveView(live, userId)
      expect(view.question).toEqual({ id: 'q1', stem: question().stem, choices: question().choices, subjectCode: 'HEMA', topicId: 7, seat: 0 })
      expect(JSON.stringify(view)).not.toContain('correctIndex')
      expect(JSON.stringify(view)).not.toContain('Citrate binds calcium')
    }
    const answered = liveAnswer(live, 'u-ana', 1, seeded(1), T0)
    if (!answered.ok) throw new Error(answered.error)
    expect(liveView(answered.live, 'u-ben').reveal?.question.correctIndex).toBe(1)
  })

  it('someone who left watches: no seat, no cards', () => {
    const left = liveLeave(table(), 'u-ben', seeded(1), T0)
    expect(liveView(left, 'u-ben')).toMatchObject({ seat: -1, hand: [] })
  })

  it('…but still knows the seat they played in (their score on the finish screen), and who sits where', () => {
    const left = liveLeave(table(), 'u-ben', seeded(1), T0)
    expect(liveView(left, 'u-ben').playedSeat).toBe(1)
    expect(liveView(left, 'u-stranger').playedSeat).toBe(-1)
    expect(liveView(left, 'u-ana').seats.map((s) => s.userId)).toEqual(['u-ana', 'u-ben', null, null])
  })
})

describe('whole live games', () => {
  /** Two people answer (right ~60%) and sometimes let the clock run out; computer players fill seats 2 and 3. */
  function playOut(seed: number): LiveGame {
    const random = seeded(seed)
    let now = T0
    let live = newLiveGame([ana, ben], random, now)
    for (let step = 0; step < 3000 && !live.game.finished; step++) {
      expect(totalCards(live.game)).toBe(78)
      now = new Date(now.getTime() + 5000)
      const seat = live.game.turn
      const userId = live.seats[seat].userId!
      if (random() < 0.05) {
        live = liveTimeout(live, random, new Date(Date.parse(live.deadline!) + 1000)) ?? live
        continue
      }
      if (live.question) {
        const r = liveAnswer(live, userId, random() < 0.6 ? live.question.correctIndex : (live.question.correctIndex + 1) % 3, random, now)
        if (!r.ok) throw new Error(r.error)
        live = r.live
      } else if (liveNeed(live)) {
        live = withQuestion(live, question(`q${step}`, 'CC'), now)
      } else if (live.game.pending?.kind === 'chooseSubject') {
        const r = liveAct(live, userId, { kind: 'choose', subject: 'CC' }, random, now)
        if (!r.ok) throw new Error(r.error)
        live = r.live
      } else if (live.game.pending?.kind === 'drawn') {
        const r = liveAct(live, userId, { kind: 'keep' }, random, now)
        if (!r.ok) throw new Error(r.error)
        live = r.live
      } else {
        const fits = live.game.players[seat].hand.filter((c) => canPlay(c, live.game))
        const r = liveAct(live, userId, fits.length > 0 ? { kind: 'play', cardId: fits[0].id } : { kind: 'draw' }, random, now)
        if (!r.ok) throw new Error(r.error)
        live = r.live
      }
    }
    return live
  }

  it('always ends, never loses a card, and it is always a person’s turn while it runs', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const live = playOut(seed)
      expect(live.game.finished).toBe(true)
      expect(totalCards(live.game)).toBe(78)
    }
  })
})
