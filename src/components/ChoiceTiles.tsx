import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** A radio button that looks like a pressable tile. Real radios keep keyboard + screen readers working. */
export function Tile({
  name,
  checked,
  onChange,
  children,
  className,
}: {
  name: string
  checked: boolean
  onChange: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40',
        checked ? 'border-primary bg-primary/[0.06] ring-1 ring-primary' : 'hover:border-primary/50',
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  )
}

/** A group of choices with a plain heading. */
export function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 flex items-baseline gap-2">
        <span className="font-heading text-lg font-bold">{title}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  )
}
