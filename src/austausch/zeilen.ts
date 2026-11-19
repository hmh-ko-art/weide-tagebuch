// Gemeinsames Zeilenmodell für alle Exporte (Excel, PDF, KML): eine Zeile je Nadel/Fläche
import { eintragDatum, farbName, gruppenFarbe, gruppenOrdnung, hektar, mitte, notizenSortiert, pinFarbe, tagText, tierKurz, type Eintrag, type Gruppe } from '../types'

export interface Zeile {
  e: Eintrag
  nr?: number // Nummer innerhalb der Gruppe (wie auf der Karte)
  typ: 'Nadel' | 'Fläche'
  name: string
  gruppe: string // Gruppenname oder ''
  gruppeId: string | null
  schafe: number; boecke: number; laemmer: number
  kurz: string // „50 + 1 +12 L“
  herde: string
  farbe: string // Hex
  farbName: string
  datum: string // YYYY-MM-DD (Datum des Eintrags)
  lat: number; lng: number // Nadel: Position, Fläche: Mittelpunkt
  ha: number // nur Flächen
  punkte: number
  notizen: string // alle Notizen, neueste zuerst
  letzteNotiz: string
}
export interface Summe { name: string; farbe: string; anzahl: number; schafe: number; boecke: number; laemmer: number; ha: number }

const tiere = (e: Eintrag, art: string) => (e.einheiten ?? []).reduce((s, x) => s + (x.art === art ? x.anzahl : 0), 0)
export const notizText = (n: { text: string; zeitpunkt: string; autor?: string }) => `${tagText(n.zeitpunkt.slice(0, 10))}${n.autor ? ` ${n.autor}` : ''}: ${n.text}`

// Reihenfolge wie in der Liste: Gruppen in ihrer Reihenfolge (Nummern 1..n), dann Nadeln ohne Gruppe, dann Flächen (je neueste zuerst)
export function zeilenBauen(eintraege: Eintrag[], gruppen: Gruppe[]): Zeile[] {
  const gIds = new Set(gruppen.map((g) => g.id))
  const nummern = new Map<string, number>()
  for (const g of gruppen) gruppenOrdnung(g, eintraege).forEach((e, i) => nummern.set(e.id, i + 1))
  const neueste = (a: Eintrag, b: Eintrag) => eintragDatum(b).localeCompare(eintragDatum(a)) || b.geaendert.localeCompare(a.geaendert)
  const sortiert = [
    ...gruppen.flatMap((g) => gruppenOrdnung(g, eintraege)),
    ...eintraege.filter((e) => e.typ === 'pin' && !(e.gruppe && gIds.has(e.gruppe))).sort(neueste),
    ...eintraege.filter((e) => e.typ === 'flaeche').sort(neueste),
  ]
  return sortiert.map((e) => {
    const g = e.typ === 'pin' && e.gruppe && gIds.has(e.gruppe) ? gruppen.find((x) => x.id === e.gruppe)! : null
    const m = mitte(e)
    const notizen = notizenSortiert(e)
    const farbe = g ? gruppenFarbe(g, gruppen) : pinFarbe(e)
    return {
      e, nr: nummern.get(e.id), typ: e.typ === 'pin' ? 'Nadel' : 'Fläche', name: e.titel || '', gruppe: g?.name ?? '', gruppeId: g?.id ?? null,
      schafe: tiere(e, 'schaf'), boecke: tiere(e, 'bock'), laemmer: tiere(e, 'lamm'), kurz: tierKurz(e), herde: e.herde ?? '',
      farbe, farbName: farbName(farbe), datum: eintragDatum(e), lat: m.lat, lng: m.lng,
      ha: e.typ === 'flaeche' ? hektar(e.punkte) : 0, punkte: e.typ === 'flaeche' ? e.punkte.length : 1,
      notizen: notizen.map(notizText).join('\n'), letzteNotiz: notizen[0] ? notizText(notizen[0]) : '',
    }
  })
}

// Summen je Gruppe (+ „Ohne Gruppe“, „Flächen“) und gesamt
export function summenBauen(zeilen: Zeile[], gruppen: Gruppe[]): { gruppen: Summe[]; gesamt: Summe } {
  const sum = (name: string, farbe: string, l: Zeile[]): Summe => ({ name, farbe, anzahl: l.length, schafe: l.reduce((s, z) => s + z.schafe, 0), boecke: l.reduce((s, z) => s + z.boecke, 0), laemmer: l.reduce((s, z) => s + z.laemmer, 0), ha: l.reduce((s, z) => s + z.ha, 0) })
  const liste: Summe[] = []
  for (const g of gruppen) { const l = zeilen.filter((z) => z.gruppeId === g.id); if (l.length) liste.push(sum(g.name, gruppenFarbe(g, gruppen), l)) }
  const ohne = zeilen.filter((z) => z.typ === 'Nadel' && !z.gruppeId)
  if (ohne.length) liste.push(sum(gruppen.length ? 'Nadeln ohne Gruppe' : 'Nadeln', '#9e9e9e', ohne))
  const fl = zeilen.filter((z) => z.typ === 'Fläche')
  if (fl.length) liste.push(sum('Flächen', '#2e7d32', fl))
  return { gruppen: liste, gesamt: sum('Gesamt', '#000000', zeilen) }
}

export const dateiName = (karte: string, endung: string) => `${(karte || 'FlockMap').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'FlockMap'}-${new Date().toISOString().slice(0, 10)}.${endung}`
export function herunterladen(daten: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(daten)
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 60000)
}
export const zahl = (n: number, stellen = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: stellen, minimumFractionDigits: stellen })
