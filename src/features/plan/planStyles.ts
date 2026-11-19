// Class names shared by the plan bar on Home and the Plan page.
import type { Tone } from './planText'

/** The quiet white button (same look as Warm-up on the Next up bar). */
export const quietButtonClass =
  'flex h-11 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-card px-4 font-heading text-base font-semibold whitespace-nowrap shadow-toon-sm outline-none transition-[transform,box-shadow] duration-75 hover:bg-secondary/60 focus-visible:ring-3 focus-visible:ring-ring/40 active:translate-y-[3px] active:shadow-none'

/** The small tag under a task: red = needs work, gold = past mistakes, blue = everything else. */
export const TONE_CLASS: Record<Tone, string> = {
  red: 'border-wrong bg-wrong-soft text-wrong',
  gold: 'border-highlight bg-highlight-soft text-foreground',
  blue: 'border-primary bg-primary/10 text-primary-deep',
}

/** On a dark results panel: the see-through button beside the gold one (same size and shape). */
export const quietHeroButtonClass =
  'flex h-12 items-center justify-center gap-2 rounded-2xl border-[2.5px] border-white/35 bg-white/10 px-5 font-heading text-lg font-semibold whitespace-nowrap text-white outline-none hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/60 active:translate-y-px'

export const tagClass = 'inline-block rounded-full border-[1.5px] px-2 py-px text-xs font-bold whitespace-nowrap'
