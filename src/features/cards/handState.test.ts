import { describe, expect, it } from 'vitest'
import { newCardGame, type Card, type CardGame } from '@/lib/cards'
import { CARD_WIDTH, cardStep, handState } from './handState'

describe('cardStep', () => {
  it('a few cards sit side by side with a small gap', () => {
    expect(cardStep(3, 800)).toEqual({ step: CARD_WIDTH + 8, fits: true })
    expect(cardStep(1, 0)).toEqual({ step: CARD_WIDTH + 8, fits: true })
  })

  it('more cards overlap just enough to fit the width', () => {
    const { step, fits } = cardStep(8, 540)
    expect(fits).toBe(true)
    expect(step).toBeLessThan(CARD_WIDTH)
    // the last card's right edge (plus room for the tilt) lands inside the width
    expect(24 + CARD_WIDTH + 7 * step).toBeCloseTo(540)
  })

  it('past the tightest overlap the row scrolls instead', () => {
    expect(cardStep(20, 400)).toEqual({ step: 32, fits: false })
  })
})

const num = (subject: 'CC' | 'HEMA' | 'MICRO', number: number): Card => ({ id: `${subject}-${number}`, kind: 'number', subject, number })

/** Her hand against a HEMA 7 on the pile; the computer players hold one card each. */
function table(hand: Card[], extra: Partial<CardGame> = {}): CardGame {
  const base = newCardGame(() => 0.5, new Date(0))
  return {
    ...base,
    players: base.players.map((p, i) => ({ ...p, hand: i === 0 ? hand : [num('CC', i)] })),
    discard: [num('HEMA', 7)],
    subject: 'HEMA',
    turn: 0,
    pending: null,
    ...extra,
  }
}

describe('handState', () => {
  it('her move: the cards that fit can be tapped, and the picked one is ready', () => {
    const g = table([num('HEMA', 2), num('CC', 7), num('CC', 3)])
    const state = handState(g, 'CC-7', false)
    expect([...state.playableIds]).toEqual(['HEMA-2', 'CC-7'])
    expect(state.picked).toBe('CC-7')
    expect(state.canDraw).toBe(false)
    expect(state.hint).toBe('Ready? Tap Answer to play.')
    expect(handState(g, null, false).hint).toBe('Your turn. Pick a card that fits.')
  })

  it("ignores a picked card that doesn't fit (or isn't hers any more)", () => {
    const g = table([num('HEMA', 2), num('CC', 3)])
    expect(handState(g, 'CC-3', false).picked).toBeNull()
    expect(handState(g, 'MICRO-9', false).picked).toBeNull()
  })

  it('nothing fits: Draw is on', () => {
    const state = handState(table([num('CC', 3)]), null, false)
    expect(state.canDraw).toBe(true)
    expect(state.playableIds.size).toBe(0)
    expect(state.hint).toBe('Nothing fits. Draw a card.')
  })

  it('after drawing a card that fits: only that card, already picked, and Draw becomes Keep', () => {
    const g = table([num('CC', 3), num('HEMA', 1)], { pending: { kind: 'drawn', cardId: 'HEMA-1' } })
    const state = handState(g, null, false)
    expect([...state.playableIds]).toEqual(['HEMA-1'])
    expect(state.picked).toBe('HEMA-1')
    expect(state.keepingDrawn).toBe(true)
    expect(state.canDraw).toBe(false)
  })

  it("someone else's turn: nothing can be tapped, and the hint says whose turn it is", () => {
    const g = table([num('HEMA', 2)], { turn: 2 })
    const state = handState(g, 'HEMA-2', false)
    expect(state.playableIds.size).toBe(0)
    expect(state.picked).toBeNull()
    expect(state.hint).toBe(`${g.players[2].name}’s turn…`)
  })

  it('a question is up: nothing can be tapped', () => {
    const g = table([num('HEMA', 2)], { pending: { kind: 'play', cardId: 'HEMA-2' } })
    expect(handState(g, 'HEMA-2', true).playableIds.size).toBe(0)
  })

  it('the game is over: no hint', () => {
    expect(handState(table([num('HEMA', 2)], { finished: true, winner: 1 }), null, false).hint).toBe('')
  })
})
