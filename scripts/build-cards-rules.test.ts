import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rulesFingerprint } from './build-cards-rules'

// The Edge Function `cards-game` runs the rules from supabase/functions/cards-game/rules.js, a bundle of
// src/lib/cardsLive.ts (and cards.ts, board.ts, quiz.ts). These make sure the server plays by the same rules as the app.

describe('the Last Card rules bundle for the server', () => {
  it('was built from the current rules (if this fails: npm run build:cards-rules)', () => {
    const firstLine = readFileSync('supabase/functions/cards-game/rules.js', 'utf8').split('\n')[0]
    expect(firstLine).toBe(`// rules-fingerprint: ${rulesFingerprint()}`)
  })

  it('works on its own, as plain JavaScript: deals a live game and takes a move', async () => {
    const rules = await import('../supabase/functions/cards-game/rules.js')
    const now = new Date('2026-11-13T08:00:00Z')
    const live = rules.newLiveGame(
      [
        { userId: 'a', name: 'Ana' },
        { userId: 'b', name: 'Ben' },
      ],
      Math.random,
      now,
    )
    expect(live.seats).toHaveLength(4)
    expect(rules.liveView(live, 'a').hand).toHaveLength(7)
    const drew = rules.liveAct(live, 'a', { kind: 'draw' }, Math.random, now)
    // Drawing is refused while a card fits; either way the answer is a proper result, never a crash.
    expect(typeof drew.ok).toBe('boolean')
  })
})
