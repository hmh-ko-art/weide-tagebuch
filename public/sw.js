// FlockMap Service Worker – Offline-Modus
// 1) App-Hülle: beim Installieren komplett vorgeladen (Liste wird beim Build eingesetzt) -> App startet auch ohne Netz.
// 2) Seitenaufrufe: Netz zuerst (max. 5 s), sonst die gespeicherte App-Hülle.
// 3) Kartenkacheln (Esri, OpenStreetMap): nur was tatsächlich angesehen wurde, wird gespeichert (kein Massen-Download –
//    so verlangen es die Nutzungsbedingungen von Esri und OSM). Mit Netz immer frisch vom Server (max. 4 s),
//    ohne Netz aus dem Speicher. Höchstens KACHELN_MAX Kacheln, älteste fliegen zuerst raus.
//    „Gebiet für offline sichern“ kopiert angesehene Kacheln in einen geschützten Speicher (wird nie automatisch geleert).
// /api wird nie vom Service Worker gecacht – Kartendaten liegen in IndexedDB (siehe src/speicher.ts).
const VERSION = '__VERSION__'
const PRECACHE = self.__PRECACHE__ || ['/', '/index.html']
const SHELL = 'flockmap-shell-' + VERSION
const KACHELN = 'flockmap-kacheln'
const GEBIETE = 'flockmap-gebiete'
const KACHELN_MAX = 2500
const KACHEL_HOSTS = /^(server\.arcgisonline\.com|[abc]\.tile\.openstreetmap\.org|tile\.openstreetmap\.org)$/

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL)
    // einzeln laden: eine fehlende Datei soll nicht die ganze Installation verhindern
    // „/“ kann per Cookie auf eine Karte weiterleiten -> App-Hülle aus /index.html (neutral) laden
    await Promise.allSettled(PRECACHE.map((u) => fetch(u === '/' ? '/index.html' : u, { cache: 'reload' }).then((r) => { if (r.ok && !r.redirected) return c.put(u === '/' ? '/index.html' : u, r) })))
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys()
    // vorherige App-Hülle behalten (offene alte Seiten laden evtl. noch Teile nach), ältere löschen
    const huellen = ks.filter((k) => k.startsWith('flockmap-shell-') && k !== SHELL)
    const behalten = new Set([SHELL, KACHELN, GEBIETE, huellen[huellen.length - 1]])
    await Promise.all(ks.filter((k) => !behalten.has(k)).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

const mitZeitlimit = (p, ms) => new Promise((ok, fehl) => { const t = setTimeout(() => fehl(new Error('Zeitlimit')), ms); p.then((r) => { clearTimeout(t); ok(r) }, (x) => { clearTimeout(t); fehl(x) }) })
let schreibZaehler = 0
async function kachelSpeichern(req, res) {
  const c = await caches.open(KACHELN)
  await c.delete(req.url) // neu einsortieren -> Reihenfolge entspricht „zuletzt angesehen“
  await c.put(req.url, res)
  if (++schreibZaehler % 100 === 0) {
    const ks = await c.keys()
    if (ks.length > KACHELN_MAX) await Promise.all(ks.slice(0, ks.length - KACHELN_MAX + 200).map((k) => c.delete(k)))
  }
}
async function kachel(e) {
  const req = e.request
  const ausSpeicher = () => caches.match(req.url, { ignoreVary: true })
  if (self.navigator && self.navigator.onLine === false) { const r = await ausSpeicher(); if (r) return r }
  try {
    const r = await mitZeitlimit(fetch(req.url, { mode: 'cors', credentials: 'omit' }), 4000)
    if (r.ok && r.type !== 'opaque') e.waitUntil(kachelSpeichern(req, r.clone()))
    return r
  } catch (x) {
    const r = await ausSpeicher()
    if (r) return r
    throw x
  }
}
async function seite(e) {
  try {
    // 7p: Weiterleitungen (z. B. „/“ -> gemerkte Karte per Cookie) unverändert an den Browser geben; nicht als App-Hülle speichern
    const r = await mitZeitlimit(fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' }), 5000)
    if (r.type === 'opaqueredirect') return r
    // App-Hülle nur aus der neutralen Seite (ohne Karte/Zugang im Manifest-Link) speichern
    if (r.ok && !new URL(e.request.url).search) { const c = r.clone(); e.waitUntil(caches.open(SHELL).then((s) => s.put('/index.html', c))) }
    return r
  } catch {
    return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()
  }
}
async function datei(e) {
  const url = new URL(e.request.url)
  // gehashte Dateien ändern sich nie: Speicher zuerst
  if (url.pathname.startsWith('/assets/')) {
    const r = await caches.match(e.request)
    if (r) return r
  }
  try {
    const r = await fetch(e.request)
    if (r.ok) { const c = r.clone(); e.waitUntil(caches.open(SHELL).then((s) => s.put(e.request, c))) }
    return r
  } catch (x) {
    const r = await caches.match(e.request, { ignoreSearch: url.pathname === '/' })
    if (r) return r
    if (url.pathname === '/') return (await caches.match('/index.html')) || Response.error()
    throw x
  }
}
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (KACHEL_HOSTS.test(url.hostname)) return e.respondWith(kachel(e))
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return
  e.respondWith(e.request.mode === 'navigate' ? seite(e) : datei(e))
})
