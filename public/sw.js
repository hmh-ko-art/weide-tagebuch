// Einfacher Service Worker: App-Hülle offline verfügbar (Netz zuerst, Cache als Rückfall). /api wird nie gecacht.
// Seitenaufrufe immer frisch vom Server holen (kein Browser-HTTP-Cache), damit neue Versionen sofort ankommen.
const CACHE = 'flockmap-v2'
self.addEventListener('install', () => self.skipWaiting())
// Alte Caches (z. B. „weide-tagebuch-v1“, „flockmap-v1“) aufräumen
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  const netz = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin' }) : fetch(e.request)
  e.respondWith(
    netz
      .then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((cache) => cache.put(e.request, c)) } return r })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
  )
})
