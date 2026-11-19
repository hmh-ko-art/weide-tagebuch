import { alleKreise } from '../../server/flaechen.js'
import { spannungLetzte, kvText } from '../../server/spannung.js'
import { useEffect, useRef } from 'react'
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps'
import { START, START_ZOOM, pinFarbe, type Eintrag } from '../types'
import { nadelHtml } from './nadel'
import { infraSvg } from './symbole'
import { linienArt, linienStuecke } from '../../server/infrastruktur.js'
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
      poly.addListener('click', (ev: google.maps.MapMouseEvent) => cb.current.onAuswahl(e.id, ev.latLng ? { lat: ev.latLng.lat(), lng: ev.latLng.lng() } : undefined))
      return poly
    })
    // Zäune, Wege, Gräben (Tore als Lücken)
    for (const e of p.eintraege) {
      if (e.typ !== 'linie') continue
      const a = linienArt(e.linienArt), aktiv = e.id === p.ausgewaehlt
      for (const st of linienStuecke(e)) {
        const l = new google.maps.Polyline({ map, path: st, strokeColor: aktiv ? FARBE_AKTIV : pinFarbe(e), strokeWeight: a.breite + (aktiv ? 2 : 0), strokeOpacity: 0.95 })
        l.addListener('click', (ev: google.maps.MapMouseEvent) => cb.current.onAuswahl(e.id, ev.latLng ? { lat: ev.latLng.lat(), lng: ev.latLng.lng() } : undefined))
        polys.push(l as unknown as google.maps.Polygon)
      }
    }
    // Kreise um Nadeln (beim Bearbeiten: Vorschau mit dem eingestellten Radius)
    for (const e of p.eintraege) {
      if (e.typ !== 'pin') continue
      for (const ak of alleKreise(e)) {
        const kb = ak.stehenId == null && p.kreisBearbeiten?.id === e.id ? p.kreisBearbeiten : null
        const f = kb?.farbe ?? ak.kreis.farbe ?? pinFarbe(e)
        // nicht antippbar: Tippen in den Kreis setzt eine Nadel; Farbe per langem Drücken (contextmenu)
        const c = new google.maps.Circle({ map, center: kb?.mitte ?? ak.mitte, radius: kb?.radius ?? ak.kreis.radius, strokeColor: kb ? FARBE_AKTIV : f, strokeWeight: 2.5, fillColor: f, fillOpacity: ak.stehenId ? 0.28 : 0.38, clickable: false })
        c.addListener('click', (ev: google.maps.MapMouseEvent) => {
          const d = ev.domEvent as MouseEvent | undefined
          if (cb.current.onKreisKlick && !kb) cb.current.onKreisKlick(e.id, ak.stehenId, d?.clientX ?? window.innerWidth / 2, d?.clientY ?? window.innerHeight / 2)
          else cb.current.onAuswahl(e.id, ev.latLng ? { lat: ev.latLng.lat(), lng: ev.latLng.lng() } : undefined)
        })
        polys.push(c as unknown as google.maps.Polygon)
      }
    }
    const kb = p.kreisBearbeiten
    if (kb && !p.eintraege.some((e) => e.id === kb.id && e.typ === 'pin' && e.kreis)) polys.push(new google.maps.Circle({ map, center: kb.mitte, radius: kb.radius, strokeColor: FARBE_AKTIV, strokeWeight: 2.5, fillColor: kb.farbe, fillOpacity: 0.38, clickable: false }) as unknown as google.maps.Polygon)
    return () => polys.forEach((x) => x.setMap(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, p.eintraege, p.ausgewaehlt, p.hervor.join(), p.kreisBearbeiten?.radius, p.kreisBearbeiten?.farbe, p.kreisBearbeiten?.mitte.lat, p.kreisBearbeiten?.mitte.lng])

  useEffect(() => {
    if (!map || !p.zeichenPunkte.length) return
    const poly = p.zeichenLinie
      ? new google.maps.Polyline({ map, path: p.zeichenPunkte, strokeColor: FARBE_AKTIV, strokeWeight: 4, clickable: false })
      : new google.maps.Polygon({ map, paths: p.zeichenPunkte, strokeColor: FARBE_AKTIV, fillOpacity: 0.15, clickable: false })
    return () => poly.setMap(null)
  }, [map, p.zeichenPunkte, p.zeichenLinie])

  useEffect(() => {
    if (!map || !p.route) return
    const line = new google.maps.Polyline({ map, path: p.route.punkte, strokeColor: ROUTE_FARBE, strokeWeight: 6, strokeOpacity: 0.8 })
    const b = new google.maps.LatLngBounds()
    p.route.punkte.forEach((q) => b.extend(q))
    map.fitBounds(b, { top: 40, left: 40, right: 40, bottom: Math.min(360, window.innerHeight * 0.45) })
    return () => line.setMap(null)
  }, [map, p.route])

  useEffect(() => {
    if (!map || !p.fokus) return
    if (p.fokus.nurSichtbar) { if (!map.getBounds()?.contains(p.fokus)) map.panTo(p.fokus); return } // Zoom bleibt
    map.panTo(p.fokus); map.setZoom(p.fokus.zoom ?? Math.max(map.getZoom() ?? 10, 14))
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
        onContextmenu={(e) => { const d = e.domEvent as MouseEvent | undefined; if (e.detail.latLng) p.onLangDruck?.(e.detail.latLng, d?.clientX ?? window.innerWidth / 2, d?.clientY ?? window.innerHeight / 2) }}
        onCameraChanged={(e) => p.onMitte(e.detail.center)}
      >
        {p.eintraege.map((e) =>
          e.typ === 'pin' ? (
            <AdvancedMarker key={e.id} position={e.position} title={[e.titel, spannungLetzte(e) ? `⚡ ${kvText(spannungLetzte(e)!.kv)}` : ''].filter(Boolean).join(' · ') || undefined} onClick={() => p.onAuswahl(e.id)}
              draggable={p.verschiebbar.includes(e.id)} onDragEnd={(ev) => { const ll = ev.latLng; if (ll) p.onVerschieben(e.id, { lat: ll.lat(), lng: ll.lng() }) }}>
              <div dangerouslySetInnerHTML={{ __html: e.infra ? infraSvg(e.infra, 30, e.id === p.ausgewaehlt, !!p.warnIds?.includes(e.id)) : nadelHtml(pinFarbe(e), e.id === p.ausgewaehlt, p.hervor.includes(pinFarbe(e)), p.nummern[e.id]) }} />
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
