import { useEffect, useState } from 'react'
import { BOARD_COLUMNS, BOARD_ROWS } from '@/lib/board'

/** The board's frame (padding around the squares), in pixels on both sides together: 8px padding + 1px border, each side. */
const BOARD_FRAME_PX = 18

/**
 * The board's width so it fits the box it's given, both across and down (no scrolling):
 * the squares are 10 wide by 6 tall, plus the frame. Pass `measure` as the box's ref; `width` is null until it's measured.
 */
export function useFittedBoardWidth() {
  // A callback ref (not useRef): the box may appear later (e.g. once the game screen shows), so the effect must rerun then.
  const [box, measure] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    if (!box) return
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect
      const inner = Math.min(w - BOARD_FRAME_PX, ((h - BOARD_FRAME_PX) * BOARD_COLUMNS) / BOARD_ROWS)
      setWidth(Math.max(0, Math.floor(inner + BOARD_FRAME_PX)))
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [box])
  return { measure, width }
}
