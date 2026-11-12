import { queueSession } from '@/lib/offline/outbox'

/** Starts the quiz session (mode 'cards', migration 0041) that a new card game's answers belong to. Works offline. */
export function queueCardsSession(): string {
  const id = crypto.randomUUID()
  // total_items: a card game has no fixed number of questions, so 0; the score is saved when it ends.
  queueSession({ id, mode: 'cards', total_items: 0, filters: { source: 'all', cards: true }, started_at: new Date().toISOString() })
  return id
}
