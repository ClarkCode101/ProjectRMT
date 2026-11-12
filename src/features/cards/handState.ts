// What she can do with her hand right now on the Last Card table (PROJECT_PLAN.md §15).
// Plain logic (no React), so it is easy to test.
import { isHerMove, playableCards, type CardGame } from '@/lib/cards'

/** What she can do with her hand right now. */
export type HandState = {
  /** the cards she may tap: on her move, the ones that fit; after drawing one that fits, only that card */
  playableIds: ReadonlySet<string>
  /** the card that's up, ready for "Answer to play" (null = none) */
  picked: string | null
  /** nothing fits, so Draw is on */
  canDraw: boolean
  /** she drew a card that fits: Draw becomes "Keep card" */
  keepingDrawn: boolean
  /** one line above her hand saying what to do */
  hint: string
}

export function handState(game: CardGame, pickedId: string | null, askOpen: boolean): HandState {
  const pending = game.pending
  const herMove = isHerMove(game)
  const drawnId = pending?.kind === 'drawn' && !askOpen ? pending.cardId : null
  const keepingDrawn = drawnId !== null
  const playableIds = new Set(herMove ? playableCards(game, 0).map((c) => c.id) : drawnId !== null ? [drawnId] : [])
  const picked = drawnId ?? (pickedId !== null && playableIds.has(pickedId) ? pickedId : null)
  const canDraw = herMove && playableIds.size === 0

  let hint = ''
  if (game.finished) hint = ''
  else if (game.turn !== 0) hint = `${game.players[game.turn].name}’s turn…`
  else if (keepingDrawn) hint = 'You drew a card that fits. Play it, or keep it.'
  else if (canDraw) hint = 'Nothing fits. Draw a card.'
  else if (herMove && picked) hint = 'Ready? Tap Answer to play.'
  else if (herMove) hint = 'Your turn. Pick a card that fits.'

  return { playableIds, picked, canDraw, keepingDrawn, hint }
}

// ---------- How her hand is spread out ----------

/** Width of a card in her hand, in px (the 'lg' size). */
export const CARD_WIDTH = 104
/** Side by side with a small gap when there's room. */
const ROOMY_STEP = CARD_WIDTH + 8
/** The tightest overlap: the corner (number + subject code) still shows. */
const MIN_STEP = 32
/** Room kept at the ends for the tilt of the outer cards. */
const EDGE = 24

/** How far apart the cards sit (left edge to left edge), so they fit in `width`. Below MIN_STEP the row scrolls. */
export function cardStep(count: number, width: number): { step: number; fits: boolean } {
  if (count <= 1) return { step: ROOMY_STEP, fits: true }
  const step = Math.min(ROOMY_STEP, (width - EDGE - CARD_WIDTH) / (count - 1))
  return step >= MIN_STEP ? { step, fits: true } : { step: MIN_STEP, fits: false }
}
