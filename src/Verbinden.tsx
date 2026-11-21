// 7p: Startbildschirm der Home-Bildschirm-App ohne gemerkte Karte (iOS: eigener, leerer Speicher).
// Statt einer leeren Handy-Karte: persönlichen Link einfügen -> gemerkt und geöffnet. Oder bewusst die Handy-Karte ohne Konto.
import { useState } from 'react'
import { lesen } from './speicher'
import { NUR_HANDY, linkLesen } from './verbindenHilfe'

export function Verbinden() {
  const [text, setText] = useState('')
  const [fehler, setFehler] = useState('')
  const lokal = lesen<unknown[]>('wt-lokal', []).length
  const kannEinfuegen = !!navigator.clipboard?.readText
  const oeffnen = (t = text) => {
    const ziel = linkLesen(t)
    if (!ziel) { setFehler('Das ist kein FlockMap-Link. Er sieht so aus: …/?karte=…&zugang=…'); return }
    location.href = ziel // die Karte merkt sich Karte + Zugang beim Öffnen (Gerät + Cookie)
  }
  const einfuegen = async () => {
    try { const t = await navigator.clipboard.readText(); setText(t); setFehler(''); if (linkLesen(t)) oeffnen(t) } catch { setFehler('Einfügen nicht erlaubt – bitte lange ins Feld tippen und „Einsetzen“ wählen.') }
  }
  return (
    <main className="verbinden">
      <div className="verbinden-karte">
        <img src="/icon-192.png" alt="" width="64" height="64" />
        <h1>Karte verbinden</h1>
        <p>Die App auf dem Home-Bildschirm hat einen eigenen Speicher. Füge <strong>einmal</strong> deinen persönlichen Link ein (aus Nachricht oder E-Mail kopieren) – danach öffnet das Symbol immer deine Karte.</p>
        <label>Persönlichen Link einfügen
          <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://…/?karte=…&zugang=…" value={text}
            onChange={(e) => { setText(e.target.value); setFehler('') }} onKeyDown={(e) => { if (e.key === 'Enter') oeffnen() }} />
        </label>
        {fehler && <p className="fehler" role="alert">{fehler}</p>}
        <div className="knoepfe">
          {kannEinfuegen && <button type="button" onClick={einfuegen}>📋 Einfügen</button>}
          <button type="button" className="primaer" disabled={!text.trim()} onClick={() => oeffnen()}>Karte öffnen</button>
        </div>
        {lokal > 0 && <p className="hinweis klein">Auf der Handy-Karte dieses Symbols liegen {lokal} {lokal === 1 ? 'Eintrag' : 'Einträge'}. Nach dem Verbinden kannst du sie auf deine Karte übernehmen.</p>}
        <hr />
        <button type="button" className="verbinden-lokal" onClick={() => { localStorage.setItem(NUR_HANDY, '1'); location.href = '/?lokal' }}>📱 Handy-Karte ohne Konto</button>
        <p className="hinweis klein">Nur auf diesem Gerät, ohne Teilen. Verbinden geht später über Einstellungen oder einen Link.</p>
      </div>
    </main>
  )
}
