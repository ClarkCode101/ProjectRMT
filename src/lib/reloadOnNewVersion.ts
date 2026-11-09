// After an update (a new push), a page left open can still be running the old version.
// When it then opens a screen it hasn't loaded yet, it asks for that screen's file from the OLD version,
// which no longer exists on the server, and the screen fails to load.
// Fix: when that happens, reload once, which opens the new version. Nothing is lost: answers wait in
// the outbox and an unfinished mock exam is saved on the device.

/** Don't reload again within this long (so a file that's truly missing can't cause a reload loop). */
export const RELOAD_COOLDOWN_MS = 30_000

const LAST_RELOAD_KEY = 'projectrmt:last-version-reload'

/**
 * Reload only when online (offline, the new version can't be downloaded anyway)
 * and not just after the last reload.
 */
export function shouldReload(lastReloadAt: number | null, now: number, online: boolean): boolean {
  if (!online) return false
  return lastReloadAt === null || now - lastReloadAt > RELOAD_COOLDOWN_MS
}

function readLastReload(): number | null {
  try {
    const value = Number(sessionStorage.getItem(LAST_RELOAD_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** Call once at startup. */
export function reloadOnNewVersion() {
  // Vite fires this when a screen's file can't be downloaded.
  window.addEventListener('vite:preloadError', (event) => {
    const now = Date.now()
    if (!shouldReload(readLastReload(), now, navigator.onLine)) return // let the error show as usual
    event.preventDefault() // we handle it: don't show the error
    try {
      sessionStorage.setItem(LAST_RELOAD_KEY, String(now))
    } catch {
      // Storage blocked: still reload. The worst case is one extra reload.
    }
    window.location.reload()
  })
}
