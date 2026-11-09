import type { ReactNode } from 'react'
import { PASSING_RATE, type SubjectSummary } from '@/lib/quiz'

// Each board subject lives in the body part a MedTech links it to.
export type Organ = {
  name: string
  /** one line on what the subject covers */
  about: string
  /** which side of the body its card goes on (laptop), and its place from the top on that side */
  side: 'left' | 'right'
  rank: number
  /** small flat picture for cards; viewBox + shapes */
  iconBox: string
  icon: ReactNode
}

export const ORGANS: Record<string, Organ> = {
  HTMLE: {
    name: 'Brain & tissue',
    about: 'Tissue processing, staining, cytology, MT laws and ethics.',
    side: 'right',
    rank: 1,
    iconBox: '84 16 32 28',
    icon: <ellipse cx="100" cy="30" rx="14" ry="11" fill="#9B7BEA" />,
  },
  MICRO: {
    name: 'Lungs',
    about: 'Bacteria, TB, fungi, viruses and parasites.',
    side: 'left',
    rank: 1,
    iconBox: '72 96 56 50',
    icon: (
      <>
        <path d="M96 100c-10 2-17 14-18 30-1 10 4 13 10 11 6-2 8-8 8-16z" fill="#4FB6E8" />
        <path d="M104 100c10 2 17 14 18 30 1 10-4 13-10 11-6-2-8-8-8-16z" fill="#4FB6E8" />
      </>
    ),
  },
  HEMA: {
    name: 'Heart & blood',
    about: 'Blood cells, anemias, leukemias and clotting.',
    side: 'right',
    rank: 2,
    iconBox: '94 114 24 26',
    icon: <path d="M106 122c2-4 8-4 9 1 1 5-5 10-9 13-4-3-10-8-9-13 1-5 7-5 9-1z" fill="#E5484D" />,
  },
  CC: {
    name: 'Liver',
    about: 'Liver and kidney function, enzymes, glucose, lipids and electrolytes.',
    side: 'left',
    rank: 3,
    iconBox: '72 136 38 26',
    icon: <path d="M78 146c8-4 22-5 27-1 2 3-3 9-12 12-9 3-17 1-17-4 0-3 1-5 2-7z" fill="#B9773F" />,
  },
  CM: {
    name: 'Kidneys',
    about: 'Urinalysis and other body fluids.',
    side: 'right',
    rank: 3,
    iconBox: '72 160 56 28',
    icon: (
      <>
        <path d="M84 166c-5 0-7 6-6 11 1 6 6 8 9 5 2-2 1-5 3-7 2-3 0-9-6-9z" fill="#E8875A" />
        <path d="M116 166c5 0 7 6 6 11-1 6-6 8-9 5-2-2-1-5-3-7-2-3 0-9 6-9z" fill="#E8875A" />
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
    iconBox: '42 182 20 20',
    icon: <path d="M52 185c3 5 5 8 5 10a5 5 0 0 1-10 0c0-2 2-5 5-10z" fill="#E5484D" />,
  },
}

/**
 * How far along she is in a subject:
 * new = nothing answered; starting = fewer than MIN_ANSWERED (too few for a real score, so no "low" yet);
 * low = below 60% with enough answers; passing = 60% or more with enough answers.
 */
export type SubjectStatus = 'new' | 'starting' | 'low' | 'passing'

/** Answers needed before a subject's score counts as real (0% after one question says very little). */
export const MIN_ANSWERED = 10

export function subjectStatus(s: SubjectSummary): SubjectStatus {
  if (s.accuracy === null || s.attempts === 0) return 'new'
  if (s.attempts < MIN_ANSWERED) return 'starting'
  return s.belowPassing ? 'low' : 'passing'
}

export const STATUS_TEXT: Record<SubjectStatus, string> = { new: 'Not started', starting: 'Getting started', low: 'Below 60%', passing: 'Passing' }

/** Text color of the status. Amber (not red) for "below 60%": it's a next step, not an alarm. */
export const STATUS_COLOR: Record<SubjectStatus, string> = {
  new: 'text-muted-foreground',
  starting: 'text-primary-deep',
  low: 'text-[#9A5B00]',
  passing: 'text-correct',
}

/** How many she got right (attempts × accuracy, rounded). */
export function correctCount(s: SubjectSummary): number {
  return s.accuracy === null ? 0 : Math.round(s.accuracy * s.attempts)
}

/**
 * How many more correct answers in a row would bring the score to 60%.
 * Solves (correct + k) / (attempts + k) ≥ 0.6 for the smallest whole k.
 */
export function correctToPass(s: SubjectSummary): number {
  const k = (PASSING_RATE * s.attempts - correctCount(s)) / (1 - PASSING_RATE)
  return Math.max(0, Math.ceil(k - 1e-9))
}

/** The one-line "what next" in the subject card under the body. */
export function statusDetail(s: SubjectSummary): string {
  const status = subjectStatus(s)
  if (status === 'new') return 'Answer a few to see your score'
  const right = `${correctCount(s)} of ${s.attempts} correct`
  if (status === 'starting') return `${right} · ${MIN_ANSWERED - s.attempts} more for a real score`
  if (status === 'low') {
    const k = correctToPass(s)
    return `${right} · ${k} right in a row to pass`
  }
  return right
}

/**
 * How an organ looks on the 3D body: grey until she answers something in its subject, then its full color
 * (the color "unlocks" as soon as she starts), and glowing once the subject is passing.
 * (Mixing the colors toward grey by score made every organ look muddy, so it's on/off, plus the glow.)
 */
export type OrganLook = 'grey' | 'color' | 'glow'

export function organLook(s: SubjectSummary): OrganLook {
  const status = subjectStatus(s)
  if (status === 'new') return 'grey'
  return status === 'passing' ? 'glow' : 'color'
}
