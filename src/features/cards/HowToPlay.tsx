import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Card } from '@/lib/cards'
import { CardFace } from './PlayingCard'

// "How to play" for Last Card (PROJECT_PLAN.md §15): opened with the ? at the top right, so she can check a rule
// without leaving the game. The computer players wait while it's open.

const SPECIAL: { card: Card; name: string; what: ReactNode }[] = [
  { card: { id: 'HEMA-skip', kind: 'skip', subject: 'HEMA' }, name: 'Skip', what: 'The next player loses their turn.' },
  { card: { id: 'CC-reverse', kind: 'reverse', subject: 'CC' }, name: 'Reverse', what: 'The order of turns flips.' },
  {
    card: { id: 'BBIS-draw2', kind: 'draw2', subject: 'BBIS' },
    name: 'Draw 2',
    what: 'The next player answers 2 questions, draws 1 card for each wrong one, then loses their turn.',
  },
  {
    card: { id: 'wild-1', kind: 'wild' },
    name: 'Wild',
    what: 'Plays on anything. Its question comes from your weakest topic; get it right and you pick the next subject.',
  },
]

export function HowToPlay({ headingId, onClose }: { headingId: string; onClose: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 id={headingId} className="font-heading text-xl font-bold">
          How to play
        </h2>
        <p className="text-sm text-muted-foreground">Be the first to run out of cards.</p>
      </div>

      <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-snug marker:font-bold marker:text-primary">
        <li>
          <span className="font-semibold">Match the subject or the number</span> of the card in the middle. The cards that fit lift up on your turn.
        </li>
        <li>
          <span className="font-semibold">Answer its question.</span> Right: the card goes down. Wrong: it stays in your hand and you draw 1.
        </li>
        <li>
          <span className="font-semibold">Nothing fits?</span> Draw a card. If it fits, you may play it.
        </li>
        <li>
          <span className="font-semibold">Last card:</span> everyone sees it when a player has one card left.
        </li>
      </ol>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Special cards</h3>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SPECIAL.map(({ card, name, what }) => (
            <li key={name} className="flex items-start gap-3">
              <CardFace card={card} size="sm" className="shrink-0" />
              <p className="text-sm leading-snug">
                <span className="block font-heading font-bold">{name}</span>
                {what}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-muted-foreground">Every answer counts in your scores, like Practice.</p>

      <Button className="h-12 w-full rounded-xl font-heading text-lg font-bold" onClick={onClose} autoFocus>
        Got it
      </Button>
    </div>
  )
}
