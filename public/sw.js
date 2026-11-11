// Einfacher Service Worker: App-Hülle offline verfügbar (Netz zuerst, Cache als Rückfall). /api wird nie gecacht.
const CACHE = 'weide-tagebuch-v1'
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request)
      .then((r) => { const c = r.clone(); caches.open(CACHE).then((cache) => cache.put(e.request, c)); return r })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
  )
})
