import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Makes the app installable ("Add to Home Screen") and lets it open offline.
    VitePWA({
      // A new version is picked up by itself the next time the app is opened.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'ProjectRMT',
        short_name: 'ProjectRMT',
        description: 'MTLE reviewer: practice quizzes, mock exams, and flashcards.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F3F6F8',
        theme_color: '#0B6382',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Android cuts its own shape (circle, squircle…) out of this one, so its drawing is smaller, inside the safe zone.
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Save the app's own files on the device so it opens without internet.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // Skip the file-upload libraries (about 2 MB). Uploading needs internet anyway.
        globIgnores: ['**/pdf*', '**/mammoth*'],
        // Any page link (like /practice) opens the cached app.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
