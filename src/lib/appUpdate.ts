// "A new version is ready" for the update banner.
// The offline worker (vite-plugin-pwa) downloads a new version in the background, then WAITS:
// the page she has open keeps running the old version until she taps Refresh on the banner,
// so nothing reloads in the middle of a quiz. If she never taps it, the new version starts
// the next time she fully closes and reopens the app.

import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** How often an app left open looks for a new version. */
const CHECK_EVERY_MS = 60 * 60 * 1000

let ready = false
let updateWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()

function setReady(value: boolean) {
  ready = value
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Call once at startup. Registers the offline worker and starts looking for new versions. */
export function startAppUpdates() {
  updateWorker = registerSW({
    onNeedRefresh() {
      setReady(true)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {}) // offline or server hiccup: try again later
      }
      // An app kept open (iPad Home Screen apps rarely close) still finds out about a new version:
      // every hour, and each time she comes back to it from another app.
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}

/** ready = a new version is downloaded and waiting. refresh() switches to it (the page reloads). later() hides the banner. */
export function useAppUpdate() {
  const isReady = useSyncExternalStore(subscribe, () => ready)
  return {
    ready: isReady,
    refresh: () => updateWorker?.(true),
    later: () => setReady(false),
  }
}
