import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startAppUpdates } from './lib/appUpdate'
import { listenForInstallPrompt } from './lib/install'
import { reloadOnNewVersion } from './lib/reloadOnNewVersion'

// Start listening right away: Chrome's "you can install this" event can fire before the app is drawn.
listenForInstallPrompt()
// The offline worker, and the "New version ready" banner when a new push is downloaded.
startAppUpdates()
// After an update, a page left open on the old version reloads itself if a screen fails to load.
reloadOnNewVersion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
