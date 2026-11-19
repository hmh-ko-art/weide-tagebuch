// KML-Export (Google Earth / Google My Maps) und Import von KML/KMZ (My Maps), GeoJSON und CSV.
import { GRUPPEN_FARBEN, type LatLng } from '../types'
import type { Zeile } from './zeilen'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// KML-Farben sind aabbggrr
const kmlFarbe = (hex: string, alpha = 'ff') => { const h = hex.replace('#', '').toLowerCase(); return `${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}` }
const hexAusKml = (c: string) => { const h = c.trim().toLowerCase().replace(/^#/, ''); return /^[0-9a-f]{8}$/.test(h) ? `#${h.slice(6, 8)}${h.slice(4, 6)}${h.slice(2, 4)}` : null }

// ---------------- Export ----------------
export function kmlErzeugen(titel: string, zeilen: Zeile[], gruppenReihe: { id: string | null; name: string; farbe: string }[]): string {
  const farben = [...new Set(zeilen.map((z) => z.farbe))]
  const styles = farben.map((f) => `<Style id="f-${f.slice(1)}"><IconStyle><color>${kmlFarbe(f)}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon><hotSpot x="32" y="1" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle><LineStyle><color>${kmlFarbe(f)}</color><width>2</width></LineStyle><PolyStyle><color>${kmlFarbe(f, '59')}</color></PolyStyle></Style>`)
  const placemark = (z: Zeile) => {
    const daten: [string, string | number][] = [['flockmap_id', z.e.id], ['Name', z.name], ['Typ', z.typ], ['Gruppe', z.gruppe], ['Nr', z.nr ?? ''], ['Schafe', z.schafe], ['Böcke', z.boecke], ['Lämmer', z.laemmer], ['Herde', z.herde], ['Farbe', z.farbe], ['Datum', z.datum], ...(z.typ === 'Fläche' ? [['Hektar', z.ha.toFixed(2)] as [string, string]] : [])]
    const beschreibung = [z.kurz && `Tiere: ${z.kurz}`, z.herde && `Herde: ${z.herde}`, `Datum: ${z.datum.split('-').reverse().join('.')}`, z.typ === 'Fläche' ? `Fläche: ${z.ha.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha` : '', z.notizen && `Notizen:\n${z.notizen}`].filter(Boolean).join('\n')
    const name = [z.nr ? `${z.nr}.` : '', z.name, z.kurz].filter(Boolean).join(' ')
    const geo = z.e.typ === 'pin'
      ? `<Point><coordinates>${z.e.position.lng.toFixed(7)},${z.e.position.lat.toFixed(7)},0</coordinates></Point>`
      : `<Polygon><outerBoundaryIs><LinearRing><tessellate>1</tessellate><coordinates>${[...z.e.punkte, z.e.punkte[0]].map((p) => `${p.lng.toFixed(7)},${p.lat.toFixed(7)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
    return `<Placemark><name>${esc(name || '(ohne Namen)')}</name><description>${esc(beschreibung)}</description><styleUrl>#f-${z.farbe.slice(1)}</styleUrl><ExtendedData>${daten.map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(String(v))}</value></Data>`).join('')}</ExtendedData>${geo}</Placemark>`
  }
  const ordner = gruppenReihe.map((g) => {
    const l = zeilen.filter((z) => (g.id === '__flaechen' ? z.typ === 'Fläche' : z.typ === 'Nadel' && z.gruppeId === g.id))
    return l.length ? `<Folder><name>${esc(g.name)}</name>${l.map(placemark).join('')}</Folder>` : ''
  })
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(titel)}</name><description>Export aus FlockMap, ${new Date().toLocaleString('de-DE')}</description>${styles.join('')}${ordner.join('')}</Document></kml>`
}

// ---------------- Import ----------------
export interface Vorschlag {
  typ: 'pin' | 'flaeche'
  rohName: string
  titel: string
  ebene: string // Ordner/Ebene in My Maps -> Gruppe
  farbe: string | null
  position?: LatLng
  punkte?: LatLng[]
  schafe: number; boecke: number; laemmer: number
  ausName: boolean // Tierzahlen wurden aus dem Namen gelesen
  feldZahlen?: boolean // Tierzahlen kamen aus eigenen Feldern/Spalten (dann Namen nicht auswerten)
  notiz: string // Beschreibung + Zusatzfelder
  datum?: string
  herde?: string
  flockmapId?: string // Export aus FlockMap (Rundreise)
}
export interface ImportErgebnis { vorschlaege: Vorschlag[]; uebersprungen: { name: string; grund: string }[]; titel: string; format: string }

// Tierzahlen aus Namen wie „50 + 1“, „Koog West 50+1 +12 L“, „120“, „80 Schafe 2 Böcke 15 Lämmer“
const ZAHL_WORT = /^(koppel|fenne|parzelle|weide|feld|schlag|nr|nummer|stall|tor|deich|abschnitt|km|haus|hof|gruppe|herde|kamp|block)$/i
export function tierAusName(roh: string): { titel: string; schafe: number; boecke: number; laemmer: number; gefunden: boolean } {
  let s = ` ${roh.replace(/\s+/g, ' ')} `
  let schafe = 0, boecke = 0, laemmer = 0, gefunden = false
  const weg = (re: RegExp, f: (m: RegExpMatchArray) => void) => { s = s.replace(re, (...a) => { f(a as unknown as RegExpMatchArray); gefunden = true; return ' ' }) }
  weg(/\+?\s*(\d{1,4})\s*(?:L|Lä?mmer|Laemmer|Lamm|Lä\.?)(?![\p{L}])/giu, (m) => (laemmer += +m[1]))
  weg(/(\d{1,4})\s*(?:Schafe?|Mutterschafe?|MS|Mütter)(?![\p{L}])/giu, (m) => (schafe += +m[1]))
  weg(/(\d{1,4})\s*(?:Böcke|Bock|Boecke|B)(?![\p{L}])/giu, (m) => (boecke += +m[1]))
  weg(/(?<![\p{L}\d.,])(\d{1,4})\s*\+\s*(\d{1,4})(?![\d.,]|\s*[\p{L}])/gu, (m) => { schafe += +m[1]; boecke += +m[2] })
  // Einzelne Zahl am Anfang oder Ende = Schafe – aber nicht „Koppel 3“, „Nr. 7“, „Deich 12“
  if (!schafe && !boecke) {
    const ende = s.match(/^(.*?)(?<![\d.,:/-])(\d{1,3})\s*$/u)
    const davor = ende?.[1].trim().split(' ').pop()?.replace(/[.:]$/, '') ?? ''
    if (ende && !ZAHL_WORT.test(davor)) { schafe += +ende[2]; s = ende[1]; gefunden = true }
    else {
      const anfang = s.match(/^\s*(\d{1,3})(?![\d.,:/-])\s+(.*)$/u)
      if (anfang) { schafe += +anfang[1]; s = anfang[2]; gefunden = true }
    }
  }
  const titel = s.replace(/\s+/g, ' ').replace(/^[\s,;:·–-]+|[\s,;:·–+-]+$/g, '').trim()
  return { titel, schafe, boecke, laemmer, gefunden }
}

const kinder = (el: Element, name: string) => [...el.children].filter((c) => c.localName === name)
const kind = (el: Element, name: string) => kinder(el, name)[0] ?? null
const text = (el: Element | null) => (el?.textContent ?? '').trim()
const alle = (el: Element | Document, name: string) => [...el.getElementsByTagNameNS('*', name)]
function koordinaten(s: string): LatLng[] {
  return s.trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((x) => x.length >= 2 && Number.isFinite(x[0]) && Number.isFinite(x[1]) && Math.abs(x[1]) <= 90 && Math.abs(x[0]) <= 180).map(([lng, lat]) => ({ lat, lng }))
}
// HTML-Beschreibung (My Maps) in einfachen Text
export function htmlZuText(s: string): string {
  if (!/[<&]/.test(s)) return s.trim()
  const d = new DOMParser().parseFromString(`<div>${s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr)>/gi, '\n')}</div>`, 'text/html')
  return (d.body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}
const ohneSchluss = (l: LatLng[]) => (l.length > 1 && l[0].lat === l[l.length - 1].lat && l[0].lng === l[l.length - 1].lng ? l.slice(0, -1) : l)

export function kmlLesen(xml: string): ImportErgebnis {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length || !alle(doc, 'kml').length && !alle(doc, 'Document').length) throw new Error('Keine gültige KML-Datei')
  // Stile: id -> Farbe (IconStyle bzw. PolyStyle/LineStyle); StyleMap -> „normal“
  const stilFarbe = new Map<string, string>()
  for (const st of alle(doc, 'Style')) {
    const id = st.getAttribute('id'); if (!id) continue
    const c = text(kind(kind(st, 'IconStyle') ?? st, 'color')) || text(kind(kind(st, 'PolyStyle') ?? st, 'color')) || text(kind(kind(st, 'LineStyle') ?? st, 'color'))
    const f = hexAusKml(c) ?? (id.match(/-([0-9A-Fa-f]{6})(?:-|$)/)?.[1] ? `#${id.match(/-([0-9A-Fa-f]{6})(?:-|$)/)![1].toLowerCase()}` : null)
    if (f) stilFarbe.set(id, f)
  }
  for (const sm of alle(doc, 'StyleMap')) {
    const id = sm.getAttribute('id'); if (!id) continue
    const normal = kinder(sm, 'Pair').find((p) => text(kind(p, 'key')) === 'normal')
    const ziel = text(normal ? kind(normal, 'styleUrl') : null).replace(/^#/, '')
    if (stilFarbe.has(ziel)) stilFarbe.set(id, stilFarbe.get(ziel)!)
  }
  const farbeVon = (pm: Element) => {
    const inline = kind(pm, 'Style')
    if (inline) { const c = text(kind(kind(inline, 'IconStyle') ?? inline, 'color')) || text(kind(kind(inline, 'PolyStyle') ?? inline, 'color')); const f = hexAusKml(c); if (f) return f }
    return stilFarbe.get(text(kind(pm, 'styleUrl')).replace(/^#/, '')) ?? null
  }
  const docEl = alle(doc, 'Document')[0] ?? doc.documentElement
  const titel = text(kind(docEl, 'name'))
  const vorschlaege: Vorschlag[] = [], uebersprungen: ImportErgebnis['uebersprungen'] = []
  for (const pm of alle(doc, 'Placemark')) {
    // oberster Ordner unter dem Dokument = Ebene (My Maps: eine Ebene je Folder)
    let ebene = '', p: Element | null = pm.parentElement
    while (p && p !== docEl) { if (p.localName === 'Folder') ebene = text(kind(p, 'name')); p = p.parentElement }
    const rohName = text(kind(pm, 'name'))
    const daten: Record<string, string> = {}
    for (const d of alle(pm, 'Data')) { const n = d.getAttribute('name'); if (n) daten[n] = text(kind(d, 'value')) }
    for (const d of alle(pm, 'SimpleData')) { const n = d.getAttribute('name'); if (n) daten[n] = text(d) }
    const beschr = htmlZuText(text(kind(pm, 'description')))
    const punkt = alle(pm, 'Point')[0], poly = alle(pm, 'Polygon')[0]
    const v: Vorschlag = { typ: 'pin', rohName, titel: rohName, ebene, farbe: farbeVon(pm), schafe: 0, boecke: 0, laemmer: 0, ausName: false, notiz: '' }
    if (punkt) {
      const k = koordinaten(text(alle(punkt, 'coordinates')[0] ?? null))
      if (!k.length) { uebersprungen.push({ name: rohName, grund: 'keine Koordinaten' }); continue }
      v.position = k[0]
    } else if (poly) {
      const ring = alle(poly, 'outerBoundaryIs')[0] ?? poly
      const k = ohneSchluss(koordinaten(text(alle(ring, 'coordinates')[0] ?? null)))
      if (k.length < 3) { uebersprungen.push({ name: rohName, grund: 'Fläche mit zu wenigen Eckpunkten' }); continue }
      v.typ = 'flaeche'; v.punkte = k
    } else {
      uebersprungen.push({ name: rohName || '(ohne Namen)', grund: alle(pm, 'LineString').length ? 'Linie/Weg (FlockMap kennt nur Nadeln und Flächen)' : 'keine Nadel oder Fläche' })
      continue
    }
    if (daten.flockmap_id) {
      // Rundreise: Datei stammt aus FlockMap -> Felder exakt übernehmen
      v.flockmapId = daten.flockmap_id
      v.titel = daten.Name ?? v.titel
      v.schafe = +daten.Schafe || 0; v.boecke = +daten['Böcke'] || 0; v.laemmer = +daten['Lämmer'] || 0
      if (/^#[0-9a-f]{6}$/i.test(daten.Farbe ?? '')) v.farbe = daten.Farbe.toLowerCase()
      if (/^\d{4}-\d{2}-\d{2}$/.test(daten.Datum ?? '')) v.datum = daten.Datum
      if (daten.Herde) v.herde = daten.Herde
      if (daten.Gruppe !== undefined) v.ebene = daten.Gruppe
      const n = beschr.indexOf('Notizen:\n'); v.notiz = n >= 0 ? beschr.slice(n + 9).trim() : ''
    } else {
      const zusatz = Object.entries(daten).filter(([k, w]) => w && !/^(name|description|beschreibung|gx_media_links)$/i.test(k)).map(([k, w]) => `${k}: ${w}`)
      v.notiz = [beschr, ...zusatz].filter(Boolean).join('\n')
    }
    vorschlaege.push(v)
  }
  return { vorschlaege, uebersprungen, titel, format: 'KML' }
}

export async function kmzLesen(daten: Uint8Array): Promise<ImportErgebnis> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const dateien = unzipSync(daten)
  const name = Object.keys(dateien).find((n) => /(^|\/)doc\.kml$/i.test(n)) ?? Object.keys(dateien).find((n) => /\.kml$/i.test(n))
  if (!name) throw new Error('In der KMZ-Datei ist keine KML-Datei')
  return { ...kmlLesen(strFromU8(dateien[name])), format: 'KMZ' }
}

export function geojsonLesen(json: unknown): ImportErgebnis {
  const j = json as { type?: string; features?: unknown[]; name?: string }
  const features = (j.type === 'FeatureCollection' ? j.features : j.type === 'Feature' ? [j] : null) as { geometry?: { type: string; coordinates: unknown }; properties?: Record<string, unknown> }[] | null
  if (!Array.isArray(features)) throw new Error('Keine GeoJSON-Datei')
  const vorschlaege: Vorschlag[] = [], uebersprungen: ImportErgebnis['uebersprungen'] = []
  for (const f of features) {
    const pr = f.properties ?? {}
    const name = String(pr.name ?? pr.Name ?? pr.title ?? pr.titel ?? '')
    const g = f.geometry
    const farbe = typeof pr['marker-color'] === 'string' ? pr['marker-color'] : typeof pr.fill === 'string' ? pr.fill : null
    const v: Vorschlag = { typ: 'pin', rohName: name, titel: name, ebene: String(pr.gruppe ?? pr.Gruppe ?? pr.layer ?? pr.folder ?? ''), farbe: farbe && /^#[0-9a-f]{6}$/i.test(farbe) ? farbe.toLowerCase() : null, schafe: 0, boecke: 0, laemmer: 0, ausName: false, notiz: htmlZuText(String(pr.description ?? pr.beschreibung ?? '')) }
    if (g?.type === 'Point') { const [lng, lat] = g.coordinates as number[]; v.position = { lat, lng } }
    else if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
      const ring = (g.type === 'Polygon' ? (g.coordinates as number[][][])[0] : (g.coordinates as number[][][][])[0][0]) ?? []
      v.typ = 'flaeche'; v.punkte = ohneSchluss(ring.map(([lng, lat]) => ({ lat, lng })))
      if (v.punkte.length < 3) { uebersprungen.push({ name, grund: 'Fläche mit zu wenigen Eckpunkten' }); continue }
    } else { uebersprungen.push({ name: name || '(ohne Namen)', grund: `${g?.type ?? 'ohne Geometrie'} wird nicht unterstützt` }); continue }
    if (v.position && !(Number.isFinite(v.position.lat) && Number.isFinite(v.position.lng))) { uebersprungen.push({ name, grund: 'ungültige Koordinaten' }); continue }
    const n = (k: string[]) => { for (const x of k) if (pr[x] !== undefined && Number.isFinite(+pr[x]!)) return Math.max(0, Math.round(+pr[x]!)); return 0 }
    v.schafe = n(['Schafe', 'schafe']); v.boecke = n(['Böcke', 'boecke', 'Boecke']); v.laemmer = n(['Lämmer', 'laemmer', 'Laemmer'])
    v.feldZahlen = ['Schafe', 'schafe', 'Böcke', 'boecke', 'Boecke', 'Lämmer', 'laemmer', 'Laemmer'].some((k) => pr[k] !== undefined)
    vorschlaege.push(v)
  }
  return { vorschlaege, uebersprungen, titel: String(j.name ?? ''), format: 'GeoJSON' }
}

// CSV (z. B. aus Excel): Kopfzeile mit Name, Breite/Lat, Länge/Lng/Lon, optional Gruppe, Schafe, Böcke, Lämmer, Notiz/Beschreibung, Farbe, Datum
export function csvLesen(roh: string): ImportErgebnis {
  const zeilen = roh.replace(/^\uFEFF/, '').split(/\r?\n/).filter((z) => z.trim())
  if (zeilen.length < 2) throw new Error('CSV-Datei ist leer')
  const trenner = [';', '\t', ','].sort((a, b) => zeilen[0].split(b).length - zeilen[0].split(a).length)[0]
  const teilen = (z: string) => { const out: string[] = []; let cur = '', q = false; for (let i = 0; i < z.length; i++) { const c = z[i]; if (q) { if (c === '"' && z[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c } else if (c === '"') q = true; else if (c === trenner) { out.push(cur); cur = '' } else cur += c } out.push(cur); return out.map((x) => x.trim()) }
  const kopf = teilen(zeilen[0]).map((k) => k.toLowerCase())
  const spalte = (...namen: string[]) => kopf.findIndex((k) => namen.includes(k))
  const iName = spalte('name', 'titel', 'title', 'bezeichnung'), iLat = spalte('breite', 'lat', 'latitude', 'breitengrad'), iLng = spalte('länge', 'laenge', 'lng', 'lon', 'longitude', 'längengrad')
  if (iLat < 0 || iLng < 0) throw new Error('CSV braucht Spalten „Breite“ und „Länge“ (oder lat/lng)')
  const iG = spalte('gruppe', 'ebene', 'layer'), iS = spalte('schafe'), iB = spalte('böcke', 'boecke'), iL = spalte('lämmer', 'laemmer'), iN = spalte('notiz', 'notizen', 'beschreibung', 'description'), iF = spalte('farbe'), iD = spalte('datum')
  const zahl = (s: string | undefined) => { const n = Number((s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN }
  const koord = (s: string | undefined) => Number((s ?? '').replace(',', '.'))
  const vorschlaege: Vorschlag[] = [], uebersprungen: ImportErgebnis['uebersprungen'] = []
  for (const z of zeilen.slice(1)) {
    const f = teilen(z)
    const name = iName >= 0 ? f[iName] ?? '' : ''
    const lat = koord(f[iLat]), lng = koord(f[iLng])
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { uebersprungen.push({ name: name || z.slice(0, 30), grund: 'ungültige Koordinaten' }); continue }
    const d = iD >= 0 ? f[iD] ?? '' : ''
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.test(d) ? d.replace(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, (_, t, m, j) => `${j}-${m.padStart(2, '0')}-${t.padStart(2, '0')}`) : undefined
    const farbe = iF >= 0 && /^#[0-9a-f]{6}$/i.test(f[iF] ?? '') ? f[iF].toLowerCase() : null
    vorschlaege.push({ typ: 'pin', rohName: name, titel: name, ebene: iG >= 0 ? f[iG] ?? '' : '', farbe, position: { lat, lng }, schafe: Math.max(0, zahl(f[iS]) || 0), boecke: Math.max(0, zahl(f[iB]) || 0), laemmer: Math.max(0, zahl(f[iL]) || 0), ausName: false, feldZahlen: iS >= 0 || iB >= 0 || iL >= 0, notiz: iN >= 0 ? f[iN] ?? '' : '', datum })
  }
  return { vorschlaege, uebersprungen, titel: '', format: 'CSV' }
}

export async function dateiLesen(f: File): Promise<ImportErgebnis> {
  const n = f.name.toLowerCase()
  if (n.endsWith('.kmz')) return kmzLesen(new Uint8Array(await f.arrayBuffer()))
  const t = await f.text()
  if (n.endsWith('.kml') || /^\s*<\?xml|<kml/i.test(t.slice(0, 500))) return kmlLesen(t)
  if (n.endsWith('.geojson') || (n.endsWith('.json') && /"FeatureCollection"|"Feature"/.test(t.slice(0, 2000)))) return geojsonLesen(JSON.parse(t))
  if (n.endsWith('.csv') || n.endsWith('.txt') || n.endsWith('.tsv')) return csvLesen(t)
  throw new Error('Unbekanntes Dateiformat – erlaubt sind KML, KMZ, GeoJSON und CSV')
}

// Tierzahlen aus Namen anwenden (nur wenn keine Zahlen aus Feldern kamen)
export function namenAuswerten(v: Vorschlag, an: boolean): Vorschlag {
  if (v.flockmapId || v.feldZahlen) return v
  if (!an) return { ...v, titel: v.rohName, schafe: 0, boecke: 0, laemmer: 0, ausName: false }
  const t = tierAusName(v.rohName)
  return t.gefunden ? { ...v, titel: t.titel, schafe: t.schafe, boecke: t.boecke, laemmer: t.laemmer, ausName: true } : { ...v, titel: v.rohName, ausName: false }
}

// Nächste Palettenfarbe (für Gruppenfarben aus My Maps)
export function naechstePalette(hex: string): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const a = rgb(hex)
  return GRUPPEN_FARBEN.map((f) => ({ f, d: rgb(f).reduce((s, x, i) => s + (x - a[i]) ** 2, 0) })).sort((x, y) => x.d - y.d)[0].f
}
