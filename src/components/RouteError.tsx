import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import { useRouteError } from 'react-router'
import { switchToNewVersion } from '@/lib/appUpdate'
import { isMissingFileError } from '@/lib/reloadOnNewVersion'
import { Logo } from './report'

/**
 * Shown instead of React Router's plain "Unexpected Application Error!" page.
 * Usually the auto-reload (reloadOnNewVersion) fixes a missing file before she ever sees this;
 * this is the fallback, with one button that opens the newest version.
 */
export function RouteError() {
  const error = useRouteError()
  const [reloading, setReloading] = useState(false)
  const updated = isMissingFileError(error)

  function reload() {
    setReloading(true)
    switchToNewVersion()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-[0_16px_36px_-18px_rgb(7_71_94/0.45)]">
        <Logo className="mx-auto size-16 rounded-2xl" />
        <h1 className="mt-4 font-heading text-xl font-bold">{updated ? 'ProjectRMT was updated' : 'Something went wrong'}</h1>
        <p className="mt-1.5 text-muted-foreground">
          {updated ? 'Reload to open the latest version.' : 'Reload to try again. If it keeps happening, let the admin know.'}
        </p>
        <button
          type="button"
          onClick={reload}
          disabled={reloading}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 font-heading text-lg font-bold text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-70"
        >
          <RotateCw className="size-5" aria-hidden />
          {reloading ? 'Reloading…' : 'Reload'}
        </button>
      </div>
    </main>
  )
}
