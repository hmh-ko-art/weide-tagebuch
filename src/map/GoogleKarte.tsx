import { useEffect, useRef } from 'react'
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { START, START_ZOOM, pinFarbe, type Eintrag } from '../types'
import { nadelHtml } from './nadel'
import { FARBE_AKTIV, ROUTE_FARBE, type KartenProps } from './props'

const KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string
const MAP_ID = (import.meta.env.VITE_GOOGLE_MAP_ID as string) || 'DEMO_MAP_ID'

// Polygone, Zeichenlinie, Route und Standort imperativ auf der Google-Karte
function Overlays(p: KartenProps) {
  const map = useMap()
  const cb = useRef(p)
  cb.current = p

  useEffect(() => {
    if (!map) return
    const polys = p.eintraege.filter((e): e is Extract<Eintrag, { typ: 'flaeche' }> => e.typ === 'flaeche').map((e) => {
      const aktiv = e.id === p.ausgewaehlt
      const f = pinFarbe(e), h = p.hervor.includes(f) && !aktiv
      const poly = new google.maps.Polygon({ map, paths: e.punkte, strokeColor: aktiv ? '#fff' : f, strokeWeight: aktiv ? 4 : h ? 3.5 : 2, fillColor: f, fillOpacity: aktiv ? 0.35 : h ? 0.38 : 0.25 })
      poly.addListener('click', () => cb.current.onAuswahl(e.id))
      return poly
    })
    return () => polys.forEach((x) => x.setMap(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, p.eintraege, p.ausgewaehlt, p.hervor.join()])

  useEffect(() => {
    if (!map || !p.zeichenPunkte.length) return
    const poly = new google.maps.Polygon({ map, paths: p.zeichenPunkte, strokeColor: FARBE_AKTIV, fillOpacity: 0.15, clickable: false })
    return () => poly.setMap(null)
  }, [map, p.zeichenPunkte])

  useEffect(() => {
    if (!map || !p.route) return
    const line = new google.maps.Polyline({ map, path: p.route.punkte, strokeColor: ROUTE_FARBE, strokeWeight: 6, strokeOpacity: 0.8 })
    const b = new google.maps.LatLngBounds()
    p.route.punkte.forEach((q) => b.extend(q))
    map.fitBounds(b, { top: 40, left: 40, right: 40, bottom: Math.min(360, window.innerHeight * 0.45) })
    return () => line.setMap(null)
  }, [map, p.route])

  useEffect(() => {
    if (map && p.fokus) { map.panTo(p.fokus); map.setZoom(p.fokus.zoom ?? Math.max(map.getZoom() ?? 10, 14)) }
  }, [map, p.fokus])

  return null
}

export default function GoogleKarte(p: KartenProps) {
  return (
    <APIProvider apiKey={KEY} language="de" region="DE">
      <Map
        className="karte"
        mapId={MAP_ID}
        defaultCenter={START}
        defaultZoom={START_ZOOM}
        mapTypeId="hybrid" // Standard: Satellit mit Beschriftung
        mapTypeControl
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        onClick={(e) => e.detail.latLng && p.onKlick(e.detail.latLng)}
        onCameraChanged={(e) => p.onMitte(e.detail.center)}
      >
        {p.eintraege.map((e) =>
          e.typ === 'pin' ? (
            <AdvancedMarker key={e.id} position={e.position} title={e.titel || undefined} onClick={() => p.onAuswahl(e.id)}
              draggable={p.verschiebbar.includes(e.id)} onDragEnd={(ev) => { const ll = ev.latLng; if (ll) p.onVerschieben(e.id, { lat: ll.lat(), lng: ll.lng() }) }}>
              <div dangerouslySetInnerHTML={{ __html: nadelHtml(pinFarbe(e), e.id === p.ausgewaehlt, p.hervor.includes(pinFarbe(e))) }} />
            </AdvancedMarker>
          ) : null,
        )}
        {p.standort && (
          <AdvancedMarker position={p.standort} title="Mein Standort"><div className="standort-punkt" /></AdvancedMarker>
        )}
        <Overlays {...p} />
      </Map>
    </APIProvider>
  )
}
