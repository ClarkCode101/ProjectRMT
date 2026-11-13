// Small helpers shared by the tube pictures on Practice (the rack, the pour scene, the dots and the key).
import { ZONE_SUBJECTS } from '@/lib/board'
import { SUBJECT_COLOR } from '@/lib/books'

export type TubeStatus = 'low' | 'passing' | 'new'

export function tubeStatus(accuracy: number | null, belowPassing: boolean): TubeStatus {
  return accuracy === null ? 'new' : belowPassing ? 'low' : 'passing'
}

/** The Mix tube's code (all six subjects). */
export const MIX_CODE = 'MIX'

/**
 * The liquid's colors, bottom to top. A subject = its own color (the same as its book and its Last Card suit);
 * Mix = one layer per subject, like a centrifuged sample (and like the Wild card).
 * The cap stays red / green / gray for the score, so color never means two things in the same place.
 */
export function liquidColors(code: string): string[] {
  if (code === MIX_CODE) return ZONE_SUBJECTS.map((s) => SUBJECT_COLOR[s])
  return [SUBJECT_COLOR[code] ?? 'var(--primary)']
}

/**
 * A CSS background for the liquid. `to` = which way it runs ('top' in a tube, 'right' for a flat swatch).
 * One color: solid at the bottom, a little lighter at the surface. Several: hard-edged layers.
 */
export function liquidBackground(code: string, to: 'top' | 'right' = 'top'): string {
  const colors = liquidColors(code)
  if (colors.length === 1) return `linear-gradient(to ${to}, ${colors[0]}, color-mix(in srgb, ${colors[0]} 65%, transparent))`
  const step = 100 / colors.length
  return `linear-gradient(to ${to}, ${colors.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(', ')})`
}
