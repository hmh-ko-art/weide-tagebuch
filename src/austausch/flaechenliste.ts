// Flächenverzeichnis: Zeilen für Excel/PDF (Steckbrief, Maße, Fristen; Pacht nur, wenn übergeben – also nur bei Admins)
import * as FL from '../../server/flaechen.js'
import type { PachtListe, Pacht } from '../../server/flaechen.js'
import { mitte, notizenSortiert, type Eintrag, type Flaeche } from '../types'
import type { Blatt } from './xlsx'
import { tagText } from '../types'

export interface FlaechenZeile {
  e: Flaeche; name: string; art: string; besitz: string; ha: number; m2: number; umfang: number; ueberschneidet: boolean
  flik: string; schlag: string; programme: string; fristen: string; naechsteFrist: string
  pacht?: Pacht; pachtHa?: number; pachtEuro?: number | null; kuendigenBis?: string | null; lat: number; lng: number; notizen: string
}
export function flaechenZeilen(eintraege: Eintrag[], pacht: PachtListe | null): FlaechenZeile[] {
  const tag = new Date().toISOString().slice(0, 10)
  return eintraege.filter((e): e is Flaeche => e.typ === 'flaeche').map((e) => {
    const m = FL.messen(e.punkte), s = e.steckbrief, pa = pacht && s?.besitz === 'pacht' ? pacht[e.id] : undefined, c = mitte(e)
    const offen = (s?.fristen ?? []).filter((f) => !FL.fristErledigt(f, tag)).map((f) => ({ f, d: FL.fristTermin(f, tag) })).sort((a, b) => a.d.localeCompare(b.d))
    return {
      e, name: e.titel || '', art: FL.flaechenArt(s?.art)?.name ?? '', besitz: s?.besitz === 'pacht' ? 'Pacht' : s?.besitz === 'eigentum' ? 'Eigentum' : '',
      ha: m.ha, m2: m.m2, umfang: m.umfang, ueberschneidet: m.ueberschneidet, flik: s?.flik ?? '', schlag: s?.schlag ?? '', programme: (s?.programme ?? []).join(', '),
      fristen: (s?.fristen ?? []).map((f) => `${FL.fristArt(f.art).kurz} ${tagText(FL.fristTermin(f, tag))}${f.jaehrlich ? ' (jährl.)' : ''}${FL.fristErledigt(f, tag) ? ' erledigt' : ''}${f.programm ? ` [${f.programm}]` : ''}`).join('; '),
      naechsteFrist: offen[0] ? `${FL.fristArt(offen[0].f.art).kurz} ${tagText(offen[0].d)}` : '',
      ...(pa ? { pacht: pa, pachtHa: FL.pachtHa(pa, m.ha), pachtEuro: FL.pachtSumme(pa, m.ha), kuendigenBis: FL.kuendigenBis(pa) } : {}),
      lat: c.lat, lng: c.lng, notizen: notizenSortiert(e).map((n) => n.text).join(' | '),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export function flaechenBlaetter(eintraege: Eintrag[], pacht: PachtListe | null): Blatt[] {
  const z = flaechenZeilen(eintraege, pacht)
  if (!z.length) return []
  const mitPacht = !!pacht
  const s = FL.flaechenSummen(eintraege, pacht)
  const d = (x?: string | null) => (x ? { datum: x } : null)
  const blaetter: Blatt[] = [{
    name: 'Flächenverzeichnis',
    kopf: ['Fläche', 'Flächenart', 'Eigentum/Pacht', 'Hektar', 'm²', 'Umfang (m)', 'FLIK / Feldblock', 'Schlag-Nr.', 'Förderprogramme / Auflagen', 'Fristen', ...(mitPacht ? ['Verpächter', '€/ha/Jahr', 'Pacht-ha', 'Pacht €/Jahr', 'Pachtbeginn', 'Pachtende', 'Kündigungsfrist (Monate)', 'Kündigen bis', 'Notiz Pacht'] : []), 'Breite', 'Länge', 'ID'],
    breiten: [26, 13, 13, 10, 11, 11, 20, 10, 28, 40, ...(mitPacht ? [22, 10, 10, 12, 11, 11, 10, 11, 30] : []), 12, 12, 16],
    zeilen: z.map((r) => [r.name + (r.ueberschneidet ? ' (Umriss prüfen!)' : ''), r.art, r.besitz, { zahl: r.ha, format: 'ha' as const }, Math.round(r.m2), Math.round(r.umfang), r.flik, r.schlag, r.programme, r.fristen,
      ...(mitPacht ? [r.pacht?.verpaechter ?? '', r.pacht?.preisHa ?? null, r.pachtHa !== undefined ? { zahl: r.pachtHa, format: 'ha' as const } : null, r.pachtEuro != null ? { zahl: r.pachtEuro, format: 'ha' as const } : null, d(r.pacht?.beginn), d(r.pacht?.ende), r.pacht?.kuendigungMonate ?? null, d(r.kuendigenBis), r.pacht?.notiz ?? ''] : []),
      { zahl: r.lat, format: 'koord' as const }, { zahl: r.lng, format: 'koord' as const }, r.e.id]),
    summenZeile: ['Summe', null, null, { zahl: s.ha, format: 'ha' }, Math.round(s.ha * 10000), null, null, null, null, null, ...(mitPacht ? [null, null, { zahl: s.pachtHa, format: 'ha' as const }, { zahl: s.pachtEuro, format: 'ha' as const }] : [])],
  }, {
    name: 'Flächen-Summen',
    kopf: ['Was', 'Hektar', ...(mitPacht ? ['€/Jahr'] : [])],
    breiten: [28, 12, 14],
    zeilen: [
      ['Flächen gesamt', { zahl: s.ha, format: 'ha' }, ...(mitPacht ? [null] : [])],
      ['Eigentum', { zahl: s.eigentumHa, format: 'ha' }, ...(mitPacht ? [null] : [])],
      ['Pacht', { zahl: s.pachtHa, format: 'ha' }, ...(mitPacht ? [{ zahl: s.pachtEuro, format: 'ha' as const }] : [])],
      ...Object.entries(s.nachArt).map(([a, ha]) => [`Art: ${a === 'ohne' ? 'ohne Angabe' : FL.flaechenArt(a)?.name}`, { zahl: ha, format: 'ha' as const }, ...(mitPacht ? [null] : [])]),
    ],
  }]
  const fristen = z.flatMap((r) => (r.e.steckbrief?.fristen ?? []).map((f) => ({ r, f })))
  if (fristen.length) blaetter.push({
    name: 'Fristen',
    kopf: ['Fläche', 'Frist', 'Termin', 'Jährlich', 'Programm', 'Notiz', 'Status', 'Erledigt von'],
    breiten: [26, 22, 11, 8, 22, 30, 12, 18],
    zeilen: fristen.sort((a, b) => FL.fristTermin(a.f).localeCompare(FL.fristTermin(b.f))).map(({ r, f }) => [r.name, FL.fristArt(f.art).name, { datum: FL.fristTermin(f) }, f.jaehrlich ? 'ja' : '', f.programm ?? '', f.text ?? '', FL.fristErledigt(f) ? 'erledigt' : 'offen', f.erledigt?.autor ?? '']),
  })
  return blaetter
}
