// Last Card with classmates (PROJECT_PLAN.md §15 step 2): talking to the Edge Function `cards-game`.
// Every move goes to the server, which checks it's her turn and applies the same rules as the solo game.
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { CardSubject } from '@/lib/cards'
import type { LiveView } from '@/lib/cardsLive'
import { supabase } from '@/lib/supabase'

/** Calls the Edge Function and gives back her view; a refused move throws its message (e.g. "It's not your turn."). */
async function cardsGame(body: Record<string, unknown>): Promise<LiveView> {
  const { data, error } = await supabase.functions.invoke<{ view: LiveView }>('cards-game', { body })
  if (error) {
    // The function answers a refused move with { error: "…" } (written to be shown as is).
    if (error instanceof FunctionsHttpError) {
      const reply = (await error.context.json().catch(() => null)) as { error?: string } | null
      if (reply?.error) throw new Error(reply.error)
    }
    if (!navigator.onLine) throw new Error('You’re offline. Team games need the internet.')
    throw new Error('Couldn’t reach the game. Check your internet connection and try again.')
  }
  if (!data?.view) throw new Error('Something went wrong. Try again.')
  return data.view
}

export const cardsLive = {
  /** The host starts the lobby: computer players fill the empty seats, the cards are dealt. */
  start: (roomId: string) => cardsGame({ action: 'start', roomId }),
  play: (roomId: string, cardId: string) => cardsGame({ action: 'play', roomId, cardId }),
  draw: (roomId: string) => cardsGame({ action: 'draw', roomId }),
  keep: (roomId: string) => cardsGame({ action: 'keep', roomId }),
  choose: (roomId: string, subject: CardSubject) => cardsGame({ action: 'choose', roomId, subject }),
  answer: (roomId: string, selectedIndex: number) => cardsGame({ action: 'answer', roomId, selectedIndex }),
  /** Anyone in the room, once the clock has run out (the server checks the time). */
  timeout: (roomId: string) => cardsGame({ action: 'timeout', roomId }),
  leave: (roomId: string) => cardsGame({ action: 'leave', roomId }),
}
