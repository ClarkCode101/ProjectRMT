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
  /** the organ's own color (same as on the 3D body), used to tint its icon on the card */
  color: string
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
    color: '#9B7BEA',
    iconBox: '0 0 24 24',
    icon: (
      <>
        <path d="M12.4 16.6l1 4" fill="none" stroke="#7C5BD6" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="16.7" cy="17.3" rx="3.3" ry="2.2" fill="#7C5BD6" />
        <path d="M3.8 12.1c0-4.3 3.5-7.3 8.2-7.3 4.8 0 8.3 2.8 8.3 6.6 0 2.9-2 4.7-5 5-1.2.1-2 .3-2.8 1-.9.7-2.2.8-3.4.4-3.3-1-5.3-2.8-5.3-5.7z" fill="#9B7BEA" />
        <path d="M7.6 9.6c1.5-1.1 3.1-.7 3.8.6M12.6 7.5c1.7-.5 3.3.2 4 1.5M6.8 13.2c1.5.6 2.9.2 3.6-.9M13 11.8c1.3 1 3.1 1 4.3 0M10.2 15.6c.9-.9 2.2-1.1 3.2-.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeLinecap="round" strokeWidth="1.1" />
      </>
    ),
  },
  MICRO: {
    name: 'Lungs',
    about: 'Bacteria, TB, fungi, viruses and parasites.',
    side: 'left',
    rank: 1,
    color: '#4FB6E8',
    iconBox: '0 0 24 24',
    icon: (
      <>
        <path d="M9.7 7.4c-3.1 1-5.9 5.2-5.9 9.7 0 2.4 1.3 3.4 3.4 2.8 2.3-.7 3.5-2.1 3.5-4.8V8.5c0-.8-.4-1.3-1-1.1z" fill="#4FB6E8" />
        <path d="M14.3 7.4c3.1 1 5.9 5.2 5.9 9.7 0 2.4-1.3 3.4-3.4 2.8-2.3-.7-3.5-2.1-3.5-4.8V8.5c0-.8.4-1.3 1-1.1z" fill="#4FB6E8" />
        <path d="M12 3.2v6.2M12 9.4l-2.9 2.8M12 9.4l2.9 2.8" fill="none" stroke="#2A8FC4" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 15.2c.2-2.2 1-4 2.1-5.3M18 15.2c-.2-2.2-1-4-2.1-5.3" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeLinecap="round" strokeWidth="1.1" />
      </>
    ),
  },
  HEMA: {
    name: 'Heart & blood',
    about: 'Blood cells, anemias, leukemias and clotting.',
    side: 'right',
    rank: 2,
    color: '#E5484D',
    iconBox: '0 0 24 24',
    icon: (
      <>
        <path d="M13.2 8.2V5.4c0-1.3 1.5-2 3.4-1.5" fill="none" stroke="#B8323A" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M10.3 8V4.3" fill="none" stroke="#4FB6E8" strokeWidth="2.3" strokeLinecap="round" />
        <path d="M12 20.8c-4.8-3.3-7.8-6.3-7.8-9.9 0-2.6 1.9-4.5 4.3-4.5 1.4 0 2.7.7 3.5 1.9.8-1.2 2.1-1.9 3.5-1.9 2.4 0 4.3 1.9 4.3 4.5 0 3.6-3 6.6-7.8 9.9z" fill="#E5484D" />
        <path d="M6.9 10.9c0-1.3.8-2.2 1.9-2.3" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeLinecap="round" strokeWidth="1.3" />
      </>
    ),
  },
  CC: {
    name: 'Liver',
    about: 'Liver and kidney function, enzymes, glucose, lipids and electrolytes.',
    side: 'left',
    rank: 3,
    color: '#B9773F',
    iconBox: '0 0 24 24',
    icon: (
      <>
        <ellipse cx="9.8" cy="17.3" rx="1.7" ry="2.5" transform="rotate(20 9.8 17.3)" fill="#6FA35A" />
        <path d="M3.2 10.6c0-2.6 2.4-4.2 6.5-4.5 4.8-.3 9.4.5 11 2.4 1.1 1.3-.4 3.5-3.5 5.3-2.7 1.5-4.5 3.2-6.8 4.2-3.5 1.5-7.2-.5-7.2-4.7z" fill="#B9773F" />
        <path d="M13 6.6c-.5 2.7-.2 5 .9 7.3" fill="none" stroke="#8F5626" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M5.6 10.3c.9-1.3 2.6-1.9 4.6-2" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeLinecap="round" strokeWidth="1.2" />
      </>
    ),
  },
  CM: {
    name: 'Kidneys',
    about: 'Urinalysis and other body fluids.',
    side: 'right',
    rank: 3,
    color: '#E8875A',
    iconBox: '0 0 24 24',
    icon: (
      <>
        <path d="M10 11.2c1.5.6 1.7 2.8 1.7 9.3M14 11.2c-1.5.6-1.7 2.8-1.7 9.3" fill="none" stroke="#C2643A" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M8 4.5c-2.8 0-4.6 2.7-4.6 6.3 0 3.7 1.9 6.4 4.4 6.4 1.7 0 2.5-1.2 2.4-2.7-.1-1.2-.9-1.9-.9-3.4s.8-2.1.9-3.3C10.3 6 9.5 4.5 8 4.5z" fill="#E8875A" />
        <path d="M16 4.5c2.8 0 4.6 2.7 4.6 6.3 0 3.7-1.9 6.4-4.4 6.4-1.7 0-2.5-1.2-2.4-2.7.1-1.2.9-1.9.9-3.4s-.8-2.1-.9-3.3C13.7 6 14.5 4.5 16 4.5z" fill="#E8875A" />
        <path d="M5.3 10.3c.1-1.7.8-3 1.9-3.6M18.7 10.3c-.1-1.7-.8-3-1.9-3.6" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeLinecap="round" strokeWidth="1.1" />
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
    iconBox: '0 0 24 24',
    icon: (
      <>
        <path d="M12 2.8c3.4 4.4 6.3 7.9 6.3 11.4a6.3 6.3 0 0 1-12.6 0c0-3.5 2.9-7 6.3-11.4z" fill="#E5484D" />
        <path d="M8.6 14.3a3.4 3.4 0 0 0 2.8 3.4" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeLinecap="round" strokeWidth="1.4" />
      </>
    ),
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

/** The small line under the big number. */
export function scoreCaption(s: SubjectSummary): string {
  const status = subjectStatus(s)
  return status === 'starting' ? 'answered' : STATUS_TEXT[status]
}

/** Home's overall line, told as distance to the goal ("32% to go to passing"), which pulls harder than "you're at 28%". */
export function readinessGoal(rate: number): string {
  const pct = Math.round(rate * 100)
  const toGo = Math.round(PASSING_RATE * 100) - pct
  return toGo > 0 ? `${toGo}% to go to passing` : 'Passing · keep it above 60%'
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
 * How many more correct answers in a row would bring the score to 60%.
 * Solves (correct + k) / (attempts + k) ≥ 0.6 for the smallest whole k.
 */
export function correctToPass(s: SubjectSummary): number {
  const k = (PASSING_RATE * s.attempts - correctCount(s)) / (1 - PASSING_RATE)
  return Math.max(0, Math.ceil(k - 1e-9))
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
