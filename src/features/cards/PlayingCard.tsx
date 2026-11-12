import { Ban, Repeat } from 'lucide-react'
import type { CSSProperties } from 'react'
import { SUBJECT_COLOR } from '@/lib/books'
import { CARD_SUBJECTS, type Card } from '@/lib/cards'
import { cn } from '@/lib/utils'

// The cards' own look (PROJECT_PLAN.md §15, mockup v2): the subject's color with a white rounded window in the
// middle, and the subject code in two corners, so the color is never the only signal (WCAG 1.4.1).
// Card backs: analyzer-blue stripes with an "RMT" mark.

/** Sizes in px: width (the height is 1.42 × width). */
export type CardSize = 'xs' | 'sm' | 'md' | 'lg'
const WIDTH: Record<CardSize, number> = { xs: 30, sm: 64, md: 84, lg: 104 }

/** Six bands, one per subject, for a Wild. */
const WILD_BACKGROUND = `linear-gradient(180deg, ${CARD_SUBJECTS.map((s, i) => `${SUBJECT_COLOR[s]} ${(i * 100) / 6}% ${((i + 1) * 100) / 6}%`).join(', ')})`

function cardBox(size: CardSize): CSSProperties {
  const width = WIDTH[size]
  return { width, height: Math.round(width * 1.42) }
}

/** The Skip / Reverse mark in the corner index. */
function Corner({ card, iconClass }: { card: Card; size: CardSize; iconClass: string }) {
  if (card.kind === 'skip') return <Ban className={iconClass} strokeWidth={3} aria-hidden />
  if (card.kind === 'reverse') return <Repeat className={iconClass} strokeWidth={3} aria-hidden />
  return null
}

/** The big thing in the white window. */
function Middle({ card, size }: { card: Card; size: CardSize }) {
  const big = size === 'lg' ? 'text-5xl' : size === 'md' ? 'text-4xl' : 'text-2xl'
  const icon = size === 'lg' ? 'size-11' : size === 'md' ? 'size-9' : 'size-6'
  const word = cn('mt-0.5 font-bold tracking-wide uppercase', size === 'sm' ? 'text-[8px]' : 'text-[10px]')
  if (card.kind === 'number') return <span className={cn('font-heading leading-none font-extrabold', big)}>{card.number}</span>
  if (card.kind === 'wild') {
    return (
      <span className="flex flex-col items-center text-foreground">
        <span className={cn('font-heading leading-none font-extrabold', size === 'sm' ? 'text-sm' : 'text-xl')}>Wild</span>
        {size !== 'sm' && <span className={cn(word, 'text-center text-[8px] leading-tight')}>Any<br />subject</span>}
      </span>
    )
  }
  const Icon = card.kind === 'skip' ? Ban : Repeat
  return (
    <span className="flex flex-col items-center">
      {card.kind === 'draw2' ? (
        <span className={cn('font-heading leading-none font-extrabold', size === 'lg' ? 'text-4xl' : size === 'md' ? 'text-3xl' : 'text-xl')}>+2</span>
      ) : (
        <Icon className={icon} strokeWidth={2.6} aria-hidden />
      )}
      {size !== 'sm' && <span className={word}>{card.kind === 'draw2' ? 'Draw 2' : card.kind}</span>}
    </span>
  )
}

/**
 * The corner "index" of each size, like a real playing card's: one line at the top left ("5 HEMA") with nothing
 * over it, so it still reads when the cards overlap in her hand (only their left edge shows). The white window
 * sits below it. (Redesigned 2026-11-12: the subject code used to sit under the window, cut to "HE…", at 9px.)
 */
const INDEX: Record<CardSize, { symbol: string; code: string; icon: string; band: number; side: number }> = {
  xs: { symbol: 'text-[8px]', code: 'text-[6px]', icon: 'size-2', band: 10, side: 2 },
  sm: { symbol: 'text-[11px]', code: 'text-[9px]', icon: 'size-2.5', band: 17, side: 5 },
  md: { symbol: 'text-[13px]', code: 'text-[10px]', icon: 'size-3', band: 21, side: 7 },
  lg: { symbol: 'text-[15px]', code: 'text-[11px]', icon: 'size-3.5', band: 25, side: 9 },
}

/** "5 HEMA", "⊘ CC", "+2 CM", or "WILD": white, with a soft shadow so it reads on every subject color. */
function Index({ card, size }: { card: Card; size: CardSize }) {
  const s = INDEX[size]
  const code = card.kind === 'wild' ? 'WILD' : card.subject
  return (
    <span className="flex items-center gap-1 leading-none font-extrabold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.3)]">
      {card.kind !== 'wild' && (
        <span className={cn('flex items-center font-heading', s.symbol)}>
          {card.kind === 'number' ? card.number : card.kind === 'draw2' ? '+2' : <Corner card={card} size={size} iconClass={s.icon} />}
        </span>
      )}
      <span className={cn('tracking-wide', s.code)}>{code}</span>
    </span>
  )
}

/** A face-up card. Decorative on its own: whatever wraps it gives the name (e.g. a button's aria-label). */
export function CardFace({ card, size = 'lg', className, style }: { card: Card; size?: CardSize; className?: string; style?: CSSProperties }) {
  const color = card.kind === 'wild' ? undefined : SUBJECT_COLOR[card.subject]
  const { band, side } = INDEX[size]
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0 rounded-xl border-4 border-white shadow-[0_4px_12px_rgb(23_34_44/0.22)]', size === 'sm' && 'rounded-lg border-[3px]', className)}
      style={{ ...cardBox(size), background: card.kind === 'wild' ? WILD_BACKGROUND : color, ...style }}
    >
      <span className="absolute top-1 left-1.5">
        <Index card={card} size={size} />
      </span>
      <span className="absolute right-1.5 bottom-1 rotate-180">
        <Index card={card} size={size} />
      </span>
      <span
        className={cn('absolute flex items-center justify-center bg-white', size === 'sm' ? 'rounded-md' : 'rounded-lg')}
        style={{ color, top: band, bottom: band, left: side, right: side }}
      >
        <Middle card={card} size={size} />
      </span>
    </div>
  )
}

/** A face-down card. */
export function CardBack({ size = 'sm', className, style }: { size?: CardSize; className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center border-white shadow-[0_2px_5px_rgb(23_34_44/0.25)]',
        size === 'xs' ? 'rounded-[5px] border-2' : 'rounded-xl border-4',
        className,
      )}
      style={{ ...cardBox(size), background: 'repeating-linear-gradient(135deg, var(--primary) 0 5px, var(--primary-deep) 5px 10px)', ...style }}
    >
      {size !== 'xs' && <span className="rounded-md bg-white px-1.5 py-0.5 font-heading text-xs font-extrabold tracking-wide text-primary-deep">RMT</span>}
    </div>
  )
}
