import { describe, expect, it } from 'vitest'
import {
  answerQuestion,
  BOARD_SIZE,
  challengePool,
  LADDERS,
  moveBy,
  newGame,
  questionSubject,
  rescuePool,
  rollDie,
  SNAKES,
  squareEffect,
  startTurn,
  tallyAccuracy,
  unusedFirst,
  weakestTopic,
  zoneOf,
  type BoardGame,
} from './board'
import type { SubjectSummary } from './quiz'

const start = newGame(new Date('2026-11-11T08:00:00Z'))
const at = (position: number): BoardGame => ({ ...start, position })
const right = (questionId = 'q1', subjectCode = 'CC') => ({ questionId, subjectCode, isCorrect: true })
const wrong = (questionId = 'q1', subjectCode = 'CC') => ({ questionId, subjectCode, isCorrect: false })

describe('layout', () => {
  const jumps = [...LADDERS, ...SNAKES]

  it('never puts a ladder or snake on 1 or 60', () => {
    for (const j of jumps) {
      expect([j.from, j.to]).not.toContain(1)
      expect([j.from, j.to]).not.toContain(BOARD_SIZE)
    }
  })

  it('uses every square at most once (so a ladder never ends on a snake head)', () => {
    const squares = jumps.flatMap((j) => [j.from, j.to])
    expect(new Set(squares).size).toBe(squares.length)
  })

  it('has ladders going up and snakes going down', () => {
    for (const l of LADDERS) expect(l.to).toBeGreaterThan(l.from)
    for (const s of SNAKES) expect(s.to).toBeLessThan(s.from)
  })
})

describe('zoneOf', () => {
  it('gives each subject 10 squares in exam order', () => {
    expect(zoneOf(1)).toBe('CC')
    expect(zoneOf(10)).toBe('CC')
    expect(zoneOf(11)).toBe('MICRO')
    expect(zoneOf(30)).toBe('HEMA')
    expect(zoneOf(31)).toBe('BBIS')
    expect(zoneOf(50)).toBe('CM')
    expect(zoneOf(60)).toBe('HTMLE')
  })

  it('treats squares off the board as the nearest end', () => {
    expect(zoneOf(0)).toBe('CC')
    expect(zoneOf(75)).toBe('HTMLE')
  })
})

describe('rollDie', () => {
  it('stays between 1 and 6', () => {
    expect(rollDie(() => 0)).toBe(1)
    expect(rollDie(() => 0.5)).toBe(4)
    expect(rollDie(() => 0.9999)).toBe(6)
    expect(rollDie(() => 1)).toBe(6) // a random function that returns 1 must not give 7
  })
})

describe('moveBy and squareEffect', () => {
  it('stops at 60 instead of needing an exact roll', () => {
    expect(moveBy(57, 6)).toBe(60)
    expect(moveBy(5, 3)).toBe(8)
  })

  it('finds ladders, snakes and the finish', () => {
    expect(squareEffect(4)).toEqual({ kind: 'ladder', to: 14 })
    expect(squareEffect(25)).toEqual({ kind: 'snake', to: 12 })
    expect(squareEffect(60)).toEqual({ kind: 'finish' })
    expect(squareEffect(2)).toEqual({ kind: 'none' })
  })
})

describe('a turn', () => {
  it('starts at square 1 waiting for a roll', () => {
    expect(start.position).toBe(1)
    expect(start.pending).toBeNull()
    expect(start.finished).toBe(false)
  })

  it('walks the roll when the answer is right', () => {
    const game = answerQuestion(startTurn(at(1), 2), right())
    expect(game.position).toBe(3)
    expect(game.pending).toBeNull()
    expect(game.turns).toBe(1)
    expect(game.correct).toBe(1)
  })

  it('stays put when the answer is wrong', () => {
    const game = answerQuestion(startTurn(at(1), 6), wrong())
    expect(game.position).toBe(1)
    expect(game.pending).toBeNull()
    expect(game.answered).toBe(1)
    expect(game.correct).toBe(0)
  })

  it('ignores a second roll while a question is waiting', () => {
    const once = startTurn(at(1), 2)
    expect(startTurn(once, 5)).toBe(once)
  })

  it('ignores an answer when nothing is waiting', () => {
    expect(answerQuestion(at(5), right())).toEqual(at(5))
  })
})

describe('ladders', () => {
  const onFoot = answerQuestion(startTurn(at(1), 3), right()) // 1 + 3 = 4, the foot of 4 → 14

  it('asks a Challenge question at the foot', () => {
    expect(onFoot.position).toBe(4)
    expect(onFoot.pending).toEqual({ kind: 'ladder', from: 4, to: 14 })
  })

  it('climbs when the Challenge is right', () => {
    const game = answerQuestion(onFoot, right('q2'))
    expect(game.position).toBe(14)
    expect(game.laddersClimbed).toBe(1)
    expect(game.pending).toBeNull()
  })

  it('stays at the foot with no penalty when it is wrong', () => {
    const game = answerQuestion(onFoot, wrong('q2'))
    expect(game.position).toBe(4)
    expect(game.laddersClimbed).toBe(0)
    expect(game.pending).toBeNull()
  })
})

describe('snakes', () => {
  const onHead = answerQuestion(startTurn(at(22), 3), right()) // 22 + 3 = 25, the head of 25 → 12

  it('asks a Rescue question on the head', () => {
    expect(onHead.position).toBe(25)
    expect(onHead.pending).toEqual({ kind: 'snake', from: 25, to: 12 })
  })

  it('stays safe when the Rescue is right', () => {
    const game = answerQuestion(onHead, right('q2', 'BBIS'))
    expect(game.position).toBe(25)
    expect(game.snakesEscaped).toBe(1)
  })

  it('slides down when it is wrong', () => {
    const game = answerQuestion(onHead, wrong('q2', 'BBIS'))
    expect(game.position).toBe(12)
    expect(game.snakesSlid).toBe(1)
    expect(game.pending).toBeNull()
  })
})

describe('finishing', () => {
  it('finishes on 60, even when the roll goes past it', () => {
    const game = answerQuestion(startTurn(at(58), 6), right())
    expect(game.position).toBe(60)
    expect(game.finished).toBe(true)
  })

  it('ignores rolls after the game is over', () => {
    const done = { ...at(60), finished: true }
    expect(startTurn(done, 4)).toBe(done)
  })
})

describe('keeping score', () => {
  it('tallies per subject and remembers each question once', () => {
    let game = answerQuestion(startTurn(at(1), 1), right('a', 'CC'))
    game = answerQuestion(startTurn(game, 1), wrong('b', 'CC'))
    game = answerQuestion(startTurn(game, 1), wrong('a', 'CC'))
    expect(game.bySubject.CC).toEqual({ answered: 3, correct: 1 })
    expect(game.usedQuestionIds).toEqual(['a', 'b'])
    expect(tallyAccuracy(game.bySubject.CC)).toBeCloseTo(1 / 3)
    expect(tallyAccuracy(game.bySubject.HEMA)).toBeNull()
  })

  it('asks from the zone she is standing in', () => {
    expect(questionSubject(at(23))).toBe('HEMA')
  })
})

describe('weakestTopic', () => {
  const subject = (code: string, topics: { topicId: number; attempts: number; accuracy: number }[]): SubjectSummary => ({
    subjectId: 1,
    code,
    name: code,
    attempts: 0,
    accuracy: null,
    belowPassing: false,
    topics: topics.map((t) => ({ ...t, name: `T${t.topicId}`, belowPassing: t.accuracy < 0.6 })),
  })

  it('picks the lowest accuracy from any subject', () => {
    const summary = [subject('CC', [{ topicId: 1, attempts: 10, accuracy: 0.5 }]), subject('HEMA', [{ topicId: 2, attempts: 5, accuracy: 0.2 }])]
    expect(weakestTopic(summary)).toEqual({ subjectCode: 'HEMA', topicId: 2, topicName: 'T2', accuracy: 0.2 })
  })

  it('skips topics with too few answers', () => {
    const summary = [subject('CC', [{ topicId: 1, attempts: 2, accuracy: 0 }, { topicId: 3, attempts: 4, accuracy: 0.75 }])]
    expect(weakestTopic(summary)?.topicId).toBe(3)
  })

  it('breaks a tie with more answers', () => {
    const summary = [subject('CC', [{ topicId: 1, attempts: 3, accuracy: 0.5 }, { topicId: 2, attempts: 8, accuracy: 0.5 }])]
    expect(weakestTopic(summary)?.topicId).toBe(2)
  })

  it('is null before she has answered enough', () => {
    expect(weakestTopic([])).toBeNull()
    expect(weakestTopic([subject('CC', [{ topicId: 1, attempts: 1, accuracy: 0 }])])).toBeNull()
  })
})

describe('question pools', () => {
  const q = (id: string, topic_id = 1, difficulty: number | null = 2) => ({ id, topic_id, difficulty })

  it('unusedFirst leaves out used questions, but never leaves none', () => {
    const list = [q('a'), q('b')]
    expect(unusedFirst(list, ['a']).map((x) => x.id)).toEqual(['b'])
    expect(unusedFirst(list, ['a', 'b']).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('challengePool prefers difficulty 3, then past mistakes, then any', () => {
    expect(challengePool([q('a', 1, 3), q('b')], new Set(['b'])).map((x) => x.id)).toEqual(['a'])
    expect(challengePool([q('a'), q('b')], new Set(['b'])).map((x) => x.id)).toEqual(['b'])
    expect(challengePool([q('a'), q('b')], new Set()).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('rescuePool prefers her weakest topic, then mistakes, then the zone', () => {
    const all = [q('a', 1), q('b', 2), q('c', 3)]
    const zone = [q('c', 3)]
    expect(rescuePool(all, zone, { weakTopicId: 2, mistakeIds: new Set(['a']) }).map((x) => x.id)).toEqual(['b'])
    expect(rescuePool(all, zone, { weakTopicId: 9, mistakeIds: new Set(['a']) }).map((x) => x.id)).toEqual(['a'])
    expect(rescuePool(all, zone, { weakTopicId: null, mistakeIds: new Set() }).map((x) => x.id)).toEqual(['c'])
  })
})
