import { useEffect, useRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { ORGANS, type OrganLook } from './organs'

// Home's body, drawn as a flat cartoon (it replaced the 3D body; Body3D.tsx is still in the folder, unused).
// A round "gummy" figure with one little organ character per subject. Tap an organ to choose its subject.
// It is one SVG, so it is light (no three.js download) and looks the same on every device.

/** Where an organ is on screen, in px from the top-left of the body's box (BodyStage draws the leader lines to it). */
export type OrganAnchor = { code: string; x: number; y: number; /** always true here: a flat body never turns away */ facing: boolean }

type Props = {
  selectedCode: string | undefined
  /** grey = not started, color = started, glow = passing */
  looks: Record<string, OrganLook>
  onPick: (code: string) => void
  /** called when the body is first drawn and whenever its size changes, so the lines can follow */
  onFrame?: (anchors: OrganAnchor[]) => void
  /** true = the body does a little dance (daily goal reached) */
  celebrate?: boolean
  className?: string
}

// The drawing's own units (the SVG scales to whatever room it gets).
const VIEW = { x: -10, y: 0, w: 260, h: 430 }
const SKIN = '#BFEFF8'
const INK = '#0E3445'

/**
 * Where each organ sits on the figure: top-left corner and size, in the drawing's units.
 * `mirror`: a second copy, flipped (the other kidney). The leader line goes to the first one's middle.
 */
const PLACES: Record<string, { x: number; y: number; size: number; mirror?: { x: number; y: number } }> = {
  HTMLE: { x: 88, y: 14, size: 64 }, // brain, in the head
  MICRO: { x: 82, y: 106, size: 76 }, // lungs
  HEMA: { x: 128, y: 176, size: 40 }, // heart
  CC: { x: 58, y: 186, size: 58 }, // liver
  CM: { x: 126, y: 238, size: 34, mirror: { x: 84, y: 238 } }, // kidneys
  BBIS: { x: 6, y: 216, size: 40 }, // the blood drop, at the hand
}

export function BodyCartoon({ selectedCode, looks, onPick, onFrame, celebrate = false, className }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // The newest onFrame, so the size watcher below never calls an old one.
  const report = useRef(onFrame)
  useEffect(() => {
    report.current = onFrame
  })

  // Tell the stage where the organs are: now, when the box changes size, and once the fonts are in
  // (the cards beside the body move a little when the heading font arrives).
  useEffect(() => {
    const box = boxRef.current
    const svg = svgRef.current
    if (!box || !svg) return
    function measure() {
      if (!box || !svg) return
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const boxRect = box.getBoundingClientRect()
      const anchors = Object.entries(PLACES).map(([code, p]) => {
        // The line ends at the organ's edge on its card's side, a little above the middle, so it never covers the face.
        const edge = ORGANS[code]?.side === 'left' ? 0.12 : 0.88
        const point = new DOMPoint(p.x + p.size * edge, p.y + p.size * 0.3).matrixTransform(matrix)
        return { code, x: point.x - boxRect.left, y: point.y - boxRect.top, facing: true }
      })
      report.current?.(anchors)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  function organ(code: string) {
    const place = PLACES[code]
    const drawing = ORGANS[code]
    if (!place || !drawing) return null
    const look = looks[code] ?? 'grey'
    const isSelected = code === selectedCode
    const middle = { x: place.x + place.size / 2, y: place.y + place.size / 2 }
    // Not started yet: the organ is grey (it gets its color with her first answer).
    const style = look === 'grey' ? ({ '--organ-fill': '#C5D3DA' } as CSSProperties) : undefined
    const picture = (x: number, y: number, flipped = false) => (
      <svg x={x} y={y} width={place.size} height={place.size} viewBox={drawing.iconBox} overflow="visible">
        <g transform={flipped ? 'translate(48 0) scale(-1 1)' : undefined}>{drawing.icon}</g>
      </svg>
    )
    return (
      // The cards are the keyboard and screen-reader way to choose a subject; the organs are an extra way, by touch.
      <g key={code} style={style} className="cursor-pointer" onClick={() => onPick(code)}>
        {/* Passing: a pale gold halo behind the organ */}
        {look === 'glow' && <circle cx={middle.x} cy={middle.y} r={place.size * 0.6} fill="#FFF3B8" opacity={0.9} />}
        {/* The chosen subject: a gold ring that keeps pulsing */}
        {isSelected && <circle className="toon-ring" cx={middle.x} cy={middle.y} r={place.size * 0.55} fill="none" stroke="#F7B538" strokeWidth={4} />}
        {/* A bigger, see-through circle so a small organ is still easy to tap */}
        <circle cx={middle.x} cy={middle.y} r={Math.max(22, place.size * 0.5)} fill="transparent" />
        {place.mirror && picture(place.mirror.x, place.mirror.y, true)}
        {picture(place.x, place.y)}
        {/* Passing: a small gold star at its corner */}
        {look === 'glow' && (
          <path
            transform={`translate(${place.x + place.size * 0.86} ${place.y + place.size * 0.1})`}
            d="M0-8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L0 4.3l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"
            fill="#F7B538"
            stroke={INK}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
        )}
      </g>
    )
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      {/* absolute: the drawing fills the box it is given and never makes that box taller */}
      <svg ref={svgRef} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="absolute inset-0 size-full select-none" aria-hidden>
        {/* the shadow on the floor */}
        <ellipse cx="120" cy="412" rx="92" ry="13" fill={INK} opacity={0.13} />

        <g className={celebrate ? 'toon-dance' : 'toon-breathe'}>
          {/* The figure is drawn twice: first every part in ink, a little bigger, then every part in skin color on top.
              What is left showing of the ink is one clean outline around the whole body, with no lines where parts join. */}
          <g fill={INK} stroke={INK} strokeLinecap="round">
            <path d="M56 128Q20 176 26 240M184 128Q220 176 214 240" fill="none" strokeWidth="35" />
            <path d="M94 270V386M146 270V386" fill="none" strokeWidth="39" />
            <rect x="102.5" y="84" width="35" height="28" stroke="none" />
            <rect x="44.5" y="100.5" width="151" height="185" rx="35.5" stroke="none" />
            <circle cx="120" cy="52" r="47.5" stroke="none" />
          </g>
          <g fill={SKIN} stroke={SKIN} strokeLinecap="round">
            <path d="M56 128Q20 176 26 240M184 128Q220 176 214 240" fill="none" strokeWidth="30" />
            <path d="M94 270V386M146 270V386" fill="none" strokeWidth="34" />
            <rect x="105" y="84" width="30" height="28" stroke="none" />
            <rect x="47" y="103" width="146" height="180" rx="33" stroke="none" />
            <circle cx="120" cy="52" r="45" stroke="none" />
          </g>
          {/* a shine on the head and the belly, so it reads as soft and round */}
          <path d="M84 40q4-14 16-20M58 150q0-18 10-28" fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="5" strokeLinecap="round" />

          {/* the organs, back to front (the heart sits on top of the lungs' corner) */}
          {['HTMLE', 'MICRO', 'CC', 'CM', 'HEMA', 'BBIS'].map(organ)}
        </g>
      </svg>
    </div>
  )
}
