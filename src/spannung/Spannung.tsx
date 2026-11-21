// Weidezaungerät an der Nadel: Spannung schnell eintragen (ein Tipp), letzter Wert + kurzer Verlauf
import { useState } from 'react'
import * as SP from '../../server/spannung.js'
import { tagPlus } from '../../server/weideplan.js'
import type { Eintrag } from '../types'
import { tagKurz } from './schwelle'

const uhr = (z?: string) => (z ? new Date(z).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '')

export function SpannungZeile(p: { e: Eintrag; darf: boolean; schwelle: number; onMessen: (kv: number) => void }) {
  const [wert, setWert] = useState('')
  const [fehler, setFehler] = useState('')
  const l = p.e.spannung ?? []
  const heute = SP.heute(), gestern = tagPlus(heute, -1), ab = tagPlus(heute, -13)
  const letzte = l[0]
  const heuteSchon = letzte?.datum === heute
  const speichern = () => {
    const kv = SP.kvWert(wert)
    if (kv === undefined) { setFehler('Bitte 0–20 kV eingeben, z. B. 6,2'); return }
    p.onMessen(kv); setWert(''); setFehler('')
  }
  const verlauf = l.filter((m) => m.datum >= ab)
  return (
    <div className={`spannung${letzte && letzte.kv < p.schwelle ? ' tief' : ''}`}>
      <div className="spannung-kopf">
        <strong>⚡ {p.e.typ === 'pin' ? 'Weidezaungerät' : 'Strom / Spannung'}</strong>
        {letzte
          ? <span><span className={`spannung-marke${letzte.kv < p.schwelle ? ' tief' : ''}`}>{SP.kvText(letzte.kv)}</span> <small>{tagKurz(letzte.datum, heute, gestern)}{letzte.zeitpunkt && letzte.datum === heute ? ` ${uhr(letzte.zeitpunkt)}` : ''}{letzte.autor ? ` · ${letzte.autor}` : ''}</small></span>
          : <small>noch keine Messung</small>}
      </div>
      {letzte && letzte.kv < p.schwelle && <p className="spannung-warn">Unter der Warnschwelle von {SP.kvText(p.schwelle)} – Zaun prüfen!</p>}
      {p.darf && (
        <form className="spannung-form" onSubmit={(x) => { x.preventDefault(); speichern() }}>
          <label className="spannung-eingabe"><span className="unsichtbar">Spannung in kV</span>
            <input type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder={letzte ? String(letzte.kv).replace('.', ',') : 'z. B. 6,2'} value={wert} onChange={(x) => { setWert(x.target.value); setFehler('') }} aria-label="Spannung in kV" />
            <span>kV</span>
          </label>
          <button className="primaer" type="submit" disabled={!wert.trim()}>⚡ {heuteSchon ? 'Ersetzen' : 'Speichern'}</button>
        </form>
      )}
      {fehler && <p className="fehler klein">{fehler}</p>}
      {p.darf && heuteSchon && <p className="hinweis klein">Heute schon gemessen – ein neuer Wert ersetzt den von heute.</p>}
      {verlauf.length > 1 && (
        <details className="spannung-verlauf">
          <summary>Verlauf (14 Tage, {verlauf.length} {verlauf.length === 1 ? 'Messung' : 'Messungen'})</summary>
          <ul>{verlauf.map((m) => <li key={m.datum}><span>{tagKurz(m.datum, heute, gestern)}</span><span className={`spannung-marke klein${m.kv < p.schwelle ? ' tief' : ''}`}>{SP.kvText(m.kv)}</span><small>{m.autor ?? ''}</small></li>)}</ul>
        </details>
      )}
    </div>
  )
}
