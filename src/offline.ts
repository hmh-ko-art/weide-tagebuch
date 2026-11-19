// Offline-Hilfen: aktueller Kartenausschnitt, Kartenkacheln im Gerätespeicher, „Gebiet für offline sichern“.
// Wichtig (Nutzungsbedingungen Esri/OpenStreetMap): Es wird NICHTS gezielt heruntergeladen. Gesichert werden nur
// Kacheln, die auf diesem Gerät schon einmal angezeigt wurden – sie werden nur vor dem automatischen Aufräumen geschützt.
export const KACHELN = 'flockmap-kacheln'
export const GEBIETE = 'flockmap-gebiete'
export const GEBIETE_MAX = 3000 // höchstens so viele geschützte Kacheln (ca. 60–90 MB)
const GEBIETE_KEY = 'wt-offline-gebiete'

export interface Ansicht { nord: number; sued: number; west: number; ost: number; zoom: number; ebene: string; lat?: number; lng?: number }
let ansicht: Ansicht | null = null
export const ansichtSetzen = (a: Ansicht) => { ansicht = a; try { localStorage.setItem('wt-ansicht', JSON.stringify(a)) } catch { /* egal */ } }
export const aktuelleAnsicht = () => ansicht
export const letzteAnsicht = (): Ansicht | null => { try { return JSON.parse(localStorage.getItem('wt-ansicht') || 'null') } catch { return null } }

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
export const EBENEN: Record<string, ((z: number, x: number, y: number) => string)[]> = {
  'Satellit': [
    (z, x, y) => `${ESRI}/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    (z, x, y) => `${ESRI}/Reference/World_Transportation/MapServer/tile/${z}/${y}/${x}`,
    (z, x, y) => `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`,
  ],
  'Satellit ohne Beschriftung': [(z, x, y) => `${ESRI}/World_Imagery/MapServer/tile/${z}/${y}/${x}`],
  'Karte': [(z, x, y) => `https://${'abc'[Math.abs(x + y) % 3]}.tile.openstreetmap.org/${z}/${x}/${y}.png`],
}
const kx = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z)
const ky = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z) }
function kachelUrls(a: Ansicht, zMin: number, zMax: number, grenze = 8000): string[] {
  const vorlagen = EBENEN[a.ebene] ?? EBENEN['Satellit']
  const urls: string[] = []
  for (let z = Math.max(1, zMin); z <= Math.min(19, zMax); z++) {
    const x0 = kx(a.west, z), x1 = kx(a.ost, z), y0 = ky(a.nord, z), y1 = ky(a.sued, z)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const v of vorlagen) { urls.push(v(z, x, y)); if (urls.length >= grenze) return urls }
  }
  return urls
}

export interface Gebiet { id: string; name: string; ansicht: Ansicht; urls: string[]; datum: string }
export const gebiete = (): Gebiet[] => { try { return JSON.parse(localStorage.getItem(GEBIETE_KEY) || '[]') } catch { return [] } }
const gebieteSpeichern = (l: Gebiet[]) => localStorage.setItem(GEBIETE_KEY, JSON.stringify(l))
export const offlineMoeglich = () => 'caches' in window

// Ausschnitt sichern: alle schon angesehenen Kacheln von 2 Stufen weiter weg bis 2 Stufen näher dran
export async function gebietSichern(name: string): Promise<{ gesichert: number; fehlend: number; voll: boolean }> {
  const a = ansicht
  if (!a || !offlineMoeglich()) throw new Error('Kartenausschnitt unbekannt – bitte die Karte einmal bewegen.')
  const urls = kachelUrls(a, a.zoom - 2, a.zoom + 2)
  const [quelle, ziel] = await Promise.all([caches.open(KACHELN), caches.open(GEBIETE)])
  let belegt = (await ziel.keys()).length
  const gesichert: string[] = []
  let fehlend = 0, voll = false
  for (const u of urls) {
    if (await ziel.match(u)) { gesichert.push(u); continue }
    const r = await quelle.match(u)
    if (!r) { fehlend++; continue }
    if (belegt >= GEBIETE_MAX) { voll = true; break }
    await ziel.put(u, r)
    belegt++
    gesichert.push(u)
  }
  if (gesichert.length) gebieteSpeichern([...gebiete(), { id: Date.now().toString(36), name, ansicht: a, urls: gesichert, datum: new Date().toISOString() }])
  return { gesichert: gesichert.length, fehlend, voll }
}
export async function gebietLoeschen(id: string) {
  const alle = gebiete()
  const weg = alle.find((g) => g.id === id)
  const rest = alle.filter((g) => g.id !== id)
  gebieteSpeichern(rest)
  if (!weg || !offlineMoeglich()) return
  const noch = new Set(rest.flatMap((g) => g.urls))
  const c = await caches.open(GEBIETE)
  await Promise.all(weg.urls.filter((u) => !noch.has(u)).map((u) => c.delete(u)))
}
export async function speicherInfo(): Promise<{ kacheln: number; geschuetzt: number; mb: number | null; frei: number | null }> {
  if (!offlineMoeglich()) return { kacheln: 0, geschuetzt: 0, mb: null, frei: null }
  const [k, g] = await Promise.all([caches.open(KACHELN).then((c) => c.keys()), caches.open(GEBIETE).then((c) => c.keys())])
  const est = await navigator.storage?.estimate?.().catch(() => null)
  return { kacheln: k.length, geschuetzt: g.length, mb: est?.usage != null ? est.usage / 1e6 : null, frei: est?.quota != null && est.usage != null ? (est.quota - est.usage) / 1e6 : null }
}
export async function kachelnLeeren() { if (offlineMoeglich()) await caches.delete(KACHELN) }
// Browser bitten, den Speicher nicht von selbst zu löschen (z. B. wenn das Handy voll wird)
export async function dauerhaftAnfragen(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false } catch { return false }
}
