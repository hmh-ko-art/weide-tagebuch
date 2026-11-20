import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { START, START_ZOOM, istAusblendbar, pinFarbe, tierSummen, tierSymbolHtml, type Eintrag } from '../types'
import { NADEL_BREITE, NADEL_HOEHE, nadelHtml } from './nadel'
import { FARBE_AKTIV, ROUTE_FARBE, type KartenProps } from './props'
import { ansichtSetzen, letzteAnsicht } from '../offline'
import { infraSvg } from './symbole'
import { abstand, alleKreise } from '../../server/flaechen.js'
import { spannungLetzte } from '../../server/spannung.js'
import { gesamtLaenge, laengeText, linienArt, linienLaenge, linienStuecke, punktBei } from '../../server/infrastruktur.js'

const ll = (q: { lat: number; lng: number }) => [q.lat, q.lng] as [number, number]
const infraIcon = (html: string, label: string) => L.divIcon({ className: 'infra-icon', html: `${html}${label}`, iconSize: [30, 30], iconAnchor: [15, 15] })
const punktIcon = (sel: boolean) => L.divIcon({ className: 'eck-icon', html: `<span class="eck${sel ? ' sel' : ''}"></span>`, iconSize: [28, 28], iconAnchor: [14, 14] })
const griffIcon = L.divIcon({ className: 'eck-icon', html: '<span class="eck kreis-griff">↔</span>', iconSize: [34, 34], iconAnchor: [17, 17] })
const mitteIcon = L.divIcon({ className: 'eck-icon', html: '<span class="eck mitte">+</span>', iconSize: [26, 26], iconAnchor: [13, 13] })

// Beschriftung: Name und – falls gesetzt – dezent Symbol + Tierzahl
// Tierliste 'ausblendbar': kleiner Knopf ▾/▸ im Schild klappt sie ein/aus (Zustand pro Gerät)
// Zaunspannung: kleines ⚡-Schild (rot unter der Warnschwelle) – auch wenn die Beschriftung aus ist
const voltHtml = (e: Eintrag, schwelle: number) => {
  const m = spannungLetzte(e)
  if (!m) return ''
  return `<span class="label-volt${m.kv < schwelle ? ' tief' : ''}" title="Zaunspannung ${m.datum.split('-').reverse().join('.')}">⚡${m.kv.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>`
}
const labelHtml = (e: Eintrag, zu: boolean, schwelle: number, mitName = true) => {
  const volt = voltHtml(e, schwelle)
  if (!mitName) return volt ? `<div class="pin-label nur-volt">${volt}</div>` : ''
  const name = e.titel.trim().replace(/[<>&"]/g, '')
  const summen = tierSummen([e])
  const liste = summen.map((x) => `<span class="label-tiere">${tierSymbolHtml(x.art)}${x.n}</span>`).join('')
  const tiere = summen.length && istAusblendbar(e)
    ? `<span class="tiere-knopf" role="button" aria-expanded="${!zu}" title="Tiere ${zu ? 'einblenden' : 'ausblenden'}">${zu ? '▸ Tiere' : `▾${liste}`}</span>`
    : liste
  return name || tiere || volt ? `<div class="pin-label">${name}${tiere}${volt}</div>` : ''
}
const pinIcon = (aktiv: boolean, label: string, farbe: string, hervor: boolean, nr?: number) =>
  L.divIcon({
    className: `pin-icon${nr ? ' mit-nummer' : ''}`,
    html: `${nadelHtml(farbe, aktiv, hervor, nr)}${label}`,
    iconSize: [NADEL_BREITE, NADEL_HOEHE],
    iconAnchor: [NADEL_BREITE / 2, NADEL_HOEHE - 1],
  })

// Kostenlose OpenStreetMap-Karte (Fallback ohne Google-Key)
const EBENEN_NAME = { satellit: 'Satellit', satpur: 'Satellit ohne Beschriftung', karte: 'Karte' } as const

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
  const grundEbenen = useRef<Record<'satellit' | 'satpur' | 'karte', L.Layer> | null>(null)
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
    // 7j: Kartenansicht kommt aus Einstellungen → Darstellung (kein Ebenen-Knopf mehr auf der Karte)
    grundEbenen.current = { satellit, satpur: satPur, karte: osm }
    grundEbenen.current[cb.current.kartenAnsicht ?? 'satellit'].addTo(m)
    L.control.zoom({ position: 'topright' }).addTo(m)
    ebene.current = L.layerGroup().addTo(m)
    zeichnen.current = L.layerGroup().addTo(m)
    eckEbene.current = L.layerGroup().addTo(m)
    routeEbene.current = L.layerGroup().addTo(m)
    standortEbene.current = L.layerGroup().addTo(m)
    // Langes Drücken (Handy) bzw. Rechtsklick (PC): eigene Geste, danach wird der folgende Klick verschluckt (keine Nadel)
    let langBis = 0, langT: ReturnType<typeof setTimeout> | null = null, start: { x: number; y: number } | null = null
    const lang = (x: number, y: number) => {
      if (Date.now() < langBis) return
      langBis = Date.now() + 700
      const q = m.containerPointToLatLng(L.point(x - el.current!.getBoundingClientRect().left, y - el.current!.getBoundingClientRect().top))
      cb.current.onLangDruck?.({ lat: q.lat, lng: q.lng }, x, y)
    }
    const c0 = m.getContainer()
    const abbruch = () => { if (langT) clearTimeout(langT); langT = null; start = null }
    c0.addEventListener('pointerdown', (ev) => {
      if (!ev.isPrimary) { abbruch(); return } // zweiter Finger (Zoomen)
      if (ev.button > 0 || (ev.target as Element).closest?.('.leaflet-marker-icon, .leaflet-control')) return
      start = { x: ev.clientX, y: ev.clientY }
      if (langT) clearTimeout(langT)
      langT = setTimeout(() => { if (start) lang(start.x, start.y); langT = null }, 550)
    })
    c0.addEventListener('pointermove', (ev) => { if (start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 10) abbruch() })
    c0.addEventListener('pointerup', abbruch); c0.addEventListener('pointercancel', abbruch)
    c0.addEventListener('contextmenu', (ev) => { ev.preventDefault(); abbruch(); lang(ev.clientX, ev.clientY) })
    m.on('click', (e) => { if (Date.now() < langBis) return; cb.current.onKlick({ lat: e.latlng.lat, lng: e.latlng.lng }) })
    // Ziehen & Ablegen aus der Seitenleiste (Desktop): Ablegepunkt = Position
    c0.addEventListener('dragover', (ev) => { if (ev.dataTransfer?.types.includes('application/x-flockmap')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy' } })
    c0.addEventListener('drop', (ev) => {
      const art = ev.dataTransfer?.getData('application/x-flockmap')
      if (!art) return
      ev.preventDefault()
      const r = c0.getBoundingClientRect(), q = m.containerPointToLatLng([ev.clientX - r.left, ev.clientY - r.top])
      cb.current.onAblegen?.(art, { lat: q.lat, lng: q.lng })
    })
    // Kartengröße ändert sich (Seitenleiste auf/zu) -> Leaflet neu vermessen
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m.invalidateSize({ pan: false })) : null
    ro?.observe(c0)
    let ebeneName: string = EBENEN_NAME[cb.current.kartenAnsicht ?? 'satellit']
    const ansichtMerken = () => { const b = m.getBounds(), c = m.getCenter(); ansichtSetzen({ nord: b.getNorth(), sued: b.getSouth(), west: b.getWest(), ost: b.getEast(), zoom: m.getZoom(), ebene: ebeneName, lat: c.lat, lng: c.lng }) }
    m.on('baselayerchange', (e) => { ebeneName = e.name; ansichtMerken() })
    m.on('moveend', () => { const c = m.getCenter(); cb.current.onMitte({ lat: c.lat, lng: c.lng }); ansichtMerken() })
    ansichtMerken()
    map.current = m
    return () => { ro?.disconnect(); m.remove() }
  }, [])

  // 7j: Kartenansicht wechseln (Einstellungen → Darstellung)
  useEffect(() => {
    const m = map.current, g = grundEbenen.current
    if (!m || !g) return
    const ziel = p.kartenAnsicht ?? 'satellit'
    if (m.hasLayer(g[ziel])) return
    for (const l of Object.values(g)) if (m.hasLayer(l)) m.removeLayer(l)
    g[ziel].addTo(m)
    m.fire('baselayerchange', { name: EBENEN_NAME[ziel], layer: g[ziel] })
  }, [p.kartenAnsicht])

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
      // Kreis um die Nadel („eingezäunt“) – beim Bearbeiten zeichnet die Bearbeiten-Ebene ihn
      if (e.typ === 'pin') for (const ak of alleKreise(e)) {
        if (ak.stehenId == null && e.id === p.kreisBearbeiten?.id) continue // beim Bearbeiten zeichnet die Bearbeiten-Ebene ihn
        const kr = ak.kreis, mi = ak.mitte, f = kr.farbe || pinFarbe(e), alt = ak.stehenId != null
        L.circle(ll(mi), { radius: kr.radius, color: '#000', weight: aktiv ? 6 : 4.5, opacity: alt ? 0.25 : 0.35, fill: false, interactive: false }).addTo(g)
        // Innenfläche nicht antippbar: Tippen in den Kreis setzt eine Nadel genau dort; Farbe über den Rand (Ring) oder langes Drücken
        L.circle(ll(mi), { radius: kr.radius, color: aktiv ? '#fff' : f, weight: aktiv ? 3.5 : 2.5, fillColor: f, fillOpacity: alt ? 0.28 : aktiv ? 0.45 : 0.38, dashArray: kr.gebunden === false || e.frei ? undefined : '8 5', className: alt ? 'kreis-alt-linie' : undefined, interactive: false }).addTo(g)
        L.circle(ll(mi), { radius: kr.radius, color: '#000', opacity: 0, weight: 22, fill: false, className: 'kreis-ring' })
          .on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev)
            if (cb.current.onKreisKlick) cb.current.onKreisKlick(e.id, ak.stehenId, ev.originalEvent?.clientX ?? 0, ev.originalEvent?.clientY ?? 0)
            else cb.current.onAuswahl(e.id, { lat: ev.latlng.lat, lng: ev.latlng.lng }) // im Setz-Modus: Nadel genau hier
          }).addTo(g)
        // Fester Kreis und Nadel woanders: dünne Verbindungslinie, damit man sieht, wozu er gehört
        if (!alt && kr.gebunden === false && abstand(mi, e.position) > 2) L.polyline([ll(e.position), ll(mi)], { color: f, weight: 1.5, dashArray: '2 6', opacity: 0.9, interactive: false }).addTo(g)
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
      } else if (e.typ === 'pin' && e.frei) {
        // Freier Kreis (ohne Nadel): nur kleiner Mittelpunkt + Name in der Mitte; antippen über den Ring/langes Drücken
        if (e.id === p.kreisBearbeiten?.id) continue
        const f = e.kreis?.farbe || pinFarbe(e)
        L.circleMarker(ll(e.position), { radius: aktiv ? 5 : 3.5, color: '#fff', weight: 1.5, fillColor: f, fillOpacity: 1, interactive: false }).addTo(g)
        const name = e.titel.trim().replace(/[<>&"]/g, '')
        if ((p.beschriftung || aktiv) && name) L.tooltip({ permanent: true, direction: 'center', className: 'flaeche-label frei-kreis-label', interactive: false, offset: [0, 14] }).setLatLng(ll(e.position)).setContent(name).addTo(g)
      } else if (e.typ === 'pin') {
        const ziehbar = verschiebbar.has(e.id)
        const m = L.marker([e.position.lat, e.position.lng], { icon: pinIcon(aktiv, labelHtml(e, tiereZu.has(e.id), p.spannungSchwelle ?? 4, p.beschriftung), pinFarbe(e), hervor.has(pinFarbe(e)), p.nummern[e.id]), zIndexOffset: aktiv ? 1000 : hervor.has(pinFarbe(e)) ? 500 : 0, draggable: ziehbar, autoPan: true })
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
  }, [p.kreisBearbeiten?.id, p.eintraege, p.ausgewaehlt, p.beschriftung, p.hervor.join(), p.verschiebbar.join(), p.tiereZu.join(), p.nummern, (p.warnIds ?? []).join(), p.spannungSchwelle])

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

  // Vorläufige Kreise (7h): nach dem Verschieben einer Nadel bis zum Ende des Rückgängig-Countdowns gestrichelt
  const vorschauEbene = useRef<L.LayerGroup | null>(null)
  const vk = p.vorschauKreise ?? []
  useEffect(() => {
    if (!map.current) return
    vorschauEbene.current ??= L.layerGroup().addTo(map.current)
    const g = vorschauEbene.current
    g.clearLayers()
    for (const v of vk) {
      L.circle(ll(v.mitte), { radius: v.radius, color: '#fff', weight: 4, opacity: 0.8, dashArray: '4 8', fill: false, interactive: false }).addTo(g)
      L.circle(ll(v.mitte), { radius: v.radius, color: v.farbe, weight: 2.5, dashArray: '4 8', fillColor: v.farbe, fillOpacity: 0.14, className: 'kreis-vorlaeufig', interactive: false }).addTo(g)
    }
  }, [vk.map((v) => `${v.mitte.lat},${v.mitte.lng},${v.radius},${v.farbe}`).join('|')])

  // Kreis um Nadel bearbeiten: Kreis + Griff am Rand (ziehen = Radius)
  const kreisEbene = useRef<L.LayerGroup | null>(null)
  const kb = p.kreisBearbeiten
  useEffect(() => {
    if (!map.current) return
    kreisEbene.current ??= L.layerGroup().addTo(map.current)
    const g = kreisEbene.current
    g.clearLayers()
    if (!kb) return
    const c = L.circle(ll(kb.mitte), { radius: kb.radius, color: FARBE_AKTIV, weight: 3, fillColor: kb.farbe, fillOpacity: 0.38, interactive: false }).addTo(g)
    L.circle(ll(kb.mitte), { radius: kb.radius, color: kb.farbe, weight: 2, dashArray: '6 6', fill: false, interactive: false }).addTo(g)
    // Griff östlich der Mitte
    const ost = (r: number) => ({ lat: kb.mitte.lat, lng: kb.mitte.lng + r / (111320 * Math.cos((kb.mitte.lat * Math.PI) / 180)) })
    const m = L.marker(ll(ost(kb.radius)), { icon: griffIcon, draggable: true, zIndexOffset: 1500, autoPan: true, title: 'Ziehen ändert den Radius' }).addTo(g)
    m.on('drag', () => { const q = m.getLatLng(); c.setRadius(Math.max(3, abstand(kb.mitte, { lat: q.lat, lng: q.lng }))) })
    m.on('dragend', () => { const q = m.getLatLng(); cb.current.onKreisRadius?.(Math.max(3, Math.round(abstand(kb.mitte, { lat: q.lat, lng: q.lng })))) })
  }, [kb?.id, kb?.mitte.lat, kb?.mitte.lng, kb?.radius, kb?.farbe])

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
    const f = p.fokus
    if (!f) return
    if (!f.nurSichtbar) { map.current!.flyTo([f.lat, f.lng], f.zoom ?? Math.max(map.current!.getZoom(), 14)); return }
    // Zoom bleibt; nur schieben, wenn der Punkt außerhalb oder unter einer Leiste liegt
    const t = setTimeout(() => {
      const m = map.current!, h = m.getSize().y, w = m.getSize().x
      const unten = verdecktAb(el.current!, h)
      const q = m.latLngToContainerPoint([f.lat, f.lng])
      if (q.x >= 30 && q.x <= w - 30 && q.y >= 70 && q.y <= unten - 30) return
      const ziel = L.point(w / 2, Math.max(90, (70 + unten) / 2))
      m.panBy(q.subtract(ziel), { animate: true })
    }, 60)
    return () => clearTimeout(t)
  }, [p.fokus])

  return <div ref={el} className="karte" />
}

// Unterkante des sichtbaren Kartenbereichs (Leiste/Sheet unten verdeckt die Karte auf dem Handy)
function verdecktAb(karte: HTMLElement, h: number) {
  const top = karte.getBoundingClientRect().top
  let unten = h
  document.querySelectorAll('.leiste, .sheet').forEach((x) => {
    const r = (x as HTMLElement).getBoundingClientRect()
    if (r.height > 0 && r.left < window.innerWidth / 2 && r.right > window.innerWidth / 2 && r.top - top < unten) unten = Math.max(120, r.top - top)
  })
  return unten
}
