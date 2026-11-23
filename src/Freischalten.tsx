// 7s-1: Einlöseseite /?freischalten[&code=FM-…] – Lizenzcode eingeben, Hof + Karte anlegen, Admin-Link anzeigen.
// Nur für Betriebe (B2B). Auf Wunsch wird die Handy-Karte dieses Geräts als erste Karte übernommen.
import { useState } from 'react'
import { lesen } from './speicher'
import { appLink } from './basis'
import { LIZENZ } from './lizenzText'
import { RechtLinks } from './recht/Recht'
import { NAME_MAX } from './daten'

const sauber = (s: string) => s.replace(/\s+/g, ' ').trim()
export function Freischalten(p: { code: string | null }) {
  const [code, setCode] = useState(p.code ?? '')
  const [hofName, setHofName] = useState('')
  const [name, setName] = useState('')
  const [kartenName, setKartenName] = useState('Weidekarte')
  const [b2b, setB2b] = useState(false)
  const lokal = lesen<unknown[]>('wt-lokal', [])
  const [mitnehmen, setMitnehmen] = useState(lokal.length > 0)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fertig, setFertig] = useState<{ link: string; hof: string; eintraege: number } | null>(null)
  const [kopiert, setKopiert] = useState(false)
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false

  const einloesen = async () => {
    setFehler('')
    if (navigator.onLine === false) { setFehler('Zum Freischalten brauchst du Netz.'); return }
    setLaeuft(true)
    try {
      const body = {
        code, hofName: sauber(hofName), inhaberName: sauber(name), kartenName: sauber(kartenName) || 'Weidekarte', b2b,
        ...(mitnehmen ? { eintraege: lokal, gruppen: lesen<unknown[]>('wt-lokal-gruppen', []), weideplan: lesen<unknown>('wt-lokal-plan', null) ?? undefined, pacht: lesen<unknown>('wt-lokal-pacht', null) ?? undefined } : {}),
      }
      const r = await fetch('/api/lizenz/einloesen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.fehler || (r.status >= 500 ? 'Server nicht erreichbar – bitte gleich nochmal.' : `Fehler ${r.status}`))
      setFertig({ link: appLink(`karte=${j.karte}&zugang=${j.zugang}`), hof: j.hof?.name ?? sauber(hofName), eintraege: j.eintraege ?? 0 })
    } catch (e) {
      setFehler((e as Error).message === 'Failed to fetch' ? 'Server nicht erreichbar – bitte gleich nochmal.' : (e as Error).message)
    } finally { setLaeuft(false) }
  }
  const kopieren = async () => {
    if (!fertig) return
    try { await navigator.clipboard.writeText(fertig.link); setKopiert(true) } catch { prompt('Link kopieren:', fertig.link) }
  }
  const teilen = () => { if (fertig && navigator.share) navigator.share({ title: `FlockMap – ${fertig.hof}`, text: 'Mein persönlicher FlockMap-Link (vertraulich):', url: fertig.link }).catch(() => {}) }

  return (
    <div className="einstieg freischalten">
      <div className="einstieg-karte">
        <img src="/icon-192.png" alt="" width="64" height="64" />
        <p className="einstieg-marke">FlockMap</p>
        {!fertig ? (
          <form onSubmit={(ev) => { ev.preventDefault(); einloesen() }}>
            <h1>Hof freischalten</h1>
            <div className="lizenz-box">
              <strong>{LIZENZ.produkt}</strong>
              <span>{LIZENZ.preis}</span>
              <span>{LIZENZ.enthalten}</span>
              <span>{LIZENZ.laufzeit}</span>
              <span className="lizenz-b2b">{LIZENZ.b2b}</span>
            </div>
            {offline && <p className="fehler gefahr" role="alert">Zum Freischalten brauchst du Netz.</p>}
            <label>Lizenzcode<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="FM-XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" /></label>
            <label>Name des Hofs<input value={hofName} maxLength={60} onChange={(e) => setHofName(e.target.value)} placeholder="z. B. Schäferei Petersen" /></label>
            <label>Dein Name<input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="z. B. Jens Petersen" autoComplete="name" /></label>
            <label>Name der ersten Karte<input value={kartenName} maxLength={60} onChange={(e) => setKartenName(e.target.value)} /></label>
            {lokal.length > 0 && <label className="haken"><input type="checkbox" checked={mitnehmen} onChange={(e) => setMitnehmen(e.target.checked)} /><span>Meine Handy-Karte übernehmen ({lokal.length} {lokal.length === 1 ? 'Eintrag' : 'Einträge'})</span></label>}
            <label className="haken"><input type="checkbox" checked={b2b} onChange={(e) => setB2b(e.target.checked)} /><span>Ich nutze FlockMap für meinen Betrieb (Unternehmer, nicht Verbraucher) und habe die <a href="#recht/nutzung">Nutzungsbedingungen</a> gelesen.</span></label>
            {fehler && <p className="fehler gefahr" role="alert">{fehler}</p>}
            <button type="submit" className="primaer" disabled={laeuft || !code.trim() || !sauber(hofName) || !sauber(name) || !b2b}>{laeuft ? 'Schalte frei …' : '🔑 Hof freischalten'}</button>
            <p className="hinweis klein">{LIZENZ.gratis} <a href="/?lokal">Zur Handy-Karte</a></p>
          </form>
        ) : (
          <div className="freischalten-fertig">
            <h1>Freigeschaltet!</h1>
            <p><strong>{fertig.hof}</strong> ist angelegt{fertig.eintraege ? `, ${fertig.eintraege} ${fertig.eintraege === 1 ? 'Eintrag' : 'Einträge'} der Handy-Karte übernommen` : ''}. Du bist <strong>Inhaber</strong>.</p>
            <p>Dein persönlicher Admin-Link:</p>
            <input readOnly value={fertig.link} onFocus={(e) => e.target.select()} aria-label="Admin-Link" className="admin-link" />
            <div className="knoepfe">
              <button type="button" onClick={kopieren}>{kopiert ? '✓ Kopiert' : '📋 Kopieren'}</button>
              {'share' in navigator && <button type="button" onClick={teilen}>Teilen</button>}
            </div>
            <p className="gefahr-hinweis">Diesen Link sicher aufbewahren (z. B. als Lesezeichen oder in einer Nachricht an dich selbst) – er ist dein Schlüssel. Wer ihn hat, kann deinen Hof verwalten.</p>
            <a className="btn primaer" href={fertig.link}>Zur Karte</a>
            <p className="hinweis klein">In der Karte unter „🏡 Mein Hof“ legst du eine PIN fest und lädst dein Team ein. Für das Home-Bildschirm-Symbol die Karte öffnen und „Zum Home-Bildschirm“ wählen.</p>
          </div>
        )}
        <RechtLinks klein />
      </div>
    </div>
  )
}
