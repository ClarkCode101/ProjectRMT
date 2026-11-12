import { CircleCheck, Layers, Play, Save, Shuffle, Trophy } from 'lucide-react'
import { PageHeader } from '@/components/dashboard'
import { heroButtonClass } from '@/components/report'
import type { Card, CardGame } from '@/lib/cards'
import { cn } from '@/lib/utils'
import { CardBack, CardFace } from './PlayingCard'

// Last Card's start screen, laid out like Board Review and Mock exam (one screen, read top to bottom):
// title → a fan of cards in the middle → one status line → one row of buttons → the rules.

type Props = {
  /** the game she can continue, or null */
  inProgress: CardGame | null
  onContinue: () => void
  onNewGame: () => void
}

const RULES = [
  { icon: Layers, text: 'Match the subject or the number' },
  { icon: CircleCheck, text: 'Answer right to put a card down' },
  { icon: Shuffle, text: 'Wild: you pick the next subject' },
  { icon: Trophy, text: 'First to run out of cards wins' },
  { icon: Save, text: 'Saved on this device' },
]

/** A sample hand for the picture in the middle: one card of each kind, in a few subjects. */
const SAMPLE: Card[] = [
  { id: 'CC-7', kind: 'number', subject: 'CC', number: 7 },
  { id: 'MICRO-skip', kind: 'skip', subject: 'MICRO' },
  { id: 'HEMA-3', kind: 'number', subject: 'HEMA', number: 3 },
  { id: 'wild-1', kind: 'wild' },
  { id: 'CM-draw2', kind: 'draw2', subject: 'CM' },
  { id: 'HTMLE-reverse', kind: 'reverse', subject: 'HTMLE' },
]

export function CardsIntro({ inProgress, onContinue, onNewGame }: Props) {
  return (
    // One screen tall, no scrolling (same as Board Review).
    <div className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-120 max-w-5xl flex-col gap-3 md:h-[calc(100dvh-2.5rem)] md:min-h-136">
      <PageHeader title="Last Card" subtitle="Match the subject or the number. Answer right to put a card down." />

      {/* ---------- The picture: the draw pile and a fanned hand ---------- */}
      <section aria-hidden className="flex min-h-0 flex-1 items-center justify-center gap-10">
        <div className="relative hidden sm:block" style={{ width: 92, height: 124 }}>
          <CardBack size="md" className="absolute top-2 left-1.5" />
          <CardBack size="md" className="absolute top-1 left-0.5" />
          <CardBack size="md" className="absolute top-0 left-0" />
        </div>
        <div className="flex items-end">
          {SAMPLE.map((card, i) => {
            const offset = i - (SAMPLE.length - 1) / 2
            return (
              <CardFace
                key={card.id}
                card={card}
                className={cn(i > 0 && '-ml-10 sm:-ml-6')}
                style={{ transform: `translateY(${offset * offset * 2}px) rotate(${offset * 5}deg)`, transformOrigin: '50% 120%' }}
              />
            )
          })}
        </div>
      </section>

      {/* ---------- Status: one line ---------- */}
      <p className="shrink-0 truncate px-4 text-center text-base text-muted-foreground tabular-nums" aria-live="polite">
        {inProgress ? (
          <>
            <span className="font-bold text-[#9A5B00]">Paused</span> · you have <span className="font-bold text-foreground">{inProgress.players[0].hand.length} cards</span> ·{' '}
            {inProgress.correct}/{inProgress.answered} correct
          </>
        ) : (
          <>
            <span className="font-bold text-foreground">New game</span> · you and 3 computer players, 7 cards each
          </>
        )}
      </p>

      {/* ---------- One row of buttons (Continue / Start is the main action) ---------- */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        {inProgress && (
          <button
            type="button"
            onClick={onNewGame}
            className="flex h-12 items-center rounded-lg border bg-card px-5 font-heading font-bold outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            New game
          </button>
        )}
        <button type="button" onClick={inProgress ? onContinue : onNewGame} className={cn(heroButtonClass, 'w-auto px-7 focus-visible:ring-ring/50')}>
          <Play className="size-5 fill-current" aria-hidden />
          {inProgress ? 'Continue' : 'Start game'}
        </button>
      </div>

      {/* ---------- The rules: one quiet line under it all ---------- */}
      <div className="w-full shrink-0 border-t border-dashed pt-3">
        <h2 className="sr-only">How it works</h2>
        <ul className="flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground sm:text-sm">
          {RULES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
