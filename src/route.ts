import type { LatLng, Route } from './types'

// Mit Google-Key: Google Directions; sonst kostenloser OSRM-Demo-Server
export async function routeBerechnen(von: LatLng, nach: LatLng): Promise<Route> {
  const g = (window as unknown as { google?: typeof google }).google
  if (g?.maps) {
    const { DirectionsService, TravelMode } = (await g.maps.importLibrary('routes')) as google.maps.RoutesLibrary
    const res = await new DirectionsService().route({ origin: von, destination: nach, travelMode: TravelMode.DRIVING })
    const r = res.routes[0]
    const leg = r.legs[0]
    return {
      punkte: r.overview_path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
      distanzM: leg.distance?.value ?? 0,
      dauerS: leg.duration?.value ?? 0,
      quelle: 'Google',
    }
  }
  const url = `https://router.project-osrm.org/route/v1/driving/${von.lng},${von.lat};${nach.lng},${nach.lat}?overview=full&geometries=geojson`
  const r = await fetch(url)
  if (!r.ok) throw new Error('Routenserver nicht erreichbar')
  const j = await r.json()
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error('Keine Route gefunden')
  const route = j.routes[0]
  return {
    punkte: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanzM: route.distance,
    dauerS: route.duration,
    quelle: 'OSRM',
  }
}

export const googleNaviLink = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`

export function routeText(r: Route) {
  const km = (r.distanzM / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })
  const min = Math.round(r.dauerS / 60)
  const zeit = min >= 60 ? `${Math.floor(min / 60)} Std. ${min % 60} Min.` : `${min} Min.`
  return `${km} km · ca. ${zeit} (${r.quelle})`
}
