// Flashcards show the question and its answer, but not the choices. An answer like "All of the above" means nothing
// without them, so the card spells it out: "All of these:" and the choices it covers (or "None of these:").
// Pure logic, easy to unit test.

export type FlashcardAnswer =
  /** a normal answer: shown as it is */
  | { kind: 'plain'; text: string }
  /** "All of the above" / "All of these": every listed item is correct */
  | { kind: 'all'; text: string; items: string[] }
  /** "None of the above": none of the listed items is correct */
  | { kind: 'none'; text: string; items: string[] }

const ALL = /^all of (the )?(above|these|the choices|the options)\b/i
const NONE = /^none of (the )?(above|these|the choices|the options)\b/i
/** choices that only point at other choices: "None of the above", "Both A and B", "A and C", "B only" */
const POINTER = /^((all|none) of (the )?(above|these|the choices|the options)|(both |neither )?[a-e] (and|nor|or|&) [a-e]|[a-e] only)\b/i

/**
 * What the card shows as the answer. "All/None of the above" lists the choices above it (in the question's original
 * order); "of these" / "of the choices" lists all the other choices. Choices that only point at other choices
 * ("Both A and B") are left out. With fewer than 2 items to list, the answer is shown as it is.
 */
export function flashcardAnswer(choices: readonly string[], correctIndex: number): FlashcardAnswer {
  const text = (choices[correctIndex] ?? '').trim()
  const kind = ALL.test(text) ? 'all' : NONE.test(text) ? 'none' : null
  if (!kind) return { kind: 'plain', text }

  const above = /\babove\b/i.test(text)
  const items = choices
    .filter((_, i) => i !== correctIndex && (!above || i < correctIndex))
    .map((c) => c.trim())
    .filter((c) => c !== '' && !POINTER.test(c))
  return items.length >= 2 ? { kind, text, items } : { kind: 'plain', text }
}
