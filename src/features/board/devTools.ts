// DEV ONLY tools for live team-game tests. Used only behind `import.meta.env.DEV`,
// so `npm run build` leaves this out of the deployed app.
import { supabase } from '@/lib/supabase'
import { teamErrorMessage } from './teamApi'

/**
 * End the game now (migrations 0026–0027): the player furthest ahead wins. Works for any account when
 * VITE_DEV_KEY in .env.local matches a key in board_dev_keys (or for accounts in board_dev_testers).
 */
export async function devFinishGame(roomId: string) {
  const key = import.meta.env.VITE_DEV_KEY as string | undefined
  const { error } = await supabase.rpc('board_dev_finish', { p_room: roomId, p_key: key ?? null })
  if (error) throw new Error(teamErrorMessage(error))
}
