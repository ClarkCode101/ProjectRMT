import { describe, expect, it } from 'vitest'
import { newCardGame, type Card, type CardGame } from '@/lib/cards'
import { CARD_WIDTH, handLayout, handState, SMALL_CARD_WIDTH, TAP_MIN_MOUSE, TAP_MIN_TOUCH, TAP_STEP, TIGHT_STEP } from './handState'

/** n cards; the ones at `tap` can be tapped */
const hand = (n: number, tap: number[] = []) => Array.from({ length: n }, (_, i) => tap.includes(i))
const total = (steps: number[]) => steps.reduce((a, b) => a + b, 0)

describe('handLayout', () => {
  it('a few cards sit side by side with a small gap', () => {
    expect(handLayout(hand(3), 800)).toEqual({ size: 'lg', cardWidth: CARD_WIDTH, steps: [0, CARD_WIDTH + 8, CARD_WIDTH + 8], fits: true })
    expect(handLayout(hand(1), 0).steps).toEqual([0])
  })

  it('a phone gets the smaller cards', () => {
    expect(handLayout(hand(5), 350)).toMatchObject({ size: 'md', cardWidth: SMALL_CARD_WIDTH })
    expect(handLayout(hand(5), 700)).toMatchObject({ size: 'lg', cardWidth: CARD_WIDTH })
  })

  it('with nothing to tap, the cards overlap evenly, just enough to fit the width', () => {
    const { steps, fits, cardWidth } = handLayout(hand(8), 600)
    expect(fits).toBe(true)
    expect(new Set(steps.slice(1)).size).toBe(1)
    // the last card's right edge (plus room for the tilt) lands inside the width
    expect(24 + cardWidth + total(steps)).toBeCloseTo(600)
  })

  it('on a phone, the cards she can tap keep a thumb-sized strip and the others squeeze up', () => {
    // 10 cards on a 350px phone hand: evenly that's under 27px each, too thin to tap
    const { steps, fits, cardWidth } = handLayout(hand(10, [2, 6]), 350)
    expect(fits).toBe(true)
    expect(steps[3]).toBeGreaterThanOrEqual(TAP_STEP) // card 2 shows steps[3]
    expect(steps[7]).toBeGreaterThanOrEqual(TAP_STEP) // card 6
    expect(steps[1]).toBeGreaterThanOrEqual(TIGHT_STEP)
    expect(steps[1]).toBeLessThan(TAP_STEP)
    expect(24 + cardWidth + total(steps)).toBeCloseTo(350)
  })

  it('a tappable last card needs no extra room (it already shows whole)', () => {
    const { steps } = handLayout(hand(10, [9]), 350)
    expect(new Set(steps.slice(1)).size).toBe(1)
  })

  it('when there is room for everyone, nothing changes on her turn', () => {
    expect(handLayout(hand(6, [1]), 900)).toEqual(handLayout(hand(6), 900))
  })

  it('a crowded laptop hand squeezes instead of scrolling (18 cards, 12 that fit)', () => {
    const tap = [0, 2, 3, 4, 5, 7, 10, 11, 12, 13, 15, 16]
    const mouse = handLayout(hand(18, tap), 800, false)
    expect(mouse.fits).toBe(true)
    expect(Math.min(...tap.map((i) => mouse.steps[i + 1]))).toBeGreaterThanOrEqual(TAP_MIN_MOUSE)
    expect(mouse.steps[2]).toBeGreaterThanOrEqual(TIGHT_STEP) // card 1 doesn't fit: squeezed, number still shows
    expect(24 + mouse.cardWidth + total(mouse.steps)).toBeCloseTo(800)
  })

  it('a finger keeps a wider strip than a mouse on the cards it can tap', () => {
    const tap = [0, 2, 3, 4, 5, 7, 10, 11, 12, 13, 15, 16]
    const finger = handLayout(hand(18, tap), 900, true)
    expect(finger.fits).toBe(true)
    expect(Math.min(...tap.map((i) => finger.steps[i + 1]))).toBeGreaterThanOrEqual(TAP_MIN_TOUCH)
  })

  it("someone else's turn: a big hand squeezes all the way instead of scrolling", () => {
    const { steps, fits } = handLayout(hand(25), 700)
    expect(fits).toBe(true)
    expect(steps[1]).toBeGreaterThanOrEqual(TIGHT_STEP)
  })

  it('only when even that is too wide does the row scroll (20 cards on a phone)', () => {
    expect(handLayout(hand(20), 400)).toMatchObject({ fits: false })
    const crowded = handLayout(hand(20, [0, 5]), 400)
    expect(crowded.fits).toBe(false)
    expect(crowded.steps[1]).toBe(TAP_MIN_TOUCH) // still big enough to tap while scrolling
    expect(crowded.steps[2]).toBe(TIGHT_STEP)
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
