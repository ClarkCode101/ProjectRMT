// Last Card: a match-and-shed card game where she only puts a card down if she answers a question
// from its subject (PROJECT_PLAN.md §15). Pure logic: no Supabase or React here, so it is easy to unit test.
//
// How the state changes: every public function takes a game and returns a NEW game (the old one is never
// changed), so React state and the saved game stay simple. Inside, we copy the game once and then edit the copy.
import { ZONE_SUBJECTS, type SubjectTally, type ZoneSubject } from './board'
import { shuffle, type RandomFn } from './quiz'

// ---------- Cards ----------

/** The six suits are the six built-in subjects, in exam order (same list as the Board Review zones). */
export const CARD_SUBJECTS = ZONE_SUBJECTS
export type CardSubject = ZoneSubject

export type ActionKind = 'skip' | 'reverse' | 'draw2'

export type Card =
  | { id: string; kind: 'number'; subject: CardSubject; number: number }
  | { id: string; kind: ActionKind; subject: CardSubject }
  | { id: string; kind: 'wild' }

export const HAND_SIZE = 7
export const WILD_COUNT = 6
/** How often a computer player "answers" right. */
export const BOT_CORRECT_CHANCE = 0.7
/** Questions she answers when a Draw 2 is played on her (each wrong one = draw 1). */
export const DRAW2_QUESTIONS = 2

const ACTION_NAMES: Record<ActionKind, string> = { skip: 'Skip', reverse: 'Reverse', draw2: 'Draw 2' }

/**
 * The full deck, 78 cards: for each subject the numbers 1–9, Skip, Reverse and Draw 2 (12 × 6 = 72), plus 6 Wild.
 * Every card appears once, so its id (e.g. "HEMA-7", "CC-skip", "wild-3") is unique.
 */
export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const subject of CARD_SUBJECTS) {
    for (let number = 1; number <= 9; number++) deck.push({ id: `${subject}-${number}`, kind: 'number', subject, number })
    for (const kind of ['skip', 'reverse', 'draw2'] as const) deck.push({ id: `${subject}-${kind}`, kind, subject })
  }
  for (let i = 1; i <= WILD_COUNT; i++) deck.push({ id: `wild-${i}`, kind: 'wild' })
  return deck
}

/** "HEMA 7", "CC Skip", "Wild". */
export function cardLabel(card: Card): string {
  if (card.kind === 'wild') return 'Wild'
  if (card.kind === 'number') return `${card.subject} ${card.number}`
  return `${card.subject} ${ACTION_NAMES[card.kind]}`
}

// ---------- The game ----------

export type CardPlayer = {
  name: string
  /** false = a computer player */
  isHuman: boolean
  hand: Card[]
}

/**
 * What her turn is waiting on (null = she can pick a card, or draw if nothing fits):
 * - play: she tapped "Answer to play" on this card; a question is up
 * - drawn: she had nothing to play and drew this card, which fits; she may play it or pass
 * - chooseSubject: she answered a Wild right; she picks the next subject
 * - draw2: a Draw 2 was played on her; `left` questions to go from `subject`
 */
export type CardPending =
  | { kind: 'play'; cardId: string }
  | { kind: 'drawn'; cardId: string }
  | { kind: 'chooseSubject' }
  | { kind: 'draw2'; subject: CardSubject; left: number }

/** One thing that happened, so the screen can say "Rafa M. played HEMA 3" or "Joy D. drew 2". */
export type CardEvent =
  | { player: number; kind: 'play'; cardId: string }
  | { player: number; kind: 'miss'; cardId: string } // answered wrong, the card went back
  | { player: number; kind: 'draw'; count: number }
  | { player: number; kind: 'pass' }
  | { player: number; kind: 'choose'; subject: CardSubject }

/** The newest few events are kept (enough for the screen, small enough for the saved game). */
export const EVENT_LOG_SIZE = 12

export type CardGame = {
  /** index 0 is her; 1–3 are the computer players */
  players: CardPlayer[]
  /** face down; the top card is the LAST one in the list */
  drawPile: Card[]
  /** face up; the top card is the LAST one in the list */
  discard: Card[]
  /** the subject to match: the top card's, or the one picked with a Wild */
  subject: CardSubject
  /** 1 = clockwise (0 → 1 → 2 → 3), -1 = the other way (after a Reverse) */
  direction: 1 | -1
  /** whose turn it is (index into players) */
  turn: number
  pending: CardPending | null
  /** her answers only (computer players don't answer real questions) */
  answered: number
  correct: number
  bySubject: Record<string, SubjectTally>
  /** never the same question twice in one game */
  usedQuestionIds: string[]
  /** cards she had to draw because of wrong answers */
  drawnForMistakes: number
  /** null = no winner (still playing, or a tie when the cards ran out) */
  winner: number | null
  finished: boolean
  /** why it ended: someone emptied their hand, or there was nothing left to draw */
  endReason: 'emptied' | 'outOfCards' | null
  log: CardEvent[]
  startedAt: string
}

/** Made-up names for the computer players. */
export const BOT_NAMES = ['Joy D.', 'Rafa M.', 'Kat S.'] as const

/**
 * Shuffle, deal 7 to everyone, and turn over the first card. The first card is always a number card
 * (an action card or Wild at the start would need special rules). She goes first.
 */
export function newCardGame(random: RandomFn = Math.random, now: Date = new Date(), botNames: readonly string[] = BOT_NAMES): CardGame {
  const drawPile = shuffle(buildDeck(), random)
  const players: CardPlayer[] = [{ name: 'You', isHuman: true, hand: [] }, ...botNames.map((name) => ({ name, isHuman: false, hand: [] as Card[] }))]

  // Deal one card at a time around the table, like a real deal.
  for (let round = 0; round < HAND_SIZE; round++) {
    for (const player of players) player.hand.push(drawPile.pop()!)
  }

  // The top-most number card in the pile starts the discard pile.
  const firstIndex = drawPile.findLastIndex((card) => card.kind === 'number')
  const [first] = drawPile.splice(firstIndex, 1)

  return {
    players,
    drawPile,
    discard: [first],
    subject: (first as Extract<Card, { kind: 'number' }>).subject,
    direction: 1,
    turn: 0,
    pending: null,
    answered: 0,
    correct: 0,
    bySubject: {},
    usedQuestionIds: [],
    drawnForMistakes: 0,
    winner: null,
    finished: false,
    endReason: null,
    log: [],
    startedAt: now.toISOString(),
  }
}

/** The card on top of the discard pile. */
export function topCard(game: CardGame): Card {
  return game.discard[game.discard.length - 1]
}

/**
 * Can this card go on the pile? Yes if it's a Wild, the same subject, the same number,
 * or the same action (Skip on Skip). On a Wild only the subject that was picked counts.
 */
export function canPlay(card: Card, game: CardGame): boolean {
  if (card.kind === 'wild') return true
  if (card.subject === game.subject) return true
  const top = topCard(game)
  if (top.kind === 'wild') return false
  if (card.kind === 'number') return top.kind === 'number' && top.number === card.number
  return top.kind === card.kind
}

/** The cards in this player's hand that can go on the pile now. */
export function playableCards(game: CardGame, playerIndex: number): Card[] {
  return game.players[playerIndex].hand.filter((card) => canPlay(card, game))
}

/** The player after `from` in the current direction, `steps` seats along. */
export function nextPlayer(game: CardGame, from: number, steps = 1): number {
  const count = game.players.length
  return (((from + game.direction * steps) % count) + count) % count
}

/** Every player, fewest cards first (for the finish screen). Equal hands keep seat order. */
export function ranking(game: CardGame): number[] {
  return game.players.map((_, i) => i).sort((a, b) => game.players[a].hand.length - game.players[b].hand.length)
}

/** True when it's her turn and nothing is waiting, so she may tap a card (or draw, if nothing fits). */
export function isHerMove(game: CardGame): boolean {
  return !game.finished && game.turn === 0 && game.pending === null
}

/**
 * Which question her turn needs right now:
 * - a subject: the card's subject (or the Draw 2's)
 * - 'weakest': a Wild; the screen picks from her weakest topic (same pick as the Board Review snake)
 * - null: no question is waiting
 */
export function questionNeeded(game: CardGame): { kind: 'subject'; subject: CardSubject } | { kind: 'weakest' } | null {
  const pending = game.pending
  if (pending === null || game.finished) return null
  if (pending.kind === 'draw2') return { kind: 'subject', subject: pending.subject }
  if (pending.kind !== 'play') return null
  const card = findCard(game.players[0].hand, pending.cardId)
  if (!card) return null
  return card.kind === 'wild' ? { kind: 'weakest' } : { kind: 'subject', subject: card.subject }
}

// ---------- Her turn ----------

export type CardAnswer = { questionId: string; subjectCode: string; isCorrect: boolean }

/**
 * She picked a card and tapped "Answer to play": the question for it comes up.
 * Ignored (game returned unchanged) if it isn't her move or the card can't be played.
 * After drawing, only the drawn card may be played.
 */
export function startPlay(game: CardGame, cardId: string): CardGame {
  if (game.finished || game.turn !== 0) return game
  if (game.pending !== null && !(game.pending.kind === 'drawn' && game.pending.cardId === cardId)) return game
  const card = findCard(game.players[0].hand, cardId)
  if (!card || !canPlay(card, game)) return game
  return { ...game, pending: { kind: 'play', cardId } }
}

/**
 * Her answer to the "play this card" question.
 * Right → the card goes down and its action happens (a Wild then waits for her to pick a subject).
 * Wrong → the card stays in her hand, she draws 1, and her turn ends.
 */
export function answerPlay(game: CardGame, answer: CardAnswer, random: RandomFn = Math.random): CardGame {
  const pending = game.pending
  if (game.finished || game.turn !== 0 || pending?.kind !== 'play') return game
  const card = findCard(game.players[0].hand, pending.cardId)
  if (!card) return game

  const g = tallyAnswer(copyGame(game), answer)
  g.pending = null

  if (!answer.isCorrect) {
    addEvent(g, { player: 0, kind: 'miss', cardId: card.id })
    g.drawnForMistakes += drawCards(g, 0, 1, random)
    if (!g.finished) g.turn = nextPlayer(g, 0)
    return g
  }

  putDown(g, 0, card)
  if (g.finished) return g
  if (card.kind === 'wild') {
    g.pending = { kind: 'chooseSubject' }
    return g
  }
  applyAction(g, 0, card, random)
  return g
}

/** After a right Wild: she picks the subject everyone has to match next. */
export function chooseSubject(game: CardGame, subject: CardSubject): CardGame {
  if (game.finished || game.turn !== 0 || game.pending?.kind !== 'chooseSubject') return game
  const g = copyGame(game)
  g.pending = null
  g.subject = subject
  addEvent(g, { player: 0, kind: 'choose', subject })
  g.turn = nextPlayer(g, 0)
  return g
}

/**
 * She has nothing that fits, so she draws 1. If the drawn card fits she may play it (with a question) or pass;
 * if not, her turn ends. Ignored while she still has a card she can play: she has to try it
 * (a wrong answer costs the same 1 card, and she learns something).
 */
export function drawForTurn(game: CardGame, random: RandomFn = Math.random): CardGame {
  if (!isHerMove(game) || playableCards(game, 0).length > 0) return game
  const g = copyGame(game)
  const drawn = drawCards(g, 0, 1, random)
  if (g.finished) return g
  const card = g.players[0].hand[g.players[0].hand.length - 1]
  if (drawn === 1 && canPlay(card, g)) {
    g.pending = { kind: 'drawn', cardId: card.id }
  } else {
    addEvent(g, { player: 0, kind: 'pass' })
    g.turn = nextPlayer(g, 0)
  }
  return g
}

/** She drew a card that fits but keeps it. */
export function passDrawn(game: CardGame): CardGame {
  if (game.finished || game.turn !== 0 || game.pending?.kind !== 'drawn') return game
  const g = copyGame(game)
  g.pending = null
  addEvent(g, { player: 0, kind: 'pass' })
  g.turn = nextPlayer(g, 0)
  return g
}

/**
 * One of the questions after a Draw 2 was played on her. Wrong → draw 1. After the last one
 * her turn is skipped (as usual for a Draw 2) and the next player goes.
 */
export function answerDraw2(game: CardGame, answer: CardAnswer, random: RandomFn = Math.random): CardGame {
  const pending = game.pending
  if (game.finished || game.turn !== 0 || pending?.kind !== 'draw2') return game
  const g = tallyAnswer(copyGame(game), answer)
  if (!answer.isCorrect) g.drawnForMistakes += drawCards(g, 0, 1, random)
  if (g.finished) return g
  const left = pending.left - 1
  if (left > 0) {
    g.pending = { kind: 'draw2', subject: pending.subject, left }
  } else {
    g.pending = null
    g.turn = nextPlayer(g, 0)
  }
  return g
}

// ---------- Computer players ----------

/**
 * A whole turn for the computer player whose turn it is. Plan:
 * play a fitting action card first, else a fitting number, a Wild last. It "answers" right with
 * `chance`; wrong → the card stays and it draws 1. Nothing fits → draw 1 and try that card if it fits.
 * A Wild picks the subject it holds the most of.
 */
export function botTurn(game: CardGame, random: RandomFn = Math.random, chance = BOT_CORRECT_CHANCE): CardGame {
  if (game.finished || game.players[game.turn].isHuman) return game
  const g = copyGame(game)
  const me = g.turn

  let card = botChoice(g, me)
  if (!card) {
    drawCards(g, me, 1, random)
    if (g.finished) return g
    const drawn = g.players[me].hand[g.players[me].hand.length - 1]
    if (drawn && canPlay(drawn, g)) card = drawn
    else {
      addEvent(g, { player: me, kind: 'pass' })
      g.turn = nextPlayer(g, me)
      return g
    }
  }

  if (random() >= chance) {
    addEvent(g, { player: me, kind: 'miss', cardId: card.id })
    drawCards(g, me, 1, random)
    if (!g.finished) g.turn = nextPlayer(g, me)
    return g
  }

  putDown(g, me, card)
  if (g.finished) return g
  if (card.kind === 'wild') {
    g.subject = botFavoriteSubject(g.players[me].hand, g.subject)
    addEvent(g, { player: me, kind: 'choose', subject: g.subject })
    g.turn = nextPlayer(g, me)
    return g
  }
  applyAction(g, me, card, random, chance)
  return g
}

/** The card a computer player would play: a fitting action card, else a fitting number, else a Wild, else none. */
export function botChoice(game: CardGame, playerIndex: number): Card | null {
  const fits = playableCards(game, playerIndex)
  return (
    fits.find((c) => c.kind === 'skip' || c.kind === 'reverse' || c.kind === 'draw2') ??
    fits.find((c) => c.kind === 'number') ??
    fits.find((c) => c.kind === 'wild') ??
    null
  )
}

/** The subject a hand holds the most of (ties: the earlier one in exam order; only Wilds left: keep `current`). */
export function botFavoriteSubject(hand: readonly Card[], current: CardSubject): CardSubject {
  let best: CardSubject = current
  let bestCount = 0
  for (const subject of CARD_SUBJECTS) {
    const count = hand.filter((c) => c.kind !== 'wild' && c.subject === subject).length
    if (count > bestCount) {
      best = subject
      bestCount = count
    }
  }
  return best
}

// ---------- Helpers (they edit the copy they're given) ----------

function copyGame(game: CardGame): CardGame {
  return structuredClone(game)
}

function findCard(hand: readonly Card[], cardId: string): Card | undefined {
  return hand.find((c) => c.id === cardId)
}

function addEvent(g: CardGame, event: CardEvent) {
  g.log = [...g.log, event].slice(-EVENT_LOG_SIZE)
}

function tallyAnswer(g: CardGame, { questionId, subjectCode, isCorrect }: CardAnswer): CardGame {
  const tally = g.bySubject[subjectCode] ?? { answered: 0, correct: 0 }
  g.bySubject = { ...g.bySubject, [subjectCode]: { answered: tally.answered + 1, correct: tally.correct + (isCorrect ? 1 : 0) } }
  g.answered += 1
  if (isCorrect) g.correct += 1
  if (!g.usedQuestionIds.includes(questionId)) g.usedQuestionIds = [...g.usedQuestionIds, questionId]
  return g
}

/** Moves the card from the hand to the pile. An empty hand wins at once (an action on the last card doesn't happen). */
function putDown(g: CardGame, playerIndex: number, card: Card) {
  const hand = g.players[playerIndex].hand
  hand.splice(hand.findIndex((c) => c.id === card.id), 1)
  g.discard.push(card)
  if (card.kind !== 'wild') g.subject = card.subject
  addEvent(g, { player: playerIndex, kind: 'play', cardId: card.id })
  if (hand.length === 0) {
    g.winner = playerIndex
    g.finished = true
    g.endReason = 'emptied'
    g.pending = null
  }
}

/** What a number or action card does after it goes down, and whose turn is next. */
function applyAction(g: CardGame, playerIndex: number, card: Card, random: RandomFn, botChance = BOT_CORRECT_CHANCE) {
  if (card.kind === 'skip') {
    g.turn = nextPlayer(g, playerIndex, 2)
  } else if (card.kind === 'reverse') {
    g.direction = g.direction === 1 ? -1 : 1
    g.turn = nextPlayer(g, playerIndex)
  } else if (card.kind === 'draw2') {
    const target = nextPlayer(g, playerIndex)
    if (g.players[target].isHuman) {
      // She answers the questions on her turn; it's skipped after them (answerDraw2).
      g.turn = target
      g.pending = { kind: 'draw2', subject: card.subject, left: DRAW2_QUESTIONS }
    } else {
      // A computer player "answers" both right away, draws 1 per miss, and loses its turn.
      let misses = 0
      for (let i = 0; i < DRAW2_QUESTIONS; i++) if (random() >= botChance) misses++
      drawCards(g, target, misses, random)
      if (!g.finished) g.turn = nextPlayer(g, target)
    }
  } else {
    g.turn = nextPlayer(g, playerIndex)
  }
}

/**
 * Gives a player `count` cards from the draw pile. When the pile runs out, the discard pile (except its top card)
 * is shuffled into a new draw pile. If there is still nothing to draw, the game ends: fewest cards wins, a tie if equal.
 * Returns how many cards were really drawn.
 */
function drawCards(g: CardGame, playerIndex: number, count: number, random: RandomFn): number {
  let drawn = 0
  for (let i = 0; i < count; i++) {
    if (g.drawPile.length === 0) {
      const top = g.discard.pop()!
      g.drawPile = shuffle(g.discard, random)
      g.discard = [top]
    }
    const card = g.drawPile.pop()
    if (!card) {
      endOutOfCards(g)
      break
    }
    g.players[playerIndex].hand.push(card)
    drawn++
  }
  if (drawn > 0) addEvent(g, { player: playerIndex, kind: 'draw', count: drawn })
  return drawn
}

function endOutOfCards(g: CardGame) {
  const sizes = g.players.map((p) => p.hand.length)
  const fewest = Math.min(...sizes)
  const leaders = sizes.filter((n) => n === fewest).length
  g.winner = leaders === 1 ? sizes.indexOf(fewest) : null
  g.finished = true
  g.endReason = 'outOfCards'
  g.pending = null
}
