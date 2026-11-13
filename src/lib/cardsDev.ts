// DEV ONLY (npm run dev): shortcuts that set up a Last Card table for testing (PROJECT_PLAN.md §15).
// Used only behind `import.meta.env.DEV`, so `npm run build` leaves the panel that calls these out of the deployed app.
//
// The same shortcuts work in live games (cardsLiveDev.ts): `seat` is the player they're for (her seat in solo is 0).
//
// They never make up cards: every card is taken from wherever it is (the draw pile, a hand, or under the top of
// the pile), so the game always keeps exactly the 78 real cards and still loads as a saved game.
import { canPlay, topCard, type Card, type CardGame } from './cards'

/** Takes the first card that matches out of the draw pile, the hands, or the pile under its top card. */
function takeCard(g: CardGame, wanted: (card: Card) => boolean, skipPlayer?: number): Card | null {
  const fromList = (list: Card[]) => {
    const index = list.findIndex(wanted)
    return index === -1 ? null : list.splice(index, 1)[0]
  }
  const fromDraw = fromList(g.drawPile)
  if (fromDraw) return fromDraw
  for (const [i, player] of g.players.entries()) {
    if (i === skipPlayer) continue
    const card = fromList(player.hand)
    if (card) return card
  }
  // Under the top card only: the top card is what everyone plays on.
  const under = g.discard.slice(0, -1)
  const card = fromList(under)
  if (card) g.discard = [...under, topCard(g)]
  return card
}

/** Puts cards at the bottom of the draw pile (drawn last). */
function toBottomOfDrawPile(g: CardGame, cards: Card[]) {
  g.drawPile = [...cards, ...g.drawPile]
}

/**
 * Leaves `playerIndex` with ONE card that fits right now (a number card if there is one), so the next right answer
 * wins. A person (her, or a classmate in a live game): it becomes their move. A computer player: it wins on its turn
 * (if its "answer" is right).
 */
export function devLeaveOneCard(game: CardGame, playerIndex: number): CardGame {
  const g = structuredClone(game)
  const hand = g.players[playerIndex].hand
  const keep = hand.find((c) => c.kind === 'number' && canPlay(c, g)) ?? hand.find((c) => canPlay(c, g)) ?? null
  const others = hand.filter((c) => c !== keep)
  g.players[playerIndex].hand = []
  toBottomOfDrawPile(g, others)
  const card = keep ?? takeCard(g, (c) => c.kind === 'number' && canPlay(c, g)) ?? takeCard(g, (c) => canPlay(c, g))
  if (card) g.players[playerIndex].hand = [card]
  if (g.players[playerIndex].isHuman) {
    g.turn = playerIndex
    g.pending = null
  }
  return g
}

/** Gives the player in `seat` a Skip, Reverse and Draw 2 of the subject in play, and a Wild, then it's their move. */
export function devGiveActionCards(game: CardGame, seat = 0): CardGame {
  const g = structuredClone(game)
  const top = topCard(g)
  for (const kind of ['skip', 'reverse', 'draw2'] as const) {
    const card = takeCard(g, (c) => c.kind === kind && c.subject === g.subject && c.id !== top.id, seat)
    if (card) g.players[seat].hand.push(card)
  }
  const wild = takeCard(g, (c) => c.kind === 'wild', seat)
  if (wild) g.players[seat].hand.push(wild)
  g.turn = seat
  g.pending = null
  return g
}

/** As if someone just played a Draw 2 on the player in `seat`: two questions from the subject in play. */
export function devDraw2OnMe(game: CardGame, seat = 0): CardGame {
  return { ...structuredClone(game), turn: seat, pending: { kind: 'draw2', subject: game.subject, left: 2 } }
}

/** Moves the whole draw pile under the top card, so the next draw ends the game (fewest cards wins). */
export function devEmptyDrawPile(game: CardGame): CardGame {
  const g = structuredClone(game)
  g.discard = [...g.drawPile, ...g.discard]
  g.drawPile = []
  return g
}

/** Ends the game now: `winner` played their last card (their hand goes back into the draw pile). */
export function devFinish(game: CardGame, winner: number): CardGame {
  const g = structuredClone(game)
  toBottomOfDrawPile(g, g.players[winner].hand)
  g.players[winner].hand = []
  g.winner = winner
  g.finished = true
  g.endReason = 'emptied'
  g.pending = null
  return g
}

/** The player who goes after `seat` (the one "Next computer: 1 card left" sets up). */
export function devNextBot(game: CardGame, seat = 0): number {
  const count = game.players.length
  return (((seat + game.direction) % count) + count) % count
}

/** For the DEV answer line: the letter the right answer has on screen (A, B, …). */
export function devAnswerLetter(correctIndex: number, order: readonly number[]): string {
  const position = order.indexOf(correctIndex)
  return position >= 0 ? String.fromCharCode(65 + position) : '?'
}

