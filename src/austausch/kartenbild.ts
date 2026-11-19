// Übersichtskarte für den PDF-Bericht: Satellitenbild (Esri, dieselben Kacheln wie in der App – offline aus dem
// Kartenspeicher, sofern schon angesehen) + Flächen + Nadeln mit Gruppennummer. Quellenangabe wird eingezeichnet.
import type { Zeile } from './zeilen'
import type { Eintrag } from '../types'
import { pinFarbe } from '../types'
import { INFRA_ARTEN, istInfra, istLinie, linienArt, linienStuecke } from '../../server/infrastruktur.js'

const INFRA_BUCHSTABE: Record<string, string> = { traenke: 'W', geraet: 'Z', tor: 'T', unterstand: 'U', salz: 'S' }

const KACHEL = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
const px = (lng: number, z: number) => ((lng + 180) / 360) * 256 * 2 ** z
const py = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z }
export const QUELLE = 'Satellitenbild: Esri, Maxar, Earthstar Geographics'

async function kachelLaden(url: string, ms = 8000): Promise<ImageBitmap | null> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    const r = await fetch(url, { mode: 'cors', signal: ac.signal })
    if (!r.ok) return null
    return await createImageBitmap(await r.blob())
  } catch { return null } finally { clearTimeout(t) }
}

export async function kartenbild(zeilen: Zeile[], W = 1500, H = 1000, technik: Eintrag[] = []): Promise<{ bild: string; kacheln: number; fehlend: number } | null> {
  const punkte = [...zeilen, ...technik.map((e) => ({ e }))].flatMap((z) => (z.e.typ === 'pin' ? [z.e.position] : z.e.punkte))
  if (!punkte.length) return null
  const nord = Math.max(...punkte.map((p) => p.lat)), sued = Math.min(...punkte.map((p) => p.lat))
  const west = Math.min(...punkte.map((p) => p.lng)), ost = Math.max(...punkte.map((p) => p.lng))
  let z = 16
  while (z > 3 && (px(ost, z) - px(west, z) > W * 0.84 || py(sued, z) - py(nord, z) > H * 0.84)) z--
  if (punkte.length === 1) z = 16
  const cx = (px(west, z) + px(ost, z)) / 2, cy = (py(nord, z) + py(sued, z)) / 2
  const links = cx - W / 2, oben = cy - H / 2
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#c9cfc4'; g.fillRect(0, 0, W, H)
  const n = 2 ** z
  const auftraege: Promise<void>[] = []
  let kacheln = 0, fehlend = 0
  for (let tx = Math.floor(links / 256); tx <= Math.floor((links + W) / 256); tx++) {
    for (let ty = Math.floor(oben / 256); ty <= Math.floor((oben + H) / 256); ty++) {
      if (ty < 0 || ty >= n) continue
      const x = ((tx % n) + n) % n
      auftraege.push(kachelLaden(KACHEL(z, x, ty)).then((b) => { if (b) { g.drawImage(b, tx * 256 - links, ty * 256 - oben); kacheln++ } else fehlend++ }))
    }
  }
  await Promise.all(auftraege)
  const xy = (p: { lat: number; lng: number }) => [px(p.lng, z) - links, py(p.lat, z) - oben] as const
  // Flächen
  for (const zl of zeilen) {
    if (zl.e.typ !== 'flaeche') continue
    g.beginPath()
    zl.e.punkte.forEach((p, i) => { const [x, y] = xy(p); if (i) g.lineTo(x, y); else g.moveTo(x, y) })
    g.closePath()
    g.globalAlpha = 0.35; g.fillStyle = zl.farbe; g.fill()
    g.globalAlpha = 1; g.lineWidth = 3; g.strokeStyle = zl.farbe; g.stroke()
  }
  // Zäune, Wege, Gräben (Tore als Lücken), Stil wie auf der Karte
  for (const e of technik) {
    if (!istLinie(e)) continue
    const a = linienArt(e.linienArt)
    for (const st of linienStuecke(e)) {
      const pfad = () => { g.beginPath(); st.forEach((p, i) => { const [x, y] = xy(p); if (i) g.lineTo(x, y); else g.moveTo(x, y) }) }
      g.setLineDash([]); g.lineCap = 'round'; g.lineWidth = a.breite * 1.6 + 3; g.strokeStyle = 'rgba(0,0,0,.45)'; pfad(); g.stroke()
      g.setLineDash(a.strich ? a.strich.split(' ').map((x) => Number(x) * 1.6) : []); g.lineCap = a.strich ? 'butt' : 'round'; g.lineWidth = a.breite * 1.6; g.strokeStyle = pinFarbe(e); pfad(); g.stroke()
    }
  }
  g.setLineDash([])
  // Weide-Technik: runde Marke mit Buchstabe (W Tränke, Z Weidezaungerät, T Tor, U Unterstand, S Salz)
  const ri = Math.round(W / 95)
  for (const e of technik) {
    if (!istInfra(e)) continue
    const [x, y] = xy(e.position)
    const f = INFRA_ARTEN.find((a) => a.wert === e.infra)!.farbe
    g.beginPath(); g.arc(x, y, ri, 0, Math.PI * 2); g.fillStyle = f; g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke()
    const hell = parseInt(f.slice(1, 3), 16) * 0.299 + parseInt(f.slice(3, 5), 16) * 0.587 + parseInt(f.slice(5, 7), 16) * 0.114 > 160
    g.fillStyle = hell ? '#1d2a1d' : '#fff'; g.font = `bold ${Math.round(ri * 1.15)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(INFRA_BUCHSTABE[e.infra], x, y + 1)
  }
  // Nadeln (mit Nummer innerhalb der Gruppe)
  const r = Math.round(W / 70)
  for (const zl of zeilen) {
    if (zl.e.typ !== 'pin') continue
    const [x, y] = xy(zl.e.position)
    g.beginPath(); g.arc(x, y, zl.nr ? r : r * 0.7, 0, Math.PI * 2)
    g.fillStyle = zl.farbe; g.fill(); g.lineWidth = Math.max(3, r / 5); g.strokeStyle = '#ffffff'; g.stroke()
    if (zl.nr) {
      const hell = parseInt(zl.farbe.slice(1, 3), 16) * 0.299 + parseInt(zl.farbe.slice(3, 5), 16) * 0.587 + parseInt(zl.farbe.slice(5, 7), 16) * 0.114 > 160
      g.fillStyle = hell ? '#1d2a1d' : '#ffffff'; g.font = `bold ${Math.round(r * (zl.nr > 99 ? 0.9 : 1.15))}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText(String(zl.nr), x, y + 1)
    }
  }
  if (!kacheln) {
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(W / 2 - 330, 20, 660, 44)
    g.fillStyle = '#5b4b36'; g.font = '22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('Satellitenbild nicht verfügbar (offline, Gebiet noch nicht angesehen)', W / 2, 42)
  }
  // Quellenangabe (Pflicht laut Esri)
  g.font = '18px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom'
  const breite = g.measureText(QUELLE).width
  g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(W - breite - 16, H - 30, breite + 16, 30)
  g.fillStyle = '#333'; g.fillText(QUELLE, W - 8, H - 6)
  return { bild: c.toDataURL('image/jpeg', 0.82), kacheln, fehlend }
}
