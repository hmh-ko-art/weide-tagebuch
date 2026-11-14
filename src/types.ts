export type LatLng = { lat: number; lng: number }

// Ein Tagebuch-Eintrag (Notiz) an einer Nadel oder Fläche
export interface Notiz {
  id: string
  text: string
  zeitpunkt: string // ISO, automatisch jetzt, editierbar
  autor?: string // Name des Nutzers (bei geteilten Karten setzt der Server ihn)
  autorId?: string // Nutzer-ID des Autors (für „eigene Notizen bearbeiten/löschen“)
}

interface Basis {
  id: string
  titel: string
  notizen: Notiz[]
  erstelltVon?: string // Nutzer-ID (geteilte Karten): Nutzer dürfen nur eigene Einträge bearbeiten/löschen
  /** @deprecated altes Einzel-Notizfeld – wird per migrieren() zu notizen[0] */
  notiz?: string
  /** @deprecated alte Einzel-Tierzahl – wird per migrieren() zu einheiten[0] */
  tiere?: number
  herde?: string
  /** @deprecated altes Einzel-Symbol – wird per migrieren() zu einheiten[0].art */
  tierart?: Tierart
  einheiten?: Einheit[] // beliebig viele Tiereinheiten (je Anzahl + Tierart)
  datum?: string // Datum des Eintrags (YYYY-MM-DD, im Formular wählbar); fehlt = Erstelldatum
  tierlisteModus?: 'fest' | 'ausblendbar' // fehlt = 'fest' (bisheriges Verhalten)
  farbe?: string // Hex-Farbe (Nadel bzw. Fläche); fehlt bei alten Einträgen -> STANDARD_FARBE / FLAECHE_STANDARD
  erstellt: string
  geaendert: string
}
export interface Pin extends Basis {
  typ: 'pin'
  position: LatLng
}

// Gut auf Satellitenbild sichtbare Vorschlagsfarben
export const FARBEN: { name: string; wert: string }[] = [
  { name: 'Rot', wert: '#e53935' },
  { name: 'Gelb', wert: '#ffeb3b' },
  { name: 'Blau', wert: '#1e88e5' },
  { name: 'Weiß', wert: '#ffffff' },
  { name: 'Orange', wert: '#ff9800' },
  { name: 'Lila', wert: '#8e24aa' },
  { name: 'Pink', wert: '#ff4081' },
  { name: 'Cyan', wert: '#00e5ff' },
]
export const STANDARD_FARBE = FARBEN[0].wert
// Flächen waren bisher immer grün – das bleibt die Vorgabe für alte/neue Flächen ohne gewählte Farbe
export const FLAECHE_STANDARD = '#2e7d32'
export const FLAECHEN_FARBEN = [{ name: 'Grün', wert: FLAECHE_STANDARD }, ...FARBEN]
// Farbe eines Eintrags (Nadel oder Fläche)
export const pinFarbe = (e: { typ: 'pin' | 'flaeche'; farbe?: string }) => (e.farbe || (e.typ === 'pin' ? STANDARD_FARBE : FLAECHE_STANDARD)).toLowerCase()
export const farbName = (f: string) => FLAECHEN_FARBEN.find((x) => x.wert === f.toLowerCase())?.name ?? f
export interface Flaeche extends Basis {
  typ: 'flaeche'
  punkte: LatLng[]
}
export type Eintrag = Pin | Flaeche

export interface Route {
  punkte: LatLng[]
  distanzM: number
  dauerS: number
  quelle: 'Google' | 'OSRM'
}

export interface Fokus extends LatLng {
  zoom?: number
  n: number
}

export const START: LatLng = { lat: 54.45, lng: 8.85 } // Nordfriesische Deichküste (Husum/Eiderstedt)
export const START_ZOOM = 10

// Alte Einträge (einzelnes Feld `notiz`) verlustfrei auf `notizen` umstellen.
// Die ID der migrierten Notiz ist deterministisch, damit mehrere Geräte nicht doppelt migrieren.
export function migrieren<T extends Eintrag>(e: T): T {
  const alt = (e as { notiz?: unknown }).notiz
  const notizen: Notiz[] = Array.isArray(e.notizen) ? [...e.notizen] : []
  if (typeof alt === 'string' && alt.trim() && !notizen.some((n) => n.id === `${e.id}-n0`)) {
    notizen.push({ id: `${e.id}-n0`, text: alt, zeitpunkt: e.erstellt || e.geaendert || new Date().toISOString() })
  }
  const neu = { ...e, notizen, einheiten: einheitenMigrieren(e) }
  delete (neu as { notiz?: unknown }).notiz
  delete neu.tiere
  delete neu.tierart
  return neu
}

export const notizenSortiert = (e: Eintrag) => [...(e.notizen ?? [])].sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))

export function mitte(e: Eintrag): LatLng {
  if (e.typ === 'pin') return e.position
  const n = e.punkte.length || 1
  return {
    lat: e.punkte.reduce((s, p) => s + p.lat, 0) / n,
    lng: e.punkte.reduce((s, p) => s + p.lng, 0) / n,
  }
}

export function neueId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function datum(iso: string) {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

// Fläche in Hektar (sphärische Näherung)
export function hektar(punkte: LatLng[]) {
  if (punkte.length < 3) return 0
  const R = 6378137
  const rad = (d: number) => (d * Math.PI) / 180
  let s = 0
  for (let i = 0; i < punkte.length; i++) {
    const a = punkte[i], b = punkte[(i + 1) % punkte.length]
    s += rad(b.lng - a.lng) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)))
  }
  return Math.abs((s * R * R) / 2) / 10000
}

// ---- Tierart / Symbol zur Tierzahl ----
export type Tierart = 'schaf' | 'bock' | 'lamm'
export const TIERARTEN: { wert: Tierart; name: string; eins: string; mehr: string; emoji?: string }[] = [
  { wert: 'schaf', name: 'Schaf', eins: 'Schaf', mehr: 'Schafe', emoji: '🐑' },
  { wert: 'bock', name: 'Schafbock', eins: 'Bock', mehr: 'Böcke', emoji: '🐏' },
  { wert: 'lamm', name: 'Lamm', eins: 'Lamm', mehr: 'Lämmer' }, // kein Lamm-Emoji -> eigenes SVG (LAMM_SVG)
]
export const tierart = (e: { tierart?: string }): Tierart => (TIERARTEN.some((t) => t.wert === e.tierart) ? (e.tierart as Tierart) : 'schaf')
const tierInfo = (a: Tierart) => TIERARTEN.find((t) => t.wert === a)!
// „50 Schafe“, „1 Bock“, „3 Lämmer“ …
export const tierText = (n: number, a: Tierart) => `${n.toLocaleString('de-DE')} ${n === 1 ? tierInfo(a).eins : tierInfo(a).mehr}`
// Kleines Lamm-Symbol (helles, rundes Lämmchen) als SVG-Text – für React (dangerouslySetInnerHTML) und Leaflet-HTML
export const LAMM_SVG = `<svg class="lamm-svg" width="1.15em" height="1em" viewBox="0 0 23 20" aria-hidden="true"><g stroke="#6d5d4b" stroke-width="1.1"><line x1="7" y1="14" x2="7" y2="19" stroke-linecap="round"/><line x1="15" y1="14" x2="15" y2="19" stroke-linecap="round"/></g><g fill="#fffaf0" stroke="#8d7b68" stroke-width="1"><circle cx="7" cy="10" r="4"/><circle cx="11" cy="8" r="4.2"/><circle cx="15" cy="10" r="4"/><circle cx="11" cy="12" r="4"/></g><ellipse cx="18.8" cy="6.2" rx="3.2" ry="2.6" fill="#f3d9c0" stroke="#8d7b68" stroke-width="1"/><ellipse cx="16.6" cy="4.6" rx="1.5" ry=".8" fill="#e8c4a3" transform="rotate(-30 16.6 4.6)"/><circle cx="19.6" cy="5.7" r=".55" fill="#3a2e24"/></svg>`
export const tierSymbolHtml = (a: Tierart) => tierInfo(a).emoji ?? LAMM_SVG

// ---- Tiereinheiten: pro Eintrag beliebig viele { id, art, anzahl } ----
export interface Einheit { id: string; art: Tierart; anzahl: number }
// Alte Einzel-Tierzahl (+ Symbol) wird zur ersten Einheit – feste ID, damit alle Geräte dieselbe Einheit meinen
function einheitenMigrieren(e: { id: string; einheiten?: Einheit[]; tiere?: number; tierart?: string }): Einheit[] {
  if (Array.isArray(e.einheiten)) return e.einheiten
  if (typeof e.tiere === 'number' && Number.isFinite(e.tiere)) return [{ id: `${e.id}-t0`, art: tierart(e), anzahl: e.tiere }]
  return []
}
// Zusammengefasst je Tierart (Schaf, Bock, Lamm), z. B. 20 + 5 Schafe -> 25 Schafe
export function tierSummen(liste: { einheiten?: Einheit[] }[]): { art: Tierart; n: number }[] {
  return TIERARTEN.map((t) => ({
    art: t.wert,
    n: liste.reduce((s, e) => s + (e.einheiten ?? []).reduce((a, x) => a + (x.art === t.wert ? x.anzahl : 0), 0), 0),
  })).filter((x) => x.n > 0)
}
export const istAusblendbar = (e: { tierlisteModus?: string }) => e.tierlisteModus === 'ausblendbar'

// ---- Datum des Eintrags (maßgeblich für Zeitraum-Filter und Monatsgruppen) ----
const zweistellig = (n: number) => String(n).padStart(2, '0')
export const isoTag = (d: Date) => `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`
// e.datum (im Formular gesetzt) – sonst das Erstelldatum (lokaler Kalendertag)
export const eintragDatum = (e: { datum?: string; erstellt: string }) => (e.datum && /^\d{4}-\d{2}-\d{2}$/.test(e.datum) ? e.datum : isoTag(new Date(e.erstellt)))
export const tagText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
export const monatText = (ym: string) => new Date(`${ym}-15T12:00:00`).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
