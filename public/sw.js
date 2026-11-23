// FlockMap Service Worker – Offline-Modus
// 1) App-Hülle: beim Installieren komplett vorgeladen (Liste wird beim Build eingesetzt) -> App startet auch ohne Netz.
// 2) Seitenaufrufe (7s): gespeicherte App-Hülle sofort, Netz im Hintergrund (Cookie setzen, neue Hülle holen).
// 3) Kartenkacheln (Esri, OpenStreetMap): nur was tatsächlich angesehen wurde, wird gespeichert (kein Massen-Download –
//    so verlangen es die Nutzungsbedingungen von Esri und OSM). Mit Netz immer frisch vom Server (max. 4 s),
//    ohne Netz aus dem Speicher. Höchstens KACHELN_MAX Kacheln, älteste fliegen zuerst raus.
//    „Gebiet für offline sichern“ kopiert angesehene Kacheln in einen geschützten Speicher (wird nie automatisch geleert).
// /api wird nie vom Service Worker gecacht – Kartendaten liegen in IndexedDB (siehe src/speicher.ts).
const VERSION = '__VERSION__'
const PRECACHE = self.__PRECACHE__ || ['/', '/index.html']
const SW_STAND = '7t' // erhöhen, wenn sich die Logik ändert (VERSION ändert sich ohnehin mit jedem Build)
const SHELL = 'flockmap-shell-' + SW_STAND + '-' + VERSION
const KACHELN = 'flockmap-kacheln'
const GEBIETE = 'flockmap-gebiete'
const KACHELN_MAX = 1000 // 7s: kleiner, damit der Browser den Speicher nicht als „zu groß“ räumt (App-Hülle liegt in SHELL, wird nie verdrängt)
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
    const behalten = new Set([SHELL, KACHELN, GEBIETE, ...huellen.slice(-2)])
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
// 7s: Seitenaufrufe Speicher zuerst – die gespeicherte App-Hülle kommt sofort (auch wenn der Server gerade aufwacht,
// Render Free braucht dafür bis ~1 min). Das Netz läuft im Hintergrund: setzt das Karten-Cookie (7p) und holt eine neue Hülle.
const KARTE_RE = /^[\w-]{4,40}$/, ZUGANG_RE = /^[\w-]{8,80}$/
const htmlAntwort = (html) => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } })
// wie der Server (seiteSenden): Manifest-Link pro Karte, damit „Zum Home-Bildschirm“ (iOS) die Karte mitnimmt
function huelleFuer(html, url) {
  const id = url.searchParams.get('karte') || '', zugang = url.searchParams.get('zugang') || url.searchParams.get('schluessel') || ''
  if (!KARTE_RE.test(id)) return html
  return html.replace('href="/manifest.webmanifest"', `href="/manifest.webmanifest?karte=${id}${ZUGANG_RE.test(zugang) ? `&amp;zugang=${zugang}` : ''}"`)
}
// neue Hülle erst speichern, wenn alle darin genannten /assets/ im Speicher liegen (sonst startet sie offline halb);
// alte gehashte Dateien bleiben im Speicher, damit noch offene ältere Seiten nachladen können
let huelleLaeuft = null
function huelleAktualisieren() {
  if (huelleLaeuft) return huelleLaeuft
  huelleLaeuft = (async () => {
    const r = await fetch('/index.html', { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' })
    if (!r.ok || r.type === 'opaqueredirect' || !(r.headers.get('content-type') || '').includes('html')) return
    const html = await r.text()
    const c = await caches.open(SHELL)
    const dateien = [...new Set(html.match(/\/assets\/[^"'\s)]+/g) || [])]
    for (const d of dateien) {
      if (await caches.match(d)) continue
      const a = await fetch(d, { cache: 'reload' })
      if (!a.ok) return
      await c.put(d, a)
    }
    await c.put('/index.html', htmlAntwort(html))
  })().catch(() => {}).finally(() => { huelleLaeuft = null })
  return huelleLaeuft
}
async function seite(e) {
  const url = new URL(e.request.url)
  const huelle = await caches.match('/index.html')
  const netz = () => fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin', redirect: 'manual' })
  if (!huelle) {
    // noch keine Hülle (erster Besuch): Netz, mit Zeitlimit-Rückfall wie bisher
    try {
      const r = await mitZeitlimit(netz(), 8000)
      if (r.type !== 'opaqueredirect' && r.ok) e.waitUntil(huelleAktualisieren())
      return r
    } catch { return (await caches.match('/')) || Response.error() }
  }
  const q = url.searchParams
  const blank = url.pathname === '/' && !q.has('karte') && !q.has('hof') && !q.has('betreiber') && !q.has('lokal')
  if (blank) {
    // „/“ ohne Karte: das Cookie (7p) darf kurz (0,8 s) gewinnen (302 -> gemerkte Karte); sonst sofort die Hülle,
    // main.tsx springt dann zur zuletzt geöffneten Karte auf dem Gerät (wt-letzte-karte)
    const n = netz()
    e.waitUntil(n.then(() => huelleAktualisieren(), () => {}))
    try {
      const r = await mitZeitlimit(n, 800)
      if (r.type === 'opaqueredirect') return r
    } catch { /* Server schläft noch */ }
    return htmlAntwort(await huelle.text())
  }
  // Mit Karte/Zugang: im Hintergrund die echte Adresse abrufen (setzt das Cookie, weckt den Server), dann Hülle erneuern
  e.waitUntil(netz().then(() => huelleAktualisieren(), () => {}))
  return htmlAntwort(huelleFuer(await huelle.text(), url))
}
// sonstige Dateien (Schriften, Manifest, Symbole): kurz aufs Netz warten (1,5 s), dann der Speicher;
// gehashte /assets/ ändern sich nie -> Speicher zuerst
async function datei(e) {
  const url = new URL(e.request.url)
  const ausSpeicher = () => caches.match(e.request)
  if (url.pathname.startsWith('/assets/')) {
    const r = await caches.match(e.request)
    if (r) return r
  }
  const n = fetch(e.request).then((r) => {
    // nur echte Dateien speichern (keine HTML-Ersatzseite unter einer Datei-Adresse)
    const html = (r.headers.get('content-type') || '').includes('html')
    if (r.ok && !(html && url.pathname !== '/' && !url.pathname.endsWith('.html'))) { const c = r.clone(); e.waitUntil(caches.open(SHELL).then((s) => s.put(e.request, c))) }
    return r
  })
  e.waitUntil(n.catch(() => {}))
  try {
    const r = await mitZeitlimit(n, url.pathname.startsWith('/assets/') ? 15000 : 1500)
    return r.ok ? r : (await ausSpeicher()) || r // Server wacht auf (502/503) -> lieber die gespeicherte Datei
  } catch {
    const r = await ausSpeicher()
    if (r) return r
    // nichts gespeichert: weiter aufs Netz warten
    return n
  }
}
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (KACHEL_HOSTS.test(url.hostname)) return e.respondWith(kachel(e))
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return
  e.respondWith(e.request.mode === 'navigate' ? seite(e) : datei(e))
})
