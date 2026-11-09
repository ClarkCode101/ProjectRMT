import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listenForInstallPrompt } from './lib/install'

// Start listening right away: Chrome's "you can install this" event can fire before the app is drawn.
listenForInstallPrompt()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
