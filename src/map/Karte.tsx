import { lazy, Suspense } from 'react'
import type { KartenProps } from './props'

export const HAT_GOOGLE_KEY = !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY
const Google = lazy(() => import('./GoogleKarte'))
const Leaflet = lazy(() => import('./LeafletKarte'))

// Mit VITE_GOOGLE_MAPS_API_KEY -> Google Maps, sonst kostenlose OpenStreetMap (Leaflet)
export default function Karte(p: KartenProps) {
  return <Suspense fallback={<div className="karte laden">Karte wird geladen …</div>}>{HAT_GOOGLE_KEY ? <Google {...p} /> : <Leaflet {...p} />}</Suspense>
}
