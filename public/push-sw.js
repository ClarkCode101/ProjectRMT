// Phone notifications (Web Push), added to the app's service worker (see vite.config.ts → workbox.importScripts).
// The service worker keeps running when the app is closed, so it can show a notification at any time.
// Sent by the Edge Function notify-admin (migration 0040).

self.addEventListener('push', (event) => {
  let message = { title: 'ProjectRMT', body: 'Something new is waiting for you.', url: '/settings', tag: 'projectrmt' }
  try {
    if (event.data) message = { ...message, ...event.data.json() }
  } catch {
    // Not JSON: show the default text. iPhone stops sending if a push ever shows nothing.
  }

  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag, // the same request twice replaces itself instead of stacking
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url },
    }),
  )
})

// Tapping the notification opens the app on the right page (or brings the open app to the front).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only pages of this app, never another site.
  const path = typeof event.notification.data?.url === 'string' && event.notification.data.url.startsWith('/') ? event.notification.data.url : '/'
  const target = new URL(path, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const win of windows) {
        if ('focus' in win) {
          return win.focus().then((focused) => (focused && 'navigate' in focused ? focused.navigate(target) : undefined))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
