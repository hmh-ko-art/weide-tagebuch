// Shapefile (ZIP mit .shp/.dbf/.prj, z. B. Flächen-Export aus dem Agrarantrag oder einem GIS) lesen – ohne Bibliothek.
// Unterstützt: Polygone, Linien und Punkte; Koordinaten in WGS84 (Grad) oder ETRS89/UTM (Zone 32/33, auch 8-stellig mit Zonen-Präfix).
// Löcher in Flächen werden nicht abgezogen; Gauß-Krüger wird nicht umgerechnet (ehrliche Fehlermeldung).
import type { LatLng } from '../types'

export interface ShpObjekt { typ: 'punkt' | 'linie' | 'flaeche'; teile: LatLng[][]; felder: Record<string, string> }

// ---- UTM (ETRS89/GRS80 ≈ WGS84) -> geographische Koordinaten ----
export function utmZuLatLng(E: number, N: number, zone: number): LatLng {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), k0 = 0.9996
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2)), ep2 = e2 / (1 - e2)
  const x = E - 500000, M = N / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256))
  const p1 = mu + (1.5 * e1 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1)
  const C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0)
  const lat = p1 - ((N1 * t) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720)
  const lng = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c
  return { lat: (lat * 180) / Math.PI, lng: (zone - 1) * 6 - 180 + 3 + (lng * 180) / Math.PI }
}

type Umrechnung = (x: number, y: number) => LatLng
function umrechnungAus(prj: string, beispiel: [number, number] | null): { f: Umrechnung; name: string } {
  const p = prj.toUpperCase()
  const zoneM = /UTM[_ ]?ZONE[_ ]?(\d{1,2})|UTM(\d{2})|ZONE[_ ](\d{2})N|_(\d{2})N"/.exec(p)
  const zone = zoneM ? Number(zoneM[1] ?? zoneM[2] ?? zoneM[3] ?? zoneM[4]) : null
  const [x, y] = beispiel ?? [0, 0]
  if (/GAUSS|DHDN|GK[_ ]?ZONE|31467|31468|31466/.test(p)) throw new Error('Die Datei ist in Gauß-Krüger (DHDN) – das kann FlockMap nicht genau umrechnen. Bitte im Programm als ETRS89/UTM, WGS84 oder als KML exportieren.')
  if (zone || /PROJCS|PROJCRS/.test(p) || Math.abs(x) > 180 || Math.abs(y) > 90) {
    // 8-stellige Ostwerte mit Zonen-Präfix (z. B. 32 500 000) – in Schleswig-Holstein üblich
    if (x > 1e7) { const z = Math.floor(x / 1e6); return { f: (a, b) => utmZuLatLng(a - z * 1e6, b, z), name: `ETRS89 / UTM Zone ${z}` } }
    const z = zone ?? 32
    if (x < 100000 || x > 900000 || y < 1000000) throw new Error('Unbekanntes Koordinatensystem – bitte als WGS84, ETRS89/UTM oder KML exportieren.')
    return { f: (a, b) => utmZuLatLng(a, b, z), name: `ETRS89 / UTM Zone ${z}${zone ? '' : ' (angenommen)'}` }
  }
  return { f: (a, b) => ({ lat: b, lng: a }), name: 'WGS84' }
}

function dekodierer(cpg: string | null): (b: Uint8Array) => string {
  const c = (cpg ?? '').trim().toLowerCase()
  const name = /utf-?8/.test(c) ? 'utf-8' : /1252|8859|latin|ansi/.test(c) ? 'windows-1252' : /850|437/.test(c) ? 'ibm866' : null
  if (name) { const d = new TextDecoder(name); return (b) => d.decode(b) }
  const u = new TextDecoder('utf-8', { fatal: true }), w = new TextDecoder('windows-1252')
  return (b) => { try { return u.decode(b) } catch { return w.decode(b) } }
}
function dbfLesen(buf: Uint8Array, cpg: string | null): Record<string, string>[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = dv.getUint32(4, true), kopf = dv.getUint16(8, true), laenge = dv.getUint16(10, true)
  const dec = dekodierer(cpg)
  const felder: { name: string; len: number }[] = []
  for (let o = 32; o + 32 <= kopf && buf[o] !== 0x0d; o += 32) {
    let e = o; while (e < o + 11 && buf[e] !== 0) e++
    felder.push({ name: new TextDecoder('latin1').decode(buf.subarray(o, e)).trim(), len: buf[o + 16] })
  }
  const aus: Record<string, string>[] = []
  for (let i = 0; i < n; i++) {
    const r = kopf + i * laenge
    if (r + laenge > buf.length) break
    let o = r + 1
    const z: Record<string, string> = {}
    for (const f of felder) { z[f.name] = dec(buf.subarray(o, o + f.len)).replace(/\0/g, '').trim(); o += f.len }
    aus.push(z)
  }
  return aus
}
// Ring-Orientierung (Shapefile: Außenring im Uhrzeigersinn, Löcher gegen den Uhrzeigersinn)
const flaeche2 = (r: [number, number][]) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (q[0] - p[0]) * (q[1] + p[1]) }, 0)

export function shpLesen(shp: Uint8Array, dbf: Uint8Array | null, prj: string, cpg: string | null): { objekte: ShpObjekt[]; system: string; uebersprungen: number } {
  const dv = new DataView(shp.buffer, shp.byteOffset, shp.byteLength)
  if (dv.getInt32(0, false) !== 9994) throw new Error('Keine gültige .shp-Datei')
  const felder = dbf ? dbfLesen(dbf, cpg) : []
  const roh: { typ: ShpObjekt['typ']; teile: [number, number][][]; i: number }[] = []
  let o = 100, i = 0, uebersprungen = 0
  while (o + 12 <= shp.length) {
    const len = dv.getInt32(o + 4, false) * 2, c = o + 8
    const t = dv.getInt32(c, true)
    if ([1, 11, 21].includes(t)) roh.push({ typ: 'punkt', teile: [[[dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true)]]], i })
    else if ([3, 13, 23, 5, 15, 25].includes(t)) {
      const np = dv.getInt32(c + 36, true), nPt = dv.getInt32(c + 40, true)
      const starts = Array.from({ length: np }, (_, j) => dv.getInt32(c + 44 + j * 4, true))
      const pt = c + 44 + np * 4
      const teile = starts.map((s, j) => { const e = j + 1 < np ? starts[j + 1] : nPt; return Array.from({ length: e - s }, (_, k) => [dv.getFloat64(pt + (s + k) * 16, true), dv.getFloat64(pt + (s + k) * 16 + 8, true)] as [number, number]) })
      roh.push({ typ: t % 10 === 3 ? 'linie' : 'flaeche', teile, i })
    } else if (t !== 0) uebersprungen++
    o = c + len; i++
  }
  const erstes = roh.find((r) => r.teile[0]?.[0])?.teile[0][0] ?? null
  const { f, name } = umrechnungAus(prj, erstes)
  const objekte: ShpObjekt[] = []
  for (const r of roh) {
    let teile = r.teile
    if (r.typ === 'flaeche') {
      // nur Außenringe (Löcher weglassen); geschlossenen Endpunkt entfernen
      const aussen = teile.filter((t) => flaeche2(t) > 0)
      teile = (aussen.length ? aussen : teile).map((t) => (t.length > 1 && t[0][0] === t[t.length - 1][0] && t[0][1] === t[t.length - 1][1] ? t.slice(0, -1) : t))
    }
    objekte.push({ typ: r.typ, teile: teile.map((t) => t.map(([x, y]) => f(x, y))), felder: felder[r.i] ?? {} })
  }
  return { objekte, system: name, uebersprungen }
}

export async function shpZipLesen(daten: Uint8Array) {
  const { unzipSync, strFromU8 } = await import('fflate')
  const dateien = unzipSync(daten)
  const namen = Object.keys(dateien).filter((n) => !n.startsWith('__MACOSX'))
  const shps = namen.filter((n) => /\.shp$/i.test(n))
  if (!shps.length) throw new Error('Im ZIP ist keine Shapefile-Datei (.shp)')
  const objekte: ShpObjekt[] = [], systeme = new Set<string>()
  let uebersprungen = 0
  for (const s of shps) {
    const basis = s.slice(0, -4)
    const finde = (ext: string) => namen.find((n) => n.toLowerCase() === `${basis}.${ext}`.toLowerCase())
    const dbf = finde('dbf'), prj = finde('prj'), cpg = finde('cpg')
    const r = shpLesen(dateien[s], dbf ? dateien[dbf] : null, prj ? strFromU8(dateien[prj]) : '', cpg ? strFromU8(dateien[cpg]) : null)
    objekte.push(...r.objekte); systeme.add(r.system); uebersprungen += r.uebersprungen
  }
  return { objekte, system: [...systeme].join(', '), uebersprungen }
}
