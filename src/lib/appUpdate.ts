// Getting her onto the newest version.
// The offline worker (vite-plugin-pwa) downloads a new version in the background, then WAITS:
// the page she has open keeps running the old version until it is told to switch.
// It switches by itself only when nothing can be lost (lib/updateTiming.ts):
// - right after the app opens, including the login screen,
// - when she comes back to the app after being away for a while (iPad Home Screen apps rarely close),
// - when she moves to another page (AppLayout calls switchOnPageChange),
// and never during a quiz, mock exam, game or the editor, or while she types.
// Any other time, the "New version ready" banner shows and Refresh switches.

import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { cameBackAfterAWhile, FRESH_WINDOW_MS, shouldSwitchQuietly } from './updateTiming'

/** How often an app left open looks for a new version. */
const CHECK_EVERY_MS = 60 * 60 * 1000

let ready = false
/** She tapped Later: hide the banner. The new version still starts at the next safe moment. */
let bannerHidden = false
let busy = false
let switching = false
/** The end of the "just opened" window: a new version found before then starts by itself. */
let freshUntil = Date.now() + FRESH_WINDOW_MS
let hiddenAt: number | null = null
let updateWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
let workerRegistration: ServiceWorkerRegistration | undefined
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The cursor is in a text field (switching would wipe what she's typing). */
function isTyping(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'reset', 'range'].includes(el.type)
}

/** Switch now if this is a safe moment (see the list at the top). */
function trySwitchQuietly() {
  if (shouldSwitchQuietly({ ready, busy, typing: isTyping(), now: Date.now(), freshUntil })) switchToNewVersion()
}

/** AppLayout tells this whether a quiz, mock exam, game or editor is open (focus mode). */
export function setUpdateBusy(value: boolean) {
  busy = value
}

/**
 * She just moved to another page: a safe moment, the page she left is gone anyway.
 * The reload opens the same address, and the browser keeps the link's saved state (e.g. "started from Plan").
 */
export function switchOnPageChange() {
  if (ready && !busy) switchToNewVersion()
}

/** Call once at startup. Registers the offline worker and starts looking for new versions. */
export function startAppUpdates() {
  updateWorker = registerSW({
    onNeedRefresh() {
      ready = true
      notify()
      trySwitchQuietly()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      workerRegistration = registration
      const check = () => {
        if (navigator.onLine) registration.update().catch(() => {}) // offline or server hiccup: try again later
      }
      // An app kept open still finds out about a new version: every hour, and each time she comes back to it.
      setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          hiddenAt = Date.now()
          return
        }
        // Back after a long time away: treat it like opening the app.
        if (cameBackAfterAWhile(hiddenAt, Date.now())) {
          freshUntil = Date.now() + FRESH_WINDOW_MS
          trySwitchQuietly() // a version that was already waiting
        }
        hiddenAt = null
        check() // a newer one: onNeedRefresh switches if it arrives within the window
      })
    },
  })
}

/**
 * Reload into the newest version. If a new version is downloaded and waiting, switch to it first:
 * a plain reload would open the OLD version again (the waiting one only starts when told to, or on a full close).
 * Used by the quiet switch, the banner's Refresh, the auto-reload when a screen's file is missing, and the error page.
 */
export function switchToNewVersion() {
  if (switching) return
  switching = true
  if (workerRegistration?.waiting && updateWorker) {
    void updateWorker(true) // tells it to take over, then reloads
    // Safety net: if the switch never reports back, reload anyway.
    setTimeout(() => window.location.reload(), 3000)
  } else {
    window.location.reload()
  }
}

/** ready = show the banner (a new version is waiting). refresh() switches to it (the page reloads). later() hides the banner. */
export function useAppUpdate() {
  const showBanner = useSyncExternalStore(subscribe, () => ready && !bannerHidden)
  return {
    ready: showBanner,
    refresh: switchToNewVersion,
    later: () => {
      bannerHidden = true
      notify()
    },
  }
}
