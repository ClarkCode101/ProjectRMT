import type { ReactNode } from 'react'
import { FLOOR_LABEL, MIN_ANSWERED, PASSING_LABEL, PASSING_RATE, type SubjectSummary } from '@/lib/quiz'

// Each board subject lives in the body part a MedTech links it to.
export type Organ = {
  name: string
  /** one line on what the subject covers */
  about: string
  /** which side of the body its card goes on (laptop), and its place from the top on that side */
  side: 'left' | 'right'
  rank: number
  /** the organ's own color, used to tint its icon on the card */
  color: string
  /** small cartoon picture (a little character with a face), used on the cards and on the body; viewBox + shapes */
  iconBox: string
  icon: ReactNode
}

// How the cartoon organs are drawn:
// - INK is the dark outline every cartoon shape gets.
// - The main shape is filled with var(--organ-fill, its color): the body sets --organ-fill to grey
//   for a subject she hasn't started yet, so the organ "gets its color" once she answers something.
const INK = '#0E3445'
const outline = { stroke: INK, strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const fillOf = (color: string) => ({ fill: `var(--organ-fill, ${color})` })
const shine = { fill: 'none', stroke: '#FFFFFF', strokeOpacity: 0.7, strokeWidth: 2.2, strokeLinecap: 'round' } as const

/** The little face every organ has: two eyes and a smile, moved by (x, y) to sit well on each shape. */
function Face({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="19" cy="25" r="2.3" fill={INK} />
      <circle cx="29" cy="25" r="2.3" fill={INK} />
      <path d="M20.5 29.5q3.5 3.5 7 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  )
}

export const ORGANS: Record<string, Organ> = {
  HTMLE: {
    name: 'Brain & tissue',
    about: 'Tissue processing, staining, cytology, MT laws and ethics.',
    side: 'right',
    rank: 1,
    color: '#9B7BEA',
    iconBox: '0 0 48 48',
    icon: (
      <>
        <path d="M13 36a8.5 8.5 0 0 1-6-14a9 9 0 0 1 8-12a10 10 0 0 1 18 0a9 9 0 0 1 8 12a8.5 8.5 0 0 1-6 14a9 9 0 0 1-11 3a9 9 0 0 1-11-3z" style={fillOf('#9B7BEA')} {...outline} />
        <path d="M24 9v7M14 16q4-1 5 3M34 16q-4-1-5 3" {...shine} strokeWidth={2} />
        <Face y={2} />
      </>
    ),
  },
  MICRO: {
    name: 'Lungs',
    about: 'Bacteria, TB, fungi, viruses and parasites.',
    side: 'left',
    rank: 1,
    color: '#4FB6E8',
    iconBox: '0 0 48 48',
    icon: (
      <>
        <path d="M24 4v13" fill="none" stroke="#2A8FC4" strokeWidth="5" strokeLinecap="round" />
        <path d="M23 14v22c0 5-5 8-11 7s-8-6-7-13c1-8 6-15 12-18c3-1.5 6 0 6 2z" style={fillOf('#4FB6E8')} {...outline} />
        <path d="M25 14v22c0 5 5 8 11 7s8-6 7-13c-1-8-6-15-12-18c-3-1.5-6 0-6 2z" style={fillOf('#4FB6E8')} {...outline} />
        <circle cx="15" cy="28" r="2.3" fill={INK} />
        <circle cx="33" cy="28" r="2.3" fill={INK} />
        <path d="M20.5 33q3.5 3.5 7 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  HEMA: {
    name: 'Heart & blood',
    about: 'Blood cells, anemias, leukemias and clotting.',
    side: 'right',
    rank: 2,
    color: '#E5484D',
    iconBox: '0 0 48 48',
    icon: (
      <>
        <path d="M24 42C10 32 4 25 4 16.5a9.5 9.5 0 0 1 20-3a9.5 9.5 0 0 1 20 3C44 25 38 32 24 42z" style={fillOf('#E5484D')} {...outline} />
        <path d="M10 16c0-3 2-5 4.5-5.5" {...shine} />
        <Face y={-2} />
      </>
    ),
  },
  CC: {
    name: 'Liver',
    about: 'Liver and kidney function, enzymes, glucose, lipids and electrolytes.',
    side: 'left',
    rank: 3,
    color: '#B9773F',
    iconBox: '0 0 48 48',
    icon: (
      <>
        <path d="M4 21c0-8 10-12 23-12c11 0 18 3 18 9c0 7-8 10-15 14s-12 8-18 7s-8-9-8-18z" style={fillOf('#B9773F')} {...outline} />
        <path d="M10 18c2-3 6-4.5 11-5" {...shine} />
        <Face x={-2} y={-2} />
      </>
    ),
  },
  CM: {
    name: 'Kidneys',
    about: 'Urinalysis and other body fluids.',
    side: 'right',
    rank: 3,
    color: '#E8875A',
    iconBox: '0 0 48 48',
    icon: (
      <>
        <path d="M27 5c10 1 16 10 15 21s-9 18-18 17c-8-1-11-8-7-14c2-3 2-5 0-8c-4-7 2-17 10-16z" style={fillOf('#E8875A')} {...outline} />
        <path d="M36 17c1.5 3 2 6 1.5 9" {...shine} />
        <Face x={4} y={-2} />
      </>
    ),
  },
  // BBIS sits ABOVE CC on the left, although the liver is a bit higher than the arm's blood drop:
  // both cards are lower than their organs, and the card of the outer organ (the drop) has to be the higher one,
  // or the two lines cross.
  BBIS: {
    name: 'Blood donation',
    about: 'Blood typing, crossmatching, transfusion and immunology.',
    side: 'left',
    rank: 2,
    color: '#E5484D',
    iconBox: '0 0 48 48',
    icon: (
      <>
        <path d="M24 4C33 16 39 23 39 30a15 15 0 0 1-30 0C9 23 15 16 24 4z" style={fillOf('#E5484D')} {...outline} />
        <path d="M15 30c0-3 1.5-6 3.5-8.5" {...shine} />
        <Face y={5} />
      </>
    ),
  },
}

/**
 * How far along she is in a subject:
 * new = nothing answered; starting = fewer than MIN_ANSWERED (too few for a real score, so no "low" yet);
 * low = below 75% with enough answers; passing = 75% or more with enough answers.
 */
export type SubjectStatus = 'new' | 'starting' | 'low' | 'passing'

/** Answers needed before a subject's score counts as real (one rule for the whole app, kept in lib/quiz). */
export { MIN_ANSWERED }

export function subjectStatus(s: SubjectSummary): SubjectStatus {
  if (s.accuracy === null || s.attempts === 0) return 'new'
  if (s.attempts < MIN_ANSWERED) return 'starting'
  return s.belowPassing ? 'low' : 'passing'
}

export const STATUS_TEXT: Record<SubjectStatus, string> = { new: 'Not started', starting: 'Getting started', low: `Below ${PASSING_LABEL}`, passing: 'Passing' }

/** Text color of the status. Amber (not red) for "below 75%": it's a next step, not an alarm. */
export const STATUS_COLOR: Record<SubjectStatus, string> = {
  new: 'text-muted-foreground',
  starting: 'text-primary-deep',
  low: 'text-[#9A5B00]',
  passing: 'text-correct',
}

/** The small line under the big number. Below 50% says so: that one subject alone would fail the exam. */
export function scoreCaption(s: SubjectSummary): string {
  const status = subjectStatus(s)
  if (status === 'low' && s.belowFloor) return `Below ${FLOOR_LABEL}`
  return status === 'starting' ? 'answered' : STATUS_TEXT[status]
}

/**
 * Home's overall line, told as distance to the goal ("32% to go to passing"), which pulls harder than "you're at 28%".
 * `floorCodes`: answered subjects below 50%. Even with the average at 75%, any of them fails the exam, so that comes first.
 */
export function readinessGoal(rate: number, floorCodes: readonly string[] = []): string {
  const pct = Math.round(rate * 100)
  const toGo = Math.round(PASSING_RATE * 100) - pct
  if (toGo > 0) return `${toGo}% to go to passing`
  if (floorCodes.length > 0) return `Get ${floorCodes.join(', ')} above ${FLOOR_LABEL}`
  return `Passing · keep it above ${PASSING_LABEL}`
}

/** The next small win on a subject card: what to do to reach the next step. */
export function nextMilestone(s: SubjectSummary): string {
  const status = subjectStatus(s)
  if (status === 'new') return 'Not started yet'
  if (status === 'starting') return `${MIN_ANSWERED - s.attempts} more for a real score`
  if (status === 'low') {
    const k = correctToPass(s)
    return `${k} right in a row to pass`
  }
  return 'Passing · keep it up'
}

/** How many she got right (attempts × accuracy, rounded). */
export function correctCount(s: SubjectSummary): number {
  return s.accuracy === null ? 0 : Math.round(s.accuracy * s.attempts)
}

/**
 * How many more correct answers in a row would bring the score to 75%.
 * Solves (correct + k) / (attempts + k) ≥ 0.75 for the smallest whole k.
 */
export function correctToPass(s: SubjectSummary): number {
  const k = (PASSING_RATE * s.attempts - correctCount(s)) / (1 - PASSING_RATE)
  return Math.max(0, Math.ceil(k - 1e-9))
}

/**
 * How an organ looks on the body: grey until she answers something in its subject, then its full color
 * (the color "unlocks" as soon as she starts), and glowing once the subject is passing.
 * (Mixing the colors toward grey by score made every organ look muddy, so it's on/off, plus the glow.)
 */
export type OrganLook = 'grey' | 'color' | 'glow'

export function organLook(s: SubjectSummary): OrganLook {
  const status = subjectStatus(s)
  if (status === 'new') return 'grey'
  return status === 'passing' ? 'glow' : 'color'
}
