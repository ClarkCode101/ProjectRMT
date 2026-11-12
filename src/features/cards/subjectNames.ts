import type { CardSubject } from '@/lib/cards'

/**
 * Short subject names for the Last Card table and the subject picker, so a label never grows the layout
 * (the full names, e.g. "Histopathologic Techniques, Cytotechnology, MT Laws & Ethics", made the table resize).
 */
export const SUBJECT_SHORT_NAME: Record<CardSubject, string> = {
  CC: 'Clinical Chemistry',
  MICRO: 'Micro & Para',
  HEMA: 'Hematology',
  BBIS: 'Blood Bank',
  CM: 'Clinical Microscopy',
  HTMLE: 'Histopath & Laws',
}
