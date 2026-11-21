// 7q: Beim Ziehen/Einfügen von Eckpunkten darf eine Fläche (bzw. der Zaun einer Fläche) nicht in eine NACHBARFLÄCHE hineinragen.
// Gemeinsame Grenzen bleiben erlaubt (Toleranz), schon bestehende kleine Überlappungen blockieren nichts:
// abgelehnt wird nur, wenn ein Schritt die Überlappung VERGRÖSSERT.
import type { Eintrag, LatLng } from '../types'

const TOL = 2 // Meter: so nah an/auf der Nachbargrenze gilt noch als „an der Grenze“
const RASTER = 4 // Meter: Abtastschritt entlang der Kanten
type XY = [number, number]

function projektor(ref: LatLng) {
  const kx = 111320 * Math.cos((ref.lat * Math.PI) / 180), ky = 110540
  return (p: LatLng): XY => [(p.lng - ref.lng) * kx, (p.lat - ref.lat) * ky]
}
function drin(pt: XY, ring: XY[]) {
  let in_ = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) in_ = !in_
  }
  return in_
}
function abstandKante(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}
function randAbstand(p: XY, ring: XY[]) {
  let m = Infinity
  for (let i = 0; i < ring.length; i++) m = Math.min(m, abstandKante(p, ring[i], ring[(i + 1) % ring.length]))
  return m
}
const tiefDrin = (p: XY, ring: XY[]) => ring.length >= 3 && drin(p, ring) && randAbstand(p, ring) > TOL
// Länge (m) der Kanten von pts, die tief in ring liegt (Abtastung: Mitte jedes kurzen Stücks, gewichtet mit seiner Länge)
function laengeDrin(pts: XY[], offen: boolean, ring: XY[]) {
  let m = 0
  const n = pts.length
  for (let i = 0; i < (offen ? n - 1 : n); i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(l / RASTER))
    for (let s = 0; s < k; s++) { const t = (s + 0.5) / k; if (tiefDrin([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], ring)) m += l / k }
  }
  return m
}
// Maß der Überlappung mit EINER Nachbarfläche (Meter): eigener Rand in ihr + (bei Flächen) ihr Rand in uns
function mass(eig: XY[], eigRing: boolean, nb: XY[]) {
  return laengeDrin(eig, !eigRing, nb) + (eigRing && eig.length >= 3 ? laengeDrin(nb, false, eig) : 0)
}
const SPIEL = 1.5 * RASTER // Meter: Messrauschen der Abtastung

// Liefert die Nachbarfläche, in die der neue Stand hineinragt (mehr als vorher), sonst null
export function ueberlappung(e: Eintrag, vorher: LatLng[], nachher: LatLng[], alle: Eintrag[]): Eintrag | null {
  if (e.typ === 'pin') return null
  // nur Flächen und Zäune, die zu einer Fläche gehören (freie Linien dürfen z. B. als Trennzaun über Flächen laufen)
  if (e.typ === 'linie' && !e.flaeche) return null
  const ring = e.typ === 'flaeche' || (e.typ === 'linie' && !!e.geschlossen && nachher.length >= 3)
  const ref = nachher[0] ?? vorher[0]
  if (!ref) return null
  const xy = projektor(ref)
  const a = vorher.map(xy), b = nachher.map(xy)
  const eigeneFlaeche = e.typ === 'linie' ? e.flaeche : e.id
  const box = (l: XY[]) => l.reduce((m, [x, y]) => [Math.min(m[0], x), Math.min(m[1], y), Math.max(m[2], x), Math.max(m[3], y)], [Infinity, Infinity, -Infinity, -Infinity])
  const ba = box([...a, ...b])
  for (const f of alle) {
    if (f.typ !== 'flaeche' || f.id === eigeneFlaeche || f.punkte.length < 3) continue
    const nb = f.punkte.map(xy), bn = box(nb)
    if (bn[0] > ba[2] + TOL || bn[2] < ba[0] - TOL || bn[1] > ba[3] + TOL || bn[3] < ba[1] - TOL) continue // weit weg
    if (mass(b, ring, nb) > mass(a, ring && a.length >= 3, nb) + SPIEL) return f
  }
  return null
}
