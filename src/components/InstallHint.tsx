import { Share, X } from 'lucide-react'
import { useState } from 'react'
import { dismissHint, isHintDismissed, useInstall } from '@/lib/install'
import { cn } from '@/lib/utils'
import { Logo } from './report'

/** The Share icon as it looks in Safari, in a small key-cap, so she knows what to look for. */
export function ShareKey() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 align-middle font-semibold text-foreground">
      <Share className="size-3.5" aria-hidden />
      Share
    </span>
  )
}

/**
 * A small "install the app" tip, shown at the top (not the bottom, so it doesn't compete
 * with Home's Next up bar). On iPad it sits top right, under Safari's Share button.
 * Hidden once the app is installed, or for good after she taps X.
 * Settings has the same thing (Install app) if she wants it later.
 */
export function InstallHint() {
  const { mode, promptInstall } = useInstall()
  const [dismissed, setDismissed] = useState(isHintDismissed)

  if (dismissed || (mode !== 'ios' && mode !== 'prompt')) return null

  function close() {
    dismissHint()
    setDismissed(true)
  }

  return (
    <aside
      aria-label="Install ProjectRMT"
      className={cn(
        'animate-in fade-in slide-in-from-top-2 fixed inset-x-3 top-[calc(3.75rem+env(safe-area-inset-top))] z-30 flex items-start gap-3 rounded-2xl border bg-card py-3 pr-2 pl-3.5 shadow-[0_16px_36px_-18px_rgb(7_71_94/0.55)] duration-300',
        'md:top-4 md:right-4 md:left-auto md:w-[22rem]',
      )}
    >
      {/* iPad: a little pointer up toward Safari's Share button. */}
      {mode === 'ios' && <span aria-hidden className="absolute -top-1.5 right-14 hidden size-3 rotate-45 border-t border-l bg-card md:block" />}

      <Logo className="size-10 rounded-[10px]" />

      <div className="min-w-0 flex-1">
        {mode === 'ios' ? (
          <>
            <p className="font-heading font-bold">Add to Home Screen</p>
            <p className="text-sm leading-snug text-muted-foreground">
              Tap <ShareKey /> then <span className="font-semibold text-foreground">Add to Home Screen</span>. It opens full screen, like an app.
            </p>
          </>
        ) : (
          <>
            <p className="font-heading font-bold">Install ProjectRMT</p>
            <p className="text-sm leading-snug text-muted-foreground">Get it on your Home Screen. Opens full screen, even without internet.</p>
            <button
              type="button"
              onClick={promptInstall}
              className="mt-2 h-10 rounded-lg bg-primary px-4 font-heading text-sm font-bold text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              Install app
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Hide this tip"
        className="-mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <X className="size-4" aria-hidden />
      </button>
    </aside>
  )
}
