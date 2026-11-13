import { useState } from 'react'

export type DevAction = { label: string; onClick: () => void }

type Props = {
  /** e.g. "solo game (this device)" or "team game (database, dev key)" */
  where: string
  showAnswers: boolean
  onShowAnswers: (on: boolean) => void
  actions: readonly DevAction[]
}

const devButton = 'w-full rounded-md border border-dashed border-wrong/60 bg-card px-3 py-2 text-left font-mono text-xs font-bold hover:bg-wrong-soft'

/**
 * DEV ONLY (npm run dev): the red "DEV" button and its list of test shortcuts, for Board Review (solo and team).
 * Render it only behind `import.meta.env.DEV`, which is false in `npm run build`, so it never reaches the deployed app.
 */
export function DevPanel({ where, showAnswers, onShowAnswers, actions }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-9 rounded-md border border-dashed border-wrong/60 bg-wrong-soft px-3 font-mono text-xs font-bold"
      >
        DEV
      </button>
      {open && (
        <div className="absolute top-11 left-0 z-40 w-64 space-y-1.5 rounded-xl border border-dashed border-wrong/60 bg-card p-3 shadow-lg">
          <p className="font-mono text-[11px] font-bold text-wrong">DEV TEST ONLY · {where}</p>
          <label className="flex items-center gap-2 pb-1 font-mono text-xs">
            <input type="checkbox" checked={showAnswers} onChange={(e) => onShowAnswers(e.target.checked)} />
            Show answers
          </label>
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={devButton}
              onClick={() => {
                a.onClick()
                setOpen(false)
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** DEV ONLY: the right answer, under the question (same look as Last Card's). */
export function DevAnswerNote({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-md border border-dashed border-wrong/60 bg-wrong-soft px-3 py-2 font-mono text-xs" role="note">
      <span className="font-bold">DEV TEST ONLY · </span>
      {text}
    </p>
  )
}
