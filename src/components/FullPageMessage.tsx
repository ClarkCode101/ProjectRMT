import type { ReactNode } from 'react'

/** Centered text for loading / error states. */
export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6 text-center text-muted-foreground">
      <div>{children}</div>
    </div>
  )
}
