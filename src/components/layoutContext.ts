import { useEffect } from 'react'
import { useOutletContext } from 'react-router'

/** What AppLayout passes down to every page through <Outlet context>. */
export type LayoutContext = {
  /** true = hide the sidebar and bottom nav, e.g. while a quiz is running */
  setFocusMode: (on: boolean) => void
}

/**
 * Turns on "focus mode" while `active` is true: no nav, so a stray tap
 * can't pull her out of a quiz. Turns it off again when the page closes.
 */
export function useFocusMode(active: boolean) {
  const { setFocusMode } = useOutletContext<LayoutContext>()
  useEffect(() => {
    setFocusMode(active)
    return () => setFocusMode(false)
  }, [active, setFocusMode])
}
