// 7i: Einheitliche Infokarten unten links (Handy: unten über die ganze Breite, PC: schwebend links unten)
// – Kopfzeile mit Titel + kurzer Zusammenfassung, einklappbar (Zustand je Kartenart gemerkt), Nebensachen hinter „Mehr“,
//   Erklärtexte (Tipp) blenden sich nach ein paar Sekunden auf eine Kurzfassung ein.
import { useEffect, useState, type ReactNode } from 'react'

const KEY = 'wt-info-klein'
const kleinGemerkt = (art: string) => { try { return !!JSON.parse(localStorage.getItem(KEY) || '{}')[art] } catch { return false } }
const kleinMerken = (art: string, an: boolean) => { try { const m = JSON.parse(localStorage.getItem(KEY) || '{}'); if (an) m[art] = 1; else delete m[art]; localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* privat-Modus */ } }

export function InfoKarte(p: {
  art: string // Kartenart (für den gemerkten Klapp-Zustand), z. B. 'detail', 'kreis', 'zeichnen'
  titel: ReactNode
  zusammen?: ReactNode // kurze Zusammenfassung (Chips) – auch eingeklappt sichtbar
  schnell?: ReactNode // Knöpfe, die eingeklappt sichtbar bleiben (z. B. Speichern)
  mehr?: ReactNode // Nebensachen hinter „Mehr“
  nach?: ReactNode // nach „Mehr“ (z. B. Tagebuch-Notizen)
  klappbar?: boolean
  onZu?: () => void
  label: string
  role?: string
  className?: string
  children?: ReactNode
}) {
  const [klein, setKleinRoh] = useState(() => !!p.klappbar && kleinGemerkt(p.art))
  const [mehr, setMehr] = useState(false)
  const setKlein = (an: boolean) => { setKleinRoh(an); kleinMerken(p.art, an) }
  return (
    <section className={`info-karte${klein ? ' klein' : ''}${p.className ? ` ${p.className}` : ''}`} role={p.role ?? 'region'} aria-label={p.label}>
      <div className={`info-kopf${klein ? ' tippbar' : ''}`} onClick={klein ? () => setKlein(false) : undefined}>
        <h2 className="info-titel">{p.titel}</h2>
        {p.klappbar && <button type="button" className="info-klapp" aria-expanded={!klein} aria-label={klein ? 'Aufklappen' : 'Einklappen'} title={klein ? 'Aufklappen' : 'Einklappen (Karte freier)'}
          onClick={(x) => { x.stopPropagation(); setKlein(!klein) }}><span aria-hidden="true">{klein ? '▴' : '▾'}</span></button>}
        {p.onZu && <button type="button" className="info-zu" aria-label="Schließen" title="Schließen" onClick={(x) => { x.stopPropagation(); p.onZu!() }}>✕</button>}
        {p.zusammen && <div className="info-zusammen">{p.zusammen}</div>}
      </div>
      {klein
        ? p.schnell && <div className="info-schnell knoepfe">{p.schnell}</div>
        : <div className="info-inhalt">
            {p.children}
            {p.mehr && <>
              <button type="button" className="info-mehr-knopf" aria-expanded={mehr} onClick={() => setMehr(!mehr)}>{mehr ? 'Weniger ▴' : 'Mehr ▾'}</button>
              {mehr && <div className="info-mehr">{p.mehr}</div>}
            </>}
            {p.nach}
          </div>}
    </section>
  )
}

// Erklärtext, der sich nach ein paar Sekunden auf eine Kurzfassung reduziert (ⓘ zeigt ihn wieder)
export function Tipp(p: { lang: ReactNode; kurz?: ReactNode; s?: number }) {
  const [lang, setLang] = useState(true)
  useEffect(() => { if (!lang) return; const t = setTimeout(() => setLang(false), (p.s ?? 6) * 1000); return () => clearTimeout(t) }, [lang, p.s])
  return (
    <p className={`info-tipp${lang ? '' : ' kurz'}`}>
      {lang || !p.kurz ? p.lang : p.kurz}
      {!lang && p.kurz && <button type="button" className="info-tipp-i" aria-label="Hinweis wieder zeigen" title="Hinweis wieder zeigen" onClick={() => setLang(true)}>ⓘ</button>}
    </p>
  )
}

// Vorübergehender Hinweis im Infostapel (optional mit Countdown-Balken und Knöpfen)
export function InfoHinweis(p: { children: ReactNode; bis?: number; dauer?: number; knoepfe?: ReactNode; vorlaeufig?: boolean; onZu?: () => void }) {
  return (
    <div className={`info-hinweis${p.vorlaeufig ? ' vorlaeufig' : ''}${p.knoepfe ? ' mit-knopf' : ''}`} role="status" onClick={p.onZu}>
      <span className="info-hinweis-text">{p.children}</span>
      {p.knoepfe && <span className="info-hinweis-knoepfe">{p.knoepfe}</span>}
      {p.bis && p.dauer ? <Balken key={p.bis} bis={p.bis} dauer={p.dauer} /> : null}
    </div>
  )
}

// Countdown-Balken: läuft einmal von „Rest“ bis 0 (reine CSS-Animation)
function Balken(p: { bis: number; dauer: number }) {
  const [rest] = useState(() => Math.max(0, p.bis - Date.now()))
  if (rest <= 0) return null
  return <span className="info-countdown" aria-hidden="true" style={{ animationDuration: `${rest}ms`, transform: `scaleX(${Math.min(1, rest / p.dauer)})` }} />
}
