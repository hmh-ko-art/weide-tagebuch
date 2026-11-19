import type { Eintrag, Fokus, LatLng, Route } from '../types'

export interface PunkteBearbeiten { punkte: LatLng[]; geschlossen: boolean; sel: number | null; linie: boolean }

export interface KartenProps {
  eintraege: Eintrag[]
  ausgewaehlt: string | null
  zeichenPunkte: LatLng[]
  zeichenLinie?: boolean // Zeichnen einer Linie (Zaun/Weg/Graben) statt Fläche
  bearbeiten?: PunkteBearbeiten | null // Eckpunkte einer Linie/Fläche verschieben, einfügen, löschen
  onPunktZiehen?: (i: number, p: LatLng) => void
  onPunktWahl?: (i: number) => void
  onPunktEinfuegen?: (i: number, p: LatLng) => void // neuer Punkt an Stelle i
  warnIds?: string[] // Weidezaungeräte mit fälliger Prüfung (rot umrandet)
  route: Route | null
  standort: LatLng | null
  fokus: Fokus | null
  beschriftung: boolean // Namen unter Nadeln / auf Flächen anzeigen
  nummern: Record<string, number> // laufende Nummer der Nadel in ihrer Gruppe (1..n)
  hervor: string[] // hervorgehobene Nadelfarben (Kleinbuchstaben-Hex)
  tiereZu: string[] // IDs ausblendbarer Einträge, deren Tierliste auf diesem Gerät eingeklappt ist
  onTiereUmschalten: (id: string) => void
  verschiebbar: string[] // IDs der Nadeln, die dieser Nutzer verschieben darf (Drag-and-drop)
  onVerschieben: (id: string, p: LatLng) => void
  onKlick: (p: LatLng) => void
  onAuswahl: (id: string, p?: LatLng) => void // p: angetippte Stelle (Linien/Tore)
  onMitte: (p: LatLng) => void
}

export const FARBE = '#2e7d32'
export const FARBE_AKTIV = '#f57c00'
export const ROUTE_FARBE = '#1565c0'
