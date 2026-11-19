// Kreis um Nadel: schnelle Einzäunung („Tiere/Nadel ist eingezäunt“) statt Fläche zeichnen
import { FARBEN, FLAECHE_STANDARD, pinFarbe, type LatLng, type Pin } from '../types'
import type { Kreis } from '../../server/flaechen.js'
import * as FL from '../../server/flaechen.js'

export interface KreisEdit { id: string; radius: number; farbe: string; gebunden: boolean; mitte: LatLng; neu: boolean; alsStandard: boolean; frei?: boolean }
export const KREIS_FARBEN = [{ name: 'Grün', wert: FLAECHE_STANDARD }, ...FARBEN]
const zahl = (x: number, n = 0) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n })

export function kreisText(r: number) {
  const m = FL.kreisMasse(r)
  return `≈ ${FL.haText(m.ha)} · ${FL.m2Text(m.m2)} · Umfang ${FL.umfangText(m.umfang)} · ${m.netze} ${m.netze === 1 ? 'Netz' : 'Netze'} à ${FL.NETZ_LAENGE} m`
}

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

// Leiste beim Bearbeiten: Radius (Griff/Zahl) mit Standard-Radius, Farbe, dann Schnellauswahl gebunden/fest = speichern
export function KreisLeiste(p: { k: KreisEdit; name: string; standard: number; andere: number; set: (k: KreisEdit) => void; onSpeichern: (gebunden: boolean) => void; onAlle: () => void; onAbbrechen: () => void }) {
  const k = p.k
  return (
    <div className="leiste kreis-leiste" role="dialog" aria-label="Kreis um Nadel">
      {k.frei
        ? <p><strong>◯ {k.neu ? 'Freier Kreis' : `Freier Kreis${p.name ? ` „${p.name}“` : ''}`}</strong> <small>(ohne Nadel)</small> – Griff <span className="kreis-griff-mini">↔</span> am Rand ziehen oder Meter eingeben · Karte antippen verschiebt die Mitte</p>
        : <p><strong>◯ Kreis um „{p.name || 'Nadel'}“</strong> – Griff <span className="kreis-griff-mini">↔</span> am Rand ziehen oder Meter eingeben</p>}
      <div className="kreis-zeile-form">
        <label className="kreis-radius">Radius (m)<input type="number" inputMode="numeric" min={FL.KREIS_MIN} max={FL.KREIS_MAX} step={1} value={k.radius}
          onChange={(x) => { const r = Number(x.target.value); if (Number.isFinite(r) && r > 0) p.set({ ...k, radius: Math.min(FL.KREIS_MAX, r) }) }}
          onBlur={() => p.set({ ...k, radius: Math.max(FL.KREIS_MIN, Math.round(k.radius)) })} /></label>
        <div className="kreis-schnell">{[10, 20, 30, 50, 100].map((r) => <button key={r} type="button" className={k.radius === r ? 'aktiv' : ''} onClick={() => p.set({ ...k, radius: r })}>{r}</button>)}</div>
      </div>
      <p className="hinweis klein mess-text">{kreisText(k.radius)}</p>
      <div className="kreis-standard">
        <label><input type="checkbox" checked={k.alsStandard} onChange={(x) => p.set({ ...k, alsStandard: x.target.checked })} /> Standard-Radius für alle neuen Kreise <small>(jetzt {zahl(p.standard)} m{k.alsStandard && Math.round(k.radius) !== p.standard ? ` → ${zahl(Math.round(k.radius))} m` : ''})</small></label>
        {p.andere > 0 && <button type="button" className="kreis-alle" onClick={p.onAlle}>↺ {zahl(Math.round(k.radius))} m auf {p.andere === 1 ? 'den anderen Kreis' : `alle ${p.andere} anderen Kreise`} übernehmen</button>}
      </div>
      <div className="farben" role="radiogroup" aria-label="Farbe des Kreises">
        {KREIS_FARBEN.map((f) => <button type="button" key={f.wert} title={f.name} aria-label={f.name} role="radio" aria-checked={k.farbe === f.wert} className={k.farbe === f.wert ? 'aktiv' : ''} style={{ background: f.wert }} onClick={() => p.set({ ...k, farbe: f.wert })} />)}
        <label className="frei" title="Eigene Farbe">eigene:<input type="color" value={k.farbe} onChange={(x) => p.set({ ...k, farbe: x.target.value })} /></label>
      </div>
      {k.frei ? (
        <div className="knoepfe">
          <button className="primaer" onClick={() => p.onSpeichern(false)}>✓ {k.neu ? 'Kreis setzen' : 'Speichern'}</button>
          <button onClick={p.onAbbrechen}>Abbrechen</button>
        </div>
      ) : <>
      <p className="hinweis klein kreis-wahl-titel">Mit einem Tipp speichern:</p>
      <div className="kreis-wahl">
        <button type="button" className={k.gebunden ? 'aktiv' : ''} onClick={() => p.onSpeichern(true)}><span>🔗 An Nadel gebunden</span><small>wandert mit der Nadel</small></button>
        <button type="button" className={!k.gebunden ? 'aktiv' : ''} onClick={() => p.onSpeichern(false)}><span>📍 Bleibt am Standort</span><small>fester Pferch · Karte antippen setzt Mitte</small></button>
      </div>
      <div className="knoepfe">
        <button onClick={p.onAbbrechen}>Abbrechen</button>
      </div>
      </>}
    </div>
  )
}

// Kleine Farb-Auswahl direkt am Kreis (Tipp auf den Kreis in der Karte)
export function KreisPop(p: { x: number; y: number; titel: string; farbe: string; onFarbe: (f: string) => void; onAendern?: () => void; onAbgebaut: () => void; onZu: () => void }) {
  const w = 250, h = 160
  const left = Math.max(6, Math.min(window.innerWidth - w - 6, p.x - w / 2))
  const top = p.y + 14 + h < window.innerHeight ? p.y + 14 : Math.max(6, p.y - h - 14)
  return (
    <div className="kreis-pop" role="dialog" aria-label="Farbe des Kreises" style={{ left, top, width: w }} onClick={(x) => x.stopPropagation()}>
      <div className="kreis-pop-kopf"><span>◯ {p.titel}</span><button className="kreis-pop-zu" aria-label="Schließen" onClick={p.onZu}>✕</button></div>
      <div className="farben">{KREIS_FARBEN.map((f) => <button type="button" key={f.wert} title={f.name} aria-label={f.name} className={p.farbe === f.wert ? 'aktiv' : ''} style={{ background: f.wert }} onClick={() => p.onFarbe(f.wert)} />)}</div>
      <div className="kreis-pop-knoepfe">
        {p.onAendern && <button onClick={p.onAendern}>Radius …</button>}
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
