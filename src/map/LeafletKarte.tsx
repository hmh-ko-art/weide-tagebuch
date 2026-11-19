import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { START, START_ZOOM, istAusblendbar, pinFarbe, tierSummen, tierSymbolHtml, type Eintrag } from '../types'
import { NADEL_BREITE, NADEL_HOEHE, nadelHtml } from './nadel'
import { FARBE_AKTIV, ROUTE_FARBE, type KartenProps } from './props'
import { ansichtSetzen, letzteAnsicht } from '../offline'
import { infraSvg } from './symbole'
import { gesamtLaenge, laengeText, linienArt, linienLaenge, linienStuecke, punktBei } from '../../server/infrastruktur.js'

const ll = (q: { lat: number; lng: number }) => [q.lat, q.lng] as [number, number]
const infraIcon = (html: string, label: string) => L.divIcon({ className: 'infra-icon', html: `${html}${label}`, iconSize: [30, 30], iconAnchor: [15, 15] })
const punktIcon = (sel: boolean) => L.divIcon({ className: 'eck-icon', html: `<span class="eck${sel ? ' sel' : ''}"></span>`, iconSize: [28, 28], iconAnchor: [14, 14] })
const mitteIcon = L.divIcon({ className: 'eck-icon', html: '<span class="eck mitte">+</span>', iconSize: [26, 26], iconAnchor: [13, 13] })

// Beschriftung: Name und – falls gesetzt – dezent Symbol + Tierzahl
// Tierliste 'ausblendbar': kleiner Knopf ▾/▸ im Schild klappt sie ein/aus (Zustand pro Gerät)
const labelHtml = (e: Eintrag, zu: boolean) => {
  const name = e.titel.trim().replace(/[<>&"]/g, '')
  const summen = tierSummen([e])
  const liste = summen.map((x) => `<span class="label-tiere">${tierSymbolHtml(x.art)}${x.n}</span>`).join('')
  const tiere = summen.length && istAusblendbar(e)
    ? `<span class="tiere-knopf" role="button" aria-expanded="${!zu}" title="Tiere ${zu ? 'einblenden' : 'ausblenden'}">${zu ? '▸ Tiere' : `▾${liste}`}</span>`
    : liste
  return name || tiere ? `<div class="pin-label">${name}${tiere}</div>` : ''
}
const pinIcon = (aktiv: boolean, label: string, farbe: string, hervor: boolean, nr?: number) =>
  L.divIcon({
    className: `pin-icon${nr ? ' mit-nummer' : ''}`,
    html: `${nadelHtml(farbe, aktiv, hervor, nr)}${label}`,
    iconSize: [NADEL_BREITE, NADEL_HOEHE],
    iconAnchor: [NADEL_BREITE / 2, NADEL_HOEHE - 1],
  })

// Kostenlose OpenStreetMap-Karte (Fallback ohne Google-Key)
export default function LeafletKarte(p: KartenProps) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const ebene = useRef<L.LayerGroup | null>(null)
  const zeichnen = useRef<L.LayerGroup | null>(null)
  const eckEbene = useRef<L.LayerGroup | null>(null)
  const routeEbene = useRef<L.LayerGroup | null>(null)
  const standortEbene = useRef<L.LayerGroup | null>(null)
  const cb = useRef(p)
  cb.current = p
  const zieht = useRef(false) // während des Ziehens Marker nicht neu aufbauen

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false }).setView([START.lat, START.lng], START_ZOOM)
    // Ohne Netz dort starten, wo zuletzt geschaut wurde – dort liegen die gespeicherten Kartenkacheln
    const zuletzt = navigator.onLine === false ? letzteAnsicht() : null
    if (zuletzt?.lat != null && zuletzt.lng != null) m.setView([zuletzt.lat, zuletzt.lng], zuletzt.zoom)
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="#recht/quellen">OpenStreetMap-Mitwirkende</a>', crossOrigin: true })
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '<a href="#recht/quellen">Esri, Maxar, Earthstar Geographics, GIS User Community</a>', crossOrigin: true })
    // Beschriftungen (Orte, Grenzen, Straßen) über dem Satellitenbild
    const orte = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, crossOrigin: true })
    const strassen = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, crossOrigin: true })
    const satellit = L.layerGroup([sat, strassen, orte])
    const satPur = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '<a href="#recht/quellen">Esri, Maxar, Earthstar Geographics, GIS User Community</a>', crossOrigin: true })
    satellit.addTo(m) // Standard: Satellit mit Beschriftung
    L.control.layers({ 'Satellit': satellit, 'Satellit ohne Beschriftung': satPur, 'Karte': osm }, undefined, { position: 'topright' }).addTo(m)
    L.control.zoom({ position: 'topright' }).addTo(m)
    ebene.current = L.layerGroup().addTo(m)
    zeichnen.current = L.layerGroup().addTo(m)
    eckEbene.current = L.layerGroup().addTo(m)
    routeEbene.current = L.layerGroup().addTo(m)
    standortEbene.current = L.layerGroup().addTo(m)
    m.on('click', (e) => cb.current.onKlick({ lat: e.latlng.lat, lng: e.latlng.lng }))
    let ebeneName = 'Satellit'
    const ansichtMerken = () => { const b = m.getBounds(), c = m.getCenter(); ansichtSetzen({ nord: b.getNorth(), sued: b.getSouth(), west: b.getWest(), ost: b.getEast(), zoom: m.getZoom(), ebene: ebeneName, lat: c.lat, lng: c.lng }) }
    m.on('baselayerchange', (e) => { ebeneName = e.name; ansichtMerken() })
    m.on('moveend', () => { const c = m.getCenter(); cb.current.onMitte({ lat: c.lat, lng: c.lng }); ansichtMerken() })
    ansichtMerken()
    map.current = m
    return () => { m.remove() }
  }, [])

  // Einträge
  useEffect(() => {
    if (zieht.current) return
    const g = ebene.current!
    g.clearLayers()
    const hervor = new Set(p.hervor)
    const verschiebbar = new Set(p.verschiebbar)
    const tiereZu = new Set(p.tiereZu)
    const warn = new Set(p.warnIds ?? [])
    for (const e of p.eintraege) {
      const aktiv = e.id === p.ausgewaehlt
      const klick = (ev: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(ev)
        // Tipp auf den ▾/▸-Knopf im Schild: nur Tierliste ein-/ausklappen
        if ((ev.originalEvent?.target as Element | null)?.closest?.('.tiere-knopf')) cb.current.onTiereUmschalten(e.id)
        else cb.current.onAuswahl(e.id)
      }
      if (e.typ === 'pin' && e.infra) {
        // Weide-Technik: eigenes rundes Symbol (Gerät mit fälliger Prüfung rot umrandet)
        const ziehbar = verschiebbar.has(e.id)
        const name = e.titel.trim().replace(/[<>&"]/g, '')
        const m = L.marker(ll(e.position), { icon: infraIcon(infraSvg(e.infra, 30, aktiv, warn.has(e.id)), p.beschriftung && name ? `<div class="pin-label infra-label">${name}</div>` : ''), zIndexOffset: aktiv ? 1000 : 300, draggable: ziehbar, autoPan: true, title: e.titel || undefined })
        m.on('click', klick)
        if (ziehbar) {
          m.on('dragstart', () => { zieht.current = true; navigator.vibrate?.(15) })
          m.on('dragend', () => { zieht.current = false; const q = m.getLatLng(); cb.current.onVerschieben(e.id, { lat: q.lat, lng: q.lng }) })
        }
        m.addTo(g)
      } else if (e.typ === 'linie') {
        // Zaun/Weg/Graben: Linie im Stil der Art, dunkler Schatten für Kontrast auf dem Satellitenbild, Tore als Lücken
        const a = linienArt(e.linienArt), f = pinFarbe(e)
        const linienKlick = (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); cb.current.onAuswahl(e.id, { lat: ev.latlng.lat, lng: ev.latlng.lng }) }
        for (const st of linienStuecke(e)) {
          const pts = st.map(ll)
          L.polyline(pts, { color: aktiv ? '#fff' : '#000', weight: a.breite + (aktiv ? 5 : 3), opacity: aktiv ? 0.9 : 0.35, interactive: false }).addTo(g)
          L.polyline(pts, { color: aktiv ? FARBE_AKTIV : f, weight: a.breite, opacity: 1, dashArray: a.strich || undefined, lineCap: a.strich ? 'butt' : 'round', interactive: false }).addTo(g)
          // breite unsichtbare Tippfläche (leicht mit dem Finger zu treffen)
          L.polyline(pts, { color: '#000', weight: 22, opacity: 0 }).on('click', linienKlick).addTo(g)
        }
        // Tore: kleine Pfosten an beiden Enden der Lücke
        for (const t of e.tore ?? []) {
          for (const d of [-t.breite / 2, t.breite / 2]) L.circleMarker(ll(punktBei(e, t.pos + d)), { radius: 4, color: '#3e2723', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(g)
          L.circleMarker(ll(punktBei(e, t.pos)), { radius: 11, opacity: 0, fillOpacity: 0 }).on('click', (ev) => { L.DomEvent.stopPropagation(ev); cb.current.onAuswahl(e.id, punktBei(e, t.pos)) }).addTo(g)
        }
        if (p.beschriftung || aktiv) {
          const txt = `${e.titel.trim().replace(/[<>&"]/g, '')}${e.titel.trim() ? ' · ' : ''}${laengeText(linienLaenge(e))}`
          L.tooltip({ permanent: true, direction: 'center', className: 'linie-label', interactive: false }).setLatLng(ll(punktBei(e, gesamtLaenge(e) / 2))).setContent(txt).addTo(g)
        }
      } else if (e.typ === 'pin') {
        const ziehbar = verschiebbar.has(e.id)
        const m = L.marker([e.position.lat, e.position.lng], { icon: pinIcon(aktiv, p.beschriftung ? labelHtml(e, tiereZu.has(e.id)) : '', pinFarbe(e), hervor.has(pinFarbe(e)), p.nummern[e.id]), zIndexOffset: aktiv ? 1000 : hervor.has(pinFarbe(e)) ? 500 : 0, draggable: ziehbar, autoPan: true })
        m.on('click', klick)
        if (ziehbar) {
          // Finger runter, ziehen, loslassen -> neue Position (kurzes Antippen bleibt ein Klick)
          m.on('dragstart', () => { zieht.current = true; m.getElement()?.classList.add('zieht'); m.setZIndexOffset(2000); navigator.vibrate?.(15) })
          m.on('dragend', () => {
            zieht.current = false
            m.getElement()?.classList.remove('zieht')
            const ll = m.getLatLng()
            cb.current.onVerschieben(e.id, { lat: ll.lat, lng: ll.lng })
          })
        }
        m.addTo(g)
      } else {
        // Fläche in ihrer Farbe; ausgewählt: weißer, dicker Rand; hervorgehoben: dezent dickerer Rand + etwas kräftigere Füllung
        const f = pinFarbe(e), h = hervor.has(f) && !aktiv
        const poly = L.polygon(e.punkte.map((q) => [q.lat, q.lng] as [number, number]), { color: aktiv ? '#fff' : f, fillColor: f, weight: aktiv ? 4 : h ? 3.5 : 2, opacity: 1, fillOpacity: aktiv ? 0.35 : h ? 0.38 : 0.25 })
        // Nur beschriften, wenn die Fläche einen Namen hat
        if (p.beschriftung && e.titel.trim()) poly.bindTooltip(e.titel, { permanent: true, direction: 'center', className: 'flaeche-label' })
        // Tipp auf eine Fläche: Stelle mitgeben (im Setz-Modus kommt die Nadel genau dorthin, z. B. eine Tränke in der Weide)
        poly.on('click', (ev: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(ev); cb.current.onAuswahl(e.id, { lat: ev.latlng.lat, lng: ev.latlng.lng }) }).addTo(g)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.eintraege, p.ausgewaehlt, p.beschriftung, p.hervor.join(), p.verschiebbar.join(), p.tiereZu.join(), p.nummern, (p.warnIds ?? []).join()])

  // Zeichnen einer Fläche oder Linie
  useEffect(() => {
    const g = zeichnen.current!
    g.clearLayers()
    const pts = p.zeichenPunkte.map(ll)
    if (pts.length >= 2) (p.zeichenLinie ? L.polyline(pts, { color: FARBE_AKTIV, weight: 4 }) : L.polygon(pts, { color: FARBE_AKTIV, dashArray: '6 6', fillOpacity: 0.15 })).addTo(g)
    pts.forEach((q) => L.circleMarker(q, { radius: 6, color: FARBE_AKTIV, fillColor: '#fff', fillOpacity: 1 }).addTo(g))
  }, [p.zeichenPunkte, p.zeichenLinie])

  // Eckpunkte bearbeiten: Punkte ziehen, „+“ in der Mitte fügt einen Punkt ein, Tippen wählt einen Punkt (zum Löschen)
  useEffect(() => {
    const g = eckEbene.current!
    g.clearLayers()
    const b = p.bearbeiten
    if (!b) return
    const pts = b.punkte.map(ll)
    if (pts.length >= 2) (b.linie ? L.polyline(pts.concat(b.geschlossen ? [pts[0]] : []), { color: FARBE_AKTIV, weight: 4, interactive: false }) : L.polygon(pts, { color: FARBE_AKTIV, weight: 3, fillOpacity: 0.15, interactive: false })).addTo(g)
    const ring = !b.linie || b.geschlossen
    const n = pts.length
    for (let i = 0; i < (ring ? n : n - 1); i++) {
      const a = b.punkte[i], c = b.punkte[(i + 1) % n]
      const m = L.marker([(a.lat + c.lat) / 2, (a.lng + c.lng) / 2], { icon: mitteIcon, draggable: true, zIndexOffset: 900 })
      m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); const q = m.getLatLng(); cb.current.onPunktEinfuegen?.(i + 1, { lat: q.lat, lng: q.lng }) })
      m.on('dragend', () => { const q = m.getLatLng(); cb.current.onPunktEinfuegen?.(i + 1, { lat: q.lat, lng: q.lng }) })
      m.addTo(g)
    }
    b.punkte.forEach((q, i) => {
      const m = L.marker(ll(q), { icon: punktIcon(b.sel === i), draggable: true, zIndexOffset: 1000, autoPan: true })
      m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); cb.current.onPunktWahl?.(i) })
      m.on('dragstart', () => cb.current.onPunktWahl?.(i))
      m.on('dragend', () => { const z = m.getLatLng(); cb.current.onPunktZiehen?.(i, { lat: z.lat, lng: z.lng }) })
      m.addTo(g)
    })
  }, [p.bearbeiten])

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
