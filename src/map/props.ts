import type { Eintrag, Fokus, LatLng, Route } from '../types'

export interface KartenProps {
  eintraege: Eintrag[]
  ausgewaehlt: string | null
  zeichenPunkte: LatLng[]
  route: Route | null
  standort: LatLng | null
  fokus: Fokus | null
  onKlick: (p: LatLng) => void
  onAuswahl: (id: string) => void
  onMitte: (p: LatLng) => void
}

export const FARBE = '#2e7d32'
export const FARBE_AKTIV = '#f57c00'
export const ROUTE_FARBE = '#1565c0'
