// Last Card with classmates (PROJECT_PLAN.md §15 step 3): turning HER view from the server (LiveView) into the same
// table the solo game draws (CardGame), so the live game reuses the solo screen, cards and flying cards.
//
// - The table is turned so she is always seat 0 (at the bottom), like the solo game: her seat on the server can be
//   1–3. Everyone else keeps their place around the table, in turn order.
// - The other players' cards aren't sent to her (only how many): they become face-down placeholders, one per card.
// - Only she counts as the person "at" the table (isHuman), so lines like "You played…" mean her; the others show by
//   name, and computer players are marked isComputer.
import { cardById, DRAW2_QUESTIONS, type Card, type CardEvent, type CardGame, type CardPlayer } from './cards'
import type { LiveReveal, LiveView } from './cardsLive'

/** One face-down card standing in for a card she can't see. */
function hiddenCard(seat: number, index: number): Card {
  return { id: `hidden-${seat}-${index}`, kind: 'number', subject: 'CC', number: 1 }
}

export type LiveTable = {
  /** the table with her at seat 0 */
  game: CardGame
  /** a seat on the server → its place on her table (0 = her) */
  place: (seat: number) => number
  /** her place on the server (-1: watching) */
  mySeat: number
}

export function tableFromView(view: LiveView, startedAt = 'live'): LiveTable {
  const count = view.seats.length
  const me = view.seat >= 0 ? view.seat : 0
  const place = (seat: number) => (((seat - me) % count) + count) % count
  const seatAt = (index: number) => (index + me) % count

  const players: CardPlayer[] = Array.from({ length: count }, (_, index) => {
    const seat = seatAt(index)
    const s = view.seats[seat]
    const mine = index === 0 && view.seat >= 0
    return {
      name: mine ? 'You' : s.name,
      isHuman: mine,
      isComputer: s.isComputer,
      hand: mine ? view.hand : Array.from({ length: s.cards }, (_, i) => hiddenCard(seat, i)),
    }
  })

  const log: CardEvent[] = view.log.map((e) => {
    const moved = { ...e, player: place(e.player) }
    return e.kind === 'reverse' ? { ...moved, next: place(e.next) } : moved
  })

  const mine = view.seat >= 0 ? view.stats[view.seat] : undefined
  const game: CardGame = {
    players,
    drawPile: Array.from({ length: view.drawPileCount }, (_, i) => hiddenCard(-1, i)),
    discard: view.discard,
    subject: view.subject,
    direction: view.direction,
    turn: place(view.turn),
    // what she is in the middle of (someone else's is only for show)
    pending: view.pending,
    answered: mine?.answered ?? 0,
    correct: mine?.correct ?? 0,
    bySubject: mine?.bySubject ?? {},
    usedQuestionIds: [],
    drawnForMistakes: mine?.drawnForMistakes ?? 0,
    winner: view.winner === null ? null : place(view.winner),
    finished: view.finished,
    endReason: view.endReason,
    log,
    moveCount: view.moveCount,
    startedAt,
  }
  return { game, place, mySeat: view.seat }
}

/** The reveal with its seat turned to her table (so "who answered" matches the seats on screen). */
export function revealOnTable(reveal: LiveReveal | null, place: (seat: number) => number): (LiveReveal & { place: number }) | null {
  return reveal ? { ...reveal, place: place(reveal.seat) } : null
}

/** Seconds left on the clock (0 when it's up or there is none). */
export function secondsLeft(deadline: string | null, now: number): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
}

/** "1:05", "0:09" */
export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * The order the choices show in (order[displayPosition] = original index): shuffled, but always the same for the
 * same question, so they don't jump around when the answer is revealed (or when the screen loads again).
 */
export function choiceOrderFor(questionId: string, count: number): number[] {
  let seed = 0
  for (const ch of questionId) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const order = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** What the question up now is for: the card being played (and whether it's their last), or which Draw 2 question. */
export function purposeOf(view: LiveView): { kind: 'play'; card: Card; lastCard: boolean } | { kind: 'draw2'; number: number } | null {
  const q = view.question
  const pending = view.pending
  if (!q || !pending) return null
  if (pending.kind === 'draw2') return { kind: 'draw2', number: DRAW2_QUESTIONS - pending.left + 1 }
  if (pending.kind !== 'play') return null
  const card = cardById(pending.cardId)
  return card ? { kind: 'play', card, lastCard: view.seats[q.seat]?.cards === 1 } : null
}
