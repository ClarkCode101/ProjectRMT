// DEV ONLY: shortcuts for testing a live Last Card game (PROJECT_PLAN.md §15 step 3). They run on the SERVER (the
// Edge Function `cards-game`, action "dev"), which only allows them with the dev key (VITE_DEV_KEY in .env.local,
// matching board_dev_keys) or for accounts in board_dev_testers. The DEV panel that calls them is only in `npm run dev`.
//
// Same shortcuts as the solo game's (cardsDev.ts), for the player asking ("me"). They never make up cards.
import { devDraw2OnMe, devEmptyDrawPile, devFinish, devGiveActionCards, devLeaveOneCard, devNextBot } from './cardsDev'
import { liveNeed, seatOf, TURN_SECONDS, type LiveGame, type LiveResult } from './cardsLive'

export const LIVE_DEV_OPS = ['oneCard', 'nextOneCard', 'actions', 'draw2', 'emptyPile', 'timeUp', 'finishMe', 'finishNext'] as const
export type LiveDevOp = (typeof LIVE_DEV_OPS)[number]

export function liveDev(live: LiveGame, userId: string, op: LiveDevOp, now: Date): LiveResult {
  const me = seatOf(live, userId)
  if (me === -1) return { ok: false, error: 'You’re not playing in this game.' }
  if (live.game.finished) return { ok: false, error: 'The game is over.' }
  const next = devNextBot(live.game, me)
  const freshClock = new Date(now.getTime() + TURN_SECONDS * 1000).toISOString()

  // The question up now goes away whenever the turn or what it's waiting on changes.
  const myTurn = (game: LiveGame['game']): LiveGame => ({ ...live, game, question: null, deadline: freshClock })
  let changed: LiveGame
  switch (op) {
    case 'oneCard':
      changed = myTurn(devLeaveOneCard(live.game, me))
      break
    case 'nextOneCard':
      changed = { ...live, game: devLeaveOneCard(live.game, next) }
      break
    case 'actions':
      changed = myTurn(devGiveActionCards(live.game, me))
      break
    case 'draw2':
      changed = myTurn(devDraw2OnMe(live.game, me))
      break
    case 'emptyPile':
      changed = { ...live, game: devEmptyDrawPile(live.game) }
      break
    case 'timeUp':
      // the clock runs out now: the next "timeout" from any screen passes the turn
      changed = { ...live, deadline: new Date(now.getTime() - 1000).toISOString() }
      break
    case 'finishMe':
      changed = { ...live, game: devFinish(live.game, me), question: null, deadline: null }
      break
    case 'finishNext':
      changed = { ...live, game: devFinish(live.game, next), question: null, deadline: null }
      break
  }
  return { ok: true, live: changed, need: liveNeed(changed) }
}

/** DEV: the answer to the question up now (only for the dev panel's "Show answers"). */
export function liveDevAnswer(live: LiveGame): { questionId: string; correctIndex: number } | null {
  return live.question ? { questionId: live.question.id, correctIndex: live.question.correctIndex } : null
}
