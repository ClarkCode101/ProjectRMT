import type { ReactNode } from 'react'
import { ORGAN_LAYERS } from './bodyTrace'

// Where each subject's organ sits in Home's body (BodyCartoon.tsx draws it), in the drawing's own units: 367 wide, 666 tall.
// The body and the organs are traced from a picture (bodyTrace.ts). The organs were moved to their real places:
// liver (the biggest) on her right under the ribs with the gallbladder, heart in the middle tipping to her left,
// kidneys just under the liver (her right one a little lower), bladder low in the pelvis. "Her right" is the screen's left.

/** The dark blue of the drawing's lines (used for the passing star's outline). */
export const INK = '#2C5F8F'

export type BodyOrgan = {
  /** the middle of the organ and its size: the gold ring, the glow and the extra tap area are circles around it */
  middle: { x: number; y: number }
  r: number
  /** where its card's line ends: the organ's edge on its card's side */
  lineEnd: { x: number; y: number }
  art: ReactNode
}

/** A subject's traced organ layers (paths are in half-pixels, so they are drawn at half size). */
function Traced({ code }: { code: string }) {
  return (
    <g transform="scale(0.5)">
      {ORGAN_LAYERS[code]?.map(([fill, d], i) => (
        <path key={i} d={d} fill={fill} fillRule="evenodd" />
      ))}
    </g>
  )
}

/** The blood drop (BBIS): drawn, not traced, in the same style as the traced organs (thin darker outline, small face). */
function BloodDrop({ x, y, s }: { x: number; y: number; s: number }) {
  const w = 8 * s
  const h = 22 * s
  const top = y - h * 0.55
  const bottom = y + h * 0.45
  const face = '#2C2A3E'
  return (
    <>
      <defs>
        <radialGradient id="body-blood-drop" cx="40%" cy="62%" r="65%">
          <stop offset="0" stopColor="#FF8A8E" />
          <stop offset="1" stopColor="#E5484D" />
        </radialGradient>
      </defs>
      <path
        d={`M${x} ${top}C${x + 2 * s} ${top + 6 * s} ${x + w} ${top + 10 * s} ${x + w} ${bottom - 6.5 * s}C${x + w} ${bottom - 2 * s} ${x + 4.5 * s} ${bottom} ${x} ${bottom}C${x - 4.5 * s} ${bottom} ${x - w} ${bottom - 2 * s} ${x - w} ${bottom - 6.5 * s}C${x - w} ${top + 10 * s} ${x - 2 * s} ${top + 6 * s} ${x} ${top}Z`}
        fill="url(#body-blood-drop)"
        stroke="#A8323E"
        strokeWidth={1.1 * s}
        strokeLinejoin="round"
      />
      <path
        d={`M${x - 4.8 * s} ${bottom - 7 * s}Q${x - 4.4 * s} ${bottom - 11.5 * s} ${x - 1.8 * s} ${bottom - 14 * s}`}
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity={0.75}
        strokeWidth={1.4 * s}
        strokeLinecap="round"
      />
      {[-1, 1].map((side) => (
        <g key={side}>
          <circle cx={x + side * 2.5 * s} cy={bottom - 6.2 * s} r={1.1 * s} fill={face} />
          <circle cx={x + side * 2.5 * s + 0.3 * s} cy={bottom - 6.6 * s} r={0.38 * s} fill="#FFFFFF" />
          <ellipse cx={x + side * 4.4 * s} cy={bottom - 4.4 * s} rx={1.3 * s} ry={0.75 * s} fill="#FFB3B8" opacity={0.8} />
        </g>
      ))}
      <path d={`M${x - 1.3 * s} ${bottom - 4.1 * s}q${1.3 * s} ${1.2 * s} ${2.6 * s} 0`} fill="none" stroke={face} strokeWidth={0.75 * s} strokeLinecap="round" />
    </>
  )
}

/** The organ of each subject (by subject code). Cards on the left: MICRO, CC, BBIS; on the right: HTMLE, HEMA, CM. */
export const BODY_ORGANS: Record<string, BodyOrgan> = {
  // Brain, in the head
  HTMLE: { middle: { x: 185, y: 41 }, r: 22, lineEnd: { x: 203, y: 38 }, art: <Traced code="HTMLE" /> },
  // Lungs: the ring goes around her right lung (screen left), on the card's side
  MICRO: { middle: { x: 165, y: 150 }, r: 24, lineEnd: { x: 150, y: 150 }, art: <Traced code="MICRO" /> },
  // Liver and gallbladder
  CC: { middle: { x: 182, y: 189 }, r: 30, lineEnd: { x: 155, y: 189 }, art: <Traced code="CC" /> },
  // Heart
  HEMA: { middle: { x: 197, y: 166 }, r: 17, lineEnd: { x: 212, y: 165 }, art: <Traced code="HEMA" /> },
  // Kidneys, ureters and bladder
  CM: { middle: { x: 187, y: 240 }, r: 36, lineEnd: { x: 216, y: 215 }, art: <Traced code="CM" /> },
  // The blood drop, at the top of her right thigh (red marrow of the femur)
  BBIS: { middle: { x: 164, y: 324 }, r: 16, lineEnd: { x: 155, y: 324 }, art: <BloodDrop x={164} y={324} s={1.25} /> },
}
