import { ORGANS } from './organs'

/** Small flat picture of a subject's organ (used on Home and Practice). */
export function OrganIcon({ code, className }: { code: string; className?: string }) {
  const organ = ORGANS[code]
  if (!organ) return null
  return (
    <svg viewBox={organ.iconBox} className={className} aria-hidden>
      {organ.icon}
    </svg>
  )
}
