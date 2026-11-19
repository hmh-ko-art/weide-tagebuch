// Kleine Helfer für den Weideplan (Anzeige, Farben auf der Karte, Badge)
import * as WP from '../../server/weideplan.js'
import type { Weideplan, Tiere, FlaechenStatus } from '../../server/weideplan.js'
import { TIERARTEN, tierText, type Eintrag, type Tierart } from '../types'

export const tagKurz = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
export const tagLang = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
export const tiereText = (t?: Tiere) => TIERARTEN.filter((a) => t?.[a.wert]).map((a) => tierText(t![a.wert as Tierart]!, a.wert)).join(', ') || 'ohne Tierzahl'
export const tageText = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tagen'}`
export const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export function statusText(s: FlaechenStatus, kurz = false): string {
  if (s.status === 'belegt') return kurz ? `belegt ${s.tage} T` : `belegt seit ${tageText(s.tage ?? 0)}`
  if (s.status === 'ruht') return kurz ? `ruht ${s.tage}/${s.ruhezeit} T` : `ruht seit ${tageText(s.tage ?? 0)} (bereit ab ${tagKurz(s.bereitAb!)})`
  if (s.status === 'bereit') return kurz ? 'bereit' : `bereit – ruht seit ${tageText(s.tage ?? 0)}`
  return kurz ? 'keine Daten' : 'noch keine Belegung eingetragen'
}
export const STATUS_NAMEN = { belegt: 'belegt', ruht: 'ruht', bereit: 'bereit', frei: 'keine Daten' } as const

// Badge im Kopf: überfällige + heute fällige Umtriebe/Auftriebe
export const faelligAnzahl = (p: Weideplan | null) => WP.faellige(p).filter((f) => f.stufe !== 'bald').length

// Karte im Weideplan-Modus: Farbe nach Status, Name mit Kurzstatus
export function planFarben(eintraege: Eintrag[], p: Weideplan | null): Eintrag[] {
  const st = WP.flaechenStatus(p, eintraege)
  return eintraege.map((e) => {
    const s = st.get(e.id)
    if (!s) return e
    return { ...e, farbe: WP.STATUS_FARBEN[s.status], titel: `${e.titel || 'ohne Namen'} · ${statusText(s, true)}` }
  })
}
