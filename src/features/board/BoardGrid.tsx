import type { CSSProperties } from 'react'
import { BOARD_COLUMNS, BOARD_ROWS, BOARD_SIZE, squareCell, ZONE_SIZE, zoneOf, type BoardLayout, type Jump } from '@/lib/board'
import { SUBJECT_COLOR } from '@/lib/books'
import { cn } from '@/lib/utils'

// The board uses the app's "lab report" colors (index.css), so it looks like the rest of the app:
// a white card with gray rules, squares alternating white and light gray like table rows, gray-ink numbers.
// Analyzer blue is the one accent (the ladders). Red is for flags (the snakes: the board's "L flag").
// Gold is for wins (her token: the one thing to spot right away).

const INK = '#5A6875' // --muted-foreground
const RULE = '#D6DEE5' // --border
const BLUE = '#0B6382' // --primary
const BLUE_DEEP = '#07475E' // --primary-deep
const RED = '#C2283A' // --wrong
const RED_DEEP = '#8E1C2A'
const GOLD = '#E9A23B' // --highlight

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

/** An analyzer-blue ladder at any angle: two rails and rungs, with a light line down the middle of each. */
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
        return <line key={i} x1={x - nx * half} y1={y - ny * half} x2={x + nx * half} y2={y + ny * half} stroke={BLUE} strokeWidth={0.06} />
      })}
      {[-half, half].map((side) => (
        <g key={side}>
          <line x1={ax + nx * side} y1={ay + ny * side} x2={bx + nx * side} y2={by + ny * side} stroke={BLUE_DEEP} strokeWidth={0.1} />
          <line x1={ax + nx * side} y1={ay + ny * side} x2={bx + nx * side} y2={by + ny * side} stroke="#5FA3BE" strokeWidth={0.035} />
        </g>
      ))}
    </g>
  )
}

/**
 * A friendly red snake at any angle: a wavy body (more bends the longer it is) with a light stripe,
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
      <path d={body} stroke={RED_DEEP} strokeWidth={0.19} />
      <path d={body} stroke={RED} strokeWidth={0.13} />
      <path d={body} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={0.03} transform="translate(-0.025 -0.02)" />
      {/* tongue: a short line, then a fork */}
      <path
        d={`M ${tongueX} ${tongueY} l ${-ux * 0.08} ${-uy * 0.08} l ${-ux * 0.04 + nx * 0.04} ${-uy * 0.04 + ny * 0.04} m ${ux * 0.04 - nx * 0.04} ${uy * 0.04 - ny * 0.04} l ${-ux * 0.04 - nx * 0.04} ${-uy * 0.04 - ny * 0.04}`}
        stroke={RED_DEEP}
        strokeWidth={0.025}
      />
      {/* head */}
      <ellipse cx={hx} cy={hy} rx={0.17} ry={0.14} fill={RED} stroke={RED_DEEP} strokeWidth={0.03} />
      <circle cx={hx - 0.065} cy={hy - 0.03} r={0.035} fill="#FFFFFF" />
      <circle cx={hx + 0.065} cy={hy - 0.03} r={0.035} fill="#FFFFFF" />
      <circle cx={hx - 0.06} cy={hy - 0.025} r={0.018} fill="#17222C" />
      <circle cx={hx + 0.07} cy={hy - 0.025} r={0.018} fill="#17222C" />
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
      // The same white card and soft shadow as the nav rail and the other floating cards.
      className={cn('rounded-xl border bg-card p-1.5 shadow-[0_12px_32px_-16px_rgb(7_71_94/0.35)] sm:p-2', className)}
      style={style}
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
              // The outer cell has no gap, so the ladders and snakes line up with the squares; the tile sits inside it.
              <div key={square} className="p-[2px]" style={{ gridColumn: column + 1, gridRow: row + 1 }}>
                <div
                  className={cn('relative size-full rounded-md border', finish ? 'border-highlight bg-highlight-soft' : light ? 'bg-card' : 'bg-background')}
                  style={finish ? undefined : { borderColor: RULE }}
                >
                  <span className="absolute top-0.5 left-1 font-heading text-[11px] font-bold tabular-nums sm:top-1 sm:left-1.5 sm:text-sm" style={{ color: INK }}>
                    {square}
                  </span>
                  {firstOfZone && (
                    <span
                      className="absolute right-0.5 bottom-0.5 rounded-[4px] px-1.5 font-heading text-[9px] leading-4 font-bold text-white sm:right-1 sm:bottom-1 sm:text-[11px]"
                      style={{ backgroundColor: SUBJECT_COLOR[subject] }}
                    >
                      {subject}
                    </span>
                  )}
                  {finish && <span className="absolute inset-x-0 bottom-0.5 text-center font-heading text-[9px] font-bold tracking-wide text-[#9A5B00] sm:bottom-1 sm:text-xs">FINISH</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Ladders, snakes and the token on top of the squares (not interactive). */}
        <svg aria-hidden viewBox={`0 0 ${BOARD_COLUMNS} ${BOARD_ROWS}`} className="pointer-events-none absolute inset-0 size-full overflow-visible">
          <defs>
            <radialGradient id="board-token" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#F7C978" />
              <stop offset="1" stopColor={GOLD} />
            </radialGradient>
          </defs>
          {layout.ladders.map((jump) => (
            <LadderShape key={`l${jump.from}`} jump={jump} />
          ))}
          {layout.snakes.map((jump) => (
            <SnakeShape key={`s${jump.from}`} jump={jump} />
          ))}
          {/* Her token: gold (the app's color for wins) with a deep blue edge, so it's the first thing she spots. */}
          <g className="transition-transform duration-200 ease-out motion-reduce:transition-none" style={{ transform: `translate(${token.x}px, ${token.y}px)` }}>
            <circle r={0.3} cy={0.05} fill={BLUE_DEEP} opacity={0.2} />
            <circle r={0.27} fill="url(#board-token)" stroke={BLUE_DEEP} strokeWidth={0.06} />
            <circle r={0.07} cx={-0.09} cy={-0.1} fill="#FFFFFF" opacity={0.7} />
          </g>
        </svg>
      </div>
    </div>
  )
}
