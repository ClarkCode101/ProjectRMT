// The Board Review game in progress, saved on the device after every turn (PROJECT_PLAN.md §14).
// One game per account. If it gets lost (e.g. iOS clears storage), only the board position is gone:
// her answers were already saved as attempts.
import { BOARD_SIZE, LAYOUTS, type BoardGame, type Pending } from './board'

export type SavedBoard = {
  version: 1
  /** the quiz session (mode 'board') her answers in this game belong to */
  sessionId: string
  game: BoardGame
}

const keyFor = (userId: string) => `projectrmt:board:${userId}`

const isCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isSquare = (value: unknown) => isCount(value) && (value as number) >= 1 && (value as number) <= BOARD_SIZE

function isPending(value: unknown): value is Pending | null {
  if (value === null) return true
  if (typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  if (p.kind === 'move') return isCount(p.roll) && (p.roll as number) >= 1 && (p.roll as number) <= 6
  if (p.kind === 'ladder' || p.kind === 'snake') return isSquare(p.from) && isSquare(p.to)
  return false
}

function isTallies(value: unknown): value is BoardGame['bySubject'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((t) => typeof t === 'object' && t !== null && isCount((t as { answered?: unknown }).answered) && isCount((t as { correct?: unknown }).correct))
}

function isGame(value: unknown): value is BoardGame {
  if (typeof value !== 'object' || value === null) return false
  const g = value as Record<string, unknown>
  return (
    LAYOUTS.some((l) => l.id === g.layoutId) &&
    isSquare(g.position) &&
    ['turns', 'answered', 'correct', 'laddersClimbed', 'snakesEscaped', 'snakesSlid'].every((k) => isCount(g[k])) &&
    Array.isArray(g.usedQuestionIds) &&
    g.usedQuestionIds.every((id) => typeof id === 'string') &&
    isTallies(g.bySubject) &&
    isPending(g.pending) &&
    typeof g.finished === 'boolean' &&
    typeof g.startedAt === 'string'
  )
}

/** Reads a saved game. Anything missing or not shaped right gives null ("no game"), never a crash. */
export function parseSavedBoard(raw: string | null): SavedBoard | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const saved = data as Record<string, unknown>
    if (saved.version !== 1 || typeof saved.sessionId !== 'string' || typeof saved.game !== 'object' || saved.game === null) return null
    // Games saved before there were three layouts have no layoutId: they were on the first one.
    const game = { layoutId: LAYOUTS[0].id, ...saved.game }
    if (!isGame(game)) return null
    return { version: 1, sessionId: saved.sessionId, game }
  } catch {
    return null
  }
}

export function loadBoard(userId: string): SavedBoard | null {
  try {
    return parseSavedBoard(localStorage.getItem(keyFor(userId)))
  } catch {
    return null // storage blocked
  }
}

export function saveBoard(userId: string, saved: SavedBoard) {
  try {
    localStorage.setItem(keyFor(userId), JSON.stringify(saved))
  } catch {
    // Storage full or blocked: the game still works until the page closes.
  }
}

export function clearBoard(userId: string) {
  try {
    localStorage.removeItem(keyFor(userId))
  } catch {
    // nothing to do
  }
}
