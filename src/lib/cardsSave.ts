// The Last Card game in progress, saved on the device after every move (PROJECT_PLAN.md §15).
// One game per account. If it gets lost (e.g. iOS clears storage), only the table is gone:
// her answers were already saved as attempts.
import { buildDeck, CARD_SUBJECTS, type Card, type CardGame, type CardPending, type CardSubject } from './cards'

export type SavedCards = {
  version: 1
  /** the quiz session (mode 'cards') her answers in this game belong to */
  sessionId: string
  game: CardGame
}

const keyFor = (userId: string) => `projectrmt:cards:${userId}`

/** Every real card by id: a saved card must match one of these exactly. */
const DECK = new Map(buildDeck().map((card) => [card.id, card]))
const DECK_SIZE = DECK.size

const isCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isSubject = (value: unknown): value is CardSubject => CARD_SUBJECTS.includes(value as CardSubject)

function isCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false
  const real = DECK.get((value as { id?: unknown }).id as string)
  return real !== undefined && JSON.stringify(real) === JSON.stringify(value)
}

const isCardList = (value: unknown): value is Card[] => Array.isArray(value) && value.every(isCard)

function isPending(value: unknown): value is CardPending | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  // the question already shown for it (optional: games saved before 2026-11-12 don't have one)
  const questionOk = p.questionId === undefined || typeof p.questionId === 'string'
  if (p.kind === 'play') return typeof p.cardId === 'string' && questionOk
  if (p.kind === 'drawn') return typeof p.cardId === 'string'
  if (p.kind === 'chooseSubject') return true
  if (p.kind === 'draw2') return isSubject(p.subject) && isCount(p.left) && (p.left as number) >= 1 && questionOk
  return false
}

function isTallies(value: unknown): value is CardGame['bySubject'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((t) => typeof t === 'object' && t !== null && isCount((t as { answered?: unknown }).answered) && isCount((t as { correct?: unknown }).correct))
}

function isPlayer(value: unknown): value is CardGame['players'][number] {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return typeof p.name === 'string' && typeof p.isHuman === 'boolean' && isCardList(p.hand)
}

function isGame(value: unknown): value is CardGame {
  if (typeof value !== 'object' || value === null) return false
  const g = value as Record<string, unknown>
  if (!Array.isArray(g.players) || g.players.length < 2 || !g.players.every(isPlayer)) return false
  const players = g.players as CardGame['players']
  if (!players[0].isHuman || players.slice(1).some((p) => p.isHuman)) return false
  if (!isCardList(g.drawPile) || !isCardList(g.discard) || g.discard.length === 0) return false

  // All 78 cards, each exactly once: a game with a lost or doubled card is broken.
  const allIds = [...players.flatMap((p) => p.hand), ...g.drawPile, ...g.discard].map((c) => c.id)
  if (allIds.length !== DECK_SIZE || new Set(allIds).size !== DECK_SIZE) return false

  const seat = (v: unknown) => isCount(v) && (v as number) < players.length
  return (
    isSubject(g.subject) &&
    (g.direction === 1 || g.direction === -1) &&
    seat(g.turn) &&
    isPending(g.pending) &&
    ['answered', 'correct', 'drawnForMistakes'].every((k) => isCount(g[k])) &&
    isTallies(g.bySubject) &&
    Array.isArray(g.usedQuestionIds) &&
    g.usedQuestionIds.every((id) => typeof id === 'string') &&
    (g.winner === null || seat(g.winner)) &&
    typeof g.finished === 'boolean' &&
    (g.endReason === null || g.endReason === 'emptied' || g.endReason === 'outOfCards' || g.endReason === 'everyoneLeft') &&
    Array.isArray(g.log) &&
    (g.moveCount === undefined || isCount(g.moveCount)) &&
    typeof g.startedAt === 'string'
  )
}

/** Reads a saved game. Anything missing or not shaped right gives null ("no game"), never a crash. */
export function parseSavedCards(raw: string | null): SavedCards | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const saved = data as Record<string, unknown>
    if (saved.version !== 1 || typeof saved.sessionId !== 'string' || !isGame(saved.game)) return null
    return { version: 1, sessionId: saved.sessionId, game: saved.game }
  } catch {
    return null
  }
}

export function loadCards(userId: string): SavedCards | null {
  try {
    return parseSavedCards(localStorage.getItem(keyFor(userId)))
  } catch {
    return null // storage blocked
  }
}

export function saveCards(userId: string, saved: SavedCards) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(saved))
  } catch {
    // Storage full or blocked: the game still works until the page closes.
  }
}

export function clearCards(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // nothing to do
  }
}
