// FlockMap (ehemals Weide-Tagebuch) – kleiner Sync-Server (Express + JSON-Dateien + Server-Sent Events)
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
  if (!DATABASE_URL) {
    for (const f of fs.readdirSync(DATA_DIR).filter((x) => /^hof-[a-z0-9]+\.json$/i.test(x))) {
      try { const h = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); hofCache.set(h.id, h) } catch { /* kaputte Datei überspringen */ }
    }
    return console.log('Ablage: JSON-Dateien in', DATA_DIR, `(${hofCache.size} Höfe)`)
  }
  const { default: pgMod } = await import('pg')
  // Ohne SSL: lokale DB oder eigener Server (Docker-Netz, DATABASE_SSL=off). Render bleibt bei SSL.
  const lokal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL) || /^(off|false|disable|0)$/i.test(process.env.DATABASE_SSL || '')
  pg = new pgMod.Pool({ connectionString: DATABASE_URL, ssl: lokal ? false : { rejectUnauthorized: false }, max: 3 })
  await pg.query('CREATE TABLE IF NOT EXISTS karten (id text PRIMARY KEY, daten jsonb NOT NULL, geaendert timestamptz NOT NULL DEFAULT now())')
  const { rows } = await pg.query('SELECT id, daten FROM karten')
  for (const row of rows) cache.set(row.id, karteMigrieren(row.daten))
  // Höfe (Betriebe mit mehreren Karten und gemeinsamer Personenliste) – eigene Tabelle, rein additiv
  await pg.query('CREATE TABLE IF NOT EXISTS hoefe (id text PRIMARY KEY, daten jsonb NOT NULL, geaendert timestamptz NOT NULL DEFAULT now())')
  const h = await pg.query('SELECT id, daten FROM hoefe')
  for (const row of h.rows) hofCache.set(row.id, row.daten)
  console.log(`Ablage: Postgres (${rows.length} Karten, ${h.rows.length} Höfe geladen)`)
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
app.set('trust proxy', 1) // hinter Render-Proxy: echte Client-IP für das Rate-Limit
app.use(express.json({ limit: '5mb' }))

const cache = new Map() // id -> karte
const hofCache = new Map() // id -> hof
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
  // Datum des Eintrags: nur gültiges YYYY-MM-DD, sonst entfällt es (= Erstelldatum)
  if (typeof neu.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(neu.datum) || isNaN(Date.parse(neu.datum))) delete neu.datum
  // Tierliste: 'fest' (Standard) oder 'ausblendbar'; ungültige Werte entfallen (= fest)
  if (!['fest', 'ausblendbar'].includes(neu.tierlisteModus)) delete neu.tierlisteModus
  // Gruppe (eigene Gruppen der Nadel-Liste): nur gültige ID, sonst ungruppiert
  if (!gruppenIdOk(neu.gruppe)) delete neu.gruppe
  return neu
}
// ---- Eigene Gruppen (geteilt für alle Nutzer der Karte) ----
const gruppenIdOk = (id) => typeof id === 'string' && /^[\w-]{4,40}$/.test(id)
const GRUPPEN_MAX = 100
function gruppenPruefen(liste) {
  if (!Array.isArray(liste)) return []
  const ids = new Set()
  return liste.filter((g) => g && gruppenIdOk(g.id) && typeof g.name === 'string' && !ids.has(g.id) && ids.add(g.id)).slice(0, GRUPPEN_MAX).map((g) => {
    const neu = { ...g }
    if (!farbeOk(neu.farbe)) delete neu.farbe; else neu.farbe = neu.farbe.toLowerCase()
    neu.reihenfolge = reihenfolgePruefen(neu.reihenfolge)
    return neu
  })
}
const farbeOk = (f) => typeof f === 'string' && /^#[0-9a-f]{6}$/i.test(f)
const reihenfolgePruefen = (l) => (Array.isArray(l) ? [...new Set(l.filter((x) => typeof x === 'string' && x.length <= 64))].slice(0, 2000) : [])
// Gruppe einer Nadel nur behalten, wenn es die Gruppe auf der Karte gibt
const gruppeGueltig = (k, e) => { if (e.gruppe && !(k.gruppen ?? []).some((g) => g.id === e.gruppe)) delete e.gruppe; return e }
// Karte migrieren: alter Bearbeiten-Schlüssel -> erster Admin-Zugang (der alte Link funktioniert weiter)
function karteMigrieren(k) {
  k.eintraege = (k.eintraege ?? []).map(migrieren)
  if (!Array.isArray(k.nutzer)) {
    k.nutzer = k.schluessel ? [{ id: 'admin0', name: 'Admin', rolle: 'admin', zugang: k.schluessel, erstellt: k.erstellt || new Date().toISOString() }] : []
  }
  delete k.schluessel
  k.nutzerVersion ??= 1
  k.gruppen = gruppenPruefen(k.gruppen)
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
const oeffentlich = (k) => ({ id: k.id, name: k.name, version: k.version, nutzerVersion: k.nutzerVersion, namen: autorNamen(k), eintraege: k.eintraege, gruppen: (k.gruppen ?? []).map((g) => ({ id: g.id, name: g.name, farbe: g.farbe, reihenfolge: g.reihenfolge ?? [], von: g.von, erstellt: g.erstellt })), geaendert: k.geaendert, ...(k.hof && hofCache.has(k.hof) ? { hof: { id: k.hof, name: hofCache.get(k.hof).name } } : {}) })
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
    if (rolle === 'nutzer' && n.rolle === 'ansehen') return res.status(403).json({ fehler: 'Nur ansehen – keine Bearbeitungsrechte' })
    if (rolle === 'angemeldet' && !n) return res.status(403).json({ fehler: 'Kein gültiger Zugang' })
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
    // Gruppen einer bisher lokalen Karte mitnehmen
    gruppen: gruppenPruefen(req.body?.gruppen).map((g) => ({ id: g.id, name: gruppenNamePruefen(g.name).name ?? 'Gruppe', ...(g.farbe ? { farbe: g.farbe } : {}), reihenfolge: g.reihenfolge, von: admin.id, erstellt: jetzt })),
    erstellt: jetzt,
  }
  k.eintraege.forEach((e) => gruppeGueltig(k, e))
  cache.set(id, k)
  speichern(k)
  res.status(201).json({ ...oeffentlich(k), zugang: admin.zugang, ich: ichInfo(admin) })
})

app.get('/api/karten/:id', mitKarte(), (req, res) => {
  const k = req.karte, n = req.nutzer
  const h = k.hof ? hofCache.get(k.hof) : null
  const m = h && n ? h.mitglieder.find((x) => x.id === n.id) : null
  res.json({ ...oeffentlich(k), ich: ichInfo(n), darfBearbeiten: !!n && n.rolle !== 'ansehen', ...(h ? { hof: { id: h.id, name: h.name, ...(m ? { rolle: m.rolle } : {}) } } : {}) })
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
    if (body.datum === undefined && alt.datum) modus.datum = alt.datum
    // Gruppe wird nur über /gruppe-zuordnen geändert (Merge-sicher: Bearbeiten überschreibt keine gleichzeitige Gruppierung)
    k.eintraege[i] = { ...e, ...modus, einheiten, erstelltVon: alt.erstelltVon, notizen: alt.notizen ?? [] }
    if (alt.gruppe) k.eintraege[i].gruppe = alt.gruppe; else delete k.eintraege[i].gruppe
  } else {
    // neue Notizen beim Anlegen bekommen den Nutzer als Autor
    const notizen = e.notizen.filter(notizOk).map((n) => ({ id: n.id, text: n.text.slice(0, 5000), zeitpunkt: n.zeitpunkt, autor: ich.name, autorId: ich.id }))
    k.eintraege.push(gruppeGueltig(k, { ...e, erstelltVon: ich.id, notizen }))
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
  k.eintraege = req.body.map((e) => gruppeGueltig(k, { erstelltVon: req.nutzer.id, ...migrieren(e) }))
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

// ---- Eigene Gruppen ----
// Anlegen: jeder mit Zugang; umbenennen/löschen: wer die Gruppe angelegt hat oder Admin
const darfGruppe = (n, g) => istAdmin(n) || (!!n && g.von === n.id)
function gruppenNamePruefen(roh) {
  if (typeof roh !== 'string') return { fehler: 'Name fehlt' }
  const name = roh.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (!name) return { fehler: 'Name darf nicht leer sein' }
  if ([...name].length > 40) return { fehler: 'Name ist zu lang (höchstens 40 Zeichen)' }
  return { name }
}
// Anlegen (neue ID) bzw. umbenennen (bestehende ID) – idempotent, damit Offline-Warteschlangen gefahrlos wiederholen
app.put('/api/karten/:id/gruppen/:gid', mitKarte('nutzer'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  if (!gruppenIdOk(req.params.gid)) return res.status(400).json({ fehler: 'Ungültige Gruppen-ID' })
  const { name, fehler } = gruppenNamePruefen(req.body?.name)
  if (fehler) return res.status(400).json({ fehler })
  // Farbe optional (ältere App-Versionen schicken keine -> bisherige bleibt)
  const farbe = req.body?.farbe
  if (farbe !== undefined && !farbeOk(farbe)) return res.status(400).json({ fehler: 'Ungültige Farbe' })
  k.gruppen ??= []
  const g = k.gruppen.find((x) => x.id === req.params.gid)
  if (g) {
    if (!darfGruppe(ich, g)) return res.status(403).json({ fehler: 'Nur eigene Gruppen bearbeiten (oder Admin)' })
    const f = farbe ? farbe.toLowerCase() : g.farbe
    if (g.name !== name || g.farbe !== f) { g.name = name; if (f) g.farbe = f; speichern(k) }
  } else {
    if (k.gruppen.length >= GRUPPEN_MAX) return res.status(409).json({ fehler: 'Zu viele Gruppen' })
    k.gruppen.push({ id: req.params.gid, name, ...(farbe ? { farbe: farbe.toLowerCase() } : {}), reihenfolge: [], von: ich.id, erstellt: new Date().toISOString() })
    speichern(k)
  }
  res.json({ ok: true, version: k.version })
})
// Löschen: Nadeln bleiben erhalten und sind danach ungruppiert
app.delete('/api/karten/:id/gruppen/:gid', mitKarte('nutzer'), (req, res) => {
  const k = req.karte
  const g = (k.gruppen ?? []).find((x) => x.id === req.params.gid)
  if (!g) return res.json({ ok: true, version: k.version })
  if (!darfGruppe(req.nutzer, g)) return res.status(403).json({ fehler: 'Nur eigene Gruppen löschen (oder Admin)' })
  k.gruppen = k.gruppen.filter((x) => x.id !== g.id)
  for (const e of k.eintraege) if (e.gruppe === g.id) delete e.gruppe
  speichern(k)
  res.json({ ok: true, version: k.version })
})
// Nadeln einer Gruppe zuordnen (gruppe: ID oder null = ohne Gruppe). Ändert nur das Feld „gruppe“.
// Rechte wie beim Bearbeiten: Nutzer nur eigene Nadeln, Admin alle. Nicht erlaubte werden übersprungen.
app.post('/api/karten/:id/gruppe-zuordnen', mitKarte('nutzer'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  const gid = req.body?.gruppe ?? null
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x) => typeof x === 'string').slice(0, 2000) : null
  if (!ids) return res.status(400).json({ fehler: 'ids fehlen' })
  if (gid !== null && !(k.gruppen ?? []).some((g) => g.id === gid)) return res.status(404).json({ fehler: 'Gruppe gibt es nicht (mehr)' })
  let geaendert = 0, abgelehnt = 0
  for (const id of ids) {
    const e = k.eintraege.find((x) => x.id === id)
    if (!e) continue
    if (!darfEintrag(ich, e)) { abgelehnt++; continue }
    if ((e.gruppe ?? null) === gid) continue
    // Nummernfolge: aus der alten Gruppe entfernen, in der neuen hinten anhängen
    const alt = (k.gruppen ?? []).find((g) => g.id === e.gruppe)
    if (alt) alt.reihenfolge = (alt.reihenfolge ?? []).filter((x) => x !== e.id)
    if (gid) {
      e.gruppe = gid
      const neu = k.gruppen.find((g) => g.id === gid)
      neu.reihenfolge = [...(neu.reihenfolge ?? []).filter((x) => x !== e.id), e.id]
    } else delete e.gruppe
    geaendert++
  }
  if (geaendert) speichern(k)
  if (!geaendert && abgelehnt) return res.status(403).json({ fehler: 'Nur eigene Nadeln gruppieren (oder Admin)', abgelehnt })
  res.json({ ok: true, geaendert, abgelehnt, version: k.version })
})

// Reihenfolge (Nummern 1..n) innerhalb einer Gruppe: jeder mit Zugang darf sortieren (ändert keine Nadel).
// Unbekannte IDs fallen weg, nicht genannte Mitglieder behalten ihre bisherige Reihenfolge und kommen ans Ende.
app.put('/api/karten/:id/gruppen/:gid/reihenfolge', mitKarte('nutzer'), (req, res) => {
  const k = req.karte
  const g = (k.gruppen ?? []).find((x) => x.id === req.params.gid)
  if (!g) return res.status(404).json({ fehler: 'Gruppe gibt es nicht (mehr)' })
  if (!Array.isArray(req.body?.ids)) return res.status(400).json({ fehler: 'ids fehlen' })
  const mitglieder = new Set(k.eintraege.filter((e) => e.gruppe === g.id).map((e) => e.id))
  const neu = reihenfolgePruefen(req.body.ids).filter((id) => mitglieder.has(id))
  const rest = (g.reihenfolge ?? []).filter((id) => mitglieder.has(id) && !neu.includes(id))
  const ergebnis = [...neu, ...rest]
  if (JSON.stringify(ergebnis) !== JSON.stringify(g.reihenfolge ?? [])) { g.reihenfolge = ergebnis; speichern(k) }
  res.json({ ok: true, version: k.version })
})

// ---- Nutzerverwaltung (nur Admins) ----
const nutzerListe = (k) => k.nutzer.map((n) => ({ id: n.id, name: n.name, rolle: n.rolle, zugang: n.zugang, erstellt: n.erstellt, ...(n.hof ? { hof: true } : {}) }))
const HOF_VERWALTET = { fehler: 'Diese Person gehört zum Hof – bitte unter „Mein Hof“ ändern.' }
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
  if (n.hof) return res.status(409).json(HOF_VERWALTET)
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
  if (n.hof) return res.status(409).json(HOF_VERWALTET)
  if (n.rolle === 'admin' && adminAnzahl(k) <= 1) return res.status(409).json({ fehler: 'Mindestens ein Admin muss bleiben' })
  k.nutzer = k.nutzer.filter((x) => x.id !== n.id) // Zugang ab sofort ungültig
  nutzerGeaendert(k)
  res.json({ ok: true })
})

// Eigenes Profil: jeder angemeldete Nutzer darf nur seinen eigenen Anzeigenamen ändern
app.patch('/api/karten/:id/ich', mitKarte('angemeldet'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  const { name, fehler } = namePruefen(req.body?.name)
  if (fehler) return res.status(400).json({ fehler })
  // Hof-Mitglied: Name gilt auf allen Karten des Hofs
  const h = ich.hof && k.hof ? hofCache.get(k.hof) : null
  const m = h?.mitglieder.find((x) => x.id === ich.id)
  if (m) { if (m.name !== name) { m.name = name; hofSpeichern(h) } return res.json(ichInfo(ich)) }
  if (name !== ich.name) {
    ich.name = name
    nutzerGeaendert(k) // -> SSE an alle Clients (namen + nutzerVersion)
  }
  res.json(ichInfo(ich))
})

// ---- Kartenname (nur Admins, gilt für alle) ----
app.patch('/api/karten/:id', mitKarte('admin'), (req, res) => {
  const k = req.karte
  if (typeof req.body?.name !== 'string') return res.status(400).json({ fehler: 'Name fehlt' })
  const name = req.body.name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (!name) return res.status(400).json({ fehler: 'Name darf nicht leer sein' })
  if ([...name].length > 60) return res.status(400).json({ fehler: 'Name ist zu lang (höchstens 60 Zeichen)' })
  if (name !== k.name) { k.name = name; speichern(k) } // -> Live-Update an alle
  res.json({ ok: true, name: k.name })
})

// ---- Einladungslink zur Selbstregistrierung (legt immer nur Rolle „nutzer“ an) ----
const einladungInfo = (k) => ({ code: k.einladung?.aktiv ? k.einladung.code : null })
app.get('/api/karten/:id/einladung', mitKarte('admin'), (req, res) => res.json(einladungInfo(req.karte)))
// erzeugen bzw. neu erzeugen (alter Link wird ungültig)
app.post('/api/karten/:id/einladung', mitKarte('admin'), (req, res) => {
  const k = req.karte
  k.einladung = { code: zufall(16), aktiv: true, erstellt: new Date().toISOString(), von: req.nutzer.id }
  speichern(k)
  res.json(einladungInfo(k))
})
// deaktivieren
app.delete('/api/karten/:id/einladung', mitKarte('admin'), (req, res) => {
  const k = req.karte
  if (k.einladung) { k.einladung.aktiv = false; speichern(k) }
  res.json(einladungInfo(k))
})
// Rate-Limit: höchstens 5 Beitritte je IP und Stunde, 20 Fehlversuche je IP und Stunde
const beitritte = new Map()
function zuOft(schluessel, max) {
  const jetzt = Date.now(), l = (beitritte.get(schluessel) ?? []).filter((t) => jetzt - t < 3600_000)
  beitritte.set(schluessel, l)
  if (l.length >= max) return true
  l.push(jetzt)
  return false
}
// Einladung prüfen (ohne anzulegen) – für den Beitritts-Dialog
app.get('/api/karten/:id/einladung/:code', mitKarte(), (req, res) => {
  const e = req.karte.einladung
  res.json({ gueltig: !!(e?.aktiv && gleich(e.code, req.params.code)), karte: req.karte.name })
})
app.post('/api/karten/:id/beitreten', mitKarte(), (req, res) => {
  const k = req.karte
  const e = k.einladung
  const code = String(req.body?.code ?? '')
  if (!e?.aktiv || !code || !gleich(e.code, code)) {
    if (zuOft('fehl:' + req.ip, 20)) return res.status(429).json({ fehler: 'Zu viele Versuche – bitte später erneut.' })
    return res.status(403).json({ fehler: 'Einladungslink ungültig oder deaktiviert' })
  }
  const { name, fehler } = namePruefen(req.body?.name)
  if (fehler) return res.status(400).json({ fehler })
  if (k.nutzer.length >= 200) return res.status(409).json({ fehler: 'Zu viele Nutzer auf dieser Karte' })
  if (zuOft('ok:' + req.ip, 5)) return res.status(429).json({ fehler: 'Zu viele Beitritte von diesem Gerät/Netz – bitte später erneut.' })
  // Karte gehört zu einem Hof: allgemeiner Einladungslink macht die Person zum Hof-Mitarbeiter (alle Hof-Karten)
  const h = k.hof ? hofCache.get(k.hof) : null
  if (h) {
    const m = { id: 'u' + zufall(8), name, rolle: 'mitarbeiter', zugang: zufall(20), erstellt: new Date().toISOString(), perEinladung: true }
    h.mitglieder.push(m)
    hofSpeichern(h)
    return res.status(201).json({ zugang: m.zugang, ich: ichInfo(k.nutzer.find((x) => x.id === m.id)) })
  }
  const n = { id: 'u' + zufall(8), name, rolle: 'nutzer', zugang: zufall(20), erstellt: new Date().toISOString(), perEinladung: true }
  k.nutzer.push(n)
  nutzerGeaendert(k)
  res.status(201).json({ zugang: n.zugang, ich: ichInfo(n) })
})

// =====================================================================================
// ---- Höfe (Betriebe): ein Hof hat eine gemeinsame Personenliste und eine oder mehrere Karten ----
// Rollen im Hof: inhaber (alles, nicht entfernbar solange einziger), admin (verwalten), mitarbeiter (eintragen), ansehen (nur lesen).
// Jede Person hat EINEN persönlichen Zugang, der auf allen Karten des Hofs gilt. Dafür werden die Hof-Mitglieder
// in die Nutzerliste jeder Hof-Karte gespiegelt (Feld hof: true) – die bestehenden Rechte-Prüfungen der Karten
// gelten dadurch unverändert. Karten ohne Hof und alte Links funktionieren genau wie bisher.
// =====================================================================================
const HOF_ROLLEN = ['inhaber', 'admin', 'mitarbeiter', 'ansehen']
const EINLADBAR = ['admin', 'mitarbeiter', 'ansehen']
const KARTEN_ROLLE = { inhaber: 'admin', admin: 'admin', mitarbeiter: 'nutzer', ansehen: 'ansehen' }
const HOF_KARTEN_MAX = 50, HOF_MITGLIEDER_MAX = 200, HOF_EINLADUNGEN_MAX = 50
const EINLADUNG_TAGE = 14
const hofDatei = (id) => path.join(DATA_DIR, `hof-${id}.json`)
const hofVerwalter = (m) => m?.rolle === 'inhaber' || m?.rolle === 'admin'
const hofNameOk = (roh) => {
  if (typeof roh !== 'string') return { fehler: 'Name fehlt' }
  const name = roh.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  if (!name) return { fehler: 'Name darf nicht leer sein' }
  if ([...name].length > 60) return { fehler: 'Name ist zu lang (höchstens 60 Zeichen)' }
  return { name }
}
// Mitglieder in alle Karten des Hofs spiegeln (Name, Rolle, Zugang); entfernte Mitglieder verlieren den Zugang
function hofSpiegeln(h) {
  const ids = new Set(h.mitglieder.map((m) => m.id))
  for (const kid of h.karten) {
    const k = cache.get(kid)
    if (!k) continue
    const vorher = JSON.stringify(k.nutzer)
    k.nutzer = k.nutzer.filter((n) => !n.hof || ids.has(n.id))
    for (const m of h.mitglieder) {
      const n = k.nutzer.find((x) => x.id === m.id)
      const daten = { name: m.name, rolle: KARTEN_ROLLE[m.rolle], zugang: m.zugang, hof: true }
      if (n) Object.assign(n, daten)
      else k.nutzer.push({ id: m.id, erstellt: m.erstellt, ...daten })
    }
    if (JSON.stringify(k.nutzer) !== vorher) nutzerGeaendert(k)
    else senden(k) // z. B. Hof-Name geändert -> Kopfzeilen live aktualisieren
  }
}
let hofKette = Promise.resolve()
function hofSpeichern(h, spiegeln = true) {
  h.version = (h.version ?? 0) + 1
  h.geaendert = new Date().toISOString()
  if (pg) {
    const json = JSON.stringify(h)
    hofKette = hofKette
      .then(() => pg.query('INSERT INTO hoefe (id, daten, geaendert) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET daten = EXCLUDED.daten, geaendert = now()', [h.id, json]))
      .catch((e) => console.error('Postgres-Schreibfehler (Hof):', e.message))
  } else {
    fs.writeFileSync(hofDatei(h.id) + '.tmp', JSON.stringify(h, null, 2))
    fs.renameSync(hofDatei(h.id) + '.tmp', hofDatei(h.id))
  }
  if (spiegeln) hofSpiegeln(h)
}
function hofWer(req, h) {
  const z = req.get('x-zugang')
  if (!z) return null
  return h.mitglieder.find((m) => gleich(m.zugang, z)) ?? null
}
function mitHof(stufe) {
  return (req, res, next) => {
    const h = idOk(req.params.hid) ? hofCache.get(req.params.hid) : null
    if (!h) return res.status(404).json({ fehler: 'Hof nicht gefunden' })
    const m = hofWer(req, h)
    if (stufe === 'mitglied' && !m) return res.status(403).json({ fehler: 'Kein gültiger Zugang zu diesem Hof' })
    if (stufe === 'verwalter' && !hofVerwalter(m)) return res.status(403).json({ fehler: 'Nur für Inhaber und Admins des Hofs' })
    req.hof = h
    req.mitglied = m
    next()
  }
}
const kartenInfo = (h) => h.karten.map((id) => cache.get(id)).filter(Boolean).map((k) => ({ id: k.id, name: k.name, eintraege: k.eintraege.length, geaendert: k.geaendert }))
const mitgliedInfo = (m) => ({ id: m.id, name: m.name, rolle: m.rolle, erstellt: m.erstellt })
const hofInfo = (h, m) => ({ id: h.id, name: h.name, erstellt: h.erstellt, karten: kartenInfo(h), ich: m ? { ...mitgliedInfo(m), hatPin: !!m.pin } : null })
const einladungOffen = (e) => e && !e.eingeloest && Date.parse(e.bis) > Date.now()
const pinHash = (pin, salz) => crypto.scryptSync(String(pin), salz, 32).toString('base64')

function karteAnlegen({ name, nutzer = [], eintraege = [], gruppen = [], hof }) {
  const id = zufall(10)
  const k = { id, name, version: 0, nutzerVersion: 1, nutzer, eintraege, gruppen, erstellt: new Date().toISOString(), ...(hof ? { hof } : {}) }
  cache.set(id, k)
  speichern(k)
  return k
}
function hofAnlegen({ name, inhaber, karten }) {
  const h = { id: zufall(10), name, mitglieder: [inhaber], karten, einladungen: [], erstellt: new Date().toISOString(), version: 0 }
  hofCache.set(h.id, h)
  return h
}

// -- Betreiber (Plattform-Admin): neuen Hof anlegen – später an die Bezahlung gekoppelt --
// Schutz über FLOCKMAP_ADMIN_TOKEN (Umgebungsvariable). Ohne Variable ist der Weg abgeschaltet.
function betreiber(req, res, next) {
  const t = process.env.FLOCKMAP_ADMIN_TOKEN
  if (!t || t.length < 16) return res.status(503).json({ fehler: 'Hof-Anlage ist auf diesem Server nicht eingerichtet' })
  const z = req.get('x-betreiber') || ''
  if (!gleich(z, t)) {
    if (zuOft('betreiber-fehl:' + req.ip, 10)) return res.status(429).json({ fehler: 'Zu viele Versuche – bitte später erneut.' })
    return res.status(403).json({ fehler: 'Betreiber-Schlüssel falsch' })
  }
  next()
}
app.get('/api/betreiber/hoefe', betreiber, (_req, res) => {
  res.json([...hofCache.values()].map((h) => ({ id: h.id, name: h.name, erstellt: h.erstellt, karten: h.karten.length, mitglieder: h.mitglieder.length, inhaber: h.mitglieder.filter((m) => m.rolle === 'inhaber').map((m) => m.name) })))
})
app.post('/api/betreiber/hoefe', betreiber, (req, res) => {
  const hn = hofNameOk(req.body?.name)
  if (hn.fehler) return res.status(400).json({ fehler: 'Hof-Name: ' + hn.fehler })
  const inh = namePruefen(req.body?.inhaberName)
  if (inh.fehler) return res.status(400).json({ fehler: 'Name des Inhabers: ' + inh.fehler })
  const kn = hofNameOk(req.body?.kartenName || 'Weidekarte')
  if (kn.fehler) return res.status(400).json({ fehler: 'Kartenname: ' + kn.fehler })
  const jetzt = new Date().toISOString()
  const inhaber = { id: 'u' + zufall(8), name: inh.name, rolle: 'inhaber', zugang: zufall(20), erstellt: jetzt }
  const h = hofAnlegen({ name: hn.name, inhaber, karten: [] })
  const k = karteAnlegen({ name: kn.name, hof: h.id })
  h.karten.push(k.id)
  hofSpeichern(h)
  res.status(201).json({ hof: hofInfo(h, inhaber), karte: k.id, zugang: inhaber.zugang })
})

// Hof auflösen (Betreiber, z. B. Test oder Rückerstattung). ?karten=behalten (Standard): Karten bleiben als Einzelkarten
// mit allen Personen (Zugänge gültig); ?karten=loeschen: auch die Karten des Hofs werden gelöscht.
app.delete('/api/betreiber/hoefe/:hid', betreiber, async (req, res) => {
  const h = hofCache.get(req.params.hid)
  if (!h) return res.status(404).json({ fehler: 'Hof nicht gefunden' })
  const loeschen = req.query.karten === 'loeschen'
  for (const kid of h.karten) {
    const k = cache.get(kid)
    if (!k || k.hof !== h.id) continue
    if (loeschen) {
      cache.delete(kid)
      for (const r of clients.get(kid) ?? []) r.end()
      clients.delete(kid)
      if (pg) await pgKette.then(() => pg.query('DELETE FROM karten WHERE id = $1', [kid]))
      else fs.rmSync(datei(kid), { force: true })
    } else {
      delete k.hof
      for (const n of k.nutzer) delete n.hof
      nutzerGeaendert(k)
    }
  }
  hofCache.delete(h.id)
  if (pg) await hofKette.then(() => pg.query('DELETE FROM hoefe WHERE id = $1', [h.id]))
  else fs.rmSync(hofDatei(h.id), { force: true })
  res.json({ ok: true, karten: loeschen ? 'geloescht' : 'behalten' })
})

// -- Bestehende Karte zum Hof machen (Admin der Karte). Alle bisherigen Personen werden Hof-Mitglieder
//    mit demselben Zugang (ihre Links bleiben gültig): Admin -> Admin (wer klickt: Inhaber), Nutzer -> Mitarbeiter.
app.post('/api/karten/:id/hof', mitKarte('admin'), (req, res) => {
  const k = req.karte, ich = req.nutzer
  if (k.hof && hofCache.has(k.hof)) return res.status(409).json({ fehler: 'Diese Karte gehört schon zu einem Hof' })
  const hn = hofNameOk(req.body?.name || k.name)
  if (hn.fehler) return res.status(400).json({ fehler: hn.fehler })
  const jetzt = new Date().toISOString()
  const mitglieder = k.nutzer.map((n) => ({ id: n.id, name: n.name, rolle: n.id === ich.id ? 'inhaber' : n.rolle === 'admin' ? 'admin' : n.rolle === 'ansehen' ? 'ansehen' : 'mitarbeiter', zugang: n.zugang, erstellt: n.erstellt || jetzt }))
  const h = hofAnlegen({ name: hn.name, inhaber: mitglieder.find((m) => m.id === ich.id), karten: [k.id] })
  h.mitglieder = mitglieder
  k.hof = h.id
  hofSpeichern(h) // spiegelt -> alle Karten-Nutzer bekommen hof: true, speichert die Karte
  res.status(201).json(hofInfo(h, h.mitglieder.find((m) => m.id === ich.id)))
})

// -- Hof lesen / umbenennen --
app.get('/api/hoefe/:hid', mitHof('mitglied'), (req, res) => res.json(hofInfo(req.hof, req.mitglied)))
app.patch('/api/hoefe/:hid', mitHof('verwalter'), (req, res) => {
  const { name, fehler } = hofNameOk(req.body?.name)
  if (fehler) return res.status(400).json({ fehler })
  if (name !== req.hof.name) { req.hof.name = name; hofSpeichern(req.hof) }
  res.json(hofInfo(req.hof, req.mitglied))
})
// Öffentliche Kurzinfo für die Anmelde-Seite (nur Name des Hofs, keine Personen)
app.get('/api/hoefe/:hid/info', mitHof(), (req, res) => res.json({ id: req.hof.id, name: req.hof.name }))

// -- Weitere Karte im Hof --
app.post('/api/hoefe/:hid/karten', mitHof('verwalter'), (req, res) => {
  const h = req.hof
  if (h.karten.length >= HOF_KARTEN_MAX) return res.status(409).json({ fehler: `Höchstens ${HOF_KARTEN_MAX} Karten je Hof` })
  const { name, fehler } = hofNameOk(req.body?.name)
  if (fehler) return res.status(400).json({ fehler })
  const k = karteAnlegen({ name, hof: h.id })
  h.karten.push(k.id)
  hofSpeichern(h)
  res.status(201).json({ id: k.id, karten: kartenInfo(h) })
})

// -- Mitglieder verwalten --
app.get('/api/hoefe/:hid/mitglieder', mitHof('verwalter'), (req, res) => {
  res.json(req.hof.mitglieder.map((m) => ({ ...mitgliedInfo(m), zugang: m.zugang, hatPin: !!m.pin })))
})
const inhaberAnzahl = (h) => h.mitglieder.filter((m) => m.rolle === 'inhaber').length
app.patch('/api/hoefe/:hid/mitglieder/:mid', mitHof('verwalter'), (req, res) => {
  const h = req.hof, ich = req.mitglied
  const m = h.mitglieder.find((x) => x.id === req.params.mid)
  if (!m) return res.status(404).json({ fehler: 'Person nicht gefunden' })
  // Inhaber dürfen nur Inhaber ändern (Admins können Inhaber weder herabstufen noch sperren)
  if (m.rolle === 'inhaber' && ich.rolle !== 'inhaber' && m.id !== ich.id) return res.status(403).json({ fehler: 'Den Inhaber kann nur ein Inhaber ändern' })
  const b = req.body ?? {}
  if (b.rolle !== undefined) {
    if (!HOF_ROLLEN.includes(b.rolle)) return res.status(400).json({ fehler: 'Ungültige Rolle' })
    if (b.rolle === 'inhaber' && ich.rolle !== 'inhaber') return res.status(403).json({ fehler: 'Nur ein Inhaber kann jemanden zum Inhaber machen' })
    if (m.rolle === 'inhaber' && b.rolle !== 'inhaber' && inhaberAnzahl(h) <= 1) return res.status(409).json({ fehler: 'Der Hof braucht mindestens einen Inhaber' })
    m.rolle = b.rolle
  }
  if (b.name !== undefined) {
    const { name, fehler } = namePruefen(b.name)
    if (fehler) return res.status(400).json({ fehler })
    m.name = name
  }
  if (b.neuerZugang) m.zugang = zufall(20) // alter Link sofort ungültig (z. B. Handy verloren)
  if (b.pinLoeschen) delete m.pin
  hofSpeichern(h)
  res.json({ ...mitgliedInfo(m), zugang: m.zugang, hatPin: !!m.pin })
})
app.delete('/api/hoefe/:hid/mitglieder/:mid', mitHof('verwalter'), (req, res) => {
  const h = req.hof, ich = req.mitglied
  const m = h.mitglieder.find((x) => x.id === req.params.mid)
  if (!m) return res.json({ ok: true })
  if (m.rolle === 'inhaber' && (ich.rolle !== 'inhaber' || inhaberAnzahl(h) <= 1)) return res.status(409).json({ fehler: 'Der letzte Inhaber kann nicht entfernt werden' })
  h.mitglieder = h.mitglieder.filter((x) => x.id !== m.id)
  hofSpeichern(h) // Zugang auf allen Hof-Karten sofort ungültig; Einträge und Notizen bleiben erhalten
  res.json({ ok: true })
})

// -- Persönliche Einladungen (einmal gültig, 14 Tage, mit Rolle und optional vorgegebenem Namen) --
const einladungListe = (h) => h.einladungen.filter(einladungOffen).map((e) => ({ code: e.code, rolle: e.rolle, name: e.name ?? null, bis: e.bis, erstellt: e.erstellt }))
app.get('/api/hoefe/:hid/einladungen', mitHof('verwalter'), (req, res) => res.json(einladungListe(req.hof)))
app.post('/api/hoefe/:hid/einladungen', mitHof('verwalter'), (req, res) => {
  const h = req.hof, ich = req.mitglied
  const rolle = req.body?.rolle ?? 'mitarbeiter'
  if (!EINLADBAR.includes(rolle)) return res.status(400).json({ fehler: 'Ungültige Rolle' })
  let name = null
  if (req.body?.name) { const r = namePruefen(req.body.name); if (r.fehler) return res.status(400).json({ fehler: r.fehler }); name = r.name }
  h.einladungen = h.einladungen.filter(einladungOffen)
  if (h.einladungen.length >= HOF_EINLADUNGEN_MAX) return res.status(409).json({ fehler: 'Zu viele offene Einladungen' })
  const e = { code: zufall(16), rolle, ...(name ? { name } : {}), von: ich.id, erstellt: new Date().toISOString(), bis: new Date(Date.now() + EINLADUNG_TAGE * 86400_000).toISOString() }
  h.einladungen.push(e)
  hofSpeichern(h, false)
  res.status(201).json({ code: e.code, rolle, name, bis: e.bis })
})
app.delete('/api/hoefe/:hid/einladungen/:code', mitHof('verwalter'), (req, res) => {
  const h = req.hof
  h.einladungen = h.einladungen.filter((e) => einladungOffen(e) && !gleich(e.code, req.params.code))
  hofSpeichern(h, false)
  res.json(einladungListe(h))
})
const einladungFinden = (h, code) => h.einladungen.find((e) => einladungOffen(e) && gleich(e.code, String(code ?? '')))
app.get('/api/hoefe/:hid/einladung/:code', mitHof(), (req, res) => {
  const e = einladungFinden(req.hof, req.params.code)
  res.json(e ? { gueltig: true, hof: req.hof.name, rolle: e.rolle, name: e.name ?? null } : { gueltig: false, hof: req.hof.name })
})
app.post('/api/hoefe/:hid/beitreten', mitHof(), (req, res) => {
  const h = req.hof
  const e = einladungFinden(h, req.body?.code)
  if (!e) {
    if (zuOft('fehl:' + req.ip, 20)) return res.status(429).json({ fehler: 'Zu viele Versuche – bitte später erneut.' })
    return res.status(403).json({ fehler: 'Einladung ungültig, abgelaufen oder schon benutzt' })
  }
  const { name, fehler } = namePruefen(req.body?.name || e.name)
  if (fehler) return res.status(400).json({ fehler })
  if (h.mitglieder.length >= HOF_MITGLIEDER_MAX) return res.status(409).json({ fehler: 'Zu viele Personen in diesem Hof' })
  if (zuOft('ok:' + req.ip, 10)) return res.status(429).json({ fehler: 'Zu viele Beitritte von diesem Gerät/Netz – bitte später erneut.' })
  const m = { id: 'u' + zufall(8), name, rolle: e.rolle, zugang: zufall(20), erstellt: new Date().toISOString(), perEinladung: true }
  h.mitglieder.push(m)
  e.eingeloest = m.id
  hofSpeichern(h)
  res.status(201).json({ zugang: m.zugang, karte: h.karten[0] ?? null, ich: mitgliedInfo(m) })
})

// -- Eigene PIN (für die Anmeldung auf einem neuen Gerät ohne Link) --
app.put('/api/hoefe/:hid/ich/pin', mitHof('mitglied'), (req, res) => {
  const m = req.mitglied
  const pin = req.body?.pin
  if (pin === null) delete m.pin
  else {
    if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) return res.status(400).json({ fehler: 'Die PIN muss 4 bis 8 Ziffern haben' })
    const salz = zufall(16)
    m.pin = { salz, hash: pinHash(pin, salz) }
  }
  hofSpeichern(req.hof, false)
  res.json({ hatPin: !!m.pin })
})
// Anmelden mit Name + PIN. Schutz: 10 Fehlversuche je IP und Stunde, nach 5 Fehlversuchen je Person 15 Minuten Sperre.
const pinSperre = new Map()
app.post('/api/hoefe/:hid/anmelden', mitHof(), (req, res) => {
  const h = req.hof
  const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  const pin = String(req.body?.pin ?? '')
  if (zuOft('pin-ip:' + req.ip, 10)) return res.status(429).json({ fehler: 'Zu viele Versuche – bitte in einer Stunde erneut.' })
  const kandidaten = h.mitglieder.filter((m) => m.pin && m.name.toLowerCase() === name)
  for (const m of kandidaten) {
    const s = pinSperre.get(m.id)
    if (s && s.bis > Date.now()) return res.status(429).json({ fehler: 'Zu viele falsche PINs – bitte in 15 Minuten erneut.' })
  }
  const m = kandidaten.find((x) => gleich(x.pin.hash, pinHash(pin, x.pin.salz)))
  if (!m) {
    for (const x of kandidaten) {
      const s = pinSperre.get(x.id) ?? { n: 0, bis: 0 }
      s.n += 1
      if (s.n >= 5) { s.n = 0; s.bis = Date.now() + 15 * 60_000 }
      pinSperre.set(x.id, s)
    }
    return res.status(403).json({ fehler: 'Name oder PIN falsch (oder für diese Person ist keine PIN eingerichtet)' })
  }
  pinSperre.delete(m.id)
  beitritte.set('pin-ip:' + req.ip, []) // erfolgreicher Versuch setzt den IP-Zähler zurück
  res.json({ zugang: m.zugang, karte: h.karten[0] ?? null, ich: mitgliedInfo(m) })
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
  // index.html und sw.js nie aus dem Browser-Cache ohne Rückfrage (neue Versionen sofort); Assets haben Hash im Namen
  const ohneCache = (res) => res.set('Cache-Control', 'no-cache')
  app.use(express.static(DIST_DIR, { setHeaders: (res, p) => { if (/\.(html)$|[\\/]sw\.js$|manifest/.test(p)) ohneCache(res); else if (/[\\/]assets[\\/]/.test(p)) res.set('Cache-Control', 'public, max-age=31536000, immutable') } }))
  app.get(/^\/(?!api\/|healthz).*/, (_req, res) => { ohneCache(res); res.sendFile(path.join(DIST_DIR, 'index.html')) })
}

app.get('/healthz', (_req, res) => res.json({ ok: true, ablage: pg ? 'postgres' : 'datei' }))

ablageStarten()
  .then(() => app.listen(PORT, () => console.log(`FlockMap-Server läuft auf http://localhost:${PORT}`)))
  .catch((e) => { console.error('Ablage konnte nicht gestartet werden:', e); process.exit(1) })
