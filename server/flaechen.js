// Flächen-Steckbrief (Art, Eigentum/Pacht, FLIK/Schlag, Förderprogramme + Fristen), Pacht (nur Admin/Inhaber)
// und genaues Ausmessen. Gemeinsame Logik für Server UND App (wie weideplan.js / infrastruktur.js).
import { heute, tagOk, tagPlus, tageZwischen } from './weideplan.js'

export const FLAECHEN_ARTEN = [
  { wert: 'gruenland', name: 'Grünland' },
  { wert: 'deich', name: 'Deich' },
  { wert: 'vorland', name: 'Vorland' },
  { wert: 'ackerfutter', name: 'Ackerfutter' },
  { wert: 'sonstiges', name: 'Sonstiges' },
]
export const BESITZ = [{ wert: 'eigentum', name: 'Eigentum' }, { wert: 'pacht', name: 'Pacht' }]
export const FRIST_ARTEN = [
  { wert: 'beweiden_ab', name: 'Frühestens beweiden ab', kurz: 'Beweiden ab' },
  { wert: 'schnitt_bis', name: 'Schnitt / Mahd bis', kurz: 'Schnitt bis' },
  { wert: 'antrag_bis', name: 'Antrag / Meldung bis', kurz: 'Antrag bis' },
  { wert: 'sonstige', name: 'Sonstige Frist', kurz: 'Frist' },
]
export const PROGRAMM_VORSCHLAEGE = ['Vertragsnaturschutz', 'Ökoregelung', 'Deichpflege', 'AUKM', 'Ökolandbau', 'Natura 2000', 'Wiesenvogelschutz']
export const FRIST_VORLAUF = 30 // Tage vorher in der Liste („bald“)
export const FRIST_DRAN = 7 // ab so vielen Tagen vorher zählt die Frist im Badge
export const PACHT_VORLAUF = 60 // Erinnerung an die Kündigungsfrist so viele Tage vorher (wenn kein eigenes Datum)
const MAX_PROGRAMME = 20, MAX_FRISTEN = 30, TXT = 80

export const flaechenArt = (w) => FLAECHEN_ARTEN.find((a) => a.wert === w) ?? null
export const fristArt = (w) => FRIST_ARTEN.find((a) => a.wert === w) ?? FRIST_ARTEN[FRIST_ARTEN.length - 1]
const txt = (s, n = TXT) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, n) : undefined)
const zahl = (x, min, max) => { if (x === '' || x === null || x === undefined) return undefined; const n = typeof x === 'string' ? Number(x.replace(',', '.')) : x; return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined }
const ohneLeere = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

// ---- Ausmessen: Fläche (m²) und Umfang (m) auf dem WGS84-Ellipsoid ----
// Lokale Projektion um den Schwerpunkt mit Meridian- und Querkrümmungsradius – für Weideflächen (bis einige km)
// genauer als 0,01 %; die frühere Kugel-Formel lag an der Nordsee rund 0,2 % zu niedrig.
const A = 6378137, E2 = 0.00669437999014
function radien(lat) {
  const s = Math.sin((lat * Math.PI) / 180), w = Math.sqrt(1 - E2 * s * s)
  return { M: (A * (1 - E2)) / (w * w * w), N: A / w }
}
export function projizieren(punkte) {
  const n = punkte.length || 1
  const lat0 = punkte.reduce((s, p) => s + p.lat, 0) / n, lng0 = punkte.reduce((s, p) => s + p.lng, 0) / n
  const { M, N } = radien(lat0), r = Math.PI / 180, c = Math.cos(lat0 * r)
  return punkte.map((p) => ({ x: (p.lng - lng0) * r * N * c, y: (p.lat - lat0) * r * M }))
}
function schneiden(a, b, c, d) {
  const o = (p, q, s) => Math.sign((q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}
// { m2, ha, umfang, ueberschneidet } – ueberschneidet: Umriss kreuzt sich selbst (Fläche dann nicht verlässlich)
export function messen(punkte) {
  if (!Array.isArray(punkte) || punkte.length < 2) return { m2: 0, ha: 0, umfang: 0, ueberschneidet: false }
  const p = projizieren(punkte), n = p.length
  let s = 0, u = 0
  for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; if (n >= 3 || i < n - 1) u += Math.hypot(b.x - a.x, b.y - a.y); s += a.x * b.y - b.x * a.y }
  const m2 = n >= 3 ? Math.abs(s) / 2 : 0
  let ueberschneidet = false
  if (n >= 4 && n <= 600) {
    for (let i = 0; i < n && !ueberschneidet; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (schneiden(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) { ueberschneidet = true; break }
    }
  }
  return { m2, ha: m2 / 10000, umfang: u, ueberschneidet }
}
const de = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
export const haText = (ha) => `${de(ha, ha < 10 ? 2 : 1)} ha`
export const m2Text = (m2) => `${de(Math.round(m2), 0)} m²`
export const umfangText = (m) => (m >= 10000 ? `${de(m / 1000, 2)} km` : `${de(Math.round(m), 0)} m`)
export const euroText = (x) => { const r = Math.round(x * 100) / 100; return `${r.toLocaleString('de-DE', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 })} €` }

// ---- Steckbrief bereinigen (Server: vor dem Speichern; App: beim Import) ----
function fristSauber(f) {
  if (!f || typeof f.id !== 'string' || !tagOk(f.datum)) return null
  const e = f.erledigt && typeof f.erledigt === 'object' && tagOk(f.erledigt.datum) ? ohneLeere({ datum: f.erledigt.datum, am: typeof f.erledigt.am === 'string' ? f.erledigt.am.slice(0, 40) : undefined, autor: txt(f.erledigt.autor, 60), autorId: typeof f.erledigt.autorId === 'string' ? f.erledigt.autorId.slice(0, 64) : undefined }) : undefined
  return ohneLeere({ id: f.id.slice(0, 64), art: fristArt(f.art).wert, datum: f.datum, text: txt(f.text), programm: txt(f.programm, 40), jaehrlich: f.jaehrlich === true ? true : undefined, erledigt: e })
}
export function steckbriefSauber(s) {
  if (!s || typeof s !== 'object') return null
  const programme = Array.isArray(s.programme) ? [...new Set(s.programme.map((x) => txt(x, 40)).filter(Boolean))].slice(0, MAX_PROGRAMME) : []
  const fristen = Array.isArray(s.fristen) ? s.fristen.map(fristSauber).filter(Boolean).slice(0, MAX_FRISTEN) : []
  const aus = ohneLeere({ art: flaechenArt(s.art)?.wert, besitz: BESITZ.some((b) => b.wert === s.besitz) ? s.besitz : undefined, flik: txt(s.flik, 40), schlag: txt(s.schlag, 40), programme: programme.length ? programme : undefined, fristen: fristen.length ? fristen : undefined })
  return Object.keys(aus).length ? aus : null
}
// Eintrag: Steckbrief nur an Flächen; Fehlertext oder null
export function flaecheSauber(e) {
  // Kreis um Nadel („eingezäunt“): nur an Nadeln
  if (e.typ === 'pin') {
    const k = kreisSauber(e.kreis, e.position); if (k) e.kreis = k; else delete e.kreis
    const st = kreiseStehenSauber(e.kreiseStehen); if (st.length) e.kreiseStehen = st; else delete e.kreiseStehen
  } else { delete e.kreis; delete e.kreiseStehen }
  if (e.typ !== 'flaeche') { delete e.steckbrief; return null }
  const s = steckbriefSauber(e.steckbrief)
  if (s) e.steckbrief = s; else delete e.steckbrief
  return null
}
// Erledigt-Vermerke sind „Server-Sache“ (nur über den Erledigt-Endpunkt): bekannte vom Server übernehmen, neue ohne
export function erledigtUebernehmen(neu, alt) {
  if (!neu.steckbrief?.fristen) return neu
  const a = new Map((alt?.steckbrief?.fristen ?? []).map((f) => [f.id, f]))
  neu.steckbrief.fristen = neu.steckbrief.fristen.map((f) => { const x = { ...f }; delete x.erledigt; const o = a.get(f.id); return o?.erledigt ? { ...x, erledigt: o.erledigt } : x })
  return neu
}

// ---- Fristen ----
// Nächster Termin einer Frist: jährliche Fristen rollen ins nächste Jahr, sobald der Termin erledigt ist
export function fristTermin(f, tag = heute()) {
  if (!f.jaehrlich) return f.datum
  const md = f.datum.slice(5)
  let j = Math.max(Number(f.datum.slice(0, 4)), Number(tag.slice(0, 4)) - 1)
  const termin = (y) => { const d = `${y}-${md}`; return tagOk(d) ? d : `${y}-02-28` }
  // erster Termin ab Vorjahr, der weder erledigt noch (bei „beweiden ab“) vorbei ist
  for (let i = 0; i < 4; i++, j++) {
    const d = termin(j)
    if (d < f.datum) continue
    if (f.erledigt && f.erledigt.datum >= d) continue
    if (f.art === 'beweiden_ab' && d < tag) continue
    if (f.art !== 'beweiden_ab' && tageZwischen(d, tag) > FRIST_VORLAUF) continue // länger als 30 Tage verpasst -> nächstes Jahr
    return d
  }
  return termin(j)
}
export function fristErledigt(f, tag = heute()) {
  if (f.art === 'beweiden_ab') return false
  return !!f.erledigt && f.erledigt.datum >= fristTermin({ ...f, erledigt: undefined }, tag) && !f.jaehrlich
}
// „Frühestens beweiden ab“: gesperrt bis zum Termin; jährliche Sperren gelten nur im laufenden Kalenderjahr (1.1. bis Termin)
export function sperreBis(f, tag = heute()) {
  if (f.art !== 'beweiden_ab') return null
  const d = fristTermin(f, tag)
  if (d <= tag) return null
  if (f.jaehrlich && d.slice(0, 4) !== tag.slice(0, 4)) return null
  return d
}
const stufe = (t) => (t < 0 ? 'ueberfaellig' : t <= FRIST_DRAN ? 'heute' : 'bald')
// Fällige Fristen aller Flächen (+ Pacht-Erinnerungen, wenn pacht übergeben – nur Admins haben sie)
// belegt: Set der aktuell belegten Flächen-IDs (Weideplan) -> „beweiden ab“ in der Zukunft = Verstoß
export function fristenFaellig(eintraege, pacht, tag = heute(), belegt = new Set()) {
  const aus = []
  for (const e of eintraege ?? []) {
    if (e.typ !== 'flaeche') continue
    for (const f of e.steckbrief?.fristen ?? []) {
      if (fristErledigt(f, tag)) continue
      const d = fristTermin(f, tag), t = tageZwischen(tag, d)
      if (f.art === 'beweiden_ab') {
        if (!sperreBis(f, tag)) continue
        if (t > 0 && belegt.has(e.id)) aus.push({ quelle: 'frist', eintrag: e, frist: f, datum: d, tage: t, stufe: 'ueberfaellig', sperre: true })
        else if (t > 0 && t <= FRIST_DRAN) aus.push({ quelle: 'frist', eintrag: e, frist: f, datum: d, tage: t, stufe: 'bald' })
        continue
      }
      if (t > FRIST_VORLAUF) continue
      aus.push({ quelle: 'frist', eintrag: e, frist: f, datum: d, tage: t, stufe: stufe(t) })
    }
    const p = pacht?.[e.id]
    if (p && e.steckbrief?.besitz !== 'eigentum') {
      const kb = kuendigenBis(p)
      if (kb && p.erledigt !== kb && (!p.ende || tag <= p.ende)) {
        const t = tageZwischen(tag, kb), ab = p.erinnerung && p.erinnerung <= kb ? p.erinnerung : tagPlus(kb, -PACHT_VORLAUF)
        if (tag >= ab) aus.push({ quelle: 'pacht', eintrag: e, datum: kb, tage: t, stufe: t < 0 ? 'ueberfaellig' : 'heute', art: 'kuendigung' }) // Erinnerung erreicht: zählt im Badge, bis „Erledigt“
      } else if (!kb && p.ende && p.erledigt !== p.ende) {
        const t = tageZwischen(tag, p.ende)
        if (t <= PACHT_VORLAUF && t >= -30) aus.push({ quelle: 'pacht', eintrag: e, datum: p.ende, tage: t, stufe: t < 0 ? 'ueberfaellig' : t <= 14 ? 'heute' : 'bald', art: 'ende' })
      }
    }
  }
  return aus.sort((a, b) => a.tage - b.tage)
}
export const fristenDran = (l) => l.filter((x) => x.stufe !== 'bald')

// ---- Pacht (vertraulich: nur Admin/Inhaber) ----
// Kündigung spätestens: Pachtende minus Kündigungsfrist (Monate)
export function kuendigenBis(p) {
  if (!p?.ende || !tagOk(p.ende) || !Number.isInteger(p.kuendigungMonate)) return null
  const [y, m, d] = p.ende.split('-').map(Number)
  const z = new Date(Date.UTC(y, m - 1 - p.kuendigungMonate, 1))
  const letzter = new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth() + 1, 0)).getUTCDate()
  z.setUTCDate(Math.min(d, letzter))
  return z.toISOString().slice(0, 10)
}
export function pachtSauber(p) {
  if (!p || typeof p !== 'object') return null
  const km = Number.isInteger(Number(p.kuendigungMonate)) && p.kuendigungMonate !== '' && p.kuendigungMonate !== null && Number(p.kuendigungMonate) >= 0 && Number(p.kuendigungMonate) <= 60 ? Number(p.kuendigungMonate) : undefined
  const aus = ohneLeere({
    verpaechter: txt(p.verpaechter), preisHa: zahl(p.preisHa, 0, 100000), ha: zahl(p.ha, 0, 100000),
    beginn: tagOk(p.beginn) ? p.beginn : undefined, ende: tagOk(p.ende) ? p.ende : undefined, kuendigungMonate: km,
    erinnerung: tagOk(p.erinnerung) ? p.erinnerung : undefined, erledigt: tagOk(p.erledigt) ? p.erledigt : undefined,
    notiz: txt(p.notiz, 500), geaendert: typeof p.geaendert === 'string' && !isNaN(Date.parse(p.geaendert)) ? p.geaendert : undefined,
  })
  const inhaltlich = Object.keys(aus).filter((x) => x !== 'geaendert')
  return inhaltlich.length ? aus : null
}
// Pachtfläche in ha: laut Vertrag (falls eingetragen), sonst gemessen
export const pachtHa = (p, gemessenHa) => (p?.ha ?? gemessenHa)
export const pachtSumme = (p, gemessenHa) => (p?.preisHa !== undefined ? Math.round(p.preisHa * pachtHa(p, gemessenHa) * 100) / 100 : null)
export const PACHT_FELDER = ['verpaechter', 'preisHa', 'ha', 'beginn', 'ende', 'kuendigungMonate', 'erinnerung', 'erledigt', 'notiz']
export const pachtGleich = (a, b) => PACHT_FELDER.every((f) => (a?.[f] ?? null) === (b?.[f] ?? null))

// ---- Übersicht: Summen ----
export function flaechenSummen(eintraege, pacht) {
  const s = { anzahl: 0, ha: 0, pachtHa: 0, eigentumHa: 0, pachtEuro: 0, ohnePreis: 0, nachArt: {} }
  for (const e of eintraege ?? []) {
    if (e.typ !== 'flaeche') continue
    const ha = messen(e.punkte).ha, art = e.steckbrief?.art ?? 'ohne'
    s.anzahl++; s.ha += ha
    s.nachArt[art] = (s.nachArt[art] ?? 0) + ha
    if (e.steckbrief?.besitz === 'pacht') {
      const p = pacht?.[e.id]; s.pachtHa += pachtHa(p, ha)
      const eu = pachtSumme(p, ha); if (eu === null) s.ohnePreis++; else s.pachtEuro += eu
    } else if (e.steckbrief?.besitz === 'eigentum') s.eigentumHa += ha
  }
  return s
}

// ---- Kreis um Nadel (schnelle Einzäunung statt Fläche zeichnen) ----
export const KREIS_STANDARD = 30 // m
export const KREIS_MIN = 3, KREIS_MAX = 2000
export const NETZ_LAENGE = 50
const pktOk = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
// gebunden: Mittelpunkt = Nadel (wandert mit); sonst fester Mittelpunkt (bleibt, wenn die Nadel versetzt wird)
export function kreisSauber(k, position) {
  if (!k || typeof k !== 'object' || !Number.isFinite(Number(k.radius))) return null
  const radius = Math.round(Math.min(KREIS_MAX, Math.max(KREIS_MIN, Number(k.radius))) * 10) / 10
  const gebunden = k.gebunden !== false
  const mitte = gebunden ? (pktOk(position) ? { lat: position.lat, lng: position.lng } : null) : (pktOk(k.mitte) ? { lat: k.mitte.lat, lng: k.mitte.lng } : pktOk(position) ? { lat: position.lat, lng: position.lng } : null)
  if (!mitte) return null
  return ohneLeere({ radius, farbe: typeof k.farbe === 'string' && /^#[0-9a-f]{6}$/i.test(k.farbe) ? k.farbe.toLowerCase() : undefined, gebunden, mitte, seit: tagOk(k.seit) ? k.seit : undefined })
}
// Zurückgebliebene Kreise (Nadel wurde von einem festen Kreis weg versetzt): bleiben am alten Standort, jeder mit eigener ID
export const KREISE_STEHEN_MAX = 50
export function kreiseStehenSauber(l) {
  if (!Array.isArray(l)) return []
  const ids = new Set(), aus = []
  for (const x of l.slice(0, KREISE_STEHEN_MAX)) {
    if (!x || typeof x !== 'object' || !pktOk(x.mitte)) continue
    const k = kreisSauber({ ...x, gebunden: false }, null)
    if (!k) continue
    let id = typeof x.id === 'string' && /^[a-z0-9_-]{1,40}$/i.test(x.id) ? x.id : ''
    while (!id || ids.has(id)) id = 'k' + Math.random().toString(36).slice(2, 10)
    ids.add(id)
    aus.push({ id, ...k })
  }
  return aus
}
// Alle Kreise einer Nadel: aktueller Kreis (stehenId null) + zurückgebliebene
export function alleKreise(e) {
  if (!e || e.typ !== 'pin') return []
  const l = e.kreis ? [{ kreis: e.kreis, mitte: kreisMitte(e), stehenId: null }] : []
  for (const k of e.kreiseStehen ?? []) l.push({ kreis: k, mitte: k.mitte, stehenId: k.id })
  return l
}
export const kreisMitte = (e) => (e.kreis ? (e.kreis.gebunden !== false && e.position ? e.position : e.kreis.mitte) : null)
export function kreisMasse(r) {
  const m2 = Math.PI * r * r, umfang = 2 * Math.PI * r
  return { m2, ha: m2 / 10000, umfang, netze: Math.ceil(umfang / NETZ_LAENGE) }
}
// Kreis als Vieleck (für KML/Excel/PDF), Abstand auf der Kugel
export function kreisPolygon(mitte, r, n = 48) {
  const R = 6378137, d = r / R, la = (mitte.lat * Math.PI) / 180, lo = (mitte.lng * Math.PI) / 180, aus = []
  for (let i = 0; i < n; i++) {
    const b = (2 * Math.PI * i) / n
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b))
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2))
    aus.push({ lat: Math.round(((la2 * 180) / Math.PI) * 1e7) / 1e7, lng: Math.round(((lo2 * 180) / Math.PI) * 1e7) / 1e7 })
  }
  return aus
}
// Entfernung in m (für den Zieh-Griff)
export function abstand(a, b) {
  const R = 6371008.8, r = Math.PI / 180, dla = (b.lat - a.lat) * r, dlo = (b.lng - a.lng) * r
  const h = Math.sin(dla / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlo / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}
