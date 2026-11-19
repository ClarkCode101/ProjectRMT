// "Fix until right" (Today's plan, past mistakes): a question she misses again comes back later in the same quiz,
// after she has read why. Pure functions, so they can be tested.

/** A missed question comes back after this many other questions (or sooner, near the end). */
export const RETRY_GAP = 2
/** Tries per question in one quiz. After the last one it waits for tomorrow, so she never gets stuck guessing. */
export const MAX_TRIES = 3

/**
 * The quiz order after she missed the item at position `at`: the same question put back RETRY_GAP items later
 * (or at the end, if fewer are left). `tries` = how many times she has answered it in this quiz, this one included.
 * At MAX_TRIES it isn't put back. `again` makes the new copy (e.g. with its choices shuffled again).
 */
export function requeueMissed<T>(queue: readonly T[], at: number, tries: number, again: (item: T) => T): T[] {
  if (tries >= MAX_TRIES) return [...queue]
  const insertAt = Math.min(at + 1 + RETRY_GAP, queue.length)
  return [...queue.slice(0, insertAt), again(queue[at]), ...queue.slice(insertAt)]
}

type Answer = { question: { id: string }; isCorrect: boolean }

/** How many different questions she has answered right at least once (the "Fixed 2 of 5"). */
export function fixedCount(answers: readonly Answer[]): number {
  return new Set(answers.filter((a) => a.isCorrect).map((a) => a.question.id)).size
}

/** One answer per question, the FIRST try: what is saved as her answer, and what the session's score counts. */
export function firstAnswerPerQuestion<A extends Answer>(answers: readonly A[]): A[] {
  const seen = new Set<string>()
  return answers.filter((a) => !seen.has(a.question.id) && seen.add(a.question.id))
}

/**
 * One answer per question, the LAST one (a question fixed on its second try counts as right), in the order
 * the questions first came up. For the results screen, so a retried question isn't counted twice.
 */
export function lastAnswerPerQuestion<A extends Answer>(answers: readonly A[]): A[] {
  const last = new Map<string, A>()
  for (const a of answers) last.set(a.question.id, a)
  return [...last.keys()].map((id) => last.get(id)!)
}
