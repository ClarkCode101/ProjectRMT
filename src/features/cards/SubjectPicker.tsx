import { SUBJECT_COLOR } from '@/lib/books'
import { CARD_SUBJECTS, type Card, type CardSubject } from '@/lib/cards'
import { CardFace } from './PlayingCard'
import { SUBJECT_SHORT_NAME } from './subjectNames'

// After a right Wild (PROJECT_PLAN.md §15): she picks the subject everyone plays on next.
// Each subject is a small card in the game's own look (picking a "color", like a Wild in a real card game), all the
// same size, with its short name under it. Nothing else (decided 2026-11-12: "You have N" and a score bar were
// tried and dropped, the owner wanted just the card and its name).

const WILD: Card = { id: 'wild-1', kind: 'wild' }

type Props = {
  headingId: string
  onPick: (subject: CardSubject) => void
}

export function SubjectPicker({ headingId, onPick }: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <CardFace card={WILD} size="sm" className="shrink-0" />
        <div>
          <h2 id={headingId} className="font-heading text-xl font-bold">
            Pick the next subject
          </h2>
          <p className="text-sm text-muted-foreground">Everyone plays on it next.</p>
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6">
        {CARD_SUBJECTS.map((subject) => {
          const color = SUBJECT_COLOR[subject]
          return (
            <li key={subject}>
              <button
                type="button"
                onClick={() => onPick(subject)}
                aria-label={`${subject}, ${SUBJECT_SHORT_NAME[subject]}`}
                className="group flex w-full flex-col items-center gap-2 rounded-xl px-1 pt-2 pb-1 outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
              >
                {/* A small card in the subject's color, like the ones in her hand. It rises a little on hover / press. */}
                <span
                  aria-hidden
                  className="relative block h-28 w-20 rounded-xl border-4 border-white shadow-[0_4px_12px_rgb(23_34_44/0.22)] transition-transform duration-150 group-hover:-translate-y-1.5 group-active:-translate-y-0.5 motion-reduce:transition-none"
                  style={{ background: color }}
                >
                  <span className="absolute inset-x-2 inset-y-5 flex items-center justify-center rounded-lg bg-white">
                    <span className="font-heading text-[15px] leading-none font-extrabold tracking-tight" style={{ color }}>
                      {subject}
                    </span>
                  </span>
                </span>
                <span className="text-center text-sm leading-tight font-semibold">{SUBJECT_SHORT_NAME[subject]}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
