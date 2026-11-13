// DEV ONLY (npm run dev): the live Last Card test shortcuts (PROJECT_PLAN.md §15 step 3).
// Kept apart from liveApi.ts on purpose: it sends the dev key (VITE_DEV_KEY from .env.local), and this file is only
// used behind `import.meta.env.DEV`, so `npm run build` leaves it (and the key) out of the deployed app.
// The server refuses these without the key anyway (Edge Function action "dev").
import type { LiveView } from '@/lib/cardsLive'
import type { LiveDevOp } from '@/lib/cardsLiveDev'
import { cardsGame, invokeCards } from './liveApi'

const devKey = () => import.meta.env.VITE_DEV_KEY as string | undefined

export const cardsLiveDev = {
  run: (roomId: string, op: LiveDevOp): Promise<LiveView> => cardsGame({ action: 'dev', roomId, op, devKey: devKey() }),
  /** The answer to the question up now (for "Show answers"); nothing is saved. */
  answer: async (roomId: string) =>
    (await invokeCards<{ view: LiveView; devAnswer: { questionId: string; correctIndex: number } | null }>({ action: 'dev', roomId, op: 'answer', devKey: devKey() }))
      .devAnswer,
}
