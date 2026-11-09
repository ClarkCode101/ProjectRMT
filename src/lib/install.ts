import { useSyncExternalStore } from 'react'

/**
 * "Install the app" helpers (PWA = the website saved to the Home Screen).
 *
 * How each device installs:
 * - installed: already opened from the Home Screen icon, so nothing to do.
 * - prompt:    Chrome / Edge (Android, computer) gave us a real Install button to show.
 * - ios:       iPhone / iPad have no Install button. She taps Share, then Add to Home Screen.
 * - manual:    any other browser. She has to find Install in the browser's own menu.
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual'

/** Chrome's install event. Not in TypeScript's built-in types yet. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** True on iPhone, iPod and iPad. A new iPad says it's a Mac, but a Mac has no touch screen. */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** Picks the install mode from what we know about the device. */
export function pickInstallMode(device: { standalone: boolean; canPrompt: boolean; ios: boolean }): InstallMode {
  if (device.standalone) return 'installed'
  if (device.canPrompt) return 'prompt'
  if (device.ios) return 'ios'
  return 'manual'
}

// ---------- Live state (kept outside React so the install event isn't missed before the app draws) ----------

let savedPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

/** Call once at startup. Chrome fires its install event early, sometimes before any page is on screen. */
export function listenForInstallPrompt() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // stop Chrome's own mini bar; we show our own card instead
    savedPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    savedPrompt = null
    notify()
  })
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

function currentMode(): InstallMode {
  return pickInstallMode({
    standalone: isStandalone(),
    canPrompt: savedPrompt !== null,
    ios: isIosDevice(navigator.userAgent, navigator.maxTouchPoints),
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens Chrome's install dialog. It can only be used once, so the saved event is cleared after. */
async function promptInstall() {
  const event = savedPrompt
  if (!event) return
  savedPrompt = null
  await event.prompt()
  await event.userChoice
  notify()
}

/** The install mode for this device, kept up to date, plus the action for the Install button. */
export function useInstall() {
  const mode = useSyncExternalStore(subscribe, currentMode, () => 'manual' as const)
  return { mode, promptInstall }
}

// ---------- "Don't show the tip again" (this device only) ----------

const HINT_DISMISSED_KEY = 'projectrmt:install-hint-dismissed'

export function isHintDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissHint() {
  try {
    localStorage.setItem(HINT_DISMISSED_KEY, '1')
  } catch {
    // Private mode can block storage. The tip just comes back next time, which is fine.
  }
}
