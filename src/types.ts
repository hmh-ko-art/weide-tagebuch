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
  tiere?: number
  herde?: string
  erstellt: string
  geaendert: string
}
export interface Pin extends Basis {
  typ: 'pin'
  position: LatLng
  farbe?: string // Hex-Farbe der Stecknadel, fehlt bei alten Nadeln -> STANDARD_FARBE
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
export const pinFarbe = (e: Pin) => e.farbe || STANDARD_FARBE
export const farbName = (f: string) => FARBEN.find((x) => x.wert === f.toLowerCase())?.name ?? f
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
  const neu = { ...e, notizen }
  delete (neu as { notiz?: unknown }).notiz
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
