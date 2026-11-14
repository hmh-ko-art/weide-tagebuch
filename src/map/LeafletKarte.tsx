import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { START, START_ZOOM, pinFarbe } from '../types'
import { NADEL_BREITE, NADEL_HOEHE, nadelHtml } from './nadel'
import { FARBE_AKTIV, ROUTE_FARBE, type KartenProps } from './props'

const pinIcon = (aktiv: boolean, text: string, farbe: string, hervor: boolean) =>
  L.divIcon({
    className: 'pin-icon',
    html: `${nadelHtml(farbe, aktiv, hervor)}${text.trim() ? `<div class="pin-label">${text.replace(/[<>&]/g, '')}</div>` : ''}`,
    iconSize: [NADEL_BREITE, NADEL_HOEHE],
    iconAnchor: [NADEL_BREITE / 2, NADEL_HOEHE - 1],
  })

// Kostenlose OpenStreetMap-Karte (Fallback ohne Google-Key)
export default function LeafletKarte(p: KartenProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const ebene = useRef<L.LayerGroup | null>(null)
  const zeichnen = useRef<L.LayerGroup | null>(null)
  const routeEbene = useRef<L.LayerGroup | null>(null)
  const standortEbene = useRef<L.LayerGroup | null>(null)
  const cb = useRef(p)
  cb.current = p

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false }).setView([START.lat, START.lng], START_ZOOM)
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' })
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' })
    // Beschriftungen (Orte, Grenzen, Straßen) über dem Satellitenbild
    const orte = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
    const strassen = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 })
    const satellit = L.layerGroup([sat, strassen, orte])
    const satPur = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri' })
    satellit.addTo(m) // Standard: Satellit mit Beschriftung
    L.control.layers({ 'Satellit': satellit, 'Satellit ohne Beschriftung': satPur, 'Karte': osm }, undefined, { position: 'topright' }).addTo(m)
    L.control.zoom({ position: 'topright' }).addTo(m)
    ebene.current = L.layerGroup().addTo(m)
    zeichnen.current = L.layerGroup().addTo(m)
    routeEbene.current = L.layerGroup().addTo(m)
    standortEbene.current = L.layerGroup().addTo(m)
    m.on('click', (e) => cb.current.onKlick({ lat: e.latlng.lat, lng: e.latlng.lng }))
    m.on('moveend', () => { const c = m.getCenter(); cb.current.onMitte({ lat: c.lat, lng: c.lng }) })
    map.current = m
    return () => { m.remove() }
  }, [])

  // Einträge
  useEffect(() => {
    const g = ebene.current!
    g.clearLayers()
    const hervor = new Set(p.hervor)
    for (const e of p.eintraege) {
      const aktiv = e.id === p.ausgewaehlt
      const klick = (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); cb.current.onAuswahl(e.id) }
      if (e.typ === 'pin') {
        L.marker([e.position.lat, e.position.lng], { icon: pinIcon(aktiv, p.beschriftung ? e.titel : '', pinFarbe(e), hervor.has(pinFarbe(e))), zIndexOffset: aktiv ? 1000 : hervor.has(pinFarbe(e)) ? 500 : 0 }).on('click', klick).addTo(g)
      } else {
        // Fläche in ihrer Farbe; ausgewählt: weißer, dicker Rand; hervorgehoben: dezent dickerer Rand + etwas kräftigere Füllung
        const f = pinFarbe(e), h = hervor.has(f) && !aktiv
        const poly = L.polygon(e.punkte.map((q) => [q.lat, q.lng] as [number, number]), { color: aktiv ? '#fff' : f, fillColor: f, weight: aktiv ? 4 : h ? 3.5 : 2, opacity: 1, fillOpacity: aktiv ? 0.35 : h ? 0.38 : 0.25 })
        // Nur beschriften, wenn die Fläche einen Namen hat
        if (p.beschriftung && e.titel.trim()) poly.bindTooltip(e.titel, { permanent: true, direction: 'center', className: 'flaeche-label' })
        poly.on('click', klick).addTo(g)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.eintraege, p.ausgewaehlt, p.beschriftung, p.hervor.join()])

  // Zeichnen einer Fläche
  useEffect(() => {
    const g = zeichnen.current!
    g.clearLayers()
    const pts = p.zeichenPunkte.map((q) => [q.lat, q.lng] as [number, number])
    if (pts.length >= 2) L.polygon(pts, { color: FARBE_AKTIV, dashArray: '6 6', fillOpacity: 0.15 }).addTo(g)
    pts.forEach((q) => L.circleMarker(q, { radius: 6, color: FARBE_AKTIV, fillColor: '#fff', fillOpacity: 1 }).addTo(g))
  }, [p.zeichenPunkte])

  // Route
  useEffect(() => {
    const g = routeEbene.current!
    g.clearLayers()
    if (!p.route) return
    const line = L.polyline(p.route.punkte.map((q) => [q.lat, q.lng] as [number, number]), { color: ROUTE_FARBE, weight: 6, opacity: 0.8 }).addTo(g)
    map.current!.fitBounds(line.getBounds(), { paddingTopLeft: [40, 40], paddingBottomRight: [40, Math.min(360, window.innerHeight * 0.45)] })
  }, [p.route])

  // Standort
  useEffect(() => {
    const g = standortEbene.current!
    g.clearLayers()
    if (p.standort) L.circleMarker([p.standort.lat, p.standort.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1e88e5', fillOpacity: 1 }).addTo(g)
  }, [p.standort])

  useEffect(() => {
    if (p.fokus) map.current!.flyTo([p.fokus.lat, p.fokus.lng], p.fokus.zoom ?? Math.max(map.current!.getZoom(), 14))
  }, [p.fokus])

  return <div ref={el} className="karte" />
}
