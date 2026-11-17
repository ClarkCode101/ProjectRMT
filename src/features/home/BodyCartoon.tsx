import { useEffect, useId, useRef, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { BODY_ORGANS, BODY_OUTLINE, INK } from './bodyArt'
import type { OrganLook } from './organs'

// Home's body: a flat cartoon girl floating in water (bubbles rise around her, two rings of light circle her),
// asleep, with one little organ character per subject inside. Tap an organ to choose its subject.
// It is one SVG, so it is light (no 3D library to download) and looks the same on every device.
// (It replaced the 3D body; Body3D.tsx is still in the folder, unused.)

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
const VIEW = { w: 395, h: 648 }
const SKIN = '#C9ECFD'
const SHADE = '#B3DCF9'
const HAIR_SHADE = '#A9DAF7'

/** Back to front: the liver covers the bottom of the lungs, the heart sits on the right lung. */
const DRAW_ORDER = ['HTMLE', 'MICRO', 'CM', 'CC', 'HEMA', 'BBIS']

// The bubbles: made once, from a fixed seed, so they are in the same places every time (no jumping on re-render).
const BUBBLES = (() => {
  let seed = 7
  const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  return Array.from({ length: 16 }, () => {
    const seconds = 9 + random() * 9
    return { x: -30 + random() * (VIEW.w + 60), r: 4 + random() * 14, seconds, delay: -random() * seconds }
  })
})()

/** A ring of light around the body. It is drawn in two halves: the back half behind the body, the front half over it. */
function ringHalf(cy: number, rx: number, ry: number, tilt: number, half: 'back' | 'front', glowId: string) {
  return (
    <path
      className="toon-halo"
      transform={`rotate(${tilt} 197 ${cy})`}
      d={`M${197 - rx} ${cy}A${rx} ${ry} 0 0 ${half === 'back' ? 1 : 0} ${197 + rx} ${cy}`}
      fill="none"
      stroke="#FFFFFF"
      strokeWidth={3.5}
      opacity={half === 'back' ? 0.6 : 0.8}
      filter={`url(#${glowId})`}
    />
  )
}

export function BodyCartoon({ selectedCode, looks, onPick, onFrame, celebrate = false, className }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // Names for the clip shape and the glow, unique to this body.
  const id = `body${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const clipId = `${id}clip`
  const glowId = `${id}glow`
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
    // Not started yet: the organ is grey (it gets its color with her first answer).
    const style = look === 'grey' ? ({ '--organ-fill': '#C5D3DA' } as CSSProperties) : undefined
    return (
      // The cards are the keyboard and screen-reader way to choose a subject; the organs are an extra way, by touch.
      <g key={code} style={style} className="cursor-pointer" onClick={() => onPick(code)}>
        {/* Passing: a pale gold halo behind the organ */}
        {look === 'glow' && <circle cx={middle.x} cy={middle.y} r={r} fill="#FFF3B8" opacity={0.85} />}
        {/* The chosen subject: a gold ring that keeps pulsing */}
        {isSelected && <circle className="toon-ring" cx={middle.x} cy={middle.y} r={r} fill="none" stroke="#F7B538" strokeWidth={5} />}
        {/* A see-through circle so a small organ is still easy to tap (not bigger than 30, or it would cover its neighbours) */}
        <circle cx={middle.x} cy={middle.y} r={Math.min(r, 30)} fill="transparent" />
        {drawing.art}
        {/* Passing: a small gold star at its corner */}
        {look === 'glow' && (
          <path
            transform={`translate(${middle.x + r * 0.75} ${middle.y - r * 0.75}) scale(1.3)`}
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

  const line = { fill: 'none', stroke: INK, strokeWidth: 4.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      {/* absolute: the drawing fills the box it is given and never makes that box taller.
          overflow-visible: the rings and bubbles may drift a little past the drawing's edges. */}
      <svg ref={svgRef} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="absolute inset-0 size-full overflow-visible select-none" aria-hidden>
        <defs>
          <filter id={glowId} x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id={clipId}>
            <path d={BODY_OUTLINE} />
          </clipPath>
        </defs>

        {/* bubbles rising behind her */}
        <g className="pointer-events-none">
          {BUBBLES.map((b, i) => (
            <g key={i} className="toon-bubble" style={{ animationDuration: `${b.seconds}s`, animationDelay: `${b.delay}s` }}>
              <circle cx={b.x} cy={VIEW.h + 30} r={b.r} fill="#FFFFFF" fillOpacity={0.35} stroke="#9FD3EE" strokeWidth={1.6} />
              <path
                d={`M${b.x - b.r * 0.55} ${VIEW.h + 30 - b.r * 0.15}a${b.r * 0.6} ${b.r * 0.6} 0 0 1 ${b.r * 0.42} ${-b.r * 0.45}`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>

        {/* the upper ring is all behind her; the lower ring's back half too */}
        <g className="pointer-events-none">
          {ringHalf(245, 185, 32, -6, 'back', glowId)}
          {ringHalf(245, 185, 32, -6, 'front', glowId)}
          {ringHalf(515, 160, 30, -8, 'back', glowId)}
        </g>

        <g className={celebrate ? 'toon-dance' : 'toon-float'}>
          {/* the skin */}
          <path d={BODY_OUTLINE} fill={SKIN} />
          {/* shading and shine, kept inside the body's outline */}
          <g clipPath={`url(#${clipId})`}>
            {/* the hair: a darker crescent on each side of the face */}
            <path d="M72 112Q76 186 121 216L154 222Q128 210 122 190Q98 160 72 112Z" fill={HAIR_SHADE} />
            <path d="M301 104Q304 172 277 200L248 204Q262 190 266 172Q276 138 301 104Z" fill={HAIR_SHADE} />
            {/* the far leg, and the lower part of the near leg, are in shade */}
            <path d="M207 483Q213 498 220 508Q240 530 247 555Q250 575 262 590L310 610V470Q262 446 236 478Q222 490 207 483Z" fill={SHADE} />
            <path d="M176 500Q196 520 220 508Q222 535 236 560Q248 580 262 596L280 650H200Q160 560 176 500Z" fill={SHADE} opacity={0.75} />
            {/* under the chin */}
            <path d="M176 216H212L208 238Q196 244 184 238Z" fill="#8FB8DE" opacity={0.55} />
            {/* soft light on the head, the thigh and the arm */}
            <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
              <path d="M96 150Q84 104 116 66" strokeOpacity={0.7} strokeWidth={9} />
              <path d="M150 420Q150 470 176 530" strokeOpacity={0.55} strokeWidth={7} />
              <path d="M70 352Q100 340 128 318" strokeOpacity={0.5} strokeWidth={6} />
            </g>
            {/* blush */}
            <ellipse cx="146" cy="190" rx="13" ry="6" fill="#F4A6C0" opacity={0.3} />
            <ellipse cx="238" cy="182" rx="13" ry="6" fill="#F4A6C0" opacity={0.3} />
          </g>
          {/* the ink outline around the whole figure */}
          <path d={BODY_OUTLINE} fill="none" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          {/* lines inside the figure: jaw, strands of hair, where the arms meet the body, between the legs */}
          <path d="M122 190Q142 212 185 216Q222 216 250 201" {...line} />
          <path d="M110 176Q109 190 113 203M269 150Q281 172 276 194M262 178Q268 190 276 195M194 396L198 412L202 396" {...line} strokeWidth={3.5} />
          <path d="M158 266Q158 290 161 310M243 268Q246 292 251 310" {...line} />
          <path d="M198 411Q199 450 207 483Q213 498 220 508Q222 535 236 560Q248 580 262 596M220 508Q240 530 247 555Q250 575 260 588" {...line} />
          {/* the sleeping face: closed eyes and a small mouth */}
          <path d="M129 177Q149 181 170 165M210 160Q234 165 256 154" {...line} strokeWidth={6} />
          <path d="M191 193Q195 189 200 192" {...line} strokeWidth={3} />

          {DRAW_ORDER.map(organ)}
        </g>

        {/* the lower ring's front half passes over her legs */}
        <g className="pointer-events-none">{ringHalf(515, 160, 30, -8, 'front', glowId)}</g>
      </svg>
    </div>
  )
}
