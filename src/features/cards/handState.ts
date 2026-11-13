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

/** Width of a card in her hand, in px: the 'lg' size, or 'md' on a narrow screen (a phone). */
export const CARD_WIDTH = 104
export const SMALL_CARD_WIDTH = 84
/** A hand narrower than this (a phone) gets the smaller cards. */
const NARROW = 560
/** Gap between cards when there's room for them side by side. */
const GAP = 8
/** Room kept at the ends for the tilt of the outer cards. */
const EDGE = 24
/** The tightest even overlap, for a 104px card: the corner (number + subject code) still shows. Scaled for smaller cards. */
const MIN_STEP = 32
/** A card she can tap gets this much showing when there's room: Apple's 44pt touch target, plus room for the tilt. */
export const TAP_STEP = 56
/** When the hand is very crowded, a card she can tap may shrink down to this. A finger needs 44 (Apple's touch target); a mouse is precise. */
export const TAP_MIN_TOUCH = 44
export const TAP_MIN_MOUSE = 32
/** A card she doesn't need to tap may squeeze down to this: just its number shows. */
export const TIGHT_STEP = 18

export type HandLayout = {
  size: 'md' | 'lg'
  cardWidth: number
  /** left edge to left edge, from the card before (steps[0] = 0). Card i shows steps[i + 1] px; the last shows whole. */
  steps: number[]
  /** false = even the tightest layout is too wide, so the row scrolls sideways */
  fits: boolean
}

/**
 * How her hand is spread out in `width` px. `tappable[i]` = card i can be tapped right now (it fits, on her move).
 * `touch` = a finger, not a mouse (the cards she can tap need more room).
 *
 * Room for everyone: spread evenly. When crowded, room is found in this order, so the row only scrolls as a last resort
 * (e.g. 20+ cards on a phone):
 *   1. the cards she doesn't need to tap squeeze up, down to TIGHT_STEP (nothing to tap = every card squeezes)
 *   2. the cards she can tap give up room too, down to TAP_MIN_TOUCH / TAP_MIN_MOUSE
 * Changed 2026-11-13: before, every card got the same 32px (too thin to tap on a phone) and a crowded hand scrolled.
 */
export function handLayout(tappable: readonly boolean[], width: number, touch = true): HandLayout {
  const count = tappable.length
  const size = width > 0 && width < NARROW ? 'md' : 'lg'
  const cardWidth = size === 'md' ? SMALL_CARD_WIDTH : CARD_WIDTH
  const minStep = Math.round((MIN_STEP * cardWidth) / CARD_WIDTH)
  const roomy = cardWidth + GAP
  const gaps = count - 1
  if (gaps <= 0) return { size, cardWidth, steps: [0], fits: true }

  const room = width - EDGE - cardWidth // what the steps may add up to
  const evenStep = Math.min(roomy, room / gaps)
  // The last card always shows whole, so only the ones before it need room to be tapped.
  const tapCount = tappable.slice(0, -1).filter(Boolean).length
  const restCount = gaps - tapCount

  const tapMin = touch ? TAP_MIN_TOUCH : TAP_MIN_MOUSE
  const even = (step: number, fits: boolean): HandLayout => ({ size, cardWidth, steps: [0, ...Array<number>(gaps).fill(step)], fits })

  // Room for everyone, or every card is one she can tap: spread evenly.
  if (evenStep >= TAP_STEP) return even(evenStep, true)
  if (restCount === 0) return evenStep >= tapMin ? even(evenStep, true) : even(tapMin, false)
  // Nothing to tap (someone else's turn, or nothing fits): every card may squeeze, down to just its number.
  if (tapCount === 0) return evenStep >= TIGHT_STEP ? even(evenStep, true) : even(TIGHT_STEP, false)

  // The cards she can tap first: as much as fits with the others at the even minimum, between TAP_STEP and roomy.
  let tapStep = Math.min(roomy, Math.max(TAP_STEP, (room - restCount * minStep) / tapCount))
  let restStep = (room - tapCount * tapStep) / restCount
  let fits = true
  if (restStep < TIGHT_STEP) {
    // 1. the others are as tight as they go, 2. so the ones she can tap give up room, down to tapMin.
    restStep = TIGHT_STEP
    tapStep = (room - restCount * TIGHT_STEP) / tapCount
    if (tapStep < tapMin) {
      tapStep = tapMin
      fits = false // 3. still too wide: the row scrolls
    }
  }
  return { size, cardWidth, steps: [0, ...tappable.slice(0, -1).map((t) => (t ? tapStep : restStep))], fits }
}
