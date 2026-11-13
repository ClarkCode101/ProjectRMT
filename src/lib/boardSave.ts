// The Board Review game in progress, saved on the device after every turn (PROJECT_PLAN.md §14).
// One game per account. If it gets lost (e.g. iOS clears storage), only the board position is gone:
// her answers were already saved as attempts.
import { BOARD_SIZE, LAYOUTS, LIFELINE_IDS, type BoardGame, type LifelineId, type Pending, type QuestionLifelines } from './board'

export type SavedBoard = {
  version: 1
  /** the quiz session (mode 'board') her answers in this game belong to */
  sessionId: string
  game: BoardGame
  /**
   * The question up now for what's waiting on the board (the roll, a ladder, a snake), with the lifelines already
   * used on it. Leaving and coming back shows the SAME question, so she can't skip a hard one (fixed 2026-11-13,
   * like Last Card's). Cleared once she answers.
   */
  question?: SavedQuestion
}

export type SavedQuestion = {
  id: string
  lifelines: QuestionLifelines
  /** the snake's rescue question came from her weakest topic (shown on the question) */
  weakTopicName: string | null
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
    typeof g.startedAt === 'string' &&
    Array.isArray(g.lifelinesUsed) &&
    g.lifelinesUsed.every((id) => LIFELINE_IDS.includes(id as LifelineId))
  )
}

const isIndex = (value: unknown) => isCount(value) && (value as number) < 10

function parseSavedQuestion(value: unknown): SavedQuestion | null {
  if (typeof value !== 'object' || value === null) return null
  const q = value as Record<string, unknown>
  const l = (typeof q.lifelines === 'object' && q.lifelines !== null ? q.lifelines : {}) as Record<string, unknown>
  if (typeof q.id !== 'string' || q.id === '') return null
  if (!Array.isArray(l.ruledOut) || !l.ruledOut.every(isIndex)) return null
  if (typeof l.secondChance !== 'boolean' || typeof l.shield !== 'boolean') return null
  if (l.firstWrong !== null && !isIndex(l.firstWrong)) return null
  return {
    id: q.id,
    lifelines: { ruledOut: l.ruledOut as number[], secondChance: l.secondChance, firstWrong: l.firstWrong as number | null, shield: l.shield },
    weakTopicName: typeof q.weakTopicName === 'string' ? q.weakTopicName : null,
  }
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
    // Games saved before lifelines (migration 0032) have spent none.
    const game = { layoutId: LAYOUTS[0].id, lifelinesUsed: [], ...saved.game }
    if (!isGame(game)) return null
    // A question that isn't shaped right is dropped (a new one is picked), the game is kept.
    const question = game.pending ? parseSavedQuestion(saved.question) : null
    return { version: 1, sessionId: saved.sessionId, game, ...(question ? { question } : {}) }
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
