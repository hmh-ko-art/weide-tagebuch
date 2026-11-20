// Kreis um Nadel: schnelle Einzäunung („Tiere/Nadel ist eingezäunt“) statt Fläche zeichnen
import { FARBEN, FLAECHE_STANDARD, pinFarbe, type LatLng, type Pin } from '../types'
import type { Kreis } from '../../server/flaechen.js'
import * as FL from '../../server/flaechen.js'
import { InfoKarte, Tipp } from '../InfoKarte'
import { FarbMenue } from '../FarbMenue'

export interface KreisEdit { id: string; radius: number; farbe: string; gebunden: boolean; mitte: LatLng; neu: boolean; alsStandard: boolean; frei?: boolean }
export const KREIS_FARBEN = [{ name: 'Grün', wert: FLAECHE_STANDARD }, ...FARBEN]
const zahl = (x: number, n = 0) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n })

export function kreisText(r: number) {
  const m = FL.kreisMasse(r)
  return `≈ ${FL.haText(m.ha)} · ${FL.m2Text(m.m2)} · Umfang ${FL.umfangText(m.umfang)} · ${m.netze} ${m.netze === 1 ? 'Netz' : 'Netze'} à ${FL.NETZ_LAENGE} m`
}

const netzText = (r: number) => { const n = FL.kreisMasse(r).netze; return `${n} ${n === 1 ? 'Netz' : 'Netze'}` }

// Vorgaben pro Karte und Gerät: Standard-Radius, zuletzt gewähltes Verhalten und Farbe
export interface KreisVorgaben { radius: number; gebunden: boolean; farbe?: string }
const vKey = (karte: string) => `wt-kreis-vorgaben:${karte}`
export function kreisVorgaben(karte: string): KreisVorgaben {
  try {
    const v = JSON.parse(localStorage.getItem(vKey(karte)) || 'null')
    if (v && Number(v.radius) > 0) return { radius: FL.kreisSauber({ radius: v.radius }, { lat: 0, lng: 0 })?.radius ?? FL.KREIS_STANDARD, gebunden: v.gebunden !== false, farbe: typeof v.farbe === 'string' ? v.farbe : undefined }
  } catch { /* kaputter Eintrag → Standard */ }
  // ältere Version merkte sich Radius/Farbe gerätweit
  return { radius: Number(localStorage.getItem('wt-kreis-radius')) || FL.KREIS_STANDARD, gebunden: true, farbe: localStorage.getItem('wt-kreis-farbe') || undefined }
}
export function kreisVorgabenSetzen(karte: string, v: Partial<KreisVorgaben>) {
  localStorage.setItem(vKey(karte), JSON.stringify({ ...kreisVorgaben(karte), ...v }))
}

export function kreisStart(e: Pin, karte: string): KreisEdit {
  const v = kreisVorgaben(karte)
  return e.kreis
    ? { id: e.id, radius: e.kreis.radius, farbe: e.kreis.farbe || pinFarbe(e), gebunden: e.kreis.gebunden !== false, mitte: FL.kreisMitte(e)!, neu: false, alsStandard: false }
    : { id: e.id, radius: v.radius, farbe: v.farbe || pinFarbe(e), gebunden: v.gebunden, mitte: e.position, neu: true, alsStandard: true }
}
// Nadel verschoben: Ein fester Kreis („bleibt am Standort“) bleibt stehen, wenn die Nadel aus ihm heraus versetzt wird,
// und um die neue Position entsteht automatisch ein neuer Kreis mit den Vorgaben (Radius, Farbe, Verhalten).
export function kreisNachVerschieben(e: Pin, neu: LatLng, karte: string): Pick<Pin, 'kreis' | 'kreiseStehen'> | null {
  const k = e.kreis
  if (!k || k.gebunden !== false || FL.abstand(k.mitte, neu) <= k.radius) return null
  const v = kreisVorgaben(karte)
  // Farbe folgt der Nadel: neuer Kreis und stehen gebliebener Kreis behalten die Farbe des bisherigen Kreises
  // (fest gespeichert, damit sie sich nicht mehr mit der Nadelfarbe oder einem anderen Kreis ändert)
  const farbe = k.farbe || pinFarbe(e)
  const stehen = FL.kreiseStehenSauber([...(e.kreiseStehen ?? []), { ...k, farbe, id: 'k' + Math.random().toString(36).slice(2, 10) }])
  const kreis = FL.kreisSauber({ radius: v.radius, farbe, gebunden: v.gebunden, mitte: neu, seit: new Date().toISOString().slice(0, 10) }, neu)
  return { kreis, kreiseStehen: stehen }
}
// Einen Kreis der Nadel ändern/entfernen (stehenId null = aktueller Kreis)
export function kreisAendern(e: Pin, stehenId: string | null, f: (k: Kreis) => Kreis | null): Pick<Pin, 'kreis' | 'kreiseStehen'> {
  if (stehenId == null) return { kreis: e.kreis ? f(e.kreis) : null, kreiseStehen: e.kreiseStehen ?? [] }
  const st = (e.kreiseStehen ?? []).flatMap((x) => { if (x.id !== stehenId) return [x]; const n = f(x); return n ? [{ ...n, id: x.id, gebunden: false, mitte: x.mitte }] : [] })
  return { kreis: e.kreis ?? null, kreiseStehen: st }
}
export const kreisAnzahl = (e: Pin) => (e.kreis ? 1 : 0) + (e.kreiseStehen?.length ?? 0)

export function kreisAusEdit(k: KreisEdit, e: Pin) {
  return FL.kreisSauber({ radius: k.radius, farbe: k.farbe, gebunden: k.gebunden, mitte: k.gebunden ? e.position : k.mitte, seit: e.kreis?.seit ?? new Date().toISOString().slice(0, 10) }, e.position)
}

// Zeile im Nadel-Detail
export function KreisDetail(p: { e: Pin; karte: string; darf: boolean; onEinkreisen: () => void; onAbgebaut: (stehenId: string | null) => void }) {
  const st = p.e.kreiseStehen ?? []
  const alte = st.length ? (
    <div className="kreis-alte">
      <p><strong>◯ {st.length === 1 ? 'Kreis' : `${st.length} Kreise`} am alten Standort</strong> <small>(bleiben stehen, bis abgebaut)</small></p>
      {st.map((x) => <div key={x.id} className="kreis-alt" style={{ borderColor: x.farbe || pinFarbe(p.e) }}>
        <span>{zahl(x.radius)} m · {zahl(FL.abstand(x.mitte, p.e.position))} m entfernt{x.seit ? ` · seit ${x.seit.split('-').reverse().join('.')}` : ''}</span>
        {p.darf && <button onClick={() => p.onAbgebaut(x.id)}>✂️ Abgebaut</button>}
      </div>)}
    </div>
  ) : null
  const k = p.e.kreis
  if (!k) {
    const v = kreisVorgaben(p.karte)
    return <>{p.darf && <button className="kreis-knopf" onClick={p.onEinkreisen}>◯ Einkreisen <small>(eingezäunt · {zahl(v.radius)} m · {v.gebunden ? 'an Nadel gebunden' : 'bleibt am Standort'})</small></button>}{alte}</>
  }
  const weg = k.gebunden === false && p.e.position ? FL.abstand(k.mitte, p.e.position) : 0
  return (<>
    <div className="kreis-zeile" style={{ borderColor: k.farbe || pinFarbe(p.e) }}>
      <p><strong>◯ Eingezäunt</strong> · Radius {zahl(k.radius)} m<br /><small>{kreisText(k.radius)}</small><br />
        <small>{k.gebunden === false ? `bleibt am Standort${weg > k.radius ? ` · Nadel steht ${zahl(weg)} m daneben` : ''}` : 'an Nadel gebunden (wandert mit)'}{k.seit ? ` · seit ${k.seit.split('-').reverse().join('.')}` : ''}</small></p>
      {p.darf && <div className="knoepfe">
        <button onClick={p.onEinkreisen}>◯ Kreis ändern</button>
        <button onClick={() => p.onAbgebaut(null)}>✂️ Abgebaut</button>
      </div>}
    </div>
    {alte}
  </>)
}

// Leiste beim Bearbeiten: Radius nur noch per Griff auf der Karte (7k), Farbe, Standard-Radius, dann Schnellauswahl gebunden/fest = speichern
export function KreisLeiste(p: { k: KreisEdit; name: string; standard: number; andere: number; set: (k: KreisEdit) => void; onSpeichern: (gebunden: boolean) => void; onAlle: () => void; onAbbrechen: () => void }) {
  const k = p.k
  return (
    <InfoKarte art="kreis" className="leiste kreis-leiste" role="dialog" label={k.frei ? 'Freier Kreis' : 'Kreis um Nadel'} klappbar onZu={p.onAbbrechen}
      titel={k.frei ? <>◯ {k.neu ? 'Freier Kreis' : `Freier Kreis${p.name ? ` „${p.name}“` : ''}`} <small>(ohne Nadel)</small></> : <>◯ Kreis um „{p.name || 'Nadel'}“</>}
      zusammen={<><span className="chip stark" title={kreisText(k.radius)}><i className="chip-punkt" style={{ background: k.farbe }} />{zahl(Math.round(k.radius))} m</span><span className="chip">{kreisText(k.radius).split(' · ')[0]}</span><span className="chip kreis-netze">{netzText(k.radius)}</span></>}
      schnell={k.frei
        ? <><button className="primaer" onClick={() => p.onSpeichern(false)}>✓ {k.neu ? 'Kreis setzen' : 'Speichern'}</button><button onClick={p.onAbbrechen}>Abbrechen</button></>
        : <><button className={k.gebunden ? 'primaer' : ''} onClick={() => p.onSpeichern(true)}>🔗 Gebunden</button><button className={!k.gebunden ? 'primaer' : ''} onClick={() => p.onSpeichern(false)}>📍 Bleibt</button></>}>
      <Tipp lang={<>Größe: Griff <span className="kreis-griff-mini">↔</span> am Rand ziehen{k.frei ? ' · Karte antippen verschiebt die Mitte' : ''}</>}
        kurz={<>Griff <span className="kreis-griff-mini">↔</span> ziehen{k.frei ? ' · Tippen = Mitte' : ''}</>} />
      <FarbMenue label="Farbe des Kreises" wert={k.farbe} farben={KREIS_FARBEN} onWahl={(f) => p.set({ ...k, farbe: f })} />
      <details className="kreis-mehr">
        <summary>Standard-Radius{p.andere > 0 ? ' · auf andere Kreise übernehmen' : ''}</summary>
        <div className="kreis-standard">
          <label><input type="checkbox" checked={k.alsStandard} onChange={(x) => p.set({ ...k, alsStandard: x.target.checked })} /> Für neue Kreise merken <small>(jetzt {zahl(p.standard)} m{k.alsStandard && Math.round(k.radius) !== p.standard ? ` → ${zahl(Math.round(k.radius))} m` : ''})</small></label>
          {p.andere > 0 && <button type="button" className="kreis-alle" onClick={p.onAlle}>↺ {zahl(Math.round(k.radius))} m auf {p.andere === 1 ? 'den anderen Kreis' : `alle ${p.andere} anderen Kreise`} übernehmen</button>}
        </div>
      </details>
      {k.frei ? (
        <div className="knoepfe">
          <button className="primaer" onClick={() => p.onSpeichern(false)}>✓ {k.neu ? 'Kreis setzen' : 'Speichern'}</button>
          <button onClick={p.onAbbrechen}>Abbrechen</button>
        </div>
      ) : <>
      <div className="kreis-wahl">
        <button type="button" className={k.gebunden ? 'aktiv' : ''} onClick={() => p.onSpeichern(true)}><span>🔗 An Nadel gebunden</span><small>wandert mit der Nadel</small></button>
        <button type="button" className={!k.gebunden ? 'aktiv' : ''} onClick={() => p.onSpeichern(false)}><span>📍 Bleibt am Standort</span><small>fester Pferch · Karte antippen setzt Mitte</small></button>
      </div>
      <div className="knoepfe">
        <button onClick={p.onAbbrechen}>Abbrechen</button>
      </div>
      </>}
    </InfoKarte>
  )
}

// Kleine Farb-Auswahl direkt am Kreis (Tipp auf den Kreis in der Karte)
export function KreisPop(p: { x: number; y: number; titel: string; farbe: string; onFarbe: (f: string) => void; onAendern?: () => void; onAbgebaut: () => void; onZu: () => void }) {
  const w = 250, h = 130
  const left = Math.max(6, Math.min(window.innerWidth - w - 6, p.x - w / 2))
  const top = p.y + 14 + h < window.innerHeight ? p.y + 14 : Math.max(6, p.y - h - 14)
  return (
    <div className="kreis-pop" role="dialog" aria-label="Farbe des Kreises" style={{ left, top, width: w }} onClick={(x) => x.stopPropagation()}>
      <div className="kreis-pop-kopf"><span>◯ {p.titel}</span><button className="kreis-pop-zu" aria-label="Schließen" onClick={p.onZu}>✕</button></div>
      <FarbMenue label="Farbe des Kreises" wert={p.farbe} farben={KREIS_FARBEN} onWahl={p.onFarbe} eigene={false} klein />
      <div className="kreis-pop-knoepfe">
        {p.onAendern && <button onClick={p.onAendern} title="Kreis bearbeiten: Größe per Griff am Rand, Farbe, Verhalten">↔ Größe ändern</button>}
        <button onClick={p.onAbgebaut}>✂️ Abgebaut</button>
      </div>
    </div>
  )
}

// Freier Kreis (ohne Nadel) im Detail: Maße, Ändern (Radius/Farbe/Mitte), Abgebaut (= entfernen)
export function FreiKreisDetail(p: { e: Pin; darf: boolean; onAendern: () => void; onAbgebaut: () => void }) {
  const k = p.e.kreis
  if (!k) return null
  return (
    <div className="kreis-zeile" style={{ borderColor: k.farbe || pinFarbe(p.e) }}>
      <p><strong>◯ Freier Kreis</strong> · Radius {zahl(k.radius)} m<br /><small>{kreisText(k.radius)}</small><br />
        <small>ohne Nadel · bleibt an seinem Platz{k.seit ? ` · seit ${k.seit.split('-').reverse().join('.')}` : ''}</small></p>
      {p.darf && <div className="knoepfe">
        <button onClick={p.onAendern}>◯ Kreis ändern</button>
        <button onClick={p.onAbgebaut}>✂️ Abgebaut</button>
      </div>}
    </div>
  )
}
