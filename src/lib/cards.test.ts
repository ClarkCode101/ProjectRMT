import { describe, expect, it } from 'vitest'
import {
  answerDraw2,
  answerPlay,
  botChoice,
  botFavoriteSubject,
  botTurn,
  buildDeck,
  canPlay,
  CARD_SUBJECTS,
  cardLabel,
  chooseSubject,
  describeEvent,
  describeMove,
  drawForTurn,
  isHerMove,
  newCardGame,
  nextPlayer,
  passDrawn,
  playableCards,
  questionNeeded,
  ranking,
  startPlay,
  topCard,
  type Card,
  type CardGame,
  type CardSubject,
} from './cards'

// ---------- helpers ----------

/** A small repeatable random (mulberry32), so a "random" game is the same every run. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const always = (value: number) => () => value
/** For computer players: 0 = always "answers" right, 0.99 = always wrong. */
const botRight = always(0)
const botWrong = always(0.99)

const num = (subject: CardSubject, number: number): Card => ({ id: `${subject}-${number}`, kind: 'number', subject, number })
const act = (subject: CardSubject, kind: 'skip' | 'reverse' | 'draw2'): Card => ({ id: `${subject}-${kind}`, kind, subject })
const wild = (n = 1): Card => ({ id: `wild-${n}`, kind: 'wild' })

/** A hand-made table: her hand, the bots' hands, the top card, and the draw pile (top = last). */
function table({
  hands,
  top = num('HEMA', 7),
  drawPile = [num('CC', 1), num('CC', 2), num('CC', 3), num('CC', 4), num('CC', 5)],
  turn = 0,
}: {
  hands: Card[][]
  top?: Card
  drawPile?: Card[]
  turn?: number
}): CardGame {
  const base = newCardGame(seeded(1), new Date('2026-11-12T08:00:00Z'))
  return {
    ...base,
    players: hands.map((hand, i) => ({ name: i === 0 ? 'You' : `Bot ${i}`, isHuman: i === 0, hand })),
    drawPile,
    discard: [top],
    subject: top.kind === 'wild' ? 'CC' : top.subject,
    turn,
  }
}
const right = (questionId = 'q1', subjectCode = 'HEMA') => ({ questionId, subjectCode, isCorrect: true })
const wrong = (questionId = 'q1', subjectCode = 'HEMA') => ({ questionId, subjectCode, isCorrect: false })
const filler = () => [num('BBIS', 1), num('BBIS', 2), num('BBIS', 3)]
const totalCards = (g: CardGame) => g.drawPile.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length, 0)

// ---------- deck ----------

describe('buildDeck', () => {
  const deck = buildDeck()

  it('has 78 cards with unique ids', () => {
    expect(deck).toHaveLength(78)
    expect(new Set(deck.map((c) => c.id)).size).toBe(78)
  })

  it('has 12 cards per subject (1–9, Skip, Reverse, Draw 2) and 6 Wilds', () => {
    for (const subject of CARD_SUBJECTS) {
      const mine = deck.filter((c) => c.kind !== 'wild' && c.subject === subject)
      expect(mine).toHaveLength(12)
      expect(mine.filter((c) => c.kind === 'number').map((c) => (c.kind === 'number' ? c.number : 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    }
    expect(deck.filter((c) => c.kind === 'wild')).toHaveLength(6)
  })
})

describe('cardLabel', () => {
  it('names numbers, actions and Wilds', () => {
    expect(cardLabel(num('HEMA', 7))).toBe('HEMA 7')
    expect(cardLabel(act('CC', 'skip'))).toBe('CC Skip')
    expect(cardLabel(act('CM', 'draw2'))).toBe('CM Draw 2')
    expect(cardLabel(wild())).toBe('Wild')
  })
})

describe('describeEvent', () => {
  const players = [
    { name: 'You', isHuman: true },
    { name: 'Rafa M.', isHuman: false },
  ]
  it('says what happened in one line', () => {
    expect(describeEvent({ player: 1, kind: 'play', cardId: 'HEMA-3' }, players)).toBe('Rafa M. played HEMA 3')
    expect(describeEvent({ player: 0, kind: 'play', cardId: 'wild-2' }, players)).toBe('You played Wild')
    expect(describeEvent({ player: 1, kind: 'miss', cardId: 'CC-skip' }, players)).toBe('Rafa M. missed the question for CC Skip')
    expect(describeEvent({ player: 0, kind: 'draw', count: 2 }, players)).toBe('You drew 2')
    expect(describeEvent({ player: 1, kind: 'pass' }, players)).toBe('Rafa M. passed')
    expect(describeEvent({ player: 1, kind: 'choose', subject: 'CM' }, players)).toBe('Rafa M. picked CM')
    expect(describeEvent({ player: 1, kind: 'skipped' }, players)).toBe('Rafa M. is skipped')
    expect(describeEvent({ player: 0, kind: 'skipped' }, players)).toBe('Your turn is skipped')
    expect(describeEvent({ player: 0, kind: 'reverse', next: 1 }, players)).toBe('Direction flipped · Rafa M. goes next')
    expect(describeEvent({ player: 1, kind: 'reverse', next: 0 }, players)).toBe('Direction flipped · your turn')
  })
})

describe('describeMove (the line at the top of the table)', () => {
  const g4 = () => table({ hands: [[num('HEMA', 1), num('CC', 2)], filler(), filler(), filler()] })
  const line = (g: CardGame) => describeMove(g.log, g.players)

  it('is empty before anything happened', () => {
    expect(describeMove([], [])).toBeNull()
  })

  it('her Skip says who is skipped', () => {
    const g = { ...g4(), players: g4().players.map((p, i) => (i === 0 ? { ...p, hand: [act('HEMA', 'skip'), num('CC', 2)] } : p)) }
    expect(line(answerPlay(startPlay(g, 'HEMA-skip'), right()))).toBe('You played HEMA Skip · Bot 1 is skipped')
  })

  it("a computer player's Skip on her says her turn is skipped", () => {
    const g = table({ hands: [filler(), filler(), filler(), [act('HEMA', 'skip'), num('CC', 1)]], turn: 3 })
    const next = botTurn(g, botRight)
    expect(line(next)).toBe('Bot 3 played HEMA Skip · Your turn is skipped')
    expect(next.turn).toBe(1)
  })

  it('Reverse says who goes next', () => {
    const g = table({ hands: [[act('HEMA', 'reverse'), num('CC', 2)], filler(), filler(), filler()] })
    expect(line(answerPlay(startPlay(g, 'HEMA-reverse'), right()))).toBe('You played HEMA Reverse · Direction flipped · Bot 3 goes next')
  })

  it('her Draw 2 on a computer player: what it drew, and that it is skipped', () => {
    const g = table({ hands: [[act('HEMA', 'draw2'), num('CC', 2)], filler(), filler(), filler()] })
    const played = answerPlay(startPlay(g, 'HEMA-draw2'), right())
    expect(line(answerPlay(startPlay(g, 'HEMA-draw2'), right(), botWrong))).toBe('You played HEMA Draw 2 · Bot 1 drew 2 and is skipped')
    expect(line(answerPlay(startPlay(g, 'HEMA-draw2'), right(), botRight))).toBe('You played HEMA Draw 2 · Bot 1 is skipped')
    expect(played.turn).toBe(2)
  })

  it('after her Draw 2 questions: what she drew, and that her turn is skipped', () => {
    const hit: CardGame = { ...table({ hands: [[num('CC', 9)], filler(), filler(), filler()], top: act('MICRO', 'draw2') }), pending: { kind: 'draw2', subject: 'MICRO', left: 1 } }
    expect(line(answerDraw2(hit, wrong('q1', 'MICRO')))).toBe('You drew 1, and your turn is skipped')
    expect(line(answerDraw2(hit, right('q1', 'MICRO')))).toBe('Your turn is skipped')
  })

  it('only shows the latest move, not the ones before it', () => {
    const g = startPlay(g4(), 'HEMA-1')
    const afterHer = answerPlay(g, right())
    const afterBot = botTurn(afterHer, botWrong)
    expect(line(afterBot)).toMatch(/^Bot 1 /)
    expect(line(afterBot)).not.toContain('You played')
  })
})

// ---------- a new game ----------

describe('newCardGame', () => {
  const game = newCardGame(seeded(42), new Date('2026-11-12T08:00:00Z'))

  it('deals 7 cards to her and 3 computer players, and keeps all 78 cards', () => {
    expect(game.players.map((p) => p.hand.length)).toEqual([7, 7, 7, 7])
    expect(game.players.map((p) => p.isHuman)).toEqual([true, false, false, false])
    expect(totalCards(game)).toBe(78)
  })

  it('starts with a number card, its subject to match, and her turn', () => {
    const top = topCard(game)
    expect(top.kind).toBe('number')
    expect(top.kind !== 'wild' && top.subject).toBe(game.subject)
    expect(game.turn).toBe(0)
    expect(game.direction).toBe(1)
    expect(isHerMove(game)).toBe(true)
    expect(game.startedAt).toBe('2026-11-12T08:00:00.000Z')
  })

  it('is the same deal for the same random', () => {
    expect(newCardGame(seeded(42), new Date(0)).players).toEqual(newCardGame(seeded(42), new Date(0)).players)
  })
})

// ---------- matching ----------

describe('canPlay', () => {
  const g = table({ hands: [[], [], [], []], top: num('HEMA', 7) })

  it('fits the same subject, the same number, or a Wild', () => {
    expect(canPlay(num('HEMA', 2), g)).toBe(true)
    expect(canPlay(act('HEMA', 'skip'), g)).toBe(true)
    expect(canPlay(num('CC', 7), g)).toBe(true)
    expect(canPlay(wild(), g)).toBe(true)
  })

  it("doesn't fit another subject and number", () => {
    expect(canPlay(num('CC', 2), g)).toBe(false)
    expect(canPlay(act('CC', 'skip'), g)).toBe(false)
  })

  it('fits the same action on an action card', () => {
    const onSkip = table({ hands: [[], [], [], []], top: act('MICRO', 'skip') })
    expect(canPlay(act('CC', 'skip'), onSkip)).toBe(true)
    expect(canPlay(act('CC', 'reverse'), onSkip)).toBe(false)
    expect(canPlay(num('CC', 7), onSkip)).toBe(false)
  })

  it('on a Wild, only the picked subject (or another Wild) fits', () => {
    const onWild = { ...table({ hands: [[], [], [], []], top: wild() }), subject: 'BBIS' as const }
    expect(canPlay(num('BBIS', 4), onWild)).toBe(true)
    expect(canPlay(num('CC', 4), onWild)).toBe(false)
    expect(canPlay(wild(2), onWild)).toBe(true)
  })
})

describe('nextPlayer', () => {
  const g = table({ hands: [[], [], [], []] })
  it('goes around the table and wraps', () => {
    expect(nextPlayer(g, 0)).toBe(1)
    expect(nextPlayer(g, 3)).toBe(0)
    expect(nextPlayer(g, 2, 2)).toBe(0)
  })
  it('goes the other way after a Reverse', () => {
    const back = { ...g, direction: -1 as const }
    expect(nextPlayer(back, 0)).toBe(3)
    expect(nextPlayer(back, 1, 2)).toBe(3)
  })
})

// ---------- her turn ----------

describe('startPlay', () => {
  const g = table({ hands: [[num('HEMA', 3), num('CC', 2)], filler(), filler(), filler()] })

  it('opens the question for a card that fits', () => {
    const next = startPlay(g, 'HEMA-3')
    expect(next.pending).toEqual({ kind: 'play', cardId: 'HEMA-3' })
    expect(questionNeeded(next)).toEqual({ kind: 'subject', subject: 'HEMA' })
  })

  it("ignores a card that doesn't fit, a card she doesn't have, and other players' turns", () => {
    expect(startPlay(g, 'CC-2')).toBe(g)
    expect(startPlay(g, 'MICRO-9')).toBe(g)
    expect(startPlay({ ...g, turn: 1 }, 'HEMA-3').pending).toBeNull()
  })

  it('a Wild asks for a question from her weakest topic', () => {
    const w = table({ hands: [[wild(), num('CC', 2)], filler(), filler(), filler()] })
    expect(questionNeeded(startPlay(w, 'wild-1'))).toEqual({ kind: 'weakest' })
  })
})

describe('answerPlay', () => {
  const g = startPlay(table({ hands: [[num('HEMA', 3), num('CC', 2)], filler(), filler(), filler()] }), 'HEMA-3')

  it('right: the card goes down, the next player goes, and the answer is counted', () => {
    const next = answerPlay(g, right('q9', 'HEMA'))
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['CC-2'])
    expect(topCard(next).id).toBe('HEMA-3')
    expect(next.turn).toBe(1)
    expect(next.pending).toBeNull()
    expect(next).toMatchObject({ answered: 1, correct: 1, usedQuestionIds: ['q9'], bySubject: { HEMA: { answered: 1, correct: 1 } } })
    expect(next.log.at(-1)).toMatchObject({ player: 0, kind: 'play', cardId: 'HEMA-3' })
  })

  it("wrong: the card stays, she draws 1, and her turn ends", () => {
    const next = answerPlay(g, wrong())
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['HEMA-3', 'CC-2', 'CC-5'])
    expect(topCard(next).id).toBe('HEMA-7')
    expect(next.turn).toBe(1)
    expect(next).toMatchObject({ answered: 1, correct: 0, drawnForMistakes: 1 })
  })

  it("doesn't change the game it was given", () => {
    const before = structuredClone(g)
    answerPlay(g, right())
    expect(g).toEqual(before)
  })

  it('a number card changes the subject to match', () => {
    const cc = startPlay(table({ hands: [[num('CC', 7), num('CC', 2)], filler(), filler(), filler()] }), 'CC-7')
    expect(answerPlay(cc, right('q1', 'CC')).subject).toBe('CC')
  })
})

describe('action cards she plays', () => {
  const hand = (card: Card) => [card, num('CC', 2)]

  it('Skip: the next player loses their turn', () => {
    const g = startPlay(table({ hands: [hand(act('HEMA', 'skip')), filler(), filler(), filler()] }), 'HEMA-skip')
    expect(answerPlay(g, right()).turn).toBe(2)
  })

  it('Reverse: the direction flips, so the player on the other side goes', () => {
    const g = startPlay(table({ hands: [hand(act('HEMA', 'reverse')), filler(), filler(), filler()] }), 'HEMA-reverse')
    const next = answerPlay(g, right())
    expect(next.direction).toBe(-1)
    expect(next.turn).toBe(3)
  })

  it('Draw 2: the computer player draws 1 per miss and loses its turn', () => {
    const g = startPlay(table({ hands: [hand(act('HEMA', 'draw2')), filler(), filler(), filler()] }), 'HEMA-draw2')
    const missesBoth = answerPlay(g, right(), botWrong)
    expect(missesBoth.players[1].hand).toHaveLength(5)
    expect(missesBoth.turn).toBe(2)
    const getsBoth = answerPlay(g, right(), botRight)
    expect(getsBoth.players[1].hand).toHaveLength(3)
    expect(getsBoth.turn).toBe(2)
  })

  it('Wild: she picks the next subject, then the next player goes', () => {
    const g = startPlay(table({ hands: [hand(wild()), filler(), filler(), filler()] }), 'wild-1')
    const picking = answerPlay(g, right('q1', 'MICRO'))
    expect(picking.pending).toEqual({ kind: 'chooseSubject' })
    expect(picking.turn).toBe(0)
    const picked = chooseSubject(picking, 'CM')
    expect(picked.subject).toBe('CM')
    expect(picked.turn).toBe(1)
    expect(picked.pending).toBeNull()
  })
})

describe('winning', () => {
  it('her last card, answered right, wins at once', () => {
    const g = startPlay(table({ hands: [[num('HEMA', 3)], filler(), filler(), filler()] }), 'HEMA-3')
    const won = answerPlay(g, right())
    expect(won).toMatchObject({ finished: true, winner: 0, endReason: 'emptied', pending: null })
    expect(isHerMove(won)).toBe(false)
  })

  it('her last card, answered wrong, keeps the game going', () => {
    const g = startPlay(table({ hands: [[num('HEMA', 3)], filler(), filler(), filler()] }), 'HEMA-3')
    const next = answerPlay(g, wrong())
    expect(next.finished).toBe(false)
    expect(next.players[0].hand).toHaveLength(2)
  })

  it("an action card as the last card ends the game; its action doesn't happen", () => {
    const g = startPlay(table({ hands: [[act('HEMA', 'draw2')], filler(), filler(), filler()] }), 'HEMA-draw2')
    const won = answerPlay(g, right(), botWrong)
    expect(won.winner).toBe(0)
    expect(won.players[1].hand).toHaveLength(3)
  })

  it('a Wild as the last card wins without picking a subject', () => {
    const g = startPlay(table({ hands: [[wild()], filler(), filler(), filler()] }), 'wild-1')
    expect(answerPlay(g, right())).toMatchObject({ finished: true, winner: 0, pending: null })
  })

  it('a computer player can win too', () => {
    const g = table({ hands: [filler(), [num('HEMA', 1)], filler(), filler()], turn: 1 })
    expect(botTurn(g, botRight)).toMatchObject({ finished: true, winner: 1 })
  })

  it('ranking lists everyone, fewest cards first', () => {
    const g = table({ hands: [[num('CC', 1), num('CC', 2)], [num('CC', 3)], filler(), [num('CC', 4), num('CC', 6)]] })
    expect(ranking(g)).toEqual([1, 0, 3, 2])
  })
})

describe('drawing on her turn', () => {
  it("isn't allowed while a card in her hand fits", () => {
    const g = table({ hands: [[num('HEMA', 3)], filler(), filler(), filler()] })
    expect(drawForTurn(g)).toBe(g)
  })

  it("nothing fits and the drawn card doesn't fit either: the turn passes", () => {
    const g = table({ hands: [[num('CC', 9)], filler(), filler(), filler()], drawPile: [num('MICRO', 1)] })
    const next = drawForTurn(g)
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['CC-9', 'MICRO-1'])
    expect(next.turn).toBe(1)
    expect(next.drawnForMistakes).toBe(0)
  })

  it('the drawn card fits: she may play only that card, or pass', () => {
    const g = table({ hands: [[num('CC', 9)], filler(), filler(), filler()], drawPile: [num('HEMA', 1)] })
    const drew = drawForTurn(g)
    expect(drew.pending).toEqual({ kind: 'drawn', cardId: 'HEMA-1' })
    expect(drew.turn).toBe(0)
    expect(startPlay(drew, 'CC-9')).toBe(drew)
    expect(startPlay(drew, 'HEMA-1').pending).toEqual({ kind: 'play', cardId: 'HEMA-1' })
    const passed = passDrawn(drew)
    expect(passed.turn).toBe(1)
    expect(passed.pending).toBeNull()
  })

  it('shuffles the pile (except its top card) back in when the draw pile is empty', () => {
    const g = { ...table({ hands: [[num('CC', 9)], filler(), filler(), filler()], drawPile: [] }), discard: [num('MICRO', 5), num('HEMA', 7)] }
    const next = drawForTurn(g)
    expect(next.players[0].hand.map((c) => c.id)).toEqual(['CC-9', 'MICRO-5'])
    expect(next.discard.map((c) => c.id)).toEqual(['HEMA-7'])
  })

  it('nothing left to draw at all: the game ends, fewest cards wins', () => {
    const g = table({ hands: [[num('CC', 9), num('CC', 8)], [num('CM', 1)], filler(), filler()], drawPile: [] })
    expect(drawForTurn(g)).toMatchObject({ finished: true, winner: 1, endReason: 'outOfCards' })
  })

  it('nothing left to draw and two players tie for fewest: no winner', () => {
    const g = table({ hands: [[num('CC', 9)], [num('CM', 1)], filler(), filler()], drawPile: [] })
    expect(drawForTurn(g)).toMatchObject({ finished: true, winner: null, endReason: 'outOfCards' })
  })
})

describe('a Draw 2 played on her', () => {
  const hit = (): CardGame => ({
    ...table({ hands: [[num('CC', 9)], filler(), filler(), filler()], top: act('MICRO', 'draw2') }),
    pending: { kind: 'draw2', subject: 'MICRO', left: 2 },
  })

  it('asks 2 questions from that subject, draws 1 per wrong one, then skips her turn', () => {
    const g = hit()
    expect(questionNeeded(g)).toEqual({ kind: 'subject', subject: 'MICRO' })
    const first = answerDraw2(g, wrong('q1', 'MICRO'))
    expect(first.pending).toEqual({ kind: 'draw2', subject: 'MICRO', left: 1 })
    expect(first.turn).toBe(0)
    const second = answerDraw2(first, right('q2', 'MICRO'))
    expect(second.pending).toBeNull()
    expect(second.turn).toBe(1)
    expect(second.players[0].hand).toHaveLength(2)
    expect(second).toMatchObject({ answered: 2, correct: 1, drawnForMistakes: 1 })
  })

  it('comes from a computer player playing Draw 2 on her', () => {
    const g = table({ hands: [filler(), filler(), filler(), [act('HEMA', 'draw2'), num('CC', 1)]], turn: 3 })
    const next = botTurn(g, botRight)
    expect(next.turn).toBe(0)
    expect(next.pending).toEqual({ kind: 'draw2', subject: 'HEMA', left: 2 })
  })
})

// ---------- computer players ----------

describe('computer players', () => {
  it('pick a fitting action card first, then a number, a Wild last', () => {
    const g = table({ hands: [[], [num('HEMA', 2), wild(), act('HEMA', 'skip')], [], []] })
    expect(botChoice(g, 1)?.id).toBe('HEMA-skip')
    const noAction = table({ hands: [[], [wild(), num('CC', 7)], [], []] })
    expect(botChoice(noAction, 1)?.id).toBe('CC-7')
    const onlyWild = table({ hands: [[], [num('CC', 1), wild()], [], []] })
    expect(botChoice(onlyWild, 1)?.id).toBe('wild-1')
  })

  it('a right "answer" plays the card; a wrong one draws 1', () => {
    const g = table({ hands: [filler(), [num('HEMA', 2), num('CC', 1)], filler(), filler()], turn: 1 })
    const played = botTurn(g, botRight)
    expect(played.players[1].hand.map((c) => c.id)).toEqual(['CC-1'])
    expect(played.turn).toBe(2)
    const missed = botTurn(g, botWrong)
    expect(missed.players[1].hand).toHaveLength(3)
    expect(missed.log.at(-2)).toMatchObject({ player: 1, kind: 'miss', cardId: 'HEMA-2' })
    expect(missed.turn).toBe(2)
  })

  it('nothing fits: draws 1 and passes if that card doesn\'t fit', () => {
    const g = table({ hands: [filler(), [num('CC', 1)], filler(), filler()], turn: 1, drawPile: [num('MICRO', 9)] })
    const next = botTurn(g, botRight)
    expect(next.players[1].hand).toHaveLength(2)
    expect(next.turn).toBe(2)
  })

  it('a Wild picks the subject it holds the most of', () => {
    expect(botFavoriteSubject([num('CC', 1), num('CM', 2), num('CM', 3), wild()], 'HEMA')).toBe('CM')
    expect(botFavoriteSubject([wild()], 'HEMA')).toBe('HEMA')
    const g = table({ hands: [filler(), [wild(), num('CM', 1), num('CM', 2)], filler(), filler()], turn: 1, top: num('MICRO', 7) })
    const next = botTurn(g, botRight)
    expect(next.subject).toBe('CM')
    expect(next.turn).toBe(2)
  })

  it("does nothing on her turn", () => {
    const g = table({ hands: [filler(), filler(), filler(), filler()] })
    expect(botTurn(g)).toBe(g)
  })
})

// ---------- whole games ----------

describe('a whole game', () => {
  /** Plays a full game: she answers right with `herChance`, picks the first card that fits, and picks CC on a Wild. */
  function playOut(seed: number, herChance: number): CardGame {
    const random = seeded(seed)
    let g = newCardGame(random)
    for (let step = 0; step < 5000 && !g.finished; step++) {
      expect(totalCards(g)).toBe(78)
      if (g.turn !== 0) {
        g = botTurn(g, random)
        continue
      }
      const answer = { questionId: `q${step}`, subjectCode: 'CC', isCorrect: random() < herChance }
      const pending = g.pending
      if (pending === null) {
        const fits = playableCards(g, 0)
        g = fits.length > 0 ? startPlay(g, fits[0].id) : drawForTurn(g, random)
      } else if (pending.kind === 'play') g = answerPlay(g, answer, random)
      else if (pending.kind === 'drawn') g = startPlay(g, pending.cardId)
      else if (pending.kind === 'chooseSubject') g = chooseSubject(g, 'CC')
      else g = answerDraw2(g, answer, random)
    }
    return g
  }

  it('always ends, never loses a card, and has a winner', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = playOut(seed, seed % 2 === 0 ? 0.9 : 0.4)
      expect(g.finished).toBe(true)
      expect(totalCards(g)).toBe(78)
      if (g.endReason === 'emptied') expect(g.players[g.winner!].hand).toHaveLength(0)
    }
  })

  it('keeps the event log short', () => {
    expect(playOut(7, 0.6).log.length).toBeLessThanOrEqual(12)
  })
})
