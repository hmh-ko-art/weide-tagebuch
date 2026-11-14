// Weide-Tagebuch – kleiner Sync-Server (Express + JSON-Dateien + Server-Sent Events)
// Start: node server/server.js   (Port über PORT, Standard 8787)
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data')
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT || 8787)
const DATABASE_URL = process.env.DATABASE_URL
fs.mkdirSync(DATA_DIR, { recursive: true })

// Ablage: mit DATABASE_URL -> Postgres (z. B. Render Postgres, übersteht Neustarts/Deploys),
// sonst JSON-Dateien in server/data (nur lokal sinnvoll; auf Render Free nicht dauerhaft).
let pg = null
async function ablageStarten() {
  if (!DATABASE_URL) return console.log('Ablage: JSON-Dateien in', DATA_DIR)
  const { default: pgMod } = await import('pg')
  const lokal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL)
  pg = new pgMod.Pool({ connectionString: DATABASE_URL, ssl: lokal ? false : { rejectUnauthorized: false }, max: 3 })
  await pg.query('CREATE TABLE IF NOT EXISTS karten (id text PRIMARY KEY, daten jsonb NOT NULL, geaendert timestamptz NOT NULL DEFAULT now())')
  const { rows } = await pg.query('SELECT id, daten FROM karten')
  for (const row of rows) cache.set(row.id, karteMigrieren(row.daten))
  console.log(`Ablage: Postgres (${rows.length} Karten geladen)`)
}
// Schreibvorgänge pro Karte nacheinander ausführen
let pgKette = Promise.resolve()
function pgSchreiben(k) {
  const json = JSON.stringify(k)
  pgKette = pgKette
    .then(() => pg.query('INSERT INTO karten (id, daten, geaendert) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET daten = EXCLUDED.daten, geaendert = now()', [k.id, json]))
    .catch((e) => console.error('Postgres-Schreibfehler:', e.message))
}

const app = express()
app.use(express.json({ limit: '5mb' }))

const cache = new Map() // id -> karte
const clients = new Map() // id -> Set<res>

const idOk = (id) => /^[a-z0-9]{6,32}$/i.test(id)
const datei = (id) => path.join(DATA_DIR, `${id}.json`)
const zufall = (n) => crypto.randomBytes(n).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, n)

// Altes Einzelfeld `notiz` -> `notizen: [...]` (gleiche Logik wie im Client, deterministische ID)
const TIERARTEN = ['schaf', 'bock', 'lamm']
// Einheiten validieren: max. 50, Art aus der Liste (sonst Schaf), Anzahl ganze Zahl 0–100000, eindeutige kurze IDs
function einheitenPruefen(liste) {
  if (!Array.isArray(liste)) return []
  const ids = new Set()
  const aus = []
  for (const x of liste.slice(0, 50)) {
    if (!x || typeof x !== 'object') continue
    const anzahl = Number(x.anzahl)
    if (!Number.isFinite(anzahl) || anzahl < 0) continue
    let id = typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : 'e' + zufall(8)
    if (ids.has(id)) id = 'e' + zufall(8)
    ids.add(id)
    aus.push({ id, art: TIERARTEN.includes(x.art) ? x.art : 'schaf', anzahl: Math.min(100000, Math.round(anzahl)) })
  }
  return aus
}
// Gleichzeitige Änderungen zusammenführen (3-Wege): basis = Stand, von dem der Client ausging.
// Unverändert gelassene Einheiten übernehmen den aktuellen Serverstand, geänderte/neue/gelöschte gelten vom Client,
// von anderen inzwischen hinzugefügte Einheiten bleiben erhalten.
function einheitenMergen(server, client, basis) {
  if (!Array.isArray(basis)) return client
  const b = new Map(einheitenPruefen(basis).map((x) => [x.id, x]))
  const sv = new Map(server.map((x) => [x.id, x]))
  const gleich = (x, y) => x.art === y.art && x.anzahl === y.anzahl
  const aus = []
  for (const c of client) {
    const alt = b.get(c.id)
    if (alt && gleich(c, alt)) { if (sv.has(c.id)) aus.push(sv.get(c.id)) } // unverändert: Serverstand (ggf. inzwischen gelöscht)
    else aus.push(c)
  }
  for (const x of server) if (!b.has(x.id) && !aus.some((c) => c.id === x.id)) aus.push(x)
  return aus
}
function migrieren(e) {
  if (!e || typeof e !== 'object') return e
  const notizen = Array.isArray(e.notizen) ? [...e.notizen] : []
  if (typeof e.notiz === 'string' && e.notiz.trim() && !notizen.some((n) => n.id === `${e.id}-n0`)) {
    notizen.push({ id: `${e.id}-n0`, text: e.notiz, zeitpunkt: e.erstellt || e.geaendert || new Date().toISOString() })
  }
  const neu = { ...e, notizen }
  delete neu.notiz
  // Tiereinheiten: alte Einzel-Tierzahl (+ Symbol) wird zur ersten Einheit (feste ID), dann prüfen
  if (!Array.isArray(neu.einheiten) && typeof neu.tiere === 'number' && Number.isFinite(neu.tiere)) {
    neu.einheiten = [{ id: `${neu.id}-t0`, art: TIERARTEN.includes(neu.tierart) ? neu.tierart : 'schaf', anzahl: neu.tiere }]
  }
  neu.einheiten = einheitenPruefen(neu.einheiten)
  delete neu.tiere
  delete neu.tierart
  delete neu.einheitenBasis
  // Tierliste: 'fest' (Standard) oder 'ausblendbar'; ungültige Werte entfallen (= fest)
  if (!['fest', 'ausblendbar'].includes(neu.tierlisteModus)) delete neu.tierlisteModus
  return neu
}
// Karte migrieren: alter Bearbeiten-Schlüssel -> erster Admin-Zugang (der alte Link funktioniert weiter)
function karteMigrieren(k) {
  k.eintraege = (k.eintraege ?? []).map(migrieren)
  if (!Array.isArray(k.nutzer)) {
    k.nutzer = k.schluessel ? [{ id: 'admin0', name: 'Admin', rolle: 'admin', zugang: k.schluessel, erstellt: k.erstellt || new Date().toISOString() }] : []
  }
  delete k.schluessel
  k.nutzerVersion ??= 1
  return k
}
const notizOk = (n) => n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.zeitpunkt === 'string'

function laden(id) {
  if (!idOk(id)) return null
  if (cache.has(id)) return cache.get(id)
  if (pg) return null // bei Postgres liegen alle Karten nach dem Start im Cache
  try {
    const k = karteMigrieren(JSON.parse(fs.readFileSync(datei(id), 'utf8')))
    cache.set(id, k)
    return k
  } catch {
    return null
  }
}
function speichern(k) {
  k.version += 1
  k.geaendert = new Date().toISOString()
  if (pg) { pgSchreiben(k); senden(k); return }
  fs.writeFileSync(datei(k.id) + '.tmp', JSON.stringify(k, null, 2))
  fs.renameSync(datei(k.id) + '.tmp', datei(k.id))
  senden(k)
}
// Öffentliche Sicht (auch für den Ansehen-Link): ohne Nutzerliste/Zugänge
// namen: aktuelle Anzeigenamen nur der Nutzer, die als Notiz-Autor vorkommen (keine Zugänge, keine Rollen)
function autorNamen(k) {
  const ids = new Set()
  for (const e of k.eintraege) for (const n of e.notizen ?? []) if (n.autorId) ids.add(n.autorId)
  return Object.fromEntries(k.nutzer.filter((n) => ids.has(n.id)).map((n) => [n.id, n.name]))
}
const oeffentlich = (k) => ({ id: k.id, name: k.name, version: k.version, nutzerVersion: k.nutzerVersion, namen: autorNamen(k), eintraege: k.eintraege, geaendert: k.geaendert })
function senden(k) {
  const set = clients.get(k.id)
  if (!set) return
  const data = `event: karte\ndata: ${JSON.stringify(oeffentlich(k))}\n\n`
  for (const res of set) res.write(data)
}
// Wer ruft an? Persönlicher Zugang per Header x-zugang (alt: x-bearbeiten-schluessel)
const gleich = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }
function wer(req, k) {
  const z = req.get('x-zugang') || req.get('x-bearbeiten-schluessel')
  if (!z) return null
  return k.nutzer.find((n) => gleich(n.zugang, z)) ?? null
}
const istAdmin = (n) => n?.rolle === 'admin'
const ichInfo = (n) => (n ? { id: n.id, name: n.name, rolle: n.rolle } : null)
// Darf `n` den Eintrag `e` bearbeiten/löschen? Admin: alles; Nutzer: nur eigene
const darfEintrag = (n, e) => istAdmin(n) || (!!n && e.erstelltVon === n.id)
const darfNotiz = (n, notiz) => istAdmin(n) || (!!n && notiz.autorId === n.id)
function nutzerGeaendert(k) { k.nutzerVersion = (k.nutzerVersion ?? 1) + 1; speichern(k) }

// Middleware: Karte laden + Nutzer bestimmen
function mitKarte(rolle) {
  return (req, res, next) => {
    const k = laden(req.params.id)
    if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
    const n = wer(req, k)
    if (rolle === 'nutzer' && !n) return res.status(403).json({ fehler: 'Nur Lesezugriff – kein gültiger Zugang' })
    if (rolle === 'admin' && !istAdmin(n)) return res.status(403).json({ fehler: 'Nur für Admins' })
    req.karte = k
    req.nutzer = n
    next()
  }
}

// Neue geteilte Karte anlegen (optional mit Startdaten)
app.post('/api/karten', (req, res) => {
  const id = zufall(10)
  const jetzt = new Date().toISOString()
  const admin = { id: 'u' + zufall(8), name: (namePruefen(req.body?.adminName).name ?? 'Admin'), rolle: 'admin', zugang: zufall(20), erstellt: jetzt }
  const k = {
    id,
    name: String(req.body?.name || 'Meine Weidekarte').slice(0, 100),
    version: 0,
    nutzerVersion: 1,
    nutzer: [admin],
    eintraege: Array.isArray(req.body?.eintraege) ? req.body.eintraege.map((e) => ({ ...migrieren(e), erstelltVon: admin.id })) : [],
    erstellt: jetzt,
  }
  cache.set(id, k)
  speichern(k)
  res.status(201).json({ ...oeffentlich(k), zugang: admin.zugang, ich: ichInfo(admin) })
})

app.get('/api/karten/:id', mitKarte(), (req, res) => {
  res.json({ ...oeffentlich(req.karte), ich: ichInfo(req.nutzer), darfBearbeiten: !!req.nutzer })
})

// Eintrag anlegen/ändern
app.put('/api/karten/:id/eintraege/:eid', mitKarte('nutzer'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  const body = req.body
  if (!body || body.id !== req.params.eid || !['pin', 'flaeche'].includes(body.typ)) return res.status(400).json({ fehler: 'Ungültiger Eintrag' })
  const e = migrieren(body)
  // Alte (noch gecachte) App-Versionen schicken keine Einheiten -> bestehende Einheiten nicht anfassen
  const ohneEinheiten = !Array.isArray(body.einheiten)
  const i = k.eintraege.findIndex((x) => x.id === e.id)
  // Notizen eines bestehenden Eintrags werden nur über die Notiz-Endpunkte geändert,
  // damit ein Bearbeiten (Name/Farbe …) nie gleichzeitig hinzugefügte Notizen überschreibt.
  if (i >= 0) {
    const alt = k.eintraege[i]
    if (!darfEintrag(ich, alt)) return res.status(403).json({ fehler: 'Nur eigene Einträge bearbeiten (oder Admin)' })
    const einheiten = ohneEinheiten ? alt.einheiten ?? [] : einheitenMergen(alt.einheiten ?? [], e.einheiten, body.einheitenBasis)
    // ältere App-Versionen kennen tierlisteModus nicht -> bisherigen Wert behalten
    const modus = body.tierlisteModus === undefined && alt.tierlisteModus ? { tierlisteModus: alt.tierlisteModus } : {}
    k.eintraege[i] = { ...e, ...modus, einheiten, erstelltVon: alt.erstelltVon, notizen: alt.notizen ?? [] }
  } else {
    // neue Notizen beim Anlegen bekommen den Nutzer als Autor
    const notizen = e.notizen.filter(notizOk).map((n) => ({ id: n.id, text: n.text.slice(0, 5000), zeitpunkt: n.zeitpunkt, autor: ich.name, autorId: ich.id }))
    k.eintraege.push({ ...e, erstelltVon: ich.id, notizen })
  }
  speichern(k)
  res.json({ ok: true, version: k.version })
})

app.delete('/api/karten/:id/eintraege/:eid', mitKarte('nutzer'), (req, res) => {
  const k = req.karte
  const e = k.eintraege.find((x) => x.id === req.params.eid)
  if (!e) return res.json({ ok: true, version: k.version })
  if (!darfEintrag(req.nutzer, e)) return res.status(403).json({ fehler: 'Nur eigene Einträge löschen (oder Admin)' })
  k.eintraege = k.eintraege.filter((x) => x.id !== req.params.eid)
  speichern(k)
  res.json({ ok: true, version: k.version })
})

// Alle Einträge ersetzen (Import)
app.put('/api/karten/:id/eintraege', mitKarte('admin'), (req, res) => {
  const k = req.karte
  if (!Array.isArray(req.body)) return res.status(400).json({ fehler: 'Liste erwartet' })
  k.eintraege = req.body.map((e) => ({ erstelltVon: req.nutzer.id, ...migrieren(e) }))
  speichern(k)
  res.json({ ok: true, version: k.version })
})

// Notiz anlegen/ändern (per Notiz-ID zusammengeführt -> gleichzeitige Notizen gehen nicht verloren)
// Notizen: jeder Nutzer darf an jedem Eintrag Notizen hinzufügen; ändern/löschen nur eigene (Admin: alle)
app.put('/api/karten/:id/eintraege/:eid/notizen/:nid', mitKarte('nutzer'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  const e = k.eintraege.find((x) => x.id === req.params.eid)
  if (!e) return res.status(404).json({ fehler: 'Eintrag nicht gefunden' })
  const n = req.body
  if (!notizOk(n) || n.id !== req.params.nid) return res.status(400).json({ fehler: 'Ungültige Notiz' })
  const alt = (e.notizen ?? []).find((x) => x.id === n.id)
  if (alt && !darfNotiz(ich, alt)) return res.status(403).json({ fehler: 'Nur eigene Notizen bearbeiten (oder Admin)' })
  // Autor setzt der Server: beim Anlegen der aktuelle Nutzer, beim Bearbeiten bleibt der ursprüngliche Autor
  const autor = alt ? { autor: alt.autor, autorId: alt.autorId } : { autor: ich.name, autorId: ich.id }
  const notiz = { id: n.id, text: n.text.slice(0, 5000), zeitpunkt: n.zeitpunkt, ...(autor.autor ? { autor: autor.autor } : {}), ...(autor.autorId ? { autorId: autor.autorId } : {}) }
  e.notizen = [...(e.notizen ?? []).filter((x) => x.id !== n.id), notiz]
  speichern(k)
  res.json({ ok: true, version: k.version })
})

app.delete('/api/karten/:id/eintraege/:eid/notizen/:nid', mitKarte('nutzer'), (req, res) => {
  const k = req.karte
  const e = k.eintraege.find((x) => x.id === req.params.eid)
  if (!e) return res.status(404).json({ fehler: 'Eintrag nicht gefunden' })
  const alt = (e.notizen ?? []).find((x) => x.id === req.params.nid)
  if (!alt) return res.json({ ok: true, version: k.version })
  if (!darfNotiz(req.nutzer, alt)) return res.status(403).json({ fehler: 'Nur eigene Notizen löschen (oder Admin)' })
  e.notizen = (e.notizen ?? []).filter((x) => x.id !== req.params.nid)
  speichern(k)
  res.json({ ok: true, version: k.version })
})

// ---- Nutzerverwaltung (nur Admins) ----
const nutzerListe = (k) => k.nutzer.map((n) => ({ id: n.id, name: n.name, rolle: n.rolle, zugang: n.zugang, erstellt: n.erstellt }))
const rolleOk = (r) => r === 'admin' || r === 'nutzer'
// Anzeigename prüfen: Text, ohne Steuerzeichen, Leerzeichen zusammengefasst, 1–40 Zeichen
const NAME_MAX = 40
function namePruefen(roh) {
  if (typeof roh !== 'string') return { fehler: 'Name fehlt' }
  const name = roh.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (!name) return { fehler: 'Name darf nicht leer sein' }
  if ([...name].length > NAME_MAX) return { fehler: `Name ist zu lang (höchstens ${NAME_MAX} Zeichen)` }
  return { name }
}
const adminAnzahl = (k) => k.nutzer.filter((n) => n.rolle === 'admin').length

app.get('/api/karten/:id/nutzer', mitKarte('admin'), (req, res) => res.json(nutzerListe(req.karte)))

app.post('/api/karten/:id/nutzer', mitKarte('admin'), (req, res) => {
  const k = req.karte
  const { name, fehler } = namePruefen(req.body?.name)
  const rolle = req.body?.rolle ?? 'nutzer'
  if (fehler) return res.status(400).json({ fehler })
  if (!rolleOk(rolle)) return res.status(400).json({ fehler: 'Ungültige Rolle' })
  const n = { id: 'u' + zufall(8), name, rolle, zugang: zufall(20), erstellt: new Date().toISOString() }
  k.nutzer.push(n)
  nutzerGeaendert(k)
  res.status(201).json(n)
})

app.patch('/api/karten/:id/nutzer/:nid', mitKarte('admin'), (req, res) => {
  const k = req.karte
  const n = k.nutzer.find((x) => x.id === req.params.nid)
  if (!n) return res.status(404).json({ fehler: 'Nutzer nicht gefunden' })
  if (req.body?.rolle !== undefined) {
    if (!rolleOk(req.body.rolle)) return res.status(400).json({ fehler: 'Ungültige Rolle' })
    if (n.rolle === 'admin' && req.body.rolle !== 'admin' && adminAnzahl(k) <= 1) return res.status(409).json({ fehler: 'Mindestens ein Admin muss bleiben' })
    n.rolle = req.body.rolle
  }
  if (req.body?.name !== undefined) {
    const { name, fehler } = namePruefen(req.body.name)
    if (fehler) return res.status(400).json({ fehler })
    n.name = name
  }
  if (req.body?.neuerZugang) n.zugang = zufall(20) // alter Link wird sofort ungültig
  nutzerGeaendert(k)
  res.json(n)
})

app.delete('/api/karten/:id/nutzer/:nid', mitKarte('admin'), (req, res) => {
  const k = req.karte
  const n = k.nutzer.find((x) => x.id === req.params.nid)
  if (!n) return res.status(404).json({ fehler: 'Nutzer nicht gefunden' })
  if (n.rolle === 'admin' && adminAnzahl(k) <= 1) return res.status(409).json({ fehler: 'Mindestens ein Admin muss bleiben' })
  k.nutzer = k.nutzer.filter((x) => x.id !== n.id) // Zugang ab sofort ungültig
  nutzerGeaendert(k)
  res.json({ ok: true })
})

// Eigenes Profil: jeder angemeldete Nutzer darf nur seinen eigenen Anzeigenamen ändern
app.patch('/api/karten/:id/ich', mitKarte('nutzer'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  const { name, fehler } = namePruefen(req.body?.name)
  if (fehler) return res.status(400).json({ fehler })
  if (name !== ich.name) {
    ich.name = name
    nutzerGeaendert(k) // -> SSE an alle Clients (namen + nutzerVersion)
  }
  res.json(ichInfo(ich))
})

// Live-Updates per Server-Sent Events
app.get('/api/karten/:id/live', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).end()
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  res.flushHeaders()
  res.write(`event: karte\ndata: ${JSON.stringify(oeffentlich(k))}\n\n`)
  if (!clients.has(k.id)) clients.set(k.id, new Set())
  clients.get(k.id).add(res)
  const ping = setInterval(() => res.write(': ping\n\n'), 25000)
  req.on('close', () => {
    clearInterval(ping)
    clients.get(k.id)?.delete(res)
  })
})

// Gebaute App ausliefern (Produktion)
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  app.get(/^\/(?!api\/|healthz).*/, (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))
}

app.get('/healthz', (_req, res) => res.json({ ok: true, ablage: pg ? 'postgres' : 'datei' }))

ablageStarten()
  .then(() => app.listen(PORT, () => console.log(`Weide-Tagebuch-Server läuft auf http://localhost:${PORT}`)))
  .catch((e) => { console.error('Ablage konnte nicht gestartet werden:', e); process.exit(1) })
