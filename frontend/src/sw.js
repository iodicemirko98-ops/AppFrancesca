/* Service worker di NoiDue: precache dell'app + notifiche push. */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api/, /^\/ws/] }))

self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data?.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'NoiDue', {
    body: d.body || '', tag: d.tag || undefined, icon: '/icon-192.png', badge: '/icon-192.png',
    data: { url: d.url || '/' }, renotify: !!d.tag,
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(url) } catch { /* ignora */ } } return }
    }
    await self.clients.openWindow(url)
  })())
})
