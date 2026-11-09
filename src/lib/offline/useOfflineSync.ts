import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { addSyncedToBank, refreshBankIfStale } from './bank'
import { flushOutbox, onSynced } from './outbox'

/**
 * Keeps the offline copy and the outbox up to date while she's logged in (used once, in AppLayout).
 * Runs when the app opens, when the internet comes back, and when she comes back to the app:
 *   1. send answers waiting in the outbox
 *   2. download a fresh question bank if the saved one is old
 */
export function useOfflineSync(userId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return

    function sync() {
      void flushOutbox().then(refreshBankIfStale)
    }
    function onVisible() {
      if (document.visibilityState === 'visible') sync()
    }

    sync()
    window.addEventListener('online', sync)
    document.addEventListener('visibilitychange', onVisible)

    // Answers or card ratings reached the server: add them to the saved copy, and refetch the pages that show them.
    const stopListening = onSynced((sent) => {
      void addSyncedToBank(sent)
      if (sent.attempts.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ['mistakes'] })
        void queryClient.invalidateQueries({ queryKey: ['topic-performance'] })
        void queryClient.invalidateQueries({ queryKey: ['attempt-history'] })
      }
      if (sent.reviews.length > 0) void queryClient.invalidateQueries({ queryKey: ['review-states'] })
    })

    return () => {
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', onVisible)
      stopListening()
    }
  }, [userId, queryClient])
}

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** true/false as the device goes online and offline. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true)
}
