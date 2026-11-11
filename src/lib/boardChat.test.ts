import { describe, expect, it } from 'vitest'
import {
  MAX_MESSAGE_LENGTH,
  QUICK_REPLIES,
  canSendMessage,
  cleanMessage,
  latestMessage,
  messageAgo,
  parseMessages,
  startsGroup,
  unreadCount,
  type ChatMessage,
} from './boardChat'

const msg = (id: string, userId: string, createdAt: string): ChatMessage => ({ id, userId, name: 'Ana', body: 'Hi', createdAt })

describe('cleanMessage / canSendMessage', () => {
  it('tidies spaces and line breaks like the database', () => {
    expect(cleanMessage('  Nice \n\n  save!  ')).toBe('Nice save!')
  })
  it('refuses empty or only spaces', () => {
    expect(canSendMessage('')).toBe(false)
    expect(canSendMessage('   \n ')).toBe(false)
  })
  it('allows exactly the limit, not one more', () => {
    expect(canSendMessage('a'.repeat(MAX_MESSAGE_LENGTH))).toBe(true)
    expect(canSendMessage('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe(false)
  })
  it('counts the limit after tidying', () => {
    expect(canSendMessage(`  ${'a'.repeat(MAX_MESSAGE_LENGTH)}   `)).toBe(true)
  })
})

describe('QUICK_REPLIES', () => {
  it('every moment has short replies that can be sent', () => {
    for (const replies of Object.values(QUICK_REPLIES)) {
      expect(replies.length).toBeGreaterThan(0)
      for (const r of replies) expect(canSendMessage(r)).toBe(true)
    }
  })
})

describe('parseMessages', () => {
  it('reads good rows and skips broken ones', () => {
    const rows = [
      { id: 'm1', user_id: 'u1', name: 'Ana', body: 'Hi', created_at: '2026-11-11T10:00:00Z' },
      { id: 'm2', user_id: 'u2', name: '', body: 'Yo', created_at: '2026-11-11T10:01:00Z' },
      { id: 3, user_id: 'u1', body: 'bad id' },
      null,
      'nope',
    ]
    expect(parseMessages(rows)).toEqual([
      { id: 'm1', userId: 'u1', name: 'Ana', body: 'Hi', createdAt: '2026-11-11T10:00:00Z' },
      { id: 'm2', userId: 'u2', name: 'A classmate', body: 'Yo', createdAt: '2026-11-11T10:01:00Z' },
    ])
  })
  it('anything that is not a list gives no messages', () => {
    expect(parseMessages(null)).toEqual([])
    expect(parseMessages({})).toEqual([])
  })
})

describe('unreadCount', () => {
  const messages = [
    msg('a', 'other', '2026-11-11T10:00:00Z'),
    msg('b', 'me', '2026-11-11T10:01:00Z'),
    msg('c', 'other', '2026-11-11T10:02:00Z'),
  ]
  it('counts only classmates’ messages after she last looked', () => {
    expect(unreadCount(messages, 'me', '2026-11-11T10:00:30Z')).toBe(1)
  })
  it('never looked: every classmate message is unread', () => {
    expect(unreadCount(messages, 'me', null)).toBe(2)
  })
  it('looked after the newest: nothing unread', () => {
    expect(unreadCount(messages, 'me', '2026-11-11T10:05:00Z')).toBe(0)
  })
  it('her own messages never count', () => {
    expect(unreadCount([msg('x', 'me', '2026-11-11T10:00:00Z')], 'me', null)).toBe(0)
  })
})

describe('startsGroup', () => {
  const first = msg('a', 'u1', '2026-11-11T10:00:00Z')
  it('the first message starts a group', () => {
    expect(startsGroup(undefined, first)).toBe(true)
  })
  it('same person soon after: same group', () => {
    expect(startsGroup(first, msg('b', 'u1', '2026-11-11T10:04:59Z'))).toBe(false)
  })
  it('another person: new group', () => {
    expect(startsGroup(first, msg('b', 'u2', '2026-11-11T10:00:10Z'))).toBe(true)
  })
  it('same person 5+ minutes later: new group', () => {
    expect(startsGroup(first, msg('b', 'u1', '2026-11-11T10:05:00Z'))).toBe(true)
  })
  it('a bad date starts a new group instead of guessing', () => {
    expect(startsGroup(first, msg('b', 'u1', 'not a date'))).toBe(true)
  })
})

describe('latestMessage / messageAgo', () => {
  it('latest is the last one; none when empty', () => {
    expect(latestMessage([msg('a', 'u', '2026-11-11T10:00:00Z'), msg('b', 'u', '2026-11-11T10:01:00Z')])?.id).toBe('b')
    expect(latestMessage([])).toBeUndefined()
  })
  it('says now, minutes, then hours', () => {
    const sent = '2026-11-11T10:00:00Z'
    const t = Date.parse(sent)
    expect(messageAgo(sent, t + 30_000)).toBe('now')
    expect(messageAgo(sent, t + 5 * 60_000)).toBe('5 min')
    expect(messageAgo(sent, t + 2 * 3_600_000 + 60_000)).toBe('2 hr')
  })
  it('a bad date or a clock that is behind says now', () => {
    expect(messageAgo('not a date', Date.now())).toBe('now')
    expect(messageAgo('2026-11-11T10:00:00Z', Date.parse('2026-11-11T09:00:00Z'))).toBe('now')
  })
})
