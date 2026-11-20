// 7m: Name direkt in der Infokarte bearbeiten – Tipp fokussiert das Feld, Enter/Verlassen speichert, Esc bricht ab
import { useEffect, useRef, useState } from 'react'

export function InlineName(p: { wert: string; darf: boolean; onSpeichern: (t: string) => void; platzhalter?: string; leerText?: string; fokus?: number; label?: string; max?: number }) {
  const [t, setT] = useState(p.wert)
  const [aktiv, setAktiv] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const abbrechen = useRef(false)
  useEffect(() => { if (p.fokus) ref.current?.focus() }, [p.fokus])
  if (!p.darf) return p.wert ? <span className="inline-name-text">{p.wert}</span> : <span className="ohne-name">{p.leerText ?? 'ohne Namen'}</span>
  return (
    <input ref={ref} className={`inline-name${p.wert ? '' : ' leer'}`} type="text" enterKeyHint="done" autoComplete="off" maxLength={p.max ?? 200}
      aria-label={p.label ?? 'Name'} placeholder={p.platzhalter ?? 'Name eingeben'} value={aktiv ? t : p.wert} size={Math.max(8, Math.min(40, (aktiv ? t : p.wert).length + 1))}
      onClick={(x) => x.stopPropagation()}
      onFocus={() => { setT(p.wert); setAktiv(true); abbrechen.current = false }}
      onChange={(x) => setT(x.target.value)}
      onKeyDown={(x) => {
        if (x.key === 'Enter') { x.preventDefault(); ref.current?.blur() }
        else if (x.key === 'Escape') { x.preventDefault(); x.stopPropagation(); abbrechen.current = true; ref.current?.blur() }
      }}
      onBlur={() => {
        const neu = t.replace(/\s+/g, ' ').trim()
        if (!abbrechen.current && neu !== p.wert.trim()) p.onSpeichern(neu)
        abbrechen.current = false
        setAktiv(false)
      }} />
  )
}
