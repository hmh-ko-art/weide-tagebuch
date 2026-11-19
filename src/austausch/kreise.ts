// Kreise um Nadeln („eingezäunt“) für Excel/PDF/KML
import * as FL from '../../server/flaechen.js'
import { farbName, pinFarbe, type Eintrag, type Pin } from '../types'
import { infraArt } from '../../server/infrastruktur.js'
import type { Blatt } from './xlsx'

export interface KreisZeile { e: Pin; name: string; art: string; radius: number; ha: number; m2: number; umfang: number; netze: number; bindung: string; farbe: string; seit: string; lat: number; lng: number }
export function kreisZeilen(eintraege: Eintrag[]): KreisZeile[] {
  return eintraege.filter((e): e is Pin => e.typ === 'pin' && !!e.kreis).map((e) => {
    const k = e.kreis!, m = FL.kreisMasse(k.radius), mi = FL.kreisMitte(e)!
    const farbe = k.farbe || pinFarbe(e)
    return { e, name: e.titel || '', art: e.infra ? infraArt(e.infra)?.name ?? 'Technik' : 'Nadel', radius: k.radius, ha: m.ha, m2: m.m2, umfang: m.umfang, netze: m.netze, bindung: k.gebunden === false ? 'bleibt am Standort' : 'an Nadel gebunden', farbe, seit: k.seit ?? '', lat: mi.lat, lng: mi.lng }
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
export function kreisBlatt(eintraege: Eintrag[]): Blatt[] {
  const z = kreisZeilen(eintraege)
  if (!z.length) return []
  return [{
    name: 'Einkreisungen',
    kopf: ['Nadel', 'Art', 'Radius (m)', 'Fläche (ha, ≈)', 'Fläche (m², ≈)', 'Umfang (m)', `Netze à ${FL.NETZ_LAENGE} m`, 'Verhalten', 'Farbe', 'Seit', 'Mitte Breite', 'Mitte Länge', 'ID'],
    breiten: [26, 14, 10, 12, 12, 11, 11, 18, 10, 11, 12, 12, 16],
    zeilen: z.map((r) => [r.name, r.art, r.radius, { zahl: r.ha, format: 'ha' as const }, Math.round(r.m2), Math.round(r.umfang), r.netze, r.bindung, farbName(r.farbe), r.seit ? { datum: r.seit } : null, { zahl: r.lat, format: 'koord' as const }, { zahl: r.lng, format: 'koord' as const }, r.e.id]),
    summenZeile: [`Summe (${z.length})`, null, null, { zahl: z.reduce((s, r) => s + r.ha, 0), format: 'ha' }, Math.round(z.reduce((s, r) => s + r.m2, 0)), Math.round(z.reduce((s, r) => s + r.umfang, 0)), z.reduce((s, r) => s + r.netze, 0), null, null, null, null, null, null],
  }]
}
