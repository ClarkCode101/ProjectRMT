// DEV ONLY test shortcuts for the solo Board Review (npm run dev's red DEV panel). Pure, like the game itself.
// Used only behind `import.meta.env.DEV`, so `npm run build` leaves the panel out of the deployed app.
import { layoutOf, type BoardGame } from './board'

/**
 * Sets up a roll that lands on a ladder's foot (or a snake's head): she stands a few squares before it with that roll
 * waiting, so answering right walks her onto it and its question comes next, the whole way it happens in a game.
 */
export function devRollOnto(game: BoardGame, kind: 'ladder' | 'snake'): BoardGame {
  const layout = layoutOf(game.layoutId)
  const jumps = kind === 'ladder' ? layout.ladders : layout.snakes
  // the first one ahead of her (or the first on the board), with room for a roll before it
  const target = jumps.find((j) => j.from > game.position && j.from > 1) ?? jumps.find((j) => j.from > 1)
  if (!target) return game
  const roll = Math.min(3, target.from - 1)
  return { ...game, position: target.from - roll, pending: { kind: 'move', roll }, finished: false }
}

/** Square 54, waiting to roll: one right answer from the end (a 6, or a smaller roll and another turn). */
export function devNearEnd(game: BoardGame): BoardGame {
  return { ...game, position: 54, pending: null, finished: false }
}

/** All three lifelines can be used again. */
export function devLifelinesBack(game: BoardGame): BoardGame {
  return { ...game, lifelinesUsed: [] }
}

/** Ends the game now: she reached square 60. */
export function devFinishBoard(game: BoardGame): BoardGame {
  return { ...game, position: 60, pending: null, finished: true }
}

/** The letter (A, B…) the right answer shows as, in the order on screen. */
export function devBoardAnswerLetter(correctIndex: number, order: readonly number[]): string {
  const position = order.indexOf(correctIndex)
  return position >= 0 ? String.fromCharCode(65 + position) : '?'
}
