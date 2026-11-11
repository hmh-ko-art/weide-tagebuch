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
  for (const row of rows) { const k = row.daten; k.eintraege = (k.eintraege ?? []).map(migrieren); cache.set(row.id, k) }
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
function migrieren(e) {
  if (!e || typeof e !== 'object') return e
  const notizen = Array.isArray(e.notizen) ? [...e.notizen] : []
  if (typeof e.notiz === 'string' && e.notiz.trim() && !notizen.some((n) => n.id === `${e.id}-n0`)) {
    notizen.push({ id: `${e.id}-n0`, text: e.notiz, zeitpunkt: e.erstellt || e.geaendert || new Date().toISOString() })
  }
  const neu = { ...e, notizen }
  delete neu.notiz
  return neu
}
const notizOk = (n) => n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.zeitpunkt === 'string'

function laden(id) {
  if (!idOk(id)) return null
  if (cache.has(id)) return cache.get(id)
  if (pg) return null // bei Postgres liegen alle Karten nach dem Start im Cache
  try {
    const k = JSON.parse(fs.readFileSync(datei(id), 'utf8'))
    k.eintraege = k.eintraege.map(migrieren)
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
const oeffentlich = (k) => ({ id: k.id, name: k.name, version: k.version, eintraege: k.eintraege, geaendert: k.geaendert })
function senden(k) {
  const set = clients.get(k.id)
  if (!set) return
  const data = `event: karte\ndata: ${JSON.stringify(oeffentlich(k))}\n\n`
  for (const res of set) res.write(data)
}
function darfBearbeiten(req, k) {
  return req.get('x-bearbeiten-schluessel') === k.schluessel
}

// Neue geteilte Karte anlegen (optional mit Startdaten)
app.post('/api/karten', (req, res) => {
  const id = zufall(10)
  const k = {
    id,
    name: String(req.body?.name || 'Meine Weidekarte').slice(0, 100),
    schluessel: zufall(16),
    version: 0,
    eintraege: Array.isArray(req.body?.eintraege) ? req.body.eintraege.map(migrieren) : [],
    erstellt: new Date().toISOString(),
  }
  cache.set(id, k)
  speichern(k)
  res.status(201).json({ ...oeffentlich(k), schluessel: k.schluessel })
})

app.get('/api/karten/:id', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
  res.json({ ...oeffentlich(k), darfBearbeiten: darfBearbeiten(req, k) })
})

// Eintrag anlegen/ändern
app.put('/api/karten/:id/eintraege/:eid', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
  if (!darfBearbeiten(req, k)) return res.status(403).json({ fehler: 'Nur Lesezugriff' })
  const body = req.body
  if (!body || body.id !== req.params.eid || !['pin', 'flaeche'].includes(body.typ)) return res.status(400).json({ fehler: 'Ungültiger Eintrag' })
  const e = migrieren(body)
  const i = k.eintraege.findIndex((x) => x.id === e.id)
  // Notizen eines bestehenden Eintrags werden nur über die Notiz-Endpunkte geändert,
  // damit ein Bearbeiten (Name/Farbe …) nie gleichzeitig hinzugefügte Notizen überschreibt.
  if (i >= 0) k.eintraege[i] = { ...e, notizen: k.eintraege[i].notizen ?? [] }
  else k.eintraege.push(e)
  speichern(k)
  res.json({ ok: true, version: k.version })
})

app.delete('/api/karten/:id/eintraege/:eid', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
  if (!darfBearbeiten(req, k)) return res.status(403).json({ fehler: 'Nur Lesezugriff' })
  k.eintraege = k.eintraege.filter((x) => x.id !== req.params.eid)
  speichern(k)
  res.json({ ok: true, version: k.version })
})

// Alle Einträge ersetzen (Import)
app.put('/api/karten/:id/eintraege', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
  if (!darfBearbeiten(req, k)) return res.status(403).json({ fehler: 'Nur Lesezugriff' })
  if (!Array.isArray(req.body)) return res.status(400).json({ fehler: 'Liste erwartet' })
  k.eintraege = req.body.map(migrieren)
  speichern(k)
  res.json({ ok: true, version: k.version })
})

// Notiz anlegen/ändern (per Notiz-ID zusammengeführt -> gleichzeitige Notizen gehen nicht verloren)
app.put('/api/karten/:id/eintraege/:eid/notizen/:nid', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
  if (!darfBearbeiten(req, k)) return res.status(403).json({ fehler: 'Nur Lesezugriff' })
  const e = k.eintraege.find((x) => x.id === req.params.eid)
  if (!e) return res.status(404).json({ fehler: 'Eintrag nicht gefunden' })
  const n = req.body
  if (!notizOk(n) || n.id !== req.params.nid) return res.status(400).json({ fehler: 'Ungültige Notiz' })
  const notiz = { id: n.id, text: n.text.slice(0, 5000), zeitpunkt: n.zeitpunkt, ...(n.autor ? { autor: String(n.autor).slice(0, 60) } : {}) }
  e.notizen = [...(e.notizen ?? []).filter((x) => x.id !== n.id), notiz]
  speichern(k)
  res.json({ ok: true, version: k.version })
})

app.delete('/api/karten/:id/eintraege/:eid/notizen/:nid', (req, res) => {
  const k = laden(req.params.id)
  if (!k) return res.status(404).json({ fehler: 'Karte nicht gefunden' })
  if (!darfBearbeiten(req, k)) return res.status(403).json({ fehler: 'Nur Lesezugriff' })
  const e = k.eintraege.find((x) => x.id === req.params.eid)
  if (!e) return res.status(404).json({ fehler: 'Eintrag nicht gefunden' })
  e.notizen = (e.notizen ?? []).filter((x) => x.id !== req.params.nid)
  speichern(k)
  res.json({ ok: true, version: k.version })
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
