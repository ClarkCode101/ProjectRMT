import { useEffect, useState } from 'react'

/**
 * A number that counts from `from` to `to` (whole numbers), easing out, after a short delay.
 * Used on Home so she sees her score go up after practicing. With "reduce motion" on, it just shows `to`.
 */
export function useCountUp(from: number, to: number, { duration = 900, delay = 300 } = {}) {
  const [value, setValue] = useState(from)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const startAt = performance.now() + delay
    function tick(now: number) {
      const t = reduceMotion || from === to ? 1 : Math.min(1, Math.max(0, (now - startAt) / duration))
      const eased = 1 - (1 - t) ** 3 // ease-out: fast at first, settling at the end
      setValue(Math.round(from + (to - from) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [from, to, duration, delay])

  return value
}
