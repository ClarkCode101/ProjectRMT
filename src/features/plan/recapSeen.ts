// Was last week's recap ("Your week") closed already? Remembered on this device by the Monday of the week it's about.
const SEEN_KEY = 'projectrmt:recap-seen'

export function readRecapSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

export function markRecapSeen(weekStart: string): void {
  try {
    localStorage.setItem(SEEN_KEY, weekStart)
  } catch {
    // storage blocked: it just shows again next visit
  }
}

/** DEV ONLY: forget it was closed, so the recap shows on top again. */
export function clearRecapSeen(): void {
  try {
    localStorage.removeItem(SEEN_KEY)
  } catch {
    // storage blocked
  }
}
