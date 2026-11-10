import type { CSSProperties } from 'react'
import { BOARD_COLUMNS, BOARD_ROWS, BOARD_SIZE, squareCell, ZONE_SIZE, zoneOf, type BoardLayout, type Jump } from '@/lib/board'
import { SUBJECT_COLOR } from '@/lib/books'
import { cn } from '@/lib/utils'

// The board is light blue glass: frosted tiles on a soft blue gradient.
// Numbers are deep blue (not white) so they stay easy to read on the light glass.

/** The middle of a square, in board units (one cell = 1 × 1). */
function center(square: number) {
  const { column, row } = squareCell(square)
  return { x: column + 0.5, y: row + 0.5 }
}

/** Direction from a to b (length 1), the sideways direction, and the distance. */
function axis(a: { x: number; y: number }, b: { x: number; y: number }) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  return { ux, uy, nx: -uy, ny: ux, length }
}

/** A glassy light-blue ladder at any angle: two rails and rungs, with a white shine. */
function LadderShape({ jump }: { jump: Jump }) {
  const foot = center(jump.from)
  const top = center(jump.to)
  const { ux, uy, nx, ny, length } = axis(foot, top)
  const half = 0.17 // half the ladder's width
  const reach = 0.14 // how far the rails stick out past the two square centers
  const ax = foot.x - ux * reach
  const ay = foot.y - uy * reach
  const bx = top.x + ux * reach
  const by = top.y + uy * reach
  const rungs = Math.max(4, Math.round((length + 2 * reach) / 0.24))
  return (
    <g strokeLinecap="round">
      {Array.from({ length: rungs }, (_, i) => {
        const t = (i + 0.5) / rungs
        const x = ax + (bx - ax) * t
        const y = ay + (by - ay) * t
        return (
          <g key={i}>
            <line x1={x - nx * half} y1={y - ny * half} x2={x + nx * half} y2={y + ny * half} stroke="#2C6E99" strokeWidth={0.075} />
            <line x1={x - nx * half} y1={y - ny * half} x2={x + nx * half} y2={y + ny * half} stroke="#BFE3F7" strokeWidth={0.04} />
          </g>
        )
      })}
      {[-half, half].map((side) => (
        <g key={side}>
          <line x1={ax + nx * side} y1={ay + ny * side} x2={bx + nx * side} y2={by + ny * side} stroke="#2C6E99" strokeWidth={0.1} />
          <line x1={ax + nx * side} y1={ay + ny * side} x2={bx + nx * side} y2={by + ny * side} stroke="url(#board-rail)" strokeWidth={0.06} />
        </g>
      ))}
    </g>
  )
}

/**
 * A friendly blue snake at any angle: a wavy body (more bends the longer it is) with a shine,
 * a head with eyes, and a little tongue.
 */
function SnakeShape({ jump }: { jump: Jump }) {
  const head = center(jump.from)
  const tail = center(jump.to)
  const { ux, uy, nx, ny, length } = axis(head, tail)
  // The head sits a little back from the middle of its square; the tail ends a little past the middle of its own.
  const hx = head.x - ux * 0.08
  const hy = head.y - uy * 0.08
  const tx = tail.x + ux * 0.12
  const ty = tail.y + uy * 0.12
  // One S per ~1.4 squares of length, swinging 0.3 of a square to each side.
  const waves = Math.max(1, Math.round(length / 1.4))
  const swing = 0.3
  let body = `M ${hx} ${hy}`
  for (let i = 0; i < waves; i++) {
    const s = i / waves
    const e = (i + 1) / waves
    const px = (t: number) => hx + (tx - hx) * t
    const py = (t: number) => hy + (ty - hy) * t
    const c1 = s + (e - s) / 3
    const c2 = s + ((e - s) * 2) / 3
    body += ` C ${px(c1) + nx * swing} ${py(c1) + ny * swing}, ${px(c2) - nx * swing} ${py(c2) - ny * swing}, ${px(e)} ${py(e)}`
  }
  // The tongue points away from the body.
  const tongueX = hx - ux * 0.14
  const tongueY = hy - uy * 0.14
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={body} stroke="#1D5E8C" strokeWidth={0.19} />
      <path d={body} stroke="url(#board-snake)" strokeWidth={0.13} />
      <path d={body} stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={0.035} transform="translate(-0.025 -0.02)" />
      {/* tongue: a short line, then a fork */}
      <path
        d={`M ${tongueX} ${tongueY} l ${-ux * 0.08} ${-uy * 0.08} l ${-ux * 0.04 + nx * 0.04} ${-uy * 0.04 + ny * 0.04} m ${ux * 0.04 - nx * 0.04} ${uy * 0.04 - ny * 0.04} l ${-ux * 0.04 - nx * 0.04} ${-uy * 0.04 - ny * 0.04}`}
        stroke="#D6456A"
        strokeWidth={0.025}
      />
      {/* head */}
      <ellipse cx={hx} cy={hy} rx={0.17} ry={0.14} fill="url(#board-snake)" stroke="#1D5E8C" strokeWidth={0.03} />
      <circle cx={hx - 0.065} cy={hy - 0.03} r={0.035} fill="#FFFFFF" />
      <circle cx={hx + 0.065} cy={hy - 0.03} r={0.035} fill="#FFFFFF" />
      <circle cx={hx - 0.06} cy={hy - 0.025} r={0.018} fill="#0B2F4A" />
      <circle cx={hx + 0.07} cy={hy - 0.025} r={0.018} fill="#0B2F4A" />
    </g>
  )
}

type Props = {
  /** where the token is drawn (it walks one square at a time toward her real position) */
  tokenSquare: number
  /** which of the three boards (where the ladders and snakes are) */
  layout: BoardLayout
  className?: string
  /** e.g. the width that makes it fit the screen */
  style?: CSSProperties
}

/** The 60-square board: six subject zones (one per row), ladders, snakes and her token. */
export function BoardGrid({ tokenSquare, layout, className, style }: Props) {
  const squares = Array.from({ length: BOARD_SIZE }, (_, i) => i + 1)
  const zone = zoneOf(tokenSquare)
  const token = center(tokenSquare)
  return (
    <div
      role="img"
      aria-label={`Board: you are on square ${tokenSquare} of ${BOARD_SIZE}, in the ${zone} zone.`}
      className={cn(
        'rounded-2xl border border-white/80 p-1.5 shadow-[0_18px_40px_-20px_rgb(20_80_130/0.55),inset_0_1px_0_rgb(255_255_255/0.9)] sm:p-2',
        className,
      )}
      style={{ background: 'linear-gradient(160deg, #DDF0FB 0%, #B9DDF3 55%, #A4D0EE 100%)', ...style }}
    >
      <div className="relative w-full" style={{ aspectRatio: `${BOARD_COLUMNS} / ${BOARD_ROWS}` }}>
        <div aria-hidden className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${BOARD_COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${BOARD_ROWS}, 1fr)` }}>
          {squares.map((square) => {
            const { column, row } = squareCell(square)
            const subject = zoneOf(square)
            const firstOfZone = (square - 1) % ZONE_SIZE === 0
            const light = (column + row) % 2 === 0
            const finish = square === BOARD_SIZE
            return (
              // The outer cell has no gap, so the ladders and snakes line up with the squares; the tile inside is the glass.
              <div key={square} className="p-[2px] sm:p-[3px]" style={{ gridColumn: column + 1, gridRow: row + 1 }}>
                <div
                  className={cn(
                    'relative size-full rounded-md border shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_1px_2px_rgb(20_80_130/0.12)] sm:rounded-lg',
                    finish ? 'border-highlight bg-highlight-soft/80' : light ? 'border-white/80 bg-white/55' : 'border-white/60 bg-white/30',
                  )}
                >
                  <span className="absolute top-0.5 left-1 font-heading text-[11px] font-bold text-[#1E5578] tabular-nums sm:top-1 sm:left-1.5 sm:text-sm">{square}</span>
                  {firstOfZone && (
                    <span
                      className="absolute right-0.5 bottom-0.5 rounded-full px-1.5 font-heading text-[9px] leading-4 font-bold text-white shadow-sm sm:right-1 sm:bottom-1 sm:text-[11px]"
                      style={{ backgroundColor: SUBJECT_COLOR[subject] }}
                    >
                      {subject}
                    </span>
                  )}
                  {finish && <span className="absolute inset-x-0 bottom-0.5 text-center font-heading text-[9px] font-bold text-foreground sm:bottom-1 sm:text-xs">FINISH</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ladders, snakes and the token on top of the tiles (not interactive). */}
        <svg aria-hidden viewBox={`0 0 ${BOARD_COLUMNS} ${BOARD_ROWS}`} className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <defs>
            <linearGradient id="board-rail" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#8CC6EA" />
            </linearGradient>
            <linearGradient id="board-snake" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#7CC3EE" />
              <stop offset="1" stopColor="#3A8BC6" />
            </linearGradient>
            <radialGradient id="board-token" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#2E7FA8" />
              <stop offset="1" stopColor="#07364A" />
            </radialGradient>
          </defs>
          {layout.ladders.map((jump) => (
            <LadderShape key={`l${jump.from}`} jump={jump} />
          ))}
          {layout.snakes.map((jump) => (
            <SnakeShape key={`s${jump.from}`} jump={jump} />
          ))}
          {/* Her token: a glossy deep-blue counter with a white ring, so it stands out on the light glass. */}
          <g className="transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `translate(${token.x}px, ${token.y}px)` }}>
            <circle r={0.3} cy={0.04} fill="#0B2F4A" opacity={0.25} />
            <circle r={0.28} fill="url(#board-token)" stroke="#FFFFFF" strokeWidth={0.07} />
            <circle r={0.08} cx={-0.09} cy={-0.1} fill="#FFFFFF" opacity={0.6} />
          </g>
        </svg>
      </div>
    </div>
  )
}
