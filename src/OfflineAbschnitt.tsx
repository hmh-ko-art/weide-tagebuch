// Einstellungen → „Offline“: Status, Postausgang, Kartenspeicher, Gebiete für offline sichern, letzte Konflikte
import { useEffect, useState } from 'react'
import { konfliktText, type useKarte } from './daten'
import { speicherArt } from './speicher'
import { aktuelleAnsicht, dauerhaftAnfragen, gebietLoeschen, gebiete, gebietSichern, GEBIETE_MAX, kachelnLeeren, offlineMoeglich, speicherInfo, type Gebiet } from './offline'

const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export function OfflineAbschnitt(p: { k: ReturnType<typeof useKarte>; meldung: (s: string) => void }) {
  const { k } = p
  const [info, setInfo] = useState<Awaited<ReturnType<typeof speicherInfo>> | null>(null)
  const [liste, setListe] = useState<Gebiet[]>(gebiete)
  const [laeuft, setLaeuft] = useState(false)
  const [dauerhaft, setDauerhaft] = useState<boolean | null>(null)
  const neu = () => { speicherInfo().then(setInfo).catch(() => {}); setListe(gebiete()) }
  useEffect(() => { neu(); navigator.storage?.persisted?.().then(setDauerhaft).catch(() => {}) }, [])
  const sichern = async () => {
    const a = aktuelleAnsicht()
    const vorschlag = `Ausschnitt ${new Date().toLocaleDateString('de-DE')}${a ? ` (Zoom ${a.zoom})` : ''}`
    const name = prompt('Name für dieses Gebiet (z. B. „Deich Nord“):', vorschlag)
    if (name === null) return
    setLaeuft(true)
    try {
      const r = await gebietSichern(name.trim() || vorschlag)
      setDauerhaft(await dauerhaftAnfragen())
      p.meldung(r.gesichert
        ? `${r.gesichert} Kartenstücke gesichert${r.voll ? ' – Speicher für Gebiete ist voll' : ''}${r.fehlend > 50 ? '. Tipp: im Gebiet einmal näher heranzoomen und erneut sichern' : ''}`
        : 'Noch nichts zum Sichern – bitte das Gebiet erst mit Netz ansehen (auch etwas heranzoomen)')
    } catch (e) { p.meldung((e as Error).message) }
    setLaeuft(false)
    neu()
  }
  const wartendText = k.wartend === 1 ? '1 Änderung wartet' : `${k.wartend} Änderungen warten`
  return (
    <>
      <h3>Offline</h3>
      {k.karteId ? (
        <>
          <p className="hinweis">
            {k.status === 'offline' ? <strong className="offline-text">Gerade offline. </strong> : k.status === 'verbunden' ? 'Verbunden. ' : ''}
            {k.wartend ? <><strong>{wartendText}</strong> auf das Senden – passiert automatisch, sobald wieder Netz da ist. </> : 'Alle Änderungen sind beim Server. '}
            {k.letzteSync && <>Zuletzt synchronisiert: {zeit(k.letzteSync)}.</>}
          </p>
          {k.wartend > 0 && k.status !== 'offline' && <button onClick={() => k.jetztSenden()}>Jetzt senden</button>}
        </>
      ) : <p className="hinweis">Diese Karte liegt nur auf diesem Gerät und funktioniert immer offline.</p>}
      <p className="hinweis klein">Ohne Empfang kannst du ganz normal Nadeln, Flächen, Notizen und Gruppen anlegen, ändern, verschieben und löschen. Alles wird auf dem Handy gespeichert ({speicherArt()}) und später automatisch gesendet. Auch das Neuladen der App geht ohne Netz.</p>

      {offlineMoeglich() && (
        <>
          <h3>Karte für offline</h3>
          <p className="hinweis klein">Das Satellitenbild wird von Esri geliefert. Gespeichert wird nur, was du dir mit Netz schon angesehen hast (so verlangen es die Nutzungsbedingungen – ein Massen-Download ist nicht erlaubt). Die zuletzt angesehenen ca. 2.500 Kartenstücke bleiben automatisch erhalten.</p>
          <p className="hinweis klein">Damit ein Gebiet sicher erhalten bleibt: mit Netz hinfahren bzw. hinschieben, einmal etwas heranzoomen, dann <strong>„Diesen Ausschnitt sichern“</strong>. Gesicherte Gebiete werden nie automatisch gelöscht (höchstens {GEBIETE_MAX.toLocaleString('de-DE')} Kartenstücke).</p>
          <button className="primaer" disabled={laeuft} onClick={sichern}>{laeuft ? 'Sichere …' : '📥 Diesen Kartenausschnitt sichern'}</button>
          {liste.length > 0 && (
            <ul className="nutzer-liste gebiete-liste">
              {liste.map((g) => (
                <li key={g.id}><div className="nutzer-kopf"><span><strong>{g.name}</strong> <small className="hinweis">· {g.urls.length} Stücke · {zeit(g.datum)}</small></span>
                  <button className="gefahr klein-knopf" onClick={() => confirm(`Gebiet „${g.name}“ nicht mehr offline sichern?`) && gebietLoeschen(g.id).then(neu)}>Entfernen</button></div></li>
              ))}
            </ul>
          )}
          <p className="hinweis klein">
            Gespeichert: {info ? `${info.kacheln.toLocaleString('de-DE')} zuletzt angesehene + ${info.geschuetzt.toLocaleString('de-DE')} gesicherte Kartenstücke` : '…'}
            {info?.mb != null && ` · FlockMap belegt ca. ${Math.round(info.mb)} MB`}
            {dauerhaft === true && ' · vor dem automatischen Löschen durch den Browser geschützt'}
          </p>
          <button onClick={() => confirm('Zuletzt angesehene Kartenstücke löschen? Gesicherte Gebiete und deine Einträge bleiben erhalten.') && kachelnLeeren().then(() => { neu(); p.meldung('Kartenspeicher geleert') })}>Kartenspeicher leeren</button>
        </>
      )}

      {k.konflikte.length > 0 && (
        <>
          <h3>Gleichzeitige Änderungen</h3>
          <ul className="konflikt-liste">{[...k.konflikte].reverse().map((x, i) => <li key={i} className="hinweis klein">⚠️ {konfliktText(x)}</li>)}</ul>
        </>
      )}
    </>
  )
}
