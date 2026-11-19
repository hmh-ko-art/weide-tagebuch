// Kreis um Nadel: schnelle Einzäunung („Tiere/Nadel ist eingezäunt“) statt Fläche zeichnen
import { FARBEN, FLAECHE_STANDARD, pinFarbe, type LatLng, type Pin } from '../types'
import * as FL from '../../server/flaechen.js'

export interface KreisEdit { id: string; radius: number; farbe: string; gebunden: boolean; mitte: LatLng; neu: boolean }
const KREIS_FARBEN = [{ name: 'Grün', wert: FLAECHE_STANDARD }, ...FARBEN]
const zahl = (x: number, n = 0) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n })

export function kreisText(r: number) {
  const m = FL.kreisMasse(r)
  return `≈ ${FL.haText(m.ha)} · ${FL.m2Text(m.m2)} · Umfang ${FL.umfangText(m.umfang)} · ${m.netze} ${m.netze === 1 ? 'Netz' : 'Netze'} à ${FL.NETZ_LAENGE} m`
}

export function kreisStart(e: Pin): KreisEdit {
  return e.kreis
    ? { id: e.id, radius: e.kreis.radius, farbe: e.kreis.farbe || pinFarbe(e), gebunden: e.kreis.gebunden !== false, mitte: FL.kreisMitte(e)!, neu: false }
    : { id: e.id, radius: Number(localStorage.getItem('wt-kreis-radius')) || FL.KREIS_STANDARD, farbe: localStorage.getItem('wt-kreis-farbe') || pinFarbe(e), gebunden: true, mitte: e.position, neu: true }
}
export function kreisAusEdit(k: KreisEdit, e: Pin) {
  return FL.kreisSauber({ radius: k.radius, farbe: k.farbe, gebunden: k.gebunden, mitte: k.gebunden ? e.position : k.mitte, seit: e.kreis?.seit ?? new Date().toISOString().slice(0, 10) }, e.position)
}

// Zeile im Nadel-Detail
export function KreisDetail(p: { e: Pin; darf: boolean; onEinkreisen: () => void; onAbgebaut: () => void }) {
  const k = p.e.kreis
  if (!k) return p.darf ? <button className="kreis-knopf" onClick={p.onEinkreisen}>◯ Einkreisen <small>(eingezäunt)</small></button> : null
  const weg = k.gebunden === false && p.e.position ? FL.abstand(k.mitte, p.e.position) : 0
  return (
    <div className="kreis-zeile" style={{ borderColor: k.farbe || pinFarbe(p.e) }}>
      <p><strong>◯ Eingezäunt</strong> · Radius {zahl(k.radius)} m<br /><small>{kreisText(k.radius)}</small><br />
        <small>{k.gebunden === false ? `bleibt am Standort${weg > k.radius ? ` · Nadel steht ${zahl(weg)} m daneben` : ''}` : 'an Nadel gebunden (wandert mit)'}{k.seit ? ` · seit ${k.seit.split('-').reverse().join('.')}` : ''}</small></p>
      {p.darf && <div className="knoepfe">
        <button onClick={p.onEinkreisen}>◯ Kreis ändern</button>
        <button onClick={p.onAbgebaut}>✂️ Abgebaut</button>
      </div>}
    </div>
  )
}

// Leiste beim Bearbeiten (Radius per Griff oder Zahl, Farbe, gebunden/fest)
export function KreisLeiste(p: { k: KreisEdit; name: string; set: (k: KreisEdit) => void; onFertig: () => void; onAbbrechen: () => void }) {
  const k = p.k
  return (
    <div className="leiste kreis-leiste" role="dialog" aria-label="Kreis um Nadel">
      <p><strong>◯ Kreis um „{p.name || 'Nadel'}“</strong> – Griff <span className="kreis-griff-mini">↔</span> am Rand ziehen oder Meter eingeben</p>
      <div className="kreis-zeile-form">
        <label className="kreis-radius">Radius (m)<input type="number" inputMode="numeric" min={FL.KREIS_MIN} max={FL.KREIS_MAX} step={1} value={k.radius}
          onChange={(x) => { const r = Number(x.target.value); if (Number.isFinite(r) && r > 0) p.set({ ...k, radius: Math.min(FL.KREIS_MAX, r) }) }}
          onBlur={() => p.set({ ...k, radius: Math.max(FL.KREIS_MIN, Math.round(k.radius)) })} /></label>
        <div className="kreis-schnell">{[10, 20, 30, 50, 100].map((r) => <button key={r} type="button" className={k.radius === r ? 'aktiv' : ''} onClick={() => p.set({ ...k, radius: r })}>{r}</button>)}</div>
      </div>
      <p className="hinweis klein mess-text">{kreisText(k.radius)}</p>
      <div className="farben" role="radiogroup" aria-label="Farbe des Kreises">
        {KREIS_FARBEN.map((f) => <button type="button" key={f.wert} title={f.name} aria-label={f.name} role="radio" aria-checked={k.farbe === f.wert} className={k.farbe === f.wert ? 'aktiv' : ''} style={{ background: f.wert }} onClick={() => p.set({ ...k, farbe: f.wert })} />)}
        <label className="frei" title="Eigene Farbe">eigene:<input type="color" value={k.farbe} onChange={(x) => p.set({ ...k, farbe: x.target.value })} /></label>
      </div>
      <div className="kreis-bindung" role="radiogroup" aria-label="Verhalten beim Verschieben der Nadel">
        <label><input type="radio" name="kreis-bindung" checked={k.gebunden} onChange={() => p.set({ ...k, gebunden: true })} /> an Nadel gebunden <small>(wandert mit)</small></label>
        <label><input type="radio" name="kreis-bindung" checked={!k.gebunden} onChange={() => p.set({ ...k, gebunden: false })} /> bleibt am Standort <small>(z. B. fester Pferch – Tippen auf die Karte versetzt die Mitte)</small></label>
      </div>
      <div className="knoepfe">
        <button className="primaer" onClick={p.onFertig}>Fertig</button>
        <button onClick={p.onAbbrechen}>Abbrechen</button>
      </div>
    </div>
  )
}
