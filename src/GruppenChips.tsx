// 7k: Gruppe mit einem Tipp wählen – Chips „ohne“, je Gruppe (mit Farbe) und „＋ neue Gruppe“
import { gruppenFarbe, type Gruppe } from './types'

export function GruppenChips(p: { gruppen: Gruppe[]; wert: string | null; onWahl: (gid: string | null) => void; onNeu?: () => void; label?: string }) {
  return (
    <div className="gruppen-chips" role="radiogroup" aria-label={p.label ?? 'Gruppe'} onClick={(x) => x.stopPropagation()}>
      <button type="button" role="radio" aria-checked={!p.wert} className={`gruppen-chip${!p.wert ? ' aktiv' : ''}`} onClick={() => p.onWahl(null)}>ohne</button>
      {p.gruppen.map((g) => (
        <button key={g.id} type="button" role="radio" aria-checked={p.wert === g.id} className={`gruppen-chip${p.wert === g.id ? ' aktiv' : ''}`} onClick={() => p.onWahl(g.id)}>
          <i className="chip-punkt" style={{ background: gruppenFarbe(g, p.gruppen) }} />{g.name}
        </button>
      ))}
      {p.onNeu && <button type="button" className="gruppen-chip neu" onClick={p.onNeu}>＋ neue Gruppe</button>}
    </div>
  )
}
