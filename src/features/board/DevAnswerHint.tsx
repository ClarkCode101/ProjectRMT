import { useEffect, useState } from 'react'
import { getBank } from '@/lib/offline/bank'

type Props = {
  questionId: string
  /** the shuffled order the popup shows the choices in (original indexes) */
  order: number[]
}

/**
 * DEV ONLY (npm run dev): shows the right answer of the team question on screen, so a live test
 * can answer right or wrong on purpose. Rendered only behind `import.meta.env.DEV`, which is false
 * in `npm run build`, so it never reaches the deployed app.
 *
 * The answer comes from the question bank already saved on this device (built-in questions, for offline Practice).
 */
export function DevAnswerHint({ questionId, order }: Props) {
  const [hint, setHint] = useState<string>('Looking up the answer…')

  useEffect(() => {
    let cancelled = false
    getBank().then((bank) => {
      if (cancelled) return
      const q = bank?.questions.find((x) => x.id === questionId)
      if (!q) {
        setHint('Not in this device’s question copy. Open Practice once while online, then try again.')
        return
      }
      const position = order.indexOf(q.correct_index)
      const letter = position >= 0 ? String.fromCharCode(65 + position) : '?'
      setHint(`Answer: ${letter}. ${q.choices[q.correct_index] ?? ''}`)
    })
    return () => {
      cancelled = true
    }
  }, [questionId, order])

  return (
    <p className="mt-3 rounded-md border border-dashed border-wrong/60 bg-wrong-soft px-3 py-2 font-mono text-xs" role="note">
      <span className="font-bold">DEV TEST ONLY · </span>
      {hint}
    </p>
  )
}
