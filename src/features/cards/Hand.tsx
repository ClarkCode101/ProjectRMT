import { useLayoutEffect, useRef, useState } from 'react'
import { cardLabel, type Card } from '@/lib/cards'
import { cn } from '@/lib/utils'
import { CardFace } from './PlayingCard'
import { handLayout } from './handState'

type Props = {
  cards: readonly Card[]
  /** ids of the cards she may pick right now (empty when it isn't her move) */
  playableIds: ReadonlySet<string>
  selectedId: string | null
  onSelect: (cardId: string) => void
  /** cards still flying into her hand (useCardFlights): their spot is kept, but they show once they land */
  hiddenIds?: ReadonlySet<string>
}

/**
 * Her hand, fanned at the bottom (thumb zone). On her turn the cards that fit lift a little, like cards you mean to
 * play; tap one to pick it (it lifts more, with a blue outline). The colors never change: fading the cards that don't
 * fit made the whole hand change color on every turn (changed 2026-11-12). The more cards, the more they overlap; on
 * her turn the cards that fit keep enough showing to tap and the others squeeze up (handLayout). Phones get smaller
 * cards. Past the tightest overlap, the row scrolls sideways.
 */
export function Hand({ cards, playableIds, selectedId, onSelect, hiddenIds }: Props) {
  const listRef = useRef<HTMLUListElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  // A finger (phone, iPad) needs a wider strip to tap than a mouse does. Read once: it doesn't change mid-game.
  const [touch] = useState(() => typeof window === 'undefined' || window.matchMedia('(pointer: coarse)').matches)

  const count = cards.length
  const { size, cardWidth, steps, fits } = handLayout(
    cards.map((c) => playableIds.has(c.id)),
    width ?? 0,
    touch,
  )
  return (
    <ul
      ref={listRef}
      aria-label="Your cards"
      // Scrolling (very crowded, e.g. 20+ cards on a phone): sideways only. The tilted end cards dip a little below
      // the row, which used to add an up-and-down scrollbar too, so there's more room at the bottom and no Y scroll.
      className={cn('flex min-w-0 items-end px-3 pt-8', fits ? 'justify-center pb-5' : 'justify-start overflow-x-auto overflow-y-hidden pb-8 pl-6')}
      // Hidden until measured, so the cards don't jump on the first paint.
      style={{ visibility: width === null ? 'hidden' : undefined }}
    >
      {cards.map((card, i) => {
        const playable = playableIds.has(card.id)
        const selected = card.id === selectedId
        // A gentle fan: tilted out from the middle, the ends a little lower.
        const offset = i - (count - 1) / 2
        const tilt = Math.max(-12, Math.min(12, offset * (count > 8 ? 2 : 3.5)))
        const drop = Math.min(16, offset * offset * (count > 8 ? 0.3 : 1.1))
        return (
          <li
            key={card.id}
            data-card-id={card.id}
            // The spacing changes when her turn starts (room for the cards she can tap): slide, don't jump.
            className="shrink-0 transition-[margin] duration-200 ease-out motion-reduce:transition-none"
            style={{ marginLeft: i === 0 ? 0 : steps[i] - cardWidth, zIndex: i, visibility: hiddenIds?.has(card.id) ? 'hidden' : undefined }}
          >
            <button
              type="button"
              onClick={() => onSelect(card.id)}
              disabled={!playable}
              aria-pressed={selected}
              aria-label={`${cardLabel(card)}${playable ? '' : ', doesn’t fit now'}`}
              className={cn(
                'block rounded-xl outline-none transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-ring/50 motion-reduce:transition-none',
                playable ? 'cursor-pointer' : 'cursor-default',
              )}
              style={{ transform: `translateY(${drop - (selected ? 28 : playable ? 14 : 0)}px) rotate(${tilt}deg)`, transformOrigin: '50% 120%' }}
            >
              <CardFace card={card} size={size} className={selected ? 'shadow-[0_0_0_3px_white,0_0_0_6px_var(--primary),0_12px_22px_rgb(23_34_44/0.35)]' : undefined} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
