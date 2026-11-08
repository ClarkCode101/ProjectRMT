import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A modal built on the browser's own <dialog>, which already handles focus, Esc to close,
 * and hiding the page behind it from screen readers.
 * - variant "center": a box in the middle of the screen (confirmations)
 * - variant "sheet": slides up from the bottom on phones, centered on computers (menus)
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  variant = 'center',
  size = 'md',
  closeOnBackdrop = true,
  children,
}: {
  open: boolean
  onClose: () => void
  /** id of the heading inside, so screen readers announce the dialog's name */
  labelledBy: string
  variant?: 'center' | 'sheet'
  /** lg = room for a question with its choices; xl = a wide two-column panel (Practice subject popup) */
  size?: 'md' | 'lg' | 'xl'
  /** false = clicking the dimmed backdrop does nothing; only a close button or Esc closes it */
  closeOnBackdrop?: boolean
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  // Keep the real <dialog> in sync with the `open` prop.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      // Ignore a late "close" from the last time it closed, if it has already been opened again.
      onClose={() => {
        if (!ref.current?.open) onClose()
      }}
      // A click on the dialog element itself (not its content) means the dimmed backdrop was clicked.
      onClick={(event) => {
        if (closeOnBackdrop && event.target === ref.current) onClose()
      }}
      className={cn(
        'animate-in fade-in border bg-card p-0 text-foreground backdrop:bg-foreground/45 duration-150',
        variant === 'center' && 'm-auto w-[min(26rem,calc(100%-2rem))] rounded-lg zoom-in-95',
        variant === 'sheet' &&
          'mx-auto mt-auto mb-0 w-full max-w-none rounded-t-xl pb-[env(safe-area-inset-bottom)] slide-in-from-bottom-4 md:m-auto md:w-[min(26rem,calc(100%-2rem))] md:rounded-lg md:pb-0',
        size === 'lg' && 'md:w-[min(40rem,calc(100%-2rem))]',
        size === 'lg' && variant === 'center' && 'w-[min(40rem,calc(100%-2rem))]',
        size === 'xl' && 'md:w-[min(54rem,calc(100%-3rem))] md:zoom-in-90',
      )}
    >
      <div className="p-5">{children}</div>
    </dialog>
  )
}
