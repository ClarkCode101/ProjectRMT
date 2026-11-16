import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A plain <select>: on phones it opens the built-in picker, which is easier to
// use than a custom dropdown.
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-xl border-2 border-ink/80 bg-card px-3 text-base outline-none focus-visible:border-ink focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
