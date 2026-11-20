// The app's look ("Design" in Settings). Saved on this device only, like the other device settings.
// The colors live in src/index.css: the base (:root) is the cartoon look, and [data-theme="modern"] or "pastel"
// on <html> swaps in the same palette drawn another way. Modern is the default: anyone who hasn't picked a look
// gets it. index.html reads the saved choice before the app loads, so the page never flashes the wrong look.

export type Theme = 'modern' | 'cartoon' | 'pastel'

/** In the order they appear in Settings (the default first). */
export const THEMES: readonly Theme[] = ['modern', 'cartoon', 'pastel']

/** What she sees until she picks a look. Keep in step with the small script in index.html. */
export const DEFAULT_THEME: Theme = 'modern'

/** Keep in step with the small script in index.html. */
export const THEME_KEY = 'projectrmt:theme'

/** Anything that isn't a known theme (nothing saved, an old or broken value) is the default look. */
export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME
}

export function readTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return DEFAULT_THEME // storage blocked
  }
}

/** Shows the look right away and remembers it on this device. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // storage blocked: the look still changes for now, it just won't be remembered
  }
}
