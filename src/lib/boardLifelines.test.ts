import { describe, expect, it } from 'vitest'
import {
  answerQuestion,
  isAssisted,
  lifelineBlock,
  lifelinesLine,
  newGame,
  NO_LIFELINES,
  pickOutcome,
  ruleOutChoices,
  spendLifeline,
  startTurn,
  type BoardGame,
} from './board'
import { parseSavedBoard } from './boardSave'
import { eventLine, parseEvent, parseLifelines, parseLifelinesUsed, parseTeamRoom } from './boardTeam'

// Board Review lifelines (PROJECT_PLAN.md §14, Step 2b; migration 0032).

/** A random function that walks through the given numbers. */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('ruleOutChoices', () => {
  it('takes away two wrong choices out of four, never the right one', () => {
    for (let correct = 0; correct < 4; correct++) {
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const out = ruleOutChoices(4, correct, seq(r, 1 - r))
        expect(out).toHaveLength(2)
        expect(out).not.toContain(correct)
        expect(new Set(out).size).toBe(2)
      }
    }
  })

  it('takes away only one of three, so one wrong choice is left', () => {
    const out = ruleOutChoices(3, 1, seq(0.5))
    expect(out).toHaveLength(1)
    expect(out).not.toContain(1)
  })

  it('takes nothing from a two-choice question', () => {
    expect(ruleOutChoices(2, 0)).toEqual([])
  })

  it('takes two out of five too', () => {
    expect(ruleOutChoices(5, 4, seq(0.1, 0.7, 0.4))).toHaveLength(2)
  })
})

describe('lifelineBlock', () => {
  const base = { used: [], pendingKind: 'move' as const, choiceCount: 4, current: NO_LIFELINES }

  it('lets her use any lifeline once', () => {
    expect(lifelineBlock('rule_out', base)).toBeNull()
    expect(lifelineBlock('second_chance', base)).toBeNull()
    expect(lifelineBlock('rule_out', { ...base, used: ['rule_out'] })).toBe('used')
  })

  it('keeps the Snake shield for a snake’s Rescue question', () => {
    expect(lifelineBlock('shield', base)).toBe('snakes-only')
    expect(lifelineBlock('shield', { ...base, pendingKind: 'ladder' })).toBe('snakes-only')
    expect(lifelineBlock('shield', { ...base, pendingKind: 'snake' })).toBeNull()
  })

  it('needs 3+ choices to rule any out', () => {
    expect(lifelineBlock('rule_out', { ...base, choiceCount: 2 })).toBe('too-few-choices')
  })

  it('locks every lifeline once Second chance has used up her first pick', () => {
    const current = { ...NO_LIFELINES, secondChance: true, firstWrong: 2 }
    expect(lifelineBlock('rule_out', { ...base, current })).toBe('after-pick')
    expect(lifelineBlock('shield', { ...base, pendingKind: 'snake', current })).toBe('after-pick')
  })
})

describe('pickOutcome', () => {
  it('is the final answer with no lifelines', () => {
    expect(pickOutcome(1, 1, NO_LIFELINES)).toBe('final')
    expect(pickOutcome(0, 1, NO_LIFELINES)).toBe('final')
  })

  it('ignores a ruled-out choice and her crossed-out first pick', () => {
    expect(pickOutcome(3, 1, { ...NO_LIFELINES, ruledOut: [0, 3] })).toBe('ignore')
    expect(pickOutcome(2, 1, { ...NO_LIFELINES, secondChance: true, firstWrong: 2 })).toBe('ignore')
  })

  it('gives Second chance one retry on a wrong pick, and only one', () => {
    const on = { ...NO_LIFELINES, secondChance: true }
    expect(pickOutcome(0, 1, on)).toBe('retry')
    expect(pickOutcome(1, 1, on)).toBe('final') // right first time: no retry needed
    expect(pickOutcome(3, 1, { ...on, firstWrong: 0 })).toBe('final') // wrong again: that's her answer
  })
})

describe('isAssisted', () => {
  it('is true when Rule out 2 or Second chance helped, not for the shield alone', () => {
    expect(isAssisted(NO_LIFELINES)).toBe(false)
    expect(isAssisted({ ...NO_LIFELINES, ruledOut: [0, 2] })).toBe(true)
    expect(isAssisted({ ...NO_LIFELINES, secondChance: true })).toBe(true)
    expect(isAssisted({ ...NO_LIFELINES, shield: true })).toBe(false)
  })
})

describe('spendLifeline and the Snake shield in a game', () => {
  const onSnake: BoardGame = { ...newGame(new Date('2026-11-11T08:00:00Z')), position: 16, pending: { kind: 'snake', from: 16, to: 5 } }

  it('starts with none spent and spends each once', () => {
    const game = newGame()
    expect(game.lifelinesUsed).toEqual([])
    const once = spendLifeline(game, 'shield')
    expect(once.lifelinesUsed).toEqual(['shield'])
    expect(spendLifeline(once, 'shield').lifelinesUsed).toEqual(['shield'])
  })

  it('a wrong Rescue with the shield on stays put', () => {
    const next = answerQuestion(onSnake, { questionId: 'q1', subjectCode: 'MICRO', isCorrect: false, shielded: true })
    expect(next.position).toBe(16)
    expect(next.snakesSlid).toBe(0)
    expect(next.snakesEscaped).toBe(0)
    expect(next.pending).toBeNull()
    expect(next.answered).toBe(1)
  })

  it('without the shield it still slides', () => {
    expect(answerQuestion(onSnake, { questionId: 'q1', subjectCode: 'MICRO', isCorrect: false }).position).toBe(5)
  })

  it('the shield does nothing on a move question', () => {
    const game = startTurn(newGame(), 3)
    expect(answerQuestion(game, { questionId: 'q1', subjectCode: 'CC', isCorrect: false, shielded: true }).position).toBe(1)
  })
})

describe('lifelinesLine', () => {
  it('lists them in the popup’s order', () => {
    expect(lifelinesLine([])).toBe('No lifelines used')
    expect(lifelinesLine(['shield', 'rule_out'])).toBe('Lifelines used: Rule out 2, Snake shield')
  })
})

describe('saved games and lifelines', () => {
  const game = newGame(new Date('2026-11-11T08:00:00Z'))

  it('keeps the spent lifelines', () => {
    const raw = JSON.stringify({ version: 1, sessionId: 's1', game: { ...game, lifelinesUsed: ['rule_out'] } })
    expect(parseSavedBoard(raw)?.game.lifelinesUsed).toEqual(['rule_out'])
  })

  it('reads a game saved before lifelines as none spent', () => {
    const { lifelinesUsed: _dropped, ...oldGame } = game
    expect(parseSavedBoard(JSON.stringify({ version: 1, sessionId: 's1', game: oldGame }))?.game.lifelinesUsed).toEqual([])
  })

  it('gives null for an unknown lifeline', () => {
    expect(parseSavedBoard(JSON.stringify({ version: 1, sessionId: 's1', game: { ...game, lifelinesUsed: ['ask_a_friend'] } }))).toBeNull()
  })
})

describe('team games: reading lifelines from the database', () => {
  it('reads the question’s lifelines, and none when missing', () => {
    expect(parseLifelines(undefined)).toEqual(NO_LIFELINES)
    expect(parseLifelines({ q: 'x', rule_out: [0, 3], second_chance: true, first_wrong: 2, shield: false })).toEqual({
      ruledOut: [0, 3],
      secondChance: true,
      firstWrong: 2,
      shield: false,
    })
  })

  it('reads which lifelines a player spent, ignoring unknown ones', () => {
    expect(parseLifelinesUsed(['shield', 'nope', 'rule_out'])).toEqual(['rule_out', 'shield'])
    expect(parseLifelinesUsed(null)).toEqual([])
  })

  it('puts them on the room and its players', () => {
    const room = parseTeamRoom({
      id: 'r1',
      status: 'playing',
      lifelines: { rule_out: [1, 2], second_chance: false, first_wrong: null, shield: false },
      players: [{ user_id: 'u1', name: 'Ana', lifelines_used: ['rule_out'] }],
    })
    expect(room?.lifelines.ruledOut).toEqual([1, 2])
    expect(room?.players[0].lifelinesUsed).toEqual(['rule_out'])
  })

  it('reads an answer’s lifelines, and says when the shield stopped a slide', () => {
    const event = parseEvent({
      kind: 'answer',
      at: '2026-11-11T08:00:00Z',
      user: 'u2',
      name: 'Ana',
      purpose: { kind: 'snake', from: 16, to: 5 },
      question_id: 'q1',
      selected: 1,
      correct_index: 0,
      is_correct: false,
      from: 16,
      to: 16,
      rule_out: [2, 3],
      first_wrong: null,
      shielded: true,
    })
    expect(event?.kind === 'answer' && event.lifelines).toEqual({ ruledOut: [2, 3], secondChance: false, firstWrong: null, shield: true })
    expect(eventLine(event, 'u1')).toBe('Ana’s Snake shield stopped the slide!')
    expect(eventLine(event, 'u2')).toBe('Your Snake shield stopped the slide!')
  })
})
