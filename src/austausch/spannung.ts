// Zaunspannung je Nadel (Weidezaungerät, 7f) für Excel-Blatt „Zaunspannung“ und PDF-Kapitel
import type { Eintrag, Pin } from '../types'
import type { Blatt } from './xlsx'

export interface SpannungZeile { e: Pin; name: string; datum: string; kv: number; unter: boolean; zeit: string; autor: string }
export function spannungZeilen(eintraege: Eintrag[], schwelle: number): SpannungZeile[] {
  return eintraege.filter((e): e is Pin => e.typ === 'pin' && !e.infra && !!e.spannung?.length)
    .flatMap((e) => (e.spannung ?? []).map((m) => ({ e, name: e.titel || '', datum: m.datum, kv: m.kv, unter: m.kv < schwelle, zeit: m.zeitpunkt ? new Date(m.zeitpunkt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '', autor: m.autor ?? '' })))
    .sort((a, b) => a.name.localeCompare(b.name, 'de') || b.datum.localeCompare(a.datum))
}
export function spannungBlatt(eintraege: Eintrag[], schwelle: number): Blatt[] {
  const z = spannungZeilen(eintraege, schwelle)
  if (!z.length) return []
  return [{
    name: 'Zaunspannung',
    kopf: ['Nadel', 'Datum', 'Uhrzeit', 'Spannung (kV)', `Unter ${String(schwelle).replace('.', ',')} kV`, 'Eingetragen von', 'ID'],
    breiten: [26, 11, 8, 12, 12, 18, 16],
    zeilen: z.map((r) => [r.name, { datum: r.datum }, r.zeit, r.kv, r.unter ? 'ja' : '', r.autor, r.e.id]),
  }]
}
