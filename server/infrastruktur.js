// Zäune, Wege, Gräben und Weide-Technik (Tränke, Weidezaungerät, Tor, Unterstand, Salzleckstein).
// Gemeinsame Logik für Server UND App (wie weideplan.js): Längen, Tore/Lücken, Geräte-Prüfungen, Bereinigung.
import { heute, tagOk, tagPlus, tageZwischen } from './weideplan.js'

export const LINIEN_ARTEN = [
  { wert: 'elektronetz', name: 'Elektronetz', farbe: '#ff9800', strich: '10 6', breite: 3.5 },
  { wert: 'festzaun', name: 'Festzaun', farbe: '#a1887f', strich: '', breite: 3.5 },
  { wert: 'litze', name: 'Litze / Draht', farbe: '#ffeb3b', strich: '2 6', breite: 3 },
  { wert: 'weg', name: 'Weg', farbe: '#f5f5f5', strich: '', breite: 5 },
  { wert: 'graben', name: 'Graben', farbe: '#29b6f6', strich: '14 5', breite: 3.5 },
  { wert: 'sonstiges', name: 'Sonstige Linie', farbe: '#e0e0e0', strich: '4 5', breite: 3 },
]
export const INFRA_ARTEN = [
  { wert: 'traenke', name: 'Tränke / Wasserstelle', kurz: 'Tränke', farbe: '#1e88e5' },
  { wert: 'geraet', name: 'Weidezaungerät', kurz: 'Zaungerät', farbe: '#fbc02d' },
  { wert: 'tor', name: 'Tor / Durchgang', kurz: 'Tor', farbe: '#8d6e63' },
  { wert: 'unterstand', name: 'Unterstand', kurz: 'Unterstand', farbe: '#6d4c41' },
  { wert: 'salz', name: 'Salzleckstein', kurz: 'Salzleckstein', farbe: '#eceff1' },
]
export const STROM_ARTEN = [
  { wert: 'akku', name: 'Akku' }, { wert: 'batterie', name: 'Batterie' }, { wert: 'solar', name: 'Solar + Akku' }, { wert: 'netz', name: 'Netzstrom (230 V)' },
]
export const STAENDE = [{ wert: 'voll', name: 'voll' }, { wert: 'halb', name: 'halb' }, { wert: 'leer', name: 'leer / tauschen' }]
export const PRUEF_STANDARD = 7 // Tage zwischen zwei Geräte-Prüfungen
export const NETZ_LAENGE = 50 // Meter je Elektronetz
export const TOR_BREITE = 4
const MAX_PUNKTE = 2000, MAX_TORE = 50, MAX_PRUEFUNGEN = 30

export const linienArt = (w) => LINIEN_ARTEN.find((a) => a.wert === w) ?? LINIEN_ARTEN[LINIEN_ARTEN.length - 1]
export const infraArt = (w) => INFRA_ARTEN.find((a) => a.wert === w) ?? null
export const istLinie = (e) => e?.typ === 'linie'
export const istInfra = (e) => e?.typ === 'pin' && !!infraArt(e.infra)
// „normale“ Einträge (Nadeln mit Tieren/Notizen, Flächen) – ohne Zäune/Technik
// Freier Kreis (7h): eigener Kreis ohne Nadel – intern eine Nadel mit frei: true, Mitte = Position
export const istFrei = (e) => e?.typ === 'pin' && e.frei === true
export const istNormal = (e) => !istLinie(e) && !istInfra(e) && !istFrei(e)

// Entfernung in Metern (Haversine)
export function abstandM(a, b) {
  const r = Math.PI / 180, R = 6371008.8
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
// Punkte der Linie (geschlossen: zurück zum Anfang)
export const linienPunkte = (e) => (e.geschlossen && e.punkte.length > 2 ? [...e.punkte, e.punkte[0]] : e.punkte)
export function gesamtLaenge(e) {
  const p = linienPunkte(e)
  let s = 0
  for (let i = 1; i < p.length; i++) s += abstandM(p[i - 1], p[i])
  return s
}
const toreSortiert = (e, L) => (e.tore ?? []).filter((t) => t.pos >= 0 && t.pos <= L).sort((a, b) => a.pos - b.pos)
// Zaunlänge ohne Tor-Lücken
export function linienLaenge(e) {
  const L = gesamtLaenge(e)
  const tore = toreSortiert(e, L)
  return Math.max(0, L - tore.reduce((s, t) => s + Math.min(t.breite ?? TOR_BREITE, L), 0))
}
export const netzAnzahl = (m) => (m > 0 ? Math.ceil(m / NETZ_LAENGE - 1e-9) : 0)
export const laengeText = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} km` : `${Math.round(m).toLocaleString('de-DE')} m`)

// Punkt in Meter-Entfernung pos entlang der Linie
export function punktBei(e, pos) {
  const p = linienPunkte(e)
  let s = 0
  for (let i = 1; i < p.length; i++) {
    const d = abstandM(p[i - 1], p[i])
    if (s + d >= pos || i === p.length - 1) {
      const t = d ? Math.max(0, Math.min(1, (pos - s) / d)) : 0
      return { lat: p[i - 1].lat + (p[i].lat - p[i - 1].lat) * t, lng: p[i - 1].lng + (p[i].lng - p[i - 1].lng) * t }
    }
    s += d
  }
  return p[0]
}
// Nächste Stelle auf der Linie zu einem angetippten Punkt: { pos (m ab Anfang), abstand (m) }
export function naechsteStelle(e, q) {
  const p = linienPunkte(e)
  let best = { pos: 0, abstand: Infinity }, s = 0
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1], b = p[i], d = abstandM(a, b)
    // lokale ebene Näherung (für Weiden völlig ausreichend)
    const kx = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
    const bx = (b.lng - a.lng) * kx, by = b.lat - a.lat, qx = (q.lng - a.lng) * kx, qy = q.lat - a.lat
    const t = bx * bx + by * by ? Math.max(0, Math.min(1, (qx * bx + qy * by) / (bx * bx + by * by))) : 0
    const x = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
    const ab = abstandM(x, q)
    if (ab < best.abstand) best = { pos: s + d * t, abstand: ab }
    s += d
  }
  return best
}
// Linie in sichtbare Stücke zerlegen (Tor-Lücken ausgespart) – für die Kartendarstellung
export function linienStuecke(e) {
  const L = gesamtLaenge(e)
  const tore = toreSortiert(e, L)
  if (!tore.length) return [linienPunkte(e)]
  const stuecke = []
  let von = 0
  const stueck = (a, b) => {
    if (b - a < 0.5) return
    const p = linienPunkte(e), aus = [punktBei(e, a)]
    let s = 0
    for (let i = 1; i < p.length; i++) { s += abstandM(p[i - 1], p[i]); if (s > a && s < b) aus.push(p[i]) }
    aus.push(punktBei(e, b))
    stuecke.push(aus)
  }
  for (const t of tore) { const h = (t.breite ?? TOR_BREITE) / 2; stueck(von, Math.max(von, t.pos - h)); von = Math.min(L, t.pos + h) }
  stueck(von, L)
  return stuecke
}

// ---- Weidezaungerät: Prüfungen ----
export function geraetFaellig(e, tag = heute()) {
  if (!istInfra(e) || e.infra !== 'geraet') return null
  const g = e.geraet ?? {}
  const intervall = Number.isInteger(g.intervall) && g.intervall > 0 ? g.intervall : PRUEF_STANDARD
  const datum = tagOk(g.geprueft) ? tagPlus(g.geprueft, intervall) : tag
  const tage = tageZwischen(tag, datum)
  const leer = g.stand === 'leer'
  if (tage > 1 && !leer) return null
  return { eintrag: e, datum, tage, nie: !tagOk(g.geprueft), leer, stufe: leer || tage < 0 ? 'ueberfaellig' : tage === 0 ? 'heute' : 'bald' }
}
export const geraeteFaellig = (eintraege, tag = heute()) => (eintraege ?? []).map((e) => geraetFaellig(e, tag)).filter(Boolean).sort((a, b) => a.datum.localeCompare(b.datum))

// Prüfung eintragen (idempotent über p.id); die neueste Prüfung bestimmt Datum, Spannung und Ladestand
export function pruefungEintragen(e, p) {
  if (!istInfra(e) || e.infra !== 'geraet' || !p || !tagOk(p.datum) || typeof p.id !== 'string') return e
  const g = { ...(e.geraet ?? {}) }
  const liste = Array.isArray(g.pruefungen) ? g.pruefungen.filter((x) => x.id !== p.id) : []
  const neu = { id: p.id.slice(0, 64), datum: p.datum, ...(kvOk(p.kv) ? { kv: kvOk(p.kv) } : {}), ...(standOk(p.stand) ? { stand: p.stand } : {}), ...(p.autor ? { autor: String(p.autor).slice(0, 60) } : {}), ...(p.autorId ? { autorId: p.autorId } : {}), ...(p.zeitpunkt ? { zeitpunkt: p.zeitpunkt } : {}) }
  liste.push(neu)
  liste.sort((a, b) => b.datum.localeCompare(a.datum) || String(b.zeitpunkt ?? '').localeCompare(String(a.zeitpunkt ?? '')))
  g.pruefungen = liste.slice(0, MAX_PRUEFUNGEN)
  const letzte = g.pruefungen[0]
  g.geprueft = letzte.datum
  if (letzte.kv !== undefined) g.kv = letzte.kv
  if (letzte.stand) g.stand = letzte.stand
  else if (g.stand === 'leer' && letzte.id === neu.id) delete g.stand // „geprüft“ ohne Angabe nach „leer“ = Akku getauscht/geladen
  return { ...e, geraet: g }
}
const kvOk = (x) => { const n = Math.round(Number(x) * 10) / 10; return x !== '' && x !== null && Number.isFinite(n) && n > 0 && n <= 20 ? n : undefined }
const standOk = (x) => (STAENDE.some((s) => s.wert === x) ? x : undefined)

// ---- Bereinigung (Server bei jedem Speichern/Import; App beim Import) ----
const pktOk = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
export function eintragSauber(e) {
  if (e.typ === 'linie') {
    if (!Array.isArray(e.punkte) || e.punkte.length < 2 || e.punkte.length > MAX_PUNKTE || !e.punkte.every(pktOk)) return 'Eine Linie braucht mindestens 2 gültige Punkte'
    e.punkte = e.punkte.map((p) => ({ lat: p.lat, lng: p.lng }))
    e.linienArt = linienArt(e.linienArt).wert
    if (e.geschlossen !== true || e.punkte.length < 3) delete e.geschlossen
    if (typeof e.flaeche !== 'string' || !/^[\w-]{1,64}$/.test(e.flaeche)) delete e.flaeche
    const L = gesamtLaenge(e)
    if (Array.isArray(e.tore)) {
      e.tore = e.tore.filter((t) => t && Number.isFinite(t.pos) && t.pos >= 0 && t.pos <= L + 1).slice(0, MAX_TORE)
        .map((t) => ({ id: typeof t.id === 'string' ? t.id.slice(0, 64) : `t${Math.round(t.pos)}`, pos: Math.round(t.pos * 10) / 10, breite: Number.isFinite(t.breite) ? Math.max(1, Math.min(20, t.breite)) : TOR_BREITE }))
      if (!e.tore.length) delete e.tore
    } else delete e.tore
    delete e.infra; delete e.geraet; delete e.frei; delete e.position; delete e.herde; delete e.gruppe; delete e.tierlisteModus
    e.einheiten = [] // Linien haben keine Tiere
    return null
  }
  delete e.linienArt; delete e.geschlossen; delete e.tore
  if (e.typ === 'flaeche') delete e.flaeche
  if (e.typ === 'pin' && e.frei === true) { delete e.infra; delete e.geraet; delete e.gruppe; delete e.herde; delete e.tierlisteModus; e.einheiten = []; return null }
  delete e.frei
  if (e.typ !== 'pin' || !infraArt(e.infra)) { delete e.infra; delete e.geraet; return null }
  delete e.gruppe; delete e.herde; delete e.tierlisteModus
  e.einheiten = [] // Weide-Technik hat keine Tiere
  if (e.infra !== 'geraet') { delete e.geraet; return null }
  const g = e.geraet && typeof e.geraet === 'object' ? e.geraet : {}
  e.geraet = {
    ...(STROM_ARTEN.some((s) => s.wert === g.strom) ? { strom: g.strom } : {}),
    ...(standOk(g.stand) ? { stand: g.stand } : {}),
    ...(tagOk(g.geprueft) ? { geprueft: g.geprueft } : {}),
    ...(kvOk(g.kv) !== undefined ? { kv: kvOk(g.kv) } : {}),
    ...(Number.isInteger(Number(g.intervall)) && Number(g.intervall) >= 1 && Number(g.intervall) <= 90 ? { intervall: Number(g.intervall) } : {}),
    ...(Array.isArray(g.pruefungen) ? { pruefungen: g.pruefungen.filter((p) => p && typeof p.id === 'string' && tagOk(p.datum)).slice(0, MAX_PRUEFUNGEN).map((p) => ({ id: p.id.slice(0, 64), datum: p.datum, ...(kvOk(p.kv) !== undefined ? { kv: kvOk(p.kv) } : {}), ...(standOk(p.stand) ? { stand: p.stand } : {}), ...(typeof p.autor === 'string' && p.autor ? { autor: p.autor.slice(0, 60) } : {}), ...(typeof p.autorId === 'string' ? { autorId: p.autorId } : {}), ...(typeof p.zeitpunkt === 'string' ? { zeitpunkt: p.zeitpunkt } : {}) })) } : {}),
  }
  return null
}

// Zaun um eine Fläche: geschlossene Linie entlang des Umrisses, mit der Fläche verknüpft
export function zaunUmFlaeche(f, art, id, jetzt) {
  return { id, typ: 'linie', titel: `Zaun ${f.titel || 'Fläche'}`.slice(0, 200), punkte: f.punkte.map((p) => ({ lat: p.lat, lng: p.lng })), geschlossen: true, flaeche: f.id, linienArt: linienArt(art).wert, notizen: [], erstellt: jetzt, geaendert: jetzt }
}

// Import (My Maps/GeoJSON): Linien- und Symbolart am Namen erkennen
const norm = (s) => String(s ?? '').toLowerCase()
export function linienArtRaten(name) {
  const n = norm(name)
  if (/netz/.test(n)) return 'elektronetz'
  if (/litze|draht|band/.test(n)) return 'litze'
  if (/graben|gr[äa]ben|siel|priel|bach/.test(n)) return 'graben'
  if (/weg|pfad|stra(ß|ss)e|zufahrt|trift/.test(n)) return 'weg'
  if (/zaun|koppel/.test(n)) return 'festzaun'
  return 'sonstiges'
}
export function infraRaten(name) {
  const n = norm(name)
  if (/tr[äa]nke|wasser|brunnen|pumpe|fass/.test(n)) return 'traenke'
  if (/weidezaunger[äa]t|zaunger[äa]t|ger[äa]t|akku|batterie/.test(n)) return 'geraet'
  if (/\btor\b|gatter|durchgang|tür|tuer/.test(n)) return 'tor'
  if (/unterstand|stall|h[üu]tte|schutz/.test(n)) return 'unterstand'
  if (/salz|leckstein|leckschale|mineral/.test(n)) return 'salz'
  return null
}
