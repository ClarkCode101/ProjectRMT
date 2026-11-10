// Letters for a question's choices, and the keyboard shortcuts that pick them (Practice and Board Review).

export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** Which display position a key picks: A–F or 1–6. Returns -1 for any other key. */
export function keyToPosition(key: string) {
  const letter = CHOICE_LETTERS.indexOf(key.toUpperCase())
  if (letter !== -1) return letter
  const digit = Number(key)
  return Number.isInteger(digit) && digit >= 1 && digit <= CHOICE_LETTERS.length ? digit - 1 : -1
}
