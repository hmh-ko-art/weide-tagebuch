// 7j: Kompakte Farbauswahl – ein Knopf „Farbe“ mit aktueller Farbe; Antippen klappt die Palette auf, Wahl klappt sie wieder zu
import { useEffect, useRef, useState } from 'react'

export function FarbMenue(p: { farben: { wert: string; name: string }[]; wert: string; onWahl: (f: string) => void; label: string; titel?: string; eigene?: boolean; klein?: boolean }) {
  const [auf, setAuf] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Tippen außerhalb schließt die Palette
  useEffect(() => {
    if (!auf) return
    const zu = (ev: PointerEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setAuf(false) }
    document.addEventListener('pointerdown', zu, true)
    return () => document.removeEventListener('pointerdown', zu, true)
  }, [auf])
  const name = p.farben.find((f) => f.wert.toLowerCase() === p.wert.toLowerCase())?.name ?? 'eigene Farbe'
  return (
    <div className={`farb-menue${auf ? ' auf' : ''}${p.klein ? ' klein' : ''}`} ref={ref}>
      <button type="button" className="farb-knopf" aria-haspopup="true" aria-expanded={auf} aria-label={`${p.label}: ${name} – ändern`} onClick={() => setAuf(!auf)}>
        <span className="farb-muster" style={{ background: p.wert }} aria-hidden="true" />
        <span className="farb-knopf-text">{p.titel ?? 'Farbe'}<small>{name}</small></span>
        <span className="farb-pfeil" aria-hidden="true">▾</span>
      </button>
      {auf && (
        <div className="farb-pop farben" role="radiogroup" aria-label={p.label}>
          {p.farben.map((f) => (
            <button type="button" key={f.wert} title={f.name} aria-label={f.name} role="radio" aria-checked={p.wert.toLowerCase() === f.wert.toLowerCase()}
              className={p.wert.toLowerCase() === f.wert.toLowerCase() ? 'aktiv' : ''} style={{ background: f.wert }} onClick={() => { p.onWahl(f.wert); setAuf(false) }} />
          ))}
          {p.eigene !== false && <label className="frei" title="Eigene Farbe">eigene:<input type="color" value={p.wert} onChange={(x) => p.onWahl(x.target.value.toLowerCase())} /></label>}
        </div>
      )}
    </div>
  )
}
