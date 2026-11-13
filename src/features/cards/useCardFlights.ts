import { useLayoutEffect, useRef, useState } from 'react'
import { cardById, cardMoves, type Card, type CardGame, type CardMove } from '@/lib/cards'

// Flying cards on the Last Card table (PROJECT_PLAN.md §15): a drawn card flies from the draw pile into a hand,
// a played card flies from a hand onto the pile. This hook works out what moved and where from / to;
// CardFlights draws the cards in the air.
//
// How: after every change of the game, it compares the game before and after (cardMoves), and the positions on
// screen before and after (the elements marked data-anchor / data-seat / data-card-id). While a card is in the air,
// the spot it is flying to is hidden, so it never shows twice.

/** Where a flying card is: its top-left corner on screen, and its size compared to a full-size (104px) card. */
export type FlightBox = { x: number; y: number; scale: number }

export type Flight = {
  key: string
  card: Card
  from: FlightBox
  to: FlightBox
  /** ms after the flight shows before it starts (several cards in one move go one after another) */
  delay: number
  duration: number
  /** face down at the start / end (a computer player's card is face down in its hand) */
  backAtStart: boolean
  backAtEnd: boolean
  /** a card flying into her hand: hidden there until it lands */
  hideHandCard: string | null
  /** a card flying onto the pile: the pile's top card is hidden until it lands */
  hideTop: boolean
}

/** A full-size card in her hand (PlayingCard 'lg'). */
export const FLIGHT_CARD_WIDTH = 104
export const FLIGHT_CARD_HEIGHT = 148
/** How small a card gets when it flies into (or out of) a computer player's seat. */
const SEAT_SCALE = 0.45
const PLAY_MS = 420
const DRAW_MS = 460
/** a move's draws start after its play has landed, one after another */
const DRAW_AFTER_PLAY_MS = 320
const DRAW_STAGGER_MS = 220

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Where every card spot is on screen right now. */
function measure(): Map<string, DOMRect> {
  const spots = new Map<string, DOMRect>()
  document.querySelectorAll<HTMLElement>('[data-card-id]').forEach((el) => {
    // The button inside is the card as drawn (raised, tilted). A tilted card's outer box is bigger than the card,
    // so keep the center of that box but the card's real size.
    const card = (el.firstElementChild as HTMLElement | null) ?? el
    const box = card.getBoundingClientRect()
    const width = card.offsetWidth
    const height = card.offsetHeight
    spots.set(`card:${el.dataset.cardId}`, new DOMRect(box.left + box.width / 2 - width / 2, box.top + box.height / 2 - height / 2, width, height))
  })
  document.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) spots.set(`seat:${el.dataset.seat}`, rect) // phones and tablets each have their own (one is hidden)
  })
  for (const anchor of ['draw-pile', 'discard']) {
    const el = document.querySelector(`[data-anchor="${anchor}"]`)
    if (el) spots.set(anchor, el.getBoundingClientRect())
  }
  return spots
}

/** A card-shaped spot (hand, pile): the card covers it. */
function cardBox(rect: DOMRect): FlightBox {
  return { x: rect.left, y: rect.top, scale: rect.width / FLIGHT_CARD_WIDTH }
}

/** A small card in the middle of a spot that isn't card-shaped (a seat, the draw pile). */
function centeredBox(rect: DOMRect, scale: number): FlightBox {
  return {
    x: rect.left + rect.width / 2 - (FLIGHT_CARD_WIDTH * scale) / 2,
    y: rect.top + rect.height / 2 - (FLIGHT_CARD_HEIGHT * scale) / 2,
    scale,
  }
}

const DRAW_PILE_SCALE = 84 / FLIGHT_CARD_WIDTH // the draw pile shows 'md' card backs

/**
 * `movesOf` says what moved between two moments of the game: solo compares the two tables (cardMoves); live games read
 * the move log (movesFromLog), since one update can hold several moves and the others' cards are hidden.
 * Moves fly one after another, in order: a draw starts as the play before it lands, a play waits for the one before.
 */
export function useCardFlights(game: CardGame, movesOf: (before: CardGame, after: CardGame) => CardMove[] = cardMoves) {
  const before = useRef<{ game: CardGame; spots: Map<string, DOMRect> } | null>(null)
  const [flights, setFlights] = useState<Flight[]>([])

  useLayoutEffect(() => {
    const spots = measure()
    const previous = before.current
    before.current = { game, spots }
    if (!previous || previous.game === game || prefersReducedMotion()) return

    const moves = movesOf(previous.game, game)
    // A card in a hand or on the pile (incl. the face-down stand-ins for cards she can't see), else any card by its id.
    const findCard = (id: string) => game.players.flatMap((p) => p.hand).find((c) => c.id === id) ?? game.discard.find((c) => c.id === id) ?? cardById(id)
    const next: Flight[] = []
    let clock = 0 // when the next move starts (ms)

    for (const [i, move] of moves.entries()) {
      const followedByDraw = moves[i + 1]?.kind === 'draw'
      const card = findCard(move.cardId)
      if (!card) continue
      const key = `${game.moveCount ?? 0}-${move.kind}-${move.cardId}-${Date.now()}`
      const herCard = game.players[move.player]?.isHuman ?? false

      if (move.kind === 'play') {
        const fromRect = herCard ? previous.spots.get(`card:${move.cardId}`) : (previous.spots.get(`seat:${move.player}`) ?? spots.get(`seat:${move.player}`))
        const toRect = spots.get('discard')
        if (!fromRect || !toRect) continue
        next.push({
          key,
          card,
          from: herCard ? cardBox(fromRect) : centeredBox(fromRect, SEAT_SCALE),
          to: cardBox(toRect),
          delay: clock,
          duration: PLAY_MS,
          backAtStart: !herCard, // a computer player's card turns face up on the way
          backAtEnd: false,
          hideHandCard: null,
          hideTop: true,
        })
        // its draws start as it lands; another play waits until it's down
        clock += followedByDraw ? DRAW_AFTER_PLAY_MS : PLAY_MS + 60
      } else {
        const fromRect = previous.spots.get('draw-pile') ?? spots.get('draw-pile')
        const toRect = herCard ? spots.get(`card:${move.cardId}`) : spots.get(`seat:${move.player}`)
        if (!fromRect || !toRect) continue
        next.push({
          key,
          card,
          from: centeredBox(fromRect, DRAW_PILE_SCALE),
          to: herCard ? cardBox(toRect) : centeredBox(toRect, SEAT_SCALE),
          delay: clock,
          duration: DRAW_MS,
          backAtStart: true,
          backAtEnd: !herCard, // hers turns face up as it lands; a computer player's stays face down
          hideHandCard: herCard ? move.cardId : null,
          hideTop: false,
        })
        clock += DRAW_STAGGER_MS
      }
    }
    // Setting state here re-renders before the screen is painted, so the landing spots are hidden from the start.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next.length > 0) setFlights((current) => [...current, ...next])
  }, [game, movesOf])

  const land = (key: string) => setFlights((current) => current.filter((f) => f.key !== key))
  const hiddenIds = new Set(flights.flatMap((f) => (f.hideHandCard ? [f.hideHandCard] : [])))
  const hideTop = flights.some((f) => f.hideTop)
  return { flights, land, hiddenIds, hideTop }
}
