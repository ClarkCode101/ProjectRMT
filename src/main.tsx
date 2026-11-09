import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listenForInstallPrompt } from './lib/install'
import { reloadOnNewVersion } from './lib/reloadOnNewVersion'

// Start listening right away: Chrome's "you can install this" event can fire before the app is drawn.
listenForInstallPrompt()
// After an update, a page left open on the old version reloads itself if a screen fails to load.
reloadOnNewVersion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
