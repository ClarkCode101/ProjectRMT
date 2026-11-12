// The Games page (PROJECT_PLAN.md §16): one place for every game, picked from a swipeable row of cards.
// Plain logic (no React), so it is easy to test.
import { BOARD_SIZE, zoneOf, type BoardGame } from '@/lib/board'
import type { CardGame } from '@/lib/cards'

export type GameId = 'board' | 'cards'

/** In the order they appear on the Games page. */
export const GAME_IDS: readonly GameId[] = ['board', 'cards']

/** Where each game lives (its own start screen keeps working, e.g. for invite links). */
export const GAME_PATH: Record<GameId, string> = { board: '/board', cards: '/cards' }

/** What the Games page says about a game she can pick up again, or that it's a new game. */
export type GameStatus = { paused: boolean; line: string }

export function boardStatus(game: BoardGame | null): GameStatus {
  if (!game || game.finished) return { paused: false, line: '60 squares, one zone per subject' }
  return {
    paused: true,
    line: `Square ${game.position} · ${zoneOf(game.position)} zone · ${game.correct}/${game.answered} correct · ${BOARD_SIZE - game.position} to go`,
  }
}

export function cardsStatus(game: CardGame | null): GameStatus {
  if (!game || game.finished) return { paused: false, line: 'You and 3 computer players, 7 cards each' }
  const cards = game.players[0]?.hand.length ?? 0
  return { paused: true, line: `You have ${cards} ${cards === 1 ? 'card' : 'cards'} · ${game.correct}/${game.answered} correct` }
}

// ---------- The last game she looked at (shown first next time) ----------

const LAST_GAME_KEY = 'projectrmt:last-game'

export function readLastGame(): GameId {
  try {
    const saved = localStorage.getItem(LAST_GAME_KEY)
    return GAME_IDS.includes(saved as GameId) ? (saved as GameId) : GAME_IDS[0]
  } catch {
    return GAME_IDS[0] // storage blocked
  }
}

export function saveLastGame(id: GameId) {
  try {
    localStorage.setItem(LAST_GAME_KEY, id)
  } catch {
    // storage blocked: the first game shows next time, that's fine
  }
}

// ---------- Dragging the row with a mouse ----------

/** A mouse must move this far before a press counts as a drag (less is a plain click). */
export const DRAG_START_PX = 6
/** A drag at least this long goes one game over in that direction, even if it was let go early. */
export const FLICK_PX = 60

/**
 * Where the row settles after a mouse drag: a long enough drag (FLICK_PX) goes one game over from where it
 * started (left drag = next game); a short one settles on whichever game is nearest the middle.
 */
export function dragTarget(startIndex: number, dragPx: number, nearestIndex: number, count: number): number {
  if (Math.abs(dragPx) < FLICK_PX) return nearestIndex
  const next = startIndex + (dragPx < 0 ? 1 : -1)
  return Math.max(0, Math.min(count - 1, next))
}
