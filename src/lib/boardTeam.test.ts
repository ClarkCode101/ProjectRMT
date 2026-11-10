import { describe, expect, it } from 'vitest'
import {
  eventLine,
  finishOrder,
  formatTurnClock,
  inviteLink,
  parseEvent,
  parseTeamRoom,
  playerColor,
  TOKEN_COLORS,
  turnExpired,
  turnOrder,
  turnSecondsLeft,
  type TeamPlayer,
} from './boardTeam'

const player = (userId: string, extra: Partial<TeamPlayer> = {}): TeamPlayer => ({
  userId,
  name: userId.toUpperCase(),
  seat: null,
  orderRoll: null,
  position: 1,
  status: 'joined',
  answered: 0,
  correct: 0,
  ...extra,
})

describe('parseTeamRoom', () => {
  const raw = {
    id: 'r1',
    host_id: 'a',
    invite_code: 'ABC234',
    layout_id: 2,
    status: 'playing',
    turn_user: 'b',
    phase: 'answer',
    pending: { kind: 'move', roll: 4 },
    deadline: '2026-11-11T10:01:30Z',
    last_event: { kind: 'roll', user: 'b', name: 'Ben', roll: 4, at: '2026-11-11T10:00:00Z' },
    winner_id: null,
    version: 7,
    now: '2026-11-11T10:00:00Z',
    me: 'a',
    question: { id: 'q1', topic_id: 3, stem: 'Which?', choices: ['A', 'B', 'C', 'D'] },
    last_question: null,
    players: [
      { user_id: 'a', name: 'Ana', seat: 1, order_roll: 3, position: 12, status: 'joined', answered: 4, correct: 3 },
      { user_id: 'b', name: 'Ben', seat: 0, order_roll: 6, position: 9, status: 'joined', answered: 4, correct: 2 },
    ],
    invited: [],
  }

  it('reads a room', () => {
    const room = parseTeamRoom(raw)!
    expect(room.status).toBe('playing')
    expect(room.pending).toEqual({ kind: 'move', roll: 4 })
    expect(room.question?.choices).toEqual(['A', 'B', 'C', 'D'])
    expect(room.players.map((p) => p.name)).toEqual(['Ana', 'Ben'])
    expect(room.lastEvent).toEqual({ kind: 'roll', at: '2026-11-11T10:00:00Z', userId: 'b', name: 'Ben', roll: 4 })
  })

  it('gives null for nothing, and safe defaults for odd values', () => {
    expect(parseTeamRoom(null)).toBeNull()
    expect(parseTeamRoom({})).toBeNull()
    const odd = parseTeamRoom({ ...raw, status: 'weird', phase: 'x', question: { id: 'q', choices: ['only one'] }, players: [{ user_id: 'a', position: 99, status: '?' }] })!
    expect(odd.status).toBe('cancelled')
    expect(odd.phase).toBeNull()
    expect(odd.question).toBeNull() // fewer than 2 choices
    expect(odd.players[0]).toMatchObject({ position: 60, status: 'left', name: 'A classmate' })
  })

  it('reads the answer reveal', () => {
    const event = parseEvent({
      kind: 'answer', user: 'b', name: 'Ben', purpose: { kind: 'snake', from: 26, to: 15 }, question_id: 'q1',
      selected: 2, correct_index: 1, is_correct: false, from: 26, to: 15, at: 't',
    })
    expect(event).toMatchObject({ kind: 'answer', isCorrect: false, purpose: { kind: 'snake', to: 15 }, to: 15 })
    expect(parseEvent({ kind: 'answer', purpose: { kind: 'teleport' } })).toBeNull()
  })
})

describe('the turn clock', () => {
  const serverNow = '2026-11-11T10:00:00.000Z'
  const fetchedAt = Date.parse(serverNow)

  it('counts down from the deadline and never shows more than 90', () => {
    expect(turnSecondsLeft('2026-11-11T10:01:00Z', serverNow, fetchedAt, fetchedAt)).toBe(60)
    expect(turnSecondsLeft('2026-11-11T10:01:40Z', serverNow, fetchedAt, fetchedAt)).toBe(90) // 100 s with the grace
    expect(turnSecondsLeft('2026-11-11T09:59:00Z', serverNow, fetchedAt, fetchedAt)).toBe(0)
    expect(turnSecondsLeft(null, serverNow, fetchedAt, fetchedAt)).toBe(0)
  })

  it('goes by the server’s clock when the phone’s clock is off', () => {
    const phoneIsTwoMinutesAhead = fetchedAt + 120_000
    expect(turnSecondsLeft('2026-11-11T10:01:00Z', serverNow, phoneIsTwoMinutesAhead, phoneIsTwoMinutesAhead + 10_000)).toBe(50)
  })

  it('is expired only a little after the deadline', () => {
    const deadline = '2026-11-11T10:00:10Z'
    expect(turnExpired(deadline, serverNow, fetchedAt, fetchedAt + 10_000)).toBe(false)
    expect(turnExpired(deadline, serverNow, fetchedAt, fetchedAt + 11_000)).toBe(true)
    expect(turnExpired(null, serverNow, fetchedAt, fetchedAt + 99_000)).toBe(false)
  })

  it('formats as m:ss', () => {
    expect(formatTurnClock(75)).toBe('1:15')
    expect(formatTurnClock(9)).toBe('0:09')
    expect(formatTurnClock(-3)).toBe('0:00')
  })
})

describe('players', () => {
  it('get a color by seat, or by join order in the lobby', () => {
    const lobby = [player('a'), player('b')]
    expect(playerColor(lobby, 'b')).toBe(TOKEN_COLORS[1])
    const game = [player('a', { seat: 1 }), player('b', { seat: 0 })]
    expect(playerColor(game, 'b')).toBe(TOKEN_COLORS[0])
  })

  it('turn order skips those who left', () => {
    const players = [player('a', { seat: 2 }), player('b', { seat: 0, status: 'left' }), player('c', { seat: 1 })]
    expect(turnOrder(players).map((p) => p.userId)).toEqual(['c', 'a'])
  })

  it('finish order: winner, then still playing by square, then by correct answers', () => {
    const players = [
      player('a', { position: 40, correct: 5 }),
      player('b', { position: 60 }),
      player('c', { position: 55, status: 'left' }),
      player('d', { position: 40, correct: 9 }),
    ]
    expect(finishOrder(players, 'b').map((p) => p.userId)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('eventLine', () => {
  const base = { at: 't', userId: 'b', name: 'Ben' }
  it('says what just happened, with "You" for herself', () => {
    expect(eventLine({ ...base, kind: 'roll', roll: 5 }, 'a')).toBe('Ben rolled 5.')
    expect(eventLine({ ...base, kind: 'roll', roll: 5 }, 'b')).toBe('You rolled 5.')
    expect(
      eventLine({ ...base, kind: 'answer', purpose: { kind: 'ladder', from: 3, to: 17 }, questionId: 'q', selected: 1, correctIndex: 1, isCorrect: true, from: 3, to: 17 }, 'a'),
    ).toBe('Ben climbed a ladder to 17!')
    expect(eventLine({ ...base, kind: 'timeout', removed: true }, 'a')).toBe('Ben missed 2 turns and is out of the game.')
    expect(eventLine({ kind: 'order', at: 't', order: [] }, 'a')).toBeNull()
    expect(eventLine(null, 'a')).toBeNull()
  })
})

describe('inviteLink', () => {
  it('points to the join page', () => {
    expect(inviteLink('https://projectrmt.pages.dev/', 'ABC234')).toBe('https://projectrmt.pages.dev/board/join/ABC234')
  })
})
