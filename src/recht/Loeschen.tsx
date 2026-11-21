// Karte / Hof löschen mit starker Bestätigung (Namen eintippen + Sicherungs-Häkchen), 30 Tage Papierkorb.
import { useState } from 'react'
import { zurHandyKarte, type useKarte } from '../daten'

type K = ReturnType<typeof useKarte>
export const datumText = (iso: string) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }) : '–')
const sauber = (s: string) => s.replace(/\s+/g, ' ').trim()

export function LoeschBestaetigung(p: { name: string; was: 'Karte' | 'Hof'; knopf: string; endgueltig?: boolean; onExport?: () => void; onLoeschen: () => Promise<unknown>; onAbbrechen: () => void; onFehler: (s: string) => void; setName: (s: string) => void; eingabe: string }) {
  const [gesichert, setGesichert] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const passt = sauber(p.eingabe) === sauber(p.name)
  return (
    <form className="loesch-box" onSubmit={async (ev) => {
      ev.preventDefault()
      if (!passt || !gesichert) return
      setLaeuft(true)
      try { await p.onLoeschen() } catch (e) { p.onFehler((e as Error).message); setLaeuft(false) }
    }}>
      {p.onExport && <p className="hinweis klein">Tipp: Vorher eine <button type="button" className="link-knopf" onClick={p.onExport}>Sicherung herunterladen</button> – damit lässt sich alles später wiederherstellen.</p>}
      <label>Zur Bestätigung den Namen {p.was === 'Hof' ? 'des Hofs' : 'der Karte'} eintippen: <strong>„{p.name}“</strong>
        <input value={p.eingabe} onChange={(e) => p.setName(e.target.value)} autoComplete="off" spellCheck={false} aria-label={`Name ${p.was === 'Hof' ? 'des Hofs' : 'der Karte'}`} />
      </label>
      <label className="haken"><input type="checkbox" checked={gesichert} onChange={(e) => setGesichert(e.target.checked)} />
        <span>{p.endgueltig ? 'Mir ist klar, dass die Daten danach nicht wiederhergestellt werden können.' : 'Ich habe eine Sicherung heruntergeladen oder brauche die Daten nicht mehr.'}</span>
      </label>
      <div className="knoepfe">
        <button type="button" onClick={p.onAbbrechen}>Abbrechen</button>
        <button type="submit" className="gefahr-voll" disabled={!passt || !gesichert || laeuft}>{laeuft ? 'Lösche …' : p.knopf}</button>
      </div>
    </form>
  )
}

// Abschnitt in den Einstellungen (Admin einer Einzelkarte bzw. Inhaber eines Hofs mit mehreren Karten)
export function KarteLoeschenAbschnitt(p: { k: K; onExport: () => void; meldung: (s: string) => void }) {
  const { k } = p
  const [offen, setOffen] = useState(false)
  const [eingabe, setEingabe] = useState('')
  if (!k.karteId || !k.darfLoeschen || k.geloescht) return null
  return (
    <>
      <h3 className="gefahr-titel">Karte löschen</h3>
      {!offen ? (
        <>
          <p className="hinweis klein">Löscht „{k.kartenName}“ mit allen {k.eintraege.length} Nadeln und Flächen, Notizen und Gruppen – für alle Personen. Die Karte liegt dann <strong>30 Tage im Papierkorb</strong> und kann so lange wiederhergestellt werden.{k.hof ? ' Den ganzen Hof löschst du unter „Mein Hof“.' : ''}</p>
          <button className="gefahr" onClick={() => setOffen(true)}>🗑️ Karte löschen …</button>
        </>
      ) : (
        <LoeschBestaetigung name={k.kartenName} was="Karte" knopf="Karte löschen" eingabe={eingabe} setName={setEingabe} onExport={p.onExport}
          onAbbrechen={() => { setOffen(false); setEingabe('') }} onFehler={p.meldung}
          onLoeschen={() => k.datenschutz.karteLoeschen(eingabe).then((j) => p.meldung(`Karte gelöscht – wiederherstellbar bis ${datumText(j.geloescht.bis)}`))} />
      )}
    </>
  )
}

// Hinweis, wenn die geöffnete Karte im Papierkorb liegt
export function GeloeschtHinweis(p: { k: K; onExport: () => void; meldung: (s: string) => void }) {
  const { k } = p
  const [endgueltig, setEndgueltig] = useState(false)
  const [eingabe, setEingabe] = useState('')
  const g = k.geloescht
  if (!g) return null
  const verwalter = k.darfLoeschen || (g.hof && k.hof?.rolle === 'inhaber')
  const name = g.hof ? k.hof?.name ?? '' : k.kartenName
  return (
    <div className="geloescht-hinweis" role="alert">
      <h2>{g.hof ? 'Dieser Hof wurde gelöscht' : 'Diese Karte wurde gelöscht'}</h2>
      {g.bis && <p>{g.hof ? 'Alle Karten des Hofs liegen' : 'Sie liegt'} im Papierkorb und wird am <strong>{datumText(g.bis)}</strong> endgültig entfernt.</p>}
      {!verwalter ? (
        <p className="hinweis">Nur {g.hof ? 'der Inhaber' : 'ein Admin'} kann sie bis dahin wiederherstellen. Änderungen von diesem Gerät werden aufbewahrt und gesendet, falls das passiert.</p>
      ) : !endgueltig ? (
        <div className="knoepfe">
          <button className="primaer" onClick={() => k.datenschutz.wiederherstellen().catch((e) => p.meldung(e.message))}>↩️ Wiederherstellen</button>
          <button onClick={p.onExport}>⬇️ Sicherung herunterladen</button>
          <button className="gefahr" onClick={() => setEndgueltig(true)}>Jetzt endgültig löschen …</button>
        </div>
      ) : (
        <LoeschBestaetigung name={name} was={g.hof ? 'Hof' : 'Karte'} knopf="Endgültig löschen" endgueltig eingabe={eingabe} setName={setEingabe}
          onAbbrechen={() => { setEndgueltig(false); setEingabe('') }} onFehler={p.meldung}
          onLoeschen={async () => { await k.datenschutz.endgueltig(eingabe); zurHandyKarte() }} />
      )}
    </div>
  )
}
