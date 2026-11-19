// Zaunspannung je Nadel (ein Weidezaungerät pro Pferch, wandert mit der Nadel): höchstens eine Messung pro Tag
import { tagOk, heute } from './weideplan.js'

export const SPANNUNG_MAX = 60 // gespeicherte Tage je Nadel
export const SCHWELLE_STANDARD = 4 // kV
export const kvWert = (x) => {
  if (x === '' || x === null || x === undefined) return undefined
  const n = Math.round(Number(String(x).replace(',', '.')) * 10) / 10
  return Number.isFinite(n) && n >= 0 && n <= 20 ? n : undefined
}
const messungSauber = (m) => {
  if (!m || typeof m !== 'object' || !tagOk(m.datum)) return null
  const kv = kvWert(m.kv)
  if (kv === undefined) return null
  return {
    datum: m.datum, kv,
    ...(typeof m.zeitpunkt === 'string' && !isNaN(Date.parse(m.zeitpunkt)) ? { zeitpunkt: m.zeitpunkt.slice(0, 30) } : {}),
    ...(typeof m.autor === 'string' && m.autor ? { autor: m.autor.slice(0, 60) } : {}),
    ...(typeof m.autorId === 'string' && m.autorId ? { autorId: m.autorId.slice(0, 64) } : {}),
  }
}
// neueste zuerst, je Tag nur eine (die spätere gewinnt)
export function spannungSauber(l) {
  if (!Array.isArray(l)) return []
  const tage = new Map()
  for (const x of l) {
    const m = messungSauber(x)
    if (!m) continue
    const alt = tage.get(m.datum)
    if (!alt || (m.zeitpunkt ?? '') >= (alt.zeitpunkt ?? '')) tage.set(m.datum, m)
  }
  return [...tage.values()].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, SPANNUNG_MAX)
}
// Messung eintragen: gleicher Tag wird überschrieben
export function spannungEintragen(e, m) {
  const neu = messungSauber(m)
  if (!e || e.typ !== 'pin' || e.infra || !neu) return e
  return { ...e, spannung: spannungSauber([neu, ...(e.spannung ?? []).filter((x) => x.datum !== neu.datum)]) }
}
export const spannungLetzte = (e) => (e && e.typ === 'pin' && !e.infra && e.spannung?.length ? e.spannung[0] : null)
export const kvText = (kv) => `${kv.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kV`
// Eintrag bereinigen (Server bei jedem Speichern/Import): nur an normalen Nadeln
export function spannungFeld(e) {
  if (e.typ !== 'pin' || e.infra) { delete e.spannung; return }
  const l = spannungSauber(e.spannung)
  if (l.length) e.spannung = l; else delete e.spannung
}
export { heute }
