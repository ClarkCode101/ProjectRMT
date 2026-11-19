// When a downloaded new version may start by itself, without asking (see appUpdate.ts).
// Only at moments when nothing can be lost:
// - right after the app opens (she hasn't done anything yet), or after it comes back from
//   being away for a while (iPad Home Screen apps rarely fully close, so this is their "open"),
// - never while busy (a quiz, mock exam, game or the question editor: focus mode),
// - never while she is typing in a field.
// Moving to another page is also safe, but that is decided in AppLayout (it switches on every page change).

/** After opening (or coming back), a new version found within this long starts by itself. */
export const FRESH_WINDOW_MS = 15_000

/**
 * Away from the app at least this long = coming back counts like a fresh open.
 * Long enough that a quiz's results screen she left for a quick break is still there when she comes back.
 */
export const AWAY_MS = 30 * 60 * 1000

export type QuietSwitchState = {
  /** a new version is downloaded and waiting */
  ready: boolean
  /** a quiz, mock exam, game or editor is open */
  busy: boolean
  /** the cursor is in a text field */
  typing: boolean
  now: number
  /** the end of the current "just opened" window */
  freshUntil: number
}

/** true = switch to the new version now, quietly. false = wait (the banner shows instead, outside focus mode). */
export function shouldSwitchQuietly({ ready, busy, typing, now, freshUntil }: QuietSwitchState): boolean {
  return ready && !busy && !typing && now <= freshUntil
}

/** Coming back to the app after being away this long counts as a fresh open. hiddenAt = null: it was never hidden. */
export function cameBackAfterAWhile(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= AWAY_MS
}
