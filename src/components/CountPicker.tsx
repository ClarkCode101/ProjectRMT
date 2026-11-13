import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  /** The chosen number, e.g. 10. */
  value: number
  /** The numbers she can pick, e.g. [10, 20, 50]. */
  options: readonly number[]
  onChange: (n: number) => void
  /** The word after the number: "items", "new". */
  unit: string
  /** Extra classes for that word in the chip, e.g. to hide it on a narrow phone (screen readers still get `label`). */
  unitClassName?: string
  /** What the number is, for screen readers: "Items", "New cards each time". */
  label: string
  /** Extra info after the number, in the chip and in each choice (e.g. Mock exam's time limit "1:00:00"). */
  detail?: (n: number) => string
  /** Small icon shown before the detail (e.g. a timer). */
  detailIcon?: LucideIcon
  disabled?: boolean
}

/**
 * One chip that shows how many ("10 items ▾"); tap it for a small menu of the choices.
 * Used on Practice, Mock exam and Flashcards so the row under the carousel stays short:
 * [⚙ options] [count chip] [Start].
 * The menu opens UPWARD, because the row sits near the bottom of the screen.
 */
export function CountPicker({ value, options, onChange, unit, unitClassName, label, detail, detailIcon: DetailIcon, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const chipRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  function close() {
    setOpen(false)
    chipRef.current?.focus()
  }

  function pick(n: number) {
    onChange(n)
    close()
  }

  // Keyboard: ↑ ↓ move between choices, Esc closes.
  function onMenuKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const current = itemRefs.current.findIndex((el) => el === document.activeElement)
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = (current + step + options.length) % options.length
    itemRefs.current[next]?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={chipRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${value}${detail ? `, ${detail(value)}` : ''}. Change`}
        className={cn(
          'flex h-12 items-center gap-2 rounded-lg border bg-card pr-3 pl-4 whitespace-nowrap text-foreground outline-none transition-[border-color,box-shadow] focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50',
          open ? 'border-primary ring-3 ring-primary/15' : 'border-primary/25 shadow-[0_3px_0_rgb(7_71_94/0.18)] hover:border-primary/50',
        )}
      >
        <span className="font-mono text-lg font-bold tabular-nums">{value}</span>
        <span className={cn('text-muted-foreground', unitClassName)}>{unit}</span>
        {detail && (
          <>
            <span aria-hidden className="h-5 w-px bg-border" />
            {DetailIcon && <DetailIcon className="size-4 text-muted-foreground" aria-hidden />}
            <span className="font-mono text-sm font-semibold text-muted-foreground tabular-nums">{detail(value)}</span>
          </>
        )}
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <>
          {/* Tap anywhere else to close (same as the account menu). */}
          <button type="button" aria-label="Close menu" tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={close} />
          <div
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            className="animate-in fade-in slide-in-from-bottom-1 absolute bottom-full left-0 z-50 mb-2 flex min-w-full flex-col gap-0.5 rounded-xl border bg-card p-1.5 shadow-lg duration-150"
          >
            {options.map((n, i) => {
              const selected = n === value
              return (
                <button
                  key={n}
                  ref={(el) => {
                    itemRefs.current[i] = el
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  autoFocus={selected}
                  onClick={() => pick(n)}
                  className={cn(
                    'flex h-11 items-center gap-2 rounded-lg px-3 text-left whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/40',
                    selected ? 'bg-primary/10 font-semibold text-primary-deep' : 'hover:bg-secondary',
                  )}
                >
                  <span className="font-mono font-bold tabular-nums">{n}</span>
                  <span>{unit}</span>
                  {detail && <span className="font-mono text-sm text-muted-foreground tabular-nums">{detail(n)}</span>}
                  <span className="ml-auto flex w-6 justify-end">{selected && <Check className="size-4 text-primary" aria-hidden />}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
