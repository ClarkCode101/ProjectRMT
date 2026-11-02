import type { ReactNode } from 'react'
import type { SubjectSummary } from '@/lib/quiz'

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
    rank: 2,
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
  BBIS: {
    name: 'Blood donation',
    about: 'Blood typing, crossmatching, transfusion and immunology.',
    side: 'left',
    rank: 3,
    iconBox: '42 182 20 20',
    icon: <path d="M52 185c3 5 5 8 5 10a5 5 0 0 1-10 0c0-2 2-5 5-10z" fill="#E5484D" />,
  },
}

export type SubjectStatus = 'passing' | 'low' | 'new'

export function subjectStatus(s: SubjectSummary): SubjectStatus {
  if (s.accuracy === null) return 'new'
  return s.belowPassing ? 'low' : 'passing'
}

export const STATUS_TEXT: Record<SubjectStatus, string> = { passing: 'Passing', low: 'Needs work', new: 'Not started' }

export const STATUS_COLOR: Record<SubjectStatus, string> = {
  passing: 'text-correct',
  low: 'text-wrong',
  new: 'text-muted-foreground',
}
