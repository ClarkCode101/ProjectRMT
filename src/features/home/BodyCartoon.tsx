import { useEffect, useId, useRef } from 'react'
import { cn } from '@/lib/utils'
import { BODY_ORGANS, INK } from './bodyArt'
import { BODY_LAYERS, BODY_VIEW } from './bodyTrace'
import type { OrganLook } from './organs'

// Home's body: a glossy "water" girl floating (bubbles rise around her, rings of light circle her), asleep,
// with one little organ character per subject inside. Tap an organ to choose its subject.
// The body and organs are traced from a picture (bodyTrace.ts) into one SVG, so it is light (no 3D library)
// and looks the same on every device. (Body3D.tsx is still in the folder, unused.)

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

const VIEW = BODY_VIEW
const MID_X = VIEW.w / 2

/** Back to front: the liver tucks under the lungs, the heart sits in front of both; the blood drop is in the thigh. */
const DRAW_ORDER = ['MICRO', 'CC', 'HEMA', 'CM', 'HTMLE', 'BBIS']

// The bubbles: made once, from a fixed seed, so they are in the same places every time (no jumping on re-render).
const BUBBLES = (() => {
  let seed = 7
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  return Array.from({ length: 16 }, () => {
    const seconds = 9 + random() * 9
    return { x: -20 + random() * (VIEW.w + 40), r: 3 + random() * 9, seconds, delay: -random() * seconds }
  })
})()

/** The rings of light: [height, half width, half height, tilt]. Faint, like in the picture. */
const RINGS: [number, number, number, number][] = [
  [110, 150, 16, -4],
  [250, 160, 18, -5],
  [420, 150, 18, -4],
]

/** A ring of light around the body. It is drawn in two halves: the back half behind the body, the front half over it. */
function ringHalf([cy, rx, ry, tilt]: [number, number, number, number], half: 'back' | 'front', glowId: string) {
  return (
    <path
      key={`${cy}${half}`}
      className="toon-halo"
      transform={`rotate(${tilt} ${MID_X} ${cy})`}
      d={`M${MID_X - rx} ${cy}A${rx} ${ry} 0 0 ${half === 'back' ? 1 : 0} ${MID_X + rx} ${cy}`}
      fill="none"
      stroke="#FFFFFF"
      strokeWidth={2}
      opacity={half === 'back' ? 0.45 : 0.6}
      filter={`url(#${glowId})`}
    />
  )
}

export function BodyCartoon({ selectedCode, looks, onPick, onFrame, celebrate = false, className }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // Names for the glow and the grey filter, unique to this body.
  const id = `body${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const glowId = `${id}glow`
  const greyId = `${id}grey`
  // The newest onFrame, so the size watcher below never calls an old one.
  const report = useRef(onFrame)
  useEffect(() => {
    report.current = onFrame
  })

  /** Tells the stage where each organ's line should end, in px from the top-left of the body's box. */
  function measure() {
    const box = boxRef.current
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!box || !matrix) return
    const boxRect = box.getBoundingClientRect()
    const anchors = Object.entries(BODY_ORGANS).map(([code, organ]) => {
      const point = new DOMPoint(organ.lineEnd.x, organ.lineEnd.y).matrixTransform(matrix)
      return { code, x: point.x - boxRect.left, y: point.y - boxRect.top, facing: true }
    })
    report.current?.(anchors)
  }
  // The newest measure, for the size watcher below (it is set up once).
  const measureNow = useRef(measure)
  useEffect(() => {
    measureNow.current = measure
    // Also after every render: choosing a subject or a score change can move the cards a little,
    // and the lines must still end on their organs (it is cheap: six points).
    measure()
  })

  // Measure again when the box changes size, and once the fonts are in
  // (the cards beside the body move a little when the heading font arrives).
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const remeasure = () => measureNow.current()
    const observer = new ResizeObserver(remeasure)
    observer.observe(box)
    window.addEventListener('resize', remeasure)
    void document.fonts?.ready.then(remeasure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', remeasure)
    }
  }, [])

  function organ(code: string) {
    const drawing = BODY_ORGANS[code]
    if (!drawing) return null
    const { middle, r } = drawing
    const look = looks[code] ?? 'grey'
    const isSelected = code === selectedCode
    return (
      // The cards are the keyboard and screen-reader way to choose a subject; the organs are an extra way, by touch.
      <g key={code} className="cursor-pointer" onClick={() => onPick(code)}>
        {/* Passing: a pale gold halo behind the organ */}
        {look === 'glow' && <circle cx={middle.x} cy={middle.y} r={r} fill="#FFF3B8" opacity={0.85} />}
        {/* The chosen subject: a gold ring that keeps pulsing */}
        {isSelected && <circle className="toon-ring" cx={middle.x} cy={middle.y} r={r} fill="none" stroke="#F7B538" strokeWidth={4} />}
        {/* A see-through circle so a small organ is still easy to tap (not bigger than 26, or it would cover its neighbours) */}
        <circle cx={middle.x} cy={middle.y} r={Math.min(r, 26)} fill="transparent" />
        {/* Not started yet: the organ is grey and faded (it gets its color with her first answer) */}
        <g filter={look === 'grey' ? `url(#${greyId})` : undefined} opacity={look === 'grey' ? 0.6 : 1}>
          {drawing.art}
        </g>
        {/* Passing: a small gold star at its corner */}
        {look === 'glow' && (
          <path
            transform={`translate(${middle.x + r * 0.75} ${middle.y - r * 0.75})`}
            d="M0-8l2.4 4.9 5.4.8-3.9 3.8.9 5.4L0 4.3l-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z"
            fill="#F7B538"
            stroke={INK}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        )}
      </g>
    )
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      {/* absolute: the drawing fills the box it is given and never makes that box taller.
          overflow-visible: the rings and bubbles may drift a little past the drawing's edges. */}
      <svg ref={svgRef} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="absolute inset-0 size-full overflow-visible select-none" aria-hidden>
        <defs>
          <filter id={glowId} x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={greyId}>
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>

        {/* bubbles rising behind her */}
        <g className="pointer-events-none">
          {BUBBLES.map((b, i) => (
            <g key={i} className="toon-bubble" style={{ animationDuration: `${b.seconds}s`, animationDelay: `${b.delay}s` }}>
              <circle cx={b.x} cy={VIEW.h + 20} r={b.r} fill="#FFFFFF" fillOpacity={0.35} stroke="#9FD3EE" strokeWidth={1.4} />
              <path
                d={`M${b.x - b.r * 0.55} ${VIEW.h + 20 - b.r * 0.15}a${b.r * 0.6} ${b.r * 0.6} 0 0 1 ${b.r * 0.42} ${-b.r * 0.45}`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>

        {/* the back halves of the rings, behind her */}
        <g className="pointer-events-none">{RINGS.map((ring) => ringHalf(ring, 'back', glowId))}</g>

        <g className={celebrate ? 'toon-dance' : 'toon-float'}>
          {/* the body: traced color layers, back to front (paths are in half-pixels) */}
          <g transform="scale(0.5)" className="pointer-events-none">
            {BODY_LAYERS.map(([fill, d], i) => (
              <path key={i} d={d} fill={fill} fillRule="evenodd" />
            ))}
          </g>
          {DRAW_ORDER.map(organ)}
        </g>

        {/* the front halves of the rings pass over her */}
        <g className="pointer-events-none">{RINGS.map((ring) => ringHalf(ring, 'front', glowId))}</g>
      </svg>
    </div>
  )
}
