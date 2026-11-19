// KML-Export (Google Earth / Google My Maps) und Import von KML/KMZ (My Maps), GeoJSON und CSV.
import { GRUPPEN_FARBEN, type LatLng } from '../types'
import type { TechnikZeile, Zeile } from './zeilen'
import * as FL from '../../server/flaechen.js'
import type { Kreis, KreisStehen, Pacht, PachtListe, Steckbrief } from '../../server/flaechen.js'
import type { Eintrag } from '../types'
import { INFRA_ARTEN, infraArt, infraRaten, laengeText, linienArt, linienArtRaten, type Geraet, type InfraArt, type LinienArt, type Tor } from '../../server/infrastruktur.js'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// KML-Farben sind aabbggrr
const kmlFarbe = (hex: string, alpha = 'ff') => { const h = hex.replace('#', '').toLowerCase(); return `${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}` }
const hexAusKml = (c: string) => { const h = c.trim().toLowerCase().replace(/^#/, ''); return /^[0-9a-f]{8}$/.test(h) ? `#${h.slice(6, 8)}${h.slice(4, 6)}${h.slice(2, 4)}` : null }

// ---------------- Export ----------------
export function kmlErzeugen(titel: string, zeilen: Zeile[], gruppenReihe: { id: string | null; name: string; farbe: string }[], technik: TechnikZeile[] = [], pacht: PachtListe | null = null, kreisQuelle: Eintrag[] = []): string {
  const farben = [...new Set(zeilen.map((z) => z.farbe))]
  const styles = farben.map((f) => `<Style id="f-${f.slice(1)}"><IconStyle><color>${kmlFarbe(f)}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-blank.png</href></Icon><hotSpot x="32" y="1" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle><LineStyle><color>${kmlFarbe(f)}</color><width>2</width></LineStyle><PolyStyle><color>${kmlFarbe(f, '59')}</color></PolyStyle></Style>`)
  const placemark = (z: Zeile) => {
    const daten: [string, string | number][] = [['flockmap_id', z.e.id], ['Name', z.name], ['Typ', z.typ], ['Gruppe', z.gruppe], ['Nr', z.nr ?? ''], ['Schafe', z.schafe], ['Böcke', z.boecke], ['Lämmer', z.laemmer], ['Herde', z.herde], ['Farbe', z.farbe], ['Datum', z.datum], ...(z.typ === 'Fläche' ? [['Hektar', z.ha.toFixed(2)] as [string, string]] : [])]
    // Flächen: Steckbrief lesbar + exakt (flockmap_steckbrief); Pacht nur, wenn ausdrücklich mit exportiert
    const sb = z.e.typ === 'flaeche' ? z.e.steckbrief : undefined
    const pa = z.e.typ === 'flaeche' && pacht ? pacht[z.e.id] : undefined
    if (sb) {
      daten.push(['flockmap_steckbrief', JSON.stringify({ ...sb, fristen: sb.fristen?.map((f) => (f.erledigt ? { ...f, erledigt: { datum: f.erledigt.datum, ...(f.erledigt.autor ? { autor: f.erledigt.autor } : {}) } } : f)) })])
      if (sb.art) daten.push(['Flächenart', FL.flaechenArt(sb.art)?.name ?? ''])
      if (sb.besitz) daten.push(['Eigentum/Pacht', sb.besitz === 'pacht' ? 'Pacht' : 'Eigentum'])
      if (sb.flik) daten.push(['FLIK', sb.flik])
      if (sb.schlag) daten.push(['Schlag', sb.schlag])
      if (sb.programme?.length) daten.push(['Förderprogramme', sb.programme.join(', ')])
    }
    if (pa) daten.push(['flockmap_pacht', JSON.stringify(pa)])
    const sbText = sb ? [sb.art && FL.flaechenArt(sb.art)?.name, sb.besitz && (sb.besitz === 'pacht' ? 'Pacht' : 'Eigentum'), sb.flik && `FLIK ${sb.flik}`, sb.schlag && `Schlag ${sb.schlag}`, sb.programme?.join(', ')].filter(Boolean).join(' · ') : ''
    const beschreibung = [z.kurz && `Tiere: ${z.kurz}`, z.herde && `Herde: ${z.herde}`, `Datum: ${z.datum.split('-').reverse().join('.')}`, z.typ === 'Fläche' ? `Fläche: ${z.ha.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha` : '', sbText, z.notizen && `Notizen:\n${z.notizen}`].filter(Boolean).join('\n')
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
  // Zäune & Wege als Linien (Stil je Art), Weide-Technik als Punkte; flockmap_technik = exakte Felder für die Rundreise
  const tStile = [...new Set(technik.filter((t) => t.gattung === 'Linie').map((t) => t.farbe))].map((f) => `<Style id="l-${f.slice(1)}"><LineStyle><color>${kmlFarbe(f)}</color><width>4</width></LineStyle></Style>`)
    .concat(INFRA_ARTEN.filter((a) => technik.some((t) => t.artWert === a.wert)).map((a) => `<Style id="i-${a.wert}"><IconStyle><color>${kmlFarbe(a.farbe)}</color><scale>1</scale><Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`))
  const tPlacemark = (t: TechnikZeile) => {
    const e = t.e
    const technikFelder = e.typ === 'linie' ? { linienArt: e.linienArt, ...(e.geschlossen ? { geschlossen: true } : {}), ...(e.tore?.length ? { tore: e.tore } : {}), ...(e.flaeche ? { flaeche: e.flaeche } : {}), ...(e.farbe ? { farbe: e.farbe } : {}) }
      : e.typ === 'pin' ? { infra: e.infra, ...(e.geraet ? { geraet: { ...e.geraet, pruefungen: (e.geraet.pruefungen ?? []).map(({ autorId: _a, ...p }) => p) } } : {}) } : {}
    const daten: [string, string][] = [['flockmap_id', e.id], ['flockmap_technik', JSON.stringify(technikFelder)], ['Art', t.art], ['Name', t.name], ...(t.laenge != null ? [['Länge (m)', String(Math.round(t.laenge))] as [string, string]] : []), ...(t.netze != null ? [['Netze à 50 m', String(t.netze)] as [string, string]] : []), ...(t.geprueft ? [['Zuletzt geprüft', t.geprueft] as [string, string]] : []), ...(t.kv != null ? [['Spannung (kV)', String(t.kv)] as [string, string]] : [])]
    const beschreibung = [t.art, t.laenge != null && `Länge: ${laengeText(t.laenge)}${t.netze != null ? ` (${t.netze} Netze à 50 m)` : ''}`, t.tore && `${t.tore} Tor(e)`, t.geprueft && `Zuletzt geprüft: ${t.geprueft.split('-').reverse().join('.')}`, t.kv != null && `Spannung: ${String(t.kv).replace('.', ',')} kV`, t.stand && `Ladestand: ${t.stand}`, t.notizen && `Notizen:\n${t.notizen}`].filter(Boolean).join('\n')
    const geo = e.typ === 'linie'
      ? `<LineString><tessellate>1</tessellate><coordinates>${[...e.punkte, ...(e.geschlossen ? [e.punkte[0]] : [])].map((p) => `${p.lng.toFixed(7)},${p.lat.toFixed(7)},0`).join(' ')}</coordinates></LineString>`
      : e.typ === 'pin' ? `<Point><coordinates>${e.position.lng.toFixed(7)},${e.position.lat.toFixed(7)},0</coordinates></Point>` : ''
    return `<Placemark><name>${esc(t.name || t.art)}</name><description>${esc(beschreibung)}</description><styleUrl>#${e.typ === 'linie' ? `l-${t.farbe.slice(1)}` : `i-${t.artWert}`}</styleUrl><ExtendedData>${daten.map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join('')}</ExtendedData>${geo}</Placemark>`
  }
  const lin = technik.filter((t) => t.gattung === 'Linie'), pkt = technik.filter((t) => t.gattung === 'Punkt')
  const tOrdner = (lin.length ? `<Folder><name>Zäune &amp; Wege</name>${lin.map(tPlacemark).join('')}</Folder>` : '') + (pkt.length ? `<Folder><name>Wasser &amp; Technik</name>${pkt.map(tPlacemark).join('')}</Folder>` : '')
  // Kreise um Nadeln als Vieleck (Google Earth/My Maps kennen keine Kreise); flockmap_kreis = exakt für die Rundreise
  const kreisPm = kreisQuelle.flatMap((e) => FL.alleKreise(e).map((ak) => ({ p: e as Extract<Eintrag, { typ: 'pin' }>, ...ak }))).map(({ p, kreis: k, mitte: mi, stehenId }) => {
    const m = FL.kreisMasse(k.radius), f = k.farbe || '#ff9800'
    const ring = FL.kreisPolygon(mi, k.radius)
    const daten: [string, string][] = [['flockmap_kreis_fuer', p.id], ['flockmap_kreis', JSON.stringify(k)], ...(stehenId ? [['flockmap_kreis_stehen', '1'] as [string, string]] : []), ...(p.frei ? [['flockmap_kreis_frei', '1'] as [string, string]] : []), ['Nadel', p.titel || ''], ['Radius (m)', String(k.radius)], ['Fläche (ha, ≈)', m.ha.toFixed(3)], ['Umfang (m)', String(Math.round(m.umfang))], [`Netze à ${FL.NETZ_LAENGE} m`, String(m.netze)], ['Verhalten', stehenId ? 'alter Standort (bleibt stehen)' : k.gebunden === false ? 'bleibt am Standort' : 'an Nadel gebunden']]
    return `<Placemark><name>${esc(`◯ ${p.frei ? `Freier Kreis${p.titel ? ` ${p.titel}` : ''}` : p.titel || 'Nadel'}${stehenId ? ' · alter Standort' : ''} (${k.radius} m)`)}</name><description>${esc(`${p.frei ? 'Freier Kreis (ohne Nadel)' : 'Eingezäunt'}: Kreis ${k.radius} m · ${FL.haText(m.ha)} · Umfang ${FL.umfangText(m.umfang)}`)}</description><Style><LineStyle><color>${kmlFarbe(f)}</color><width>3</width></LineStyle><PolyStyle><color>${kmlFarbe(f, '40')}</color></PolyStyle></Style><ExtendedData>${daten.map(([a, b]) => `<Data name="${esc(a)}"><value>${esc(b)}</value></Data>`).join('')}</ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>${[...ring, ring[0]].map((q) => `${q.lng.toFixed(7)},${q.lat.toFixed(7)},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`
  })
  const kOrdner = kreisPm.length ? `<Folder><name>Einkreisungen</name>${kreisPm.join('')}</Folder>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(titel)}</name><description>Export aus FlockMap, ${new Date().toLocaleString('de-DE')}</description>${styles.join('')}${tStile.join('')}${ordner.join('')}${tOrdner}${kOrdner}</Document></kml>`
}

// ---------------- Import ----------------
export interface Vorschlag {
  typ: 'pin' | 'flaeche' | 'linie'
  linienArt?: LinienArt; geschlossen?: boolean; tore?: Tor[]; flaeche?: string // Linie (Zaun/Weg/Graben)
  infra?: InfraArt; geraet?: Geraet // Weide-Technik (nur aus FlockMap-Export exakt; sonst per Name erkannt)
  linienFarbe?: string | null
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
  steckbrief?: Steckbrief // Flächen: Art, FLIK/Schlag, Förderung (aus FlockMap exakt, sonst aus Feldern wie FLIK/SCHLAG_NR erkannt)
  kreis?: Kreis // Kreis um Nadel (aus FlockMap-Export)
  kreiseStehen?: KreisStehen[] // Kreise am alten Standort (aus FlockMap-Export)
  pacht?: Pacht // nur aus FlockMap-Export mit Pachtdaten; übernommen nur von Admins
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
  const stilFarbe = new Map<string, string>(), stilLinie = new Map<string, string>()
  for (const st of alle(doc, 'Style')) {
    const id = st.getAttribute('id'); if (!id) continue
    const lf = hexAusKml(text(kind(kind(st, 'LineStyle') ?? st, 'color'))); if (lf && kind(st, 'LineStyle')) stilLinie.set(id, lf)
    const c = text(kind(kind(st, 'IconStyle') ?? st, 'color')) || text(kind(kind(st, 'PolyStyle') ?? st, 'color')) || text(kind(kind(st, 'LineStyle') ?? st, 'color'))
    const f = hexAusKml(c) ?? (id.match(/-([0-9A-Fa-f]{6})(?:-|$)/)?.[1] ? `#${id.match(/-([0-9A-Fa-f]{6})(?:-|$)/)![1].toLowerCase()}` : null)
    if (f) stilFarbe.set(id, f)
  }
  for (const sm of alle(doc, 'StyleMap')) {
    const id = sm.getAttribute('id'); if (!id) continue
    const normal = kinder(sm, 'Pair').find((p) => text(kind(p, 'key')) === 'normal')
    const ziel = text(normal ? kind(normal, 'styleUrl') : null).replace(/^#/, '')
    if (stilFarbe.has(ziel)) stilFarbe.set(id, stilFarbe.get(ziel)!)
    if (stilLinie.has(ziel)) stilLinie.set(id, stilLinie.get(ziel)!)
  }
  const linienFarbeVon = (pm: Element) => {
    const inline = kind(pm, 'Style')
    if (inline) { const f = hexAusKml(text(kind(kind(inline, 'LineStyle') ?? inline, 'color'))); if (f) return f }
    return stilLinie.get(text(kind(pm, 'styleUrl')).replace(/^#/, '')) ?? null
  }
  const farbeVon = (pm: Element) => {
    const inline = kind(pm, 'Style')
    if (inline) { const c = text(kind(kind(inline, 'IconStyle') ?? inline, 'color')) || text(kind(kind(inline, 'PolyStyle') ?? inline, 'color')); const f = hexAusKml(c); if (f) return f }
    return stilFarbe.get(text(kind(pm, 'styleUrl')).replace(/^#/, '')) ?? null
  }
  const docEl = alle(doc, 'Document')[0] ?? doc.documentElement
  const titel = text(kind(docEl, 'name'))
  const vorschlaege: Vorschlag[] = [], uebersprungen: ImportErgebnis['uebersprungen'] = []
  const kreisRoh: { fuer: string; roh: string; pm: Element; stehen: boolean }[] = []
  for (const pm of alle(doc, 'Placemark')) {
    // oberster Ordner unter dem Dokument = Ebene (My Maps: eine Ebene je Folder)
    let ebene = '', p: Element | null = pm.parentElement
    while (p && p !== docEl) { if (p.localName === 'Folder') ebene = text(kind(p, 'name')); p = p.parentElement }
    const rohName = text(kind(pm, 'name'))
    const daten: Record<string, string> = {}
    for (const d of alle(pm, 'Data')) { const n = d.getAttribute('name'); if (n) daten[n] = text(kind(d, 'value')) }
    for (const d of alle(pm, 'SimpleData')) { const n = d.getAttribute('name'); if (n) daten[n] = text(d) }
    // Kreis um eine Nadel aus einem FlockMap-Export: an die Nadel hängen statt eigene Fläche
    if (daten.flockmap_kreis_fuer && daten.flockmap_kreis) { kreisRoh.push({ fuer: daten.flockmap_kreis_fuer, roh: daten.flockmap_kreis, pm, stehen: daten.flockmap_kreis_stehen === '1' }); continue }
    const beschr = htmlZuText(text(kind(pm, 'description')))
    const punkt = alle(pm, 'Point')[0], poly = alle(pm, 'Polygon')[0], linien = alle(pm, 'LineString')
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
    } else if (linien.length) {
      // Linie (My Maps: Linie/Weg zeichnen) -> Zaun/Weg/Graben; Art aus Name/Ebene geraten, Farbe aus dem Linienstil
      const teile = linien.map((l) => koordinaten(text(alle(l, 'coordinates')[0] ?? null))).filter((k) => k.length >= 2)
      if (!teile.length) { uebersprungen.push({ name: rohName || '(ohne Namen)', grund: 'Linie mit zu wenigen Punkten' }); continue }
      v.typ = 'linie'; v.linienArt = linienArtRaten(`${rohName} ${ebene}`); v.farbe = linienFarbeVon(pm) ?? v.farbe
      v.punkte = teile[0]
      // MultiGeometry mit mehreren Linien: jede wird eine eigene Linie
      for (let i = 1; i < teile.length; i++) vorschlaege.push({ ...v, rohName: `${rohName} (${i + 1})`, titel: `${rohName} (${i + 1})`, punkte: teile[i], notiz: htmlZuText(text(kind(pm, 'description'))) })
    } else {
      uebersprungen.push({ name: rohName || '(ohne Namen)', grund: 'keine Nadel, Fläche oder Linie' })
      continue
    }
    if (v.typ === 'linie' && v.punkte && v.punkte.length >= 4) {
      // geschlossene Linie (Ring) erkennen
      const a = v.punkte[0], b = v.punkte[v.punkte.length - 1]
      if (Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7) { v.punkte = v.punkte.slice(0, -1); v.geschlossen = true }
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
      if (daten.flockmap_technik) technikUebernehmen(v, daten.flockmap_technik)
      if (v.typ === 'flaeche') flaechenDatenUebernehmen(v, daten.flockmap_steckbrief, daten.flockmap_pacht)
    } else {
      const zusatz = Object.entries(daten).filter(([k, w]) => w && !/^(name|description|beschreibung|gx_media_links)$/i.test(k)).map(([k, w]) => `${k}: ${w}`)
      v.notiz = [beschr, ...zusatz].filter(Boolean).join('\n')
      if (v.typ === 'flaeche') steckbriefAusFeldern(v, daten)
    }
    vorschlaege.push(v)
  }
  for (const kr of kreisRoh) {
    const pin = vorschlaege.find((v) => v.typ === 'pin' && v.flockmapId === kr.fuer)
    let k: Kreis | null = null, st: KreisStehen[] = []
    try { if (kr.stehen) st = FL.kreiseStehenSauber([JSON.parse(kr.roh)]); else k = FL.kreisSauber(JSON.parse(kr.roh), pin?.position) } catch { /* kaputt */ }
    if (pin && st.length) pin.kreiseStehen = FL.kreiseStehenSauber([...(pin.kreiseStehen ?? []), ...st])
    else if (pin && k) pin.kreis = k
    else uebersprungen.push({ name: text(kind(kr.pm, 'name')) || 'Kreis', grund: 'Kreis ohne zugehörige Nadel (Nadel nicht in der Datei)' })
  }
  return { vorschlaege, uebersprungen, titel, format: 'KML' }
}

// Flächen-Steckbrief/Pacht aus einem FlockMap-Export (JSON-Text oder Objekt)
function flaechenDatenUebernehmen(v: Vorschlag, sb: unknown, pa: unknown) {
  const json = (x: unknown) => { if (typeof x !== 'string') return x; try { return JSON.parse(x) } catch { return null } }
  const s = FL.steckbriefSauber(json(sb))
  if (s) v.steckbrief = { ...s, fristen: s.fristen?.map((f) => (f.erledigt ? { ...f, erledigt: { datum: f.erledigt.datum, ...(f.erledigt.autor ? { autor: f.erledigt.autor } : {}) } } : f)) }
  const p = FL.pachtSauber(json(pa))
  if (p) v.pacht = p
}
// Fremde Dateien (Agrarantrag, GIS): FLIK/Feldblock, Schlag-Nr., Schlagname und Nutzung an üblichen Feldnamen erkennen
export function steckbriefAusFeldern(v: Vorschlag, felder: Record<string, unknown>) {
  // Feldnamen vereinheitlichen: „Schlag-Nr.“, „SCHLAG_NR“, „schlagnr“ -> „schlagnr“
  const norm = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
  const finde = (re: RegExp) => { for (const [k, w] of Object.entries(felder)) if (re.test(norm(k)) && w !== null && w !== undefined && String(w).trim()) return String(w).trim(); return '' }
  const flik = finde(/^(flik|flek|feldblock|feldblockident|feldblockid|fbident|fbi|fbnr|feldblocknr|feldblocknummer)$/)
  const schlag = finde(/^(schlag|schlagnr|schlagnummer|slnr|schlagid|teilschlag)$/)
  const name = finde(/^(schlagname|schlagbez|bezeichnung|bezeichnun|flurname|name)$/)
  const nutzung = finde(/^(nutzung|nutzart|nutzungsart|kultur|codebez|ncbez|hnf|bodennutzung|nutzungbez)$/).toLowerCase()
  const art = /deich/.test(nutzung) ? 'deich' : /vorland|salzwiese/.test(nutzung) ? 'vorland' : /gr[uü]n|wiese|weide|mähweide|maehweide/.test(nutzung) ? 'gruenland' : /klee|feldgras|ackergras|ackerfutter|luzerne/.test(nutzung) ? 'ackerfutter' : undefined
  const s = FL.steckbriefSauber({ ...(v.steckbrief ?? {}), flik: flik || undefined, schlag: schlag || undefined, art })
  if (s) v.steckbrief = s
  if (!v.rohName.trim()) { const t = name || (schlag ? `Schlag ${schlag}` : flik ? `Feldblock ${flik}` : ''); if (t) { v.rohName = t; v.titel = t } }
}

// Exakte Felder aus einem FlockMap-Export (Zäune & Wasser) übernehmen; ungültiges wird ignoriert (Server prüft zusätzlich)
function technikUebernehmen(v: Vorschlag, roh: string) {
  try {
    const t = JSON.parse(roh) as Record<string, unknown>
    if (v.typ === 'linie') {
      if (typeof t.linienArt === 'string') v.linienArt = linienArt(t.linienArt).wert
      v.geschlossen = t.geschlossen === true || v.geschlossen
      if (Array.isArray(t.tore)) v.tore = (t.tore as Tor[]).filter((x) => x && typeof x.id === 'string' && Number.isFinite(x.pos) && Number.isFinite(x.breite)).slice(0, 50)
      if (typeof t.flaeche === 'string') v.flaeche = t.flaeche
      if (typeof t.farbe === 'string' && /^#[0-9a-f]{6}$/i.test(t.farbe)) v.farbe = t.farbe.toLowerCase(); else if (!t.farbe) v.farbe = null
    } else if (v.typ === 'pin' && infraArt(String(t.infra))) {
      v.infra = t.infra as InfraArt
      if (t.geraet && typeof t.geraet === 'object') v.geraet = t.geraet as Geraet
    }
  } catch { /* alte oder fremde Datei */ }
}

// Weide-Technik an Namen erkennen (z. B. „Tränke Siel“, „Weidezaungerät Nord“) – nur fremde Dateien
export function technikAusName(v: Vorschlag, an: boolean): Vorschlag {
  if (v.typ !== 'pin' || v.flockmapId) return v
  if (!an) return v.infra ? { ...v, infra: undefined, geraet: undefined } : v
  const i = infraRaten(v.rohName)
  return i ? { ...v, infra: i, ...(i === 'geraet' ? { geraet: v.geraet ?? {} } : {}) } : v
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
    const teilflaechen: Vorschlag[] = []
    const name = String(pr.name ?? pr.Name ?? pr.title ?? pr.titel ?? '')
    const g = f.geometry
    const farbe = typeof pr['marker-color'] === 'string' ? pr['marker-color'] : typeof pr.fill === 'string' ? pr.fill : null
    const v: Vorschlag = { typ: 'pin', rohName: name, titel: name, ebene: String(pr.gruppe ?? pr.Gruppe ?? pr.layer ?? pr.folder ?? ''), farbe: farbe && /^#[0-9a-f]{6}$/i.test(farbe) ? farbe.toLowerCase() : null, schafe: 0, boecke: 0, laemmer: 0, ausName: false, notiz: htmlZuText(String(pr.description ?? pr.beschreibung ?? '')) }
    if (g?.type === 'Point') { const [lng, lat] = g.coordinates as number[]; v.position = { lat, lng } }
    else if (g?.type === 'Polygon' || g?.type === 'MultiPolygon') {
      const ring = (g.type === 'Polygon' ? (g.coordinates as number[][][])[0] : (g.coordinates as number[][][][])[0][0]) ?? []
      v.typ = 'flaeche'; v.punkte = ohneSchluss(ring.map(([lng, lat]) => ({ lat, lng })))
      if (v.punkte.length < 3) { uebersprungen.push({ name, grund: 'Fläche mit zu wenigen Eckpunkten' }); continue }
      if (pr.flockmap_steckbrief || pr.flockmap_pacht) flaechenDatenUebernehmen(v, pr.flockmap_steckbrief, pr.flockmap_pacht); else steckbriefAusFeldern(v, pr)
      // MultiPolygon: weitere Teilflächen als eigene Flächen
      if (g.type === 'MultiPolygon') for (const [i, poly] of (g.coordinates as number[][][][]).slice(1).entries()) {
        const pk = ohneSchluss((poly[0] ?? []).map(([lng, lat]) => ({ lat, lng })))
        if (pk.length >= 3) teilflaechen.push({ ...v, rohName: `${v.rohName || 'Fläche'} (${i + 2})`, titel: `${v.titel || 'Fläche'} (${i + 2})`, punkte: pk })
      }
    } else if (g?.type === 'LineString' || g?.type === 'MultiLineString') {
      const teile = (g.type === 'LineString' ? [g.coordinates as number[][]] : (g.coordinates as number[][][])).map((l) => (l ?? []).map(([lng, lat]) => ({ lat, lng })).filter((q) => Number.isFinite(q.lat) && Number.isFinite(q.lng))).filter((l) => l.length >= 2)
      if (!teile.length) { uebersprungen.push({ name: name || '(ohne Namen)', grund: 'Linie mit zu wenigen Punkten' }); continue }
      const stroke = typeof pr.stroke === 'string' && /^#[0-9a-f]{6}$/i.test(pr.stroke) ? pr.stroke.toLowerCase() : null
      v.typ = 'linie'; v.linienArt = linienArtRaten(`${name} ${v.ebene}`); v.farbe = stroke ?? v.farbe; v.punkte = teile[0]
      for (let i = 1; i < teile.length; i++) vorschlaege.push({ ...v, rohName: `${name} (${i + 1})`, titel: `${name} (${i + 1})`, punkte: teile[i] })
      if (typeof pr.flockmap_technik === 'string') technikUebernehmen(v, pr.flockmap_technik)
    } else { uebersprungen.push({ name: name || '(ohne Namen)', grund: `${g?.type ?? 'ohne Geometrie'} wird nicht unterstützt` }); continue }
    if (v.position && !(Number.isFinite(v.position.lat) && Number.isFinite(v.position.lng))) { uebersprungen.push({ name, grund: 'ungültige Koordinaten' }); continue }
    const n = (k: string[]) => { for (const x of k) if (pr[x] !== undefined && Number.isFinite(+pr[x]!)) return Math.max(0, Math.round(+pr[x]!)); return 0 }
    v.schafe = n(['Schafe', 'schafe']); v.boecke = n(['Böcke', 'boecke', 'Boecke']); v.laemmer = n(['Lämmer', 'laemmer', 'Laemmer'])
    v.feldZahlen = ['Schafe', 'schafe', 'Böcke', 'boecke', 'Boecke', 'Lämmer', 'laemmer', 'Laemmer'].some((k) => pr[k] !== undefined)
    vorschlaege.push(v, ...teilflaechen)
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
  if (n.endsWith('.zip')) return shapefileLesen(new Uint8Array(await f.arrayBuffer()))
  if (n.endsWith('.shp')) throw new Error('Bitte die Shapefile als ZIP importieren (mit .shp, .dbf und .prj zusammen gepackt)')
  const t = await f.text()
  if (n.endsWith('.kml') || /^\s*<\?xml|<kml/i.test(t.slice(0, 500))) return kmlLesen(t)
  if (n.endsWith('.geojson') || (n.endsWith('.json') && /"FeatureCollection"|"Feature"/.test(t.slice(0, 2000)))) return geojsonLesen(JSON.parse(t))
  if (n.endsWith('.csv') || n.endsWith('.txt') || n.endsWith('.tsv')) return csvLesen(t)
  throw new Error('Unbekanntes Dateiformat – erlaubt sind KML, KMZ, GeoJSON, Shapefile (ZIP) und CSV')
}

// Shapefile im ZIP (z. B. Flächen aus dem Agrarantrag) -> Vorschläge; Attribute werden zur Notiz, FLIK/Schlag zum Steckbrief
export async function shapefileLesen(daten: Uint8Array): Promise<ImportErgebnis> {
  const { shpZipLesen } = await import('./shp')
  const r = await shpZipLesen(daten)
  const vorschlaege: Vorschlag[] = [], uebersprungen: ImportErgebnis['uebersprungen'] = []
  if (r.uebersprungen) uebersprungen.push({ name: `${r.uebersprungen} Objekte`, grund: 'Geometrie-Typ wird nicht unterstützt' })
  for (const o of r.objekte) {
    const felder = o.felder
    const zusatz = Object.entries(felder).filter(([, w]) => w).map(([k, w]) => `${k}: ${w}`).join('\n')
    const basis: Vorschlag = { typ: 'pin', rohName: '', titel: '', ebene: '', farbe: null, schafe: 0, boecke: 0, laemmer: 0, ausName: false, feldZahlen: true, notiz: zusatz }
    o.teile.forEach((t, i) => {
      const ok = t.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
      const v: Vorschlag = { ...basis }
      steckbriefAusFeldern(v, felder)
      if (i > 0) { v.rohName = `${v.rohName || 'Fläche'} (${i + 1})`; v.titel = v.rohName }
      if (!ok) { uebersprungen.push({ name: v.rohName || '(ohne Namen)', grund: 'ungültige Koordinaten' }); return }
      if (o.typ === 'punkt') { v.position = t[0]; delete v.steckbrief }
      else if (o.typ === 'linie') { if (t.length < 2) return; v.typ = 'linie'; v.punkte = t; v.linienArt = linienArtRaten(v.rohName); delete v.steckbrief }
      else { if (t.length < 3) { uebersprungen.push({ name: v.rohName || '(ohne Namen)', grund: 'Fläche mit zu wenigen Eckpunkten' }); return } v.typ = 'flaeche'; v.punkte = t }
      vorschlaege.push(v)
    })
  }
  return { vorschlaege, uebersprungen, titel: r.system, format: 'Shapefile' }
}

// Tierzahlen aus Namen anwenden (nur wenn keine Zahlen aus Feldern kamen)
export function namenAuswerten(v: Vorschlag, an: boolean): Vorschlag {
  if (v.flockmapId || v.feldZahlen) return v
  if (v.typ === 'linie' || v.infra) return { ...v, titel: v.rohName, schafe: 0, boecke: 0, laemmer: 0, ausName: false } // Zäune & Technik haben keine Tiere
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
