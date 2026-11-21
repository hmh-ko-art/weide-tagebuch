// „Meine Daten“: Auskunft (was ist über mich gespeichert – Server und Gerät), Export als Datei,
// Daten auf diesem Gerät löschen, eigenen Zugang löschen.
import { useEffect, useState } from 'react'
import { zurHandyKarte, geraetCookieVergessen, type useKarte } from '../daten'
import { geraetLeeren, geraetUebersicht } from '../speicher'
import { herunterladen, dateiName } from '../austausch/zeilen'

type K = ReturnType<typeof useKarte>
interface Auskunft {
  person: { name: string; rolle: string; seit: string | null }
  hof: { name: string; rolle: string | null; pinEingerichtet: boolean; karten: string[] } | null
  karte: { name: string }
  eintraege: { karte: string; titel: string }[]
  notizen: { karte: string; eintrag: string; text: string; zeitpunkt: string }[]
  gruppen: { karte: string; name: string }[]
  umtriebe?: { karte: string; art: string; datum: string; herde: string; von: string | null; nach: string | null }[]
  pruefungen?: { karte: string; geraet: string; datum: string; kv: number | null; stand: string | null }[]
  fristen?: { karte: string; flaeche: string; frist: string; termin: string; am: string | null }[]
}
const ROLLE: Record<string, string> = { inhaber: 'Inhaber', admin: 'Admin', mitarbeiter: 'Mitarbeiter', nutzer: 'Nutzer', ansehen: 'Nur ansehen' }
const mb = (b: number) => (b / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB'

export function MeineDaten(p: { k: K; onSchliessen: () => void; meldung: (s: string) => void }) {
  const { k } = p
  const [daten, setDaten] = useState<(Auskunft & Record<string, unknown>) | null>(null)
  const [fehler, setFehler] = useState('')
  const [geraet, setGeraet] = useState<Awaited<ReturnType<typeof geraetUebersicht>> | null>(null)
  const [loeschenOffen, setLoeschenOffen] = useState(false)
  const [verstanden, setVerstanden] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    geraetUebersicht().then(setGeraet)
    if (k.karteId && k.ich) k.datenschutz.meineDaten().then((d) => setDaten(d as Auskunft & Record<string, unknown>)).catch((e) => setFehler(navigator.onLine === false ? 'Ohne Netz nicht abrufbar.' : (e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const rolle = daten?.hof?.rolle ?? daten?.person.rolle ?? ''

  return (
    <section className="panel meine-daten">
      <div className="sheet-kopf">
        <h2>Meine Daten</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
      </div>
      <p className="hinweis">Hier siehst du, was FlockMap über dich speichert – und kannst es mitnehmen oder löschen. Kein Tracking, keine Werbung. <a href="#recht/datenschutz">Datenschutzerklärung</a></p>

      <h3>Auf dem Server</h3>
      {!k.karteId ? <p className="hinweis">Diese Karte liegt nur auf diesem Gerät – auf dem Server ist nichts über dich gespeichert.</p>
        : !k.ich ? <p className="hinweis">Du siehst diese Karte nur an (ohne eigenen Zugang). Über dich ist auf dem Server nichts gespeichert.</p>
        : fehler ? <p className="hinweis gefahr">{fehler}</p>
        : !daten ? <p className="hinweis">Lade …</p>
        : (
          <>
            <dl className="daten-liste">
              <dt>Name</dt><dd>{daten.person.name}</dd>
              <dt>Rolle</dt><dd>{ROLLE[rolle] ?? rolle}{daten.hof ? ` im Hof „${daten.hof.name}“` : ''}</dd>
              {daten.person.seit && <><dt>Dabei seit</dt><dd>{new Date(daten.person.seit).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}</dd></>}
              {daten.hof && <><dt>PIN</dt><dd>{daten.hof.pinEingerichtet ? 'eingerichtet (nur als verschlüsselter Prüfwert gespeichert)' : 'keine'}</dd></>}
              <dt>Persönlicher Link</dt><dd>gespeichert (geheim – nicht weitergeben)</dd>
              <dt>Von dir angelegt</dt><dd>{daten.eintraege.length} Nadeln/Flächen · {daten.notizen.length} Notizen · {daten.gruppen.length} Gruppen{daten.umtriebe?.length ? ` · ${daten.umtriebe.length} Umtriebe` : ''}{daten.pruefungen?.length ? ` · ${daten.pruefungen.length} Geräte-Prüfungen` : ''}{daten.fristen?.length ? ` · ${daten.fristen.length} erledigte Fristen` : ''}{daten.hof && daten.hof.karten.length > 1 ? ` (auf ${daten.hof.karten.length} Karten)` : ''}</dd>
            </dl>
            <p className="hinweis klein">Dazu kommt bei jeder Änderung ein Vermerk, wer sie gemacht hat. Deine IP-Adresse wird von FlockMap nicht gespeichert (nur kurz im Arbeitsspeicher gezählt, um Missbrauch abzuwehren).</p>
            <button onClick={() => herunterladen(new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' }), dateiName('Meine-Daten-' + daten.person.name, 'json'))}>⬇️ Meine Daten herunterladen (Datei)</button>
          </>
        )}

      <h3>Auf diesem Gerät</h3>
      {geraet ? (
        <p className="hinweis">{geraet.zugaenge === 1 ? '1 gespeicherter Zugang' : `${geraet.zugaenge} gespeicherte Zugänge`} · {geraet.karten} Kartenkopie(n) für offline · {geraet.einstellungen} Einstellungen · {geraet.kacheln} Kartenbilder{geraet.ausgang ? ` · ${geraet.ausgang} noch nicht gesendete Änderung(en)` : ''}{geraet.belegt != null ? ` · zusammen ca. ${mb(geraet.belegt)}` : ''}</p>
      ) : <p className="hinweis">Lade …</p>}
      <p className="hinweis klein">Das bleibt nur im Browser dieses Geräts (keine Cookies) und dient dazu, dass FlockMap schnell startet und offline funktioniert.</p>
      <button className="gefahr" onClick={async () => {
        const warnung = geraet?.ausgang ? `\n\nAchtung: ${geraet.ausgang} Änderung(en) sind noch nicht gesendet und gehen verloren!` : ''
        if (!confirm(`Alle FlockMap-Daten auf diesem Gerät löschen (Zugänge, Offline-Kopien, Einstellungen, Kartenbilder)? Auf dem Server bleibt alles erhalten – du brauchst danach deinen persönlichen Link wieder.${warnung}`)) return
        await geraetLeeren()
        await geraetCookieVergessen()
        location.href = location.pathname
      }}>🧹 Daten auf diesem Gerät löschen</button>

      {k.karteId && k.ich && (
        <>
          <h3 className="gefahr-titel">Meinen Zugang löschen</h3>
          {!loeschenOffen ? (
            <>
              <p className="hinweis klein">Entfernt dich {k.hof ? `aus dem Hof „${k.hof.name}“ (alle Karten)` : `von der Karte „${k.kartenName}“`}: Name, Rolle, persönlicher Link und PIN werden sofort gelöscht.</p>
              <button className="gefahr" onClick={() => setLoeschenOffen(true)}>Zugang löschen …</button>
            </>
          ) : (
            <div className="loesch-box">
              <p className="hinweis"><strong>Was passiert mit meinen Einträgen?</strong> Weiden, Tierzahlen und Notizen gehören zu den Aufzeichnungen des Betriebs und bleiben für die anderen erhalten – aber <strong>ohne deinen Namen</strong>: Sie erscheinen dann als „ehemaliger Nutzer“. Wenn einzelne Notizen ganz weg sollen, lösch sie vorher selbst oder bitte einen Admin darum.</p>
              <label className="haken"><input type="checkbox" checked={verstanden} onChange={(e) => setVerstanden(e.target.checked)} /><span>Verstanden – ich brauche danach eine neue Einladung, um wieder mitzumachen.</span></label>
              <div className="knoepfe">
                <button onClick={() => { setLoeschenOffen(false); setVerstanden(false) }}>Abbrechen</button>
                <button className="gefahr-voll" disabled={!verstanden || laeuft} onClick={async () => {
                  setLaeuft(true)
                  try { await k.datenschutz.zugangLoeschen(); zurHandyKarte() }
                  catch (e) { p.meldung((e as Error).message); setLaeuft(false) }
                }}>{laeuft ? 'Lösche …' : 'Zugang endgültig löschen'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
