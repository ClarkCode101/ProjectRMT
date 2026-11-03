import { useEffect, useState } from 'react'
import type { TubeStatus } from './tube'

// The short "pour" played inside the subject popup after she presses Start (about 1 second),
// then the quiz begins: the cap comes off, the tube tips over the flask, the flask fills.
// Pure decoration; Practice skips it when the device asks for reduced motion.

const CAP_FILL: Record<TubeStatus, string> = { low: 'var(--wrong)', passing: 'var(--correct)', new: 'var(--border)' }

// Scene coordinates (viewBox 300 wide, from y=-40 to y=210).
const TUBE = { x: 44, top: 34, width: 32, bottom: 196 }
const TUBE_PATH = `M${TUBE.x} ${TUBE.top} V${TUBE.bottom - 16} a16 16 0 0 0 ${TUBE.width} 0 V${TUBE.top} Z`
// Flask: neck x 198–222, body widening down to y=200.
const FLASK_PATH = 'M198 40 V92 L156 186 Q151 200 166 200 H254 Q269 200 264 186 L222 92 V40 Z'
// The tube's top-right corner moves just above the flask's mouth, then it tips over.
const POUR_TRANSFORM = 'translate(136px, -14px) rotate(110deg)'

/** Keeps the flask label short enough to fit on it. */
function shortLabel(text: string) {
  return text.length > 13 ? `${text.slice(0, 12).trimEnd()}…` : text
}

export function PourScene({ status, level, label }: { status: TubeStatus; level: number; label: string }) {
  // Show everything upright first, then start pouring on the next frame so the motion plays.
  const [pouring, setPouring] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPouring(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="w-60 space-y-3 text-center sm:w-72">
      <svg viewBox="0 -40 300 250" className="w-full overflow-visible" aria-hidden>
        <defs>
          <clipPath id="pour-tube-clip">
            <path d={TUBE_PATH} />
          </clipPath>
          <clipPath id="pour-flask-clip">
            <path d={FLASK_PATH} />
          </clipPath>
          <linearGradient id="pour-liquid" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--primary)" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        <line x1="10" x2="290" y1="204" y2="204" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />

        {/* ---------- flask ---------- */}
        <path d={FLASK_PATH} fill="var(--card)" />
        {/* The clip sits on a wrapper so it stays put while the liquid inside scales up. */}
        <g clipPath="url(#pour-flask-clip)">
          <rect
            x="150"
            y="40"
            width="120"
            height="160"
            fill="url(#pour-liquid)"
            style={{
              transformBox: 'fill-box',
              transformOrigin: 'bottom',
              transform: `scaleY(${pouring ? 0.55 : 0.05})`,
              transition: 'transform 500ms ease-out 550ms',
            }}
          />
        </g>
        <path d={FLASK_PATH} fill="none" stroke="var(--primary)" strokeOpacity="0.4" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="192" y="34" width="36" height="8" rx="2" fill="var(--card)" stroke="var(--primary)" strokeOpacity="0.4" strokeWidth="2" />
        {/* label sticker with the topic */}
        <rect x="174" y="146" width="72" height="26" rx="4" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
        <text x="210" y="163" textAnchor="middle" className="fill-foreground font-heading text-[10px] font-bold">
          {shortLabel(label)}
        </text>
        {/* the stream */}
        {pouring && <rect x="208" y="22" width="5" height="150" rx="2.5" fill="var(--primary)" className="pour-stream" />}

        {/* ---------- tube: tips over the flask ---------- */}
        <g
          style={{
            transformBox: 'view-box',
            transformOrigin: `${TUBE.x + TUBE.width}px ${TUBE.top}px`,
            transform: pouring ? POUR_TRANSFORM : 'none',
            transition: 'transform 450ms ease-in-out',
          }}
        >
          {/* the cap comes off first */}
          <rect
            x={TUBE.x - 4}
            y={TUBE.top - 12}
            width={TUBE.width + 8}
            height="12"
            rx="3"
            fill={CAP_FILL[status]}
            style={{ opacity: pouring ? 0 : 1, transition: 'opacity 150ms' }}
          />
          <path d={TUBE_PATH} fill="var(--card)" />
          <g clipPath="url(#pour-tube-clip)">
            <rect
              x={TUBE.x}
              y={TUBE.top}
              width={TUBE.width}
              height={TUBE.bottom - TUBE.top}
              fill="url(#pour-liquid)"
              style={{
                transformBox: 'fill-box',
                transformOrigin: 'bottom',
                transform: `scaleY(${pouring ? 0 : Math.max(level, 0.15)})`,
                transition: 'transform 450ms ease-in 450ms',
              }}
            />
          </g>
          <path d={TUBE_PATH} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        </g>
      </svg>
      <p role="status" className="font-heading text-lg font-bold">
        Preparing your sample…
      </p>
    </div>
  )
}
