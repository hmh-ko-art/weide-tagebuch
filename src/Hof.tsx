// Hof-Konten: ein Hof (Betrieb) hat eine gemeinsame Personenliste und eine oder mehrere Karten.
// Jede Person hat EINEN persönlichen Link, der auf allen Karten des Hofs gilt. Optional PIN für ein neues Gerät.
import { useCallback, useEffect, useState } from 'react'
import { zugangKey, zugangsLink, NAME_MAX, type HofRolle, type useKarte } from './daten'
import { RechtLinks } from './recht/Recht'
import { APP_BASIS } from './basis'
import { LIZENZ, LIZENZ_ART } from './lizenzText'
import { LoeschBestaetigung, datumText } from './recht/Loeschen'

type K = ReturnType<typeof useKarte>
export const ROLLEN: Record<HofRolle, { name: string; text: string }> = {
  inhaber: { name: 'Inhaber', text: 'darf alles: Personen, Karten, Hof-Name' },
  admin: { name: 'Admin', text: 'darf alles eintragen und Personen und Karten verwalten' },
  mitarbeiter: { name: 'Mitarbeiter', text: 'trägt Nadeln, Flächen und Notizen ein, ändert eigene' },
  ansehen: { name: 'Nur ansehen', text: 'sieht alles live, kann nichts ändern' },
}
interface Mitglied { id: string; name: string; rolle: HofRolle; zugang: string; hatPin: boolean; erstellt: string }
interface HofKarte { id: string; name: string; eintraege: number }
interface HofDaten { id: string; name: string; karten: HofKarte[]; geloescht?: { bis: string }; ich: { id: string; name: string; rolle: HofRolle; hatPin: boolean } | null }
interface Einladung { code: string; rolle: HofRolle; name: string | null; bis: string }

const basis = () => `${APP_BASIS}/`
export const hofEinladungsLink = (hid: string, code: string) => `${basis()}?hof=${hid}&einladung=${code}`
export const hofAnmeldeLink = (hid: string) => `${basis()}?hof=${hid}`

async function anfrage<T>(url: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.fehler || (r.status >= 500 ? 'Server nicht erreichbar – bitte gleich nochmal.' : `Fehler ${r.status}`))
  return j as T
}
function hofApi(hid: string, zugang: string | null) {
  const z: Record<string, string> = zugang ? { 'x-zugang': zugang } : {}
  const a = <T,>(pfad: string, method = 'GET', body?: unknown) => anfrage<T>(`/api/hoefe/${hid}${pfad}`, method, body, z)
  return {
    laden: () => a<HofDaten>(''),
    umbenennen: (name: string) => a<HofDaten>('', 'PATCH', { name }),
    karteAnlegen: (name: string) => a<{ id: string; karten: HofKarte[] }>('/karten', 'POST', { name }),
    mitglieder: () => a<Mitglied[]>('/mitglieder'),
    mitgliedAendern: (id: string, d: { rolle?: HofRolle; name?: string; neuerZugang?: boolean; pinLoeschen?: boolean }) => a<Mitglied>(`/mitglieder/${id}`, 'PATCH', d),
    mitgliedEntfernen: (id: string) => a<{ ok: boolean }>(`/mitglieder/${id}`, 'DELETE'),
    einladungen: () => a<Einladung[]>('/einladungen'),
    einladen: (rolle: HofRolle, name: string) => a<Einladung>('/einladungen', 'POST', { rolle, name: name || undefined }),
    einladungZurueck: (code: string) => a<Einladung[]>(`/einladungen/${code}`, 'DELETE'),
    pinSetzen: (pin: string | null) => a<{ hatPin: boolean }>('/ich/pin', 'PUT', { pin }),
    loeschen: (name: string) => a<{ geloescht: { bis: string } }>('/loeschen', 'POST', { name }),
  }
}
// Zu einer anderen Karte des Hofs wechseln: derselbe persönliche Zugang gilt dort auch
export function karteOeffnen(id: string, zugang: string | null) {
  if (zugang) localStorage.setItem(zugangKey(id), zugang)
  location.href = `${basis()}?karte=${id}`
}
async function teilen(text: string, url: string, meldung: (s: string) => void, kopiert = 'Link kopiert') {
  if (navigator.share) { try { await navigator.share({ title: 'FlockMap', text, url }); return } catch { /* abgebrochen */ } }
  try { await navigator.clipboard.writeText(url); meldung(kopiert) } catch { prompt('Link kopieren:', url) }
}
const X = () => <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const sauber = (s: string) => s.replace(/\s+/g, ' ').trim()
const bisText = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

// ---------------------------------------------------------------------------------------
// „Mein Hof“ – Panel in der App (für alle Hof-Mitglieder; Verwalten nur Inhaber/Admin)
// ---------------------------------------------------------------------------------------
export function HofPanel(p: { k: K; onSchliessen: () => void; meldung: (s: string) => void }) {
  const { k } = p
  const hid = k.hof!.id
  const api = hofApi(hid, k.zugang)
  const [hof, setHof] = useState<HofDaten | null>(null)
  const [mitglieder, setMitglieder] = useState<Mitglied[] | null>(null)
  const [einladungen, setEinladungen] = useState<Einladung[]>([])
  const [hofName, setHofName] = useState('')
  const [neueKarte, setNeueKarte] = useState('')
  const [einRolle, setEinRolle] = useState<HofRolle>('mitarbeiter')
  const [einName, setEinName] = useState('')
  const [neueEinladung, setNeueEinladung] = useState<Einladung | null>(null)
  const [pin, setPin] = useState('')
  const [loeschOffen, setLoeschOffen] = useState(false)
  const [loeschName, setLoeschName] = useState('')
  const fehler = (e: Error) => p.meldung(e.message)
  const verwalter = hof?.ich?.rolle === 'inhaber' || hof?.ich?.rolle === 'admin'
  const binInhaber = hof?.ich?.rolle === 'inhaber'

  const laden = useCallback(async () => {
    try {
      const h = await api.laden()
      setHof(h); setHofName(h.name)
      if (!h.geloescht && (h.ich?.rolle === 'inhaber' || h.ich?.rolle === 'admin')) {
        const [m, e] = await Promise.all([api.mitglieder(), api.einladungen()])
        setMitglieder(m); setEinladungen(e)
      }
    } catch (e) { fehler(e as Error) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hid, k.zugang])
  // bei Änderungen der Personenliste (z. B. jemand ist per Einladung beigetreten) neu laden
  useEffect(() => { laden() }, [laden, k.nutzerStand])

  const einladungTeilen = (e: Einladung) => {
    const url = hofEinladungsLink(hid, e.code)
    const anrede = e.name ? `Hallo ${e.name}, ` : ''
    teilen(`${anrede}du bist zum Hof „${hof?.name}“ in FlockMap eingeladen (${ROLLEN[e.rolle].name}). Link einmal öffnen, fertig – gilt 14 Tage: ${url}`, url, p.meldung, 'Einladungslink kopiert')
  }
  const linkTeilen = (m: Mitglied) => {
    const url = zugangsLink(k.karteId!, m.zugang)
    teilen(`Hallo ${m.name}, hier ist dein persönlicher Zugang zum Hof „${hof?.name}“ in FlockMap: ${url}`, url, p.meldung, `Link für ${m.name} kopiert`)
  }
  const nachAenderung = (text?: string) => { laden(); k.ichLaden(); if (text) p.meldung(text) }

  if (!hof) return (
    <section className="panel hof-panel"><div className="sheet-kopf"><h2>Mein Hof</h2><button className="x" onClick={p.onSchliessen} aria-label="Schließen"><X /></button></div><p className="hinweis">Lade …</p></section>
  )
  return (
    <section className="panel hof-panel">
      <div className="sheet-kopf">
        <h2>🏡 {hof.name}</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><X /></button>
      </div>
      {hof.ich ? <p className="hinweis">Du bist hier <strong>{ROLLEN[hof.ich.rolle].name}</strong> – {ROLLEN[hof.ich.rolle].text}.</p>
        : <p className="hinweis">Du siehst diesen Hof nur über einen Ansehen-Link.</p>}

      <h3>Karten des Hofs ({hof.karten.length})</h3>
      <ul className="hof-karten">
        {hof.karten.map((x) => (
          <li key={x.id} className={x.id === k.karteId ? 'aktiv' : ''}>
            <button onClick={() => x.id !== k.karteId && karteOeffnen(x.id, k.zugang)} disabled={x.id === k.karteId}>
              <span className="hof-karte-name">{x.name}</span>
              <small>{x.id === k.karteId ? 'geöffnet' : `${x.eintraege} Einträge · öffnen`}</small>
            </button>
          </li>
        ))}
      </ul>
      {verwalter && (
        <form className="zeile-form" onSubmit={(ev) => { ev.preventDefault(); const n = sauber(neueKarte); if (!n) return; api.karteAnlegen(n).then((r) => { setNeueKarte(''); setHof({ ...hof, karten: r.karten }); p.meldung(`Karte „${n}“ angelegt`) }).catch(fehler) }}>
          <input value={neueKarte} maxLength={60} placeholder="z. B. Winterweiden 2027" onChange={(e) => setNeueKarte(e.target.value)} aria-label="Name der neuen Karte" />
          <button type="submit" disabled={!sauber(neueKarte)}>＋ Karte</button>
        </form>
      )}

      {verwalter && mitglieder && (
        <>
          <h3>Leute einladen</h3>
          <p className="hinweis klein">Jede Einladung ist <strong>persönlich</strong>: Sie funktioniert genau einmal und 14 Tage lang. Die Person tippt den Link an, bestätigt ihren Namen – fertig. Kein Passwort, kein Konto, keine E-Mail.</p>
          <form className="hof-einladen" onSubmit={(ev) => { ev.preventDefault(); api.einladen(einRolle, sauber(einName)).then((e) => { setNeueEinladung(e); setEinName(''); laden() }).catch(fehler) }}>
            <label>Name (optional)<input value={einName} maxLength={NAME_MAX} placeholder="z. B. Jan" onChange={(e) => setEinName(e.target.value)} /></label>
            <label>Rolle<select value={einRolle} onChange={(e) => setEinRolle(e.target.value as HofRolle)}>
              <option value="mitarbeiter">Mitarbeiter</option><option value="ansehen">Nur ansehen</option><option value="admin">Admin</option>
            </select></label>
            <button type="submit" className="primaer">Einladung erstellen</button>
          </form>
          <p className="hinweis klein">{ROLLEN[einRolle].name}: {ROLLEN[einRolle].text}.</p>
          {neueEinladung && (
            <div className="neu-link">
              <p>Einladung{neueEinladung.name ? ` für ${neueEinladung.name}` : ''} ({ROLLEN[neueEinladung.rolle].name}) ist fertig:</p>
              <input readOnly value={hofEinladungsLink(hid, neueEinladung.code)} onFocus={(e) => e.target.select()} aria-label="Einladungslink" />
              <div className="knoepfe"><button className="primaer" onClick={() => einladungTeilen(neueEinladung)}>Per WhatsApp/SMS teilen</button><button onClick={() => setNeueEinladung(null)}>Fertig</button></div>
            </div>
          )}
          {einladungen.length > 0 && (
            <ul className="nutzer-liste hof-einladungen">
              {einladungen.map((e) => (
                <li key={e.code}><div className="nutzer-kopf"><span>✉️ {e.name ?? 'Einladung'} · {ROLLEN[e.rolle].name} <small className="hinweis">bis {bisText(e.bis)}</small></span></div>
                  <div className="knoepfe"><button onClick={() => einladungTeilen(e)}>Teilen</button><button className="gefahr" onClick={() => api.einladungZurueck(e.code).then((l) => { setEinladungen(l); p.meldung('Einladung zurückgezogen') }).catch(fehler)}>Zurückziehen</button></div></li>
              ))}
            </ul>
          )}

          <h3>Personen im Hof ({mitglieder.length})</h3>
          <ul className="nutzer-liste">
            {mitglieder.map((m) => {
              const gesperrt = m.rolle === 'inhaber' && !binInhaber
              return (
                <li key={m.id}>
                  <div className="nutzer-kopf">
                    <strong>{m.name}</strong>{m.id === hof.ich?.id && <span className="hinweis"> (du)</span>}{m.hatPin && <span className="pin-chip" title="Hat eine PIN für die Anmeldung auf neuen Geräten">PIN</span>}
                    <select value={m.rolle} aria-label={`Rolle von ${m.name}`} disabled={gesperrt}
                      onChange={(e) => api.mitgliedAendern(m.id, { rolle: e.target.value as HofRolle }).then(() => nachAenderung(`${m.name} ist jetzt ${ROLLEN[e.target.value as HofRolle].name}`)).catch(fehler)}>
                      {binInhaber || m.rolle === 'inhaber' ? <option value="inhaber">Inhaber</option> : null}
                      <option value="admin">Admin</option><option value="mitarbeiter">Mitarbeiter</option><option value="ansehen">Nur ansehen</option>
                    </select>
                  </div>
                  {!gesperrt && (
                    <div className="knoepfe">
                      <button onClick={() => linkTeilen(m)}>🔗 Link</button>
                      <button onClick={() => { const n = prompt('Neuer Name:', m.name); if (n && sauber(n)) api.mitgliedAendern(m.id, { name: sauber(n) }).then(() => nachAenderung()).catch(fehler) }}>Umbenennen</button>
                      <button title="Alter Link wird ungültig, z. B. bei verlorenem Handy" onClick={() => confirm(`Neuen Link für ${m.name} erzeugen? Der alte Link funktioniert dann auf keinem Gerät mehr.`) && api.mitgliedAendern(m.id, { neuerZugang: true }).then((x) => { nachAenderung(); linkTeilen(x) }).catch(fehler)}>Neuer Link</button>
                      {m.id !== hof.ich?.id && <button className="gefahr" onClick={() => confirm(`${m.name} aus dem Hof entfernen? Der Zugang ist auf allen Karten sofort ungültig. Einträge und Notizen bleiben erhalten.`) && api.mitgliedEntfernen(m.id).then(() => nachAenderung(`${m.name} entfernt`)).catch(fehler)}>Entfernen</button>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <h3>Hof-Name</h3>
          <form className="zeile-form" onSubmit={(ev) => { ev.preventDefault(); api.umbenennen(sauber(hofName)).then((h) => { setHof(h); k.setHof({ ...k.hof!, name: h.name }); p.meldung('Hof-Name gespeichert') }).catch(fehler) }}>
            <input value={hofName} maxLength={60} onChange={(e) => setHofName(e.target.value)} aria-label="Hof-Name" />
            <button type="submit" className="primaer" disabled={!sauber(hofName) || sauber(hofName) === hof.name}>Speichern</button>
          </form>
        </>
      )}

      {hof.ich && (
        <>
          <h3>Neues Handy? PIN einrichten</h3>
          <p className="hinweis klein">Mit einer PIN kannst du dich auf einem neuen Gerät selbst anmelden – Seite <strong>{hofAnmeldeLink(hid).replace(/^https?:\/\//, '')}</strong> öffnen, Name und PIN eingeben. {hof.ich.hatPin ? 'Du hast schon eine PIN.' : 'Du hast noch keine PIN.'}</p>
          <form className="zeile-form" onSubmit={(ev) => { ev.preventDefault(); api.pinSetzen(pin).then(() => { setPin(''); laden(); p.meldung('PIN gespeichert') }).catch(fehler) }}>
            <input value={pin} inputMode="numeric" autoComplete="new-password" pattern="\d{4,8}" maxLength={8} placeholder="4–8 Ziffern" onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="Neue PIN" />
            <button type="submit" disabled={pin.length < 4}>{hof.ich.hatPin ? 'PIN ändern' : 'PIN setzen'}</button>
          </form>
          {hof.ich.hatPin && <button onClick={() => api.pinSetzen(null).then(() => { laden(); p.meldung('PIN gelöscht') }).catch(fehler)}>PIN löschen</button>}
          <button onClick={() => teilen(`Anmeldung beim Hof „${hof.name}“ in FlockMap: ${hofAnmeldeLink(hid)}`, hofAnmeldeLink(hid), p.meldung)}>🔗 Anmelde-Seite des Hofs teilen</button>
        </>
      )}

      {binInhaber && !hof.geloescht && (
        <>
          <h3 className="gefahr-titel">Ganzen Hof löschen</h3>
          {!loeschOffen ? (
            <>
              <p className="hinweis klein">Löscht den Hof „{hof.name}“ mit <strong>allen {hof.karten.length} Karten</strong> ({hof.karten.reduce((n, x) => n + x.eintraege, 0)} Nadeln/Flächen), allen Personen, Einladungen und PINs. Alles liegt dann <strong>30 Tage im Papierkorb</strong> und kann so lange von dir wiederhergestellt werden; danach wird es endgültig gelöscht. Vorher am besten jede Karte unter „Export &amp; Import“ sichern.</p>
              <button className="gefahr" onClick={() => setLoeschOffen(true)}>🗑️ Hof löschen …</button>
            </>
          ) : (
            <LoeschBestaetigung name={hof.name} was="Hof" knopf="Hof löschen" eingabe={loeschName} setName={setLoeschName}
              onAbbrechen={() => { setLoeschOffen(false); setLoeschName('') }} onFehler={p.meldung}
              onLoeschen={() => api.loeschen(loeschName).then((j) => { p.meldung(`Hof gelöscht – wiederherstellbar bis ${datumText(j.geloescht.bis)}`); k.ichLaden(); p.onSchliessen() })} />
          )}
        </>
      )}
    </section>
  )
}

// Abschnitt in den Einstellungen: bestehende Karte zum Hof machen (nur Admin, nur wenn noch kein Hof)
export function HofEinrichten(p: { k: K; meldung: (s: string) => void; onHof: () => void }) {
  const { k } = p
  const [offen, setOffen] = useState(false)
  const [name, setName] = useState(k.kartenName)
  // 7s-1: Bestandskarten (z. B. Hennings Karte) brauchen keinen Code; neuere Karten einen Lizenzcode (nur Betriebe)
  const brauchtCode = !k.lizenz
  const [code, setCode] = useState('')
  const [b2b, setB2b] = useState(false)
  if (!offen) return <button onClick={() => setOffen(true)}>🏡 Hof einrichten (mehrere Karten, ein Team)</button>
  return (
    <form className="neu-link" onSubmit={(ev) => {
      ev.preventDefault()
      anfrage(`/api/karten/${k.karteId}/hof`, 'POST', { name: sauber(name), ...(brauchtCode ? { code, b2b } : {}) }, k.zugang ? { 'x-zugang': k.zugang } : {})
        .then(async () => { await k.ichLaden(); p.meldung('Hof eingerichtet'); p.onHof() }).catch((e) => p.meldung(e.message))
    }}>
      <p>Aus dieser Karte wird dein <strong>Hof</strong>. Alle bisherigen Personen gehören dann zum Hof, ihre Links funktionieren weiter. Du wirst <strong>Inhaber</strong>. Danach kannst du weitere Karten anlegen und Leute mit Rolle einladen.</p>
      <label>Name des Hofs<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="z. B. Deichschäferei Hecker" /></label>
      {brauchtCode && <>
        <p className="hinweis klein">Für einen Hof brauchst du die <strong>{LIZENZ.produkt}</strong> ({LIZENZ.preis}). {LIZENZ.b2b} {LIZENZ.laufzeit}</p>
        <label>Lizenzcode<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="FM-XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" /></label>
        <label className="haken"><input type="checkbox" checked={b2b} onChange={(e) => setB2b(e.target.checked)} /><span>Ich nutze FlockMap für meinen Betrieb (Unternehmer, nicht Verbraucher).</span></label>
      </>}
      <div className="knoepfe"><button type="button" onClick={() => setOffen(false)}>Abbrechen</button><button type="submit" className="primaer" disabled={!sauber(name) || (brauchtCode && (!code.trim() || !b2b))}>Hof einrichten</button></div>
    </form>
  )
}

// ---------------------------------------------------------------------------------------
// Einstieg ohne Karte: ?hof=ID&einladung=CODE (Beitreten) bzw. ?hof=ID (Anmelden mit Name + PIN)
// ---------------------------------------------------------------------------------------
export function HofEinstieg(p: { hofId: string; einladung: string | null }) {
  const [info, setInfo] = useState<{ gueltig?: boolean; hof: string; rolle?: HofRolle; name?: string | null } | null>(null)
  const [nichtGefunden, setNichtGefunden] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  useEffect(() => {
    const url = p.einladung ? `/api/hoefe/${p.hofId}/einladung/${encodeURIComponent(p.einladung)}` : `/api/hoefe/${p.hofId}/info`
    anfrage<{ gueltig?: boolean; hof?: string; name?: string | null; rolle?: HofRolle }>(url)
      .then((x) => { setInfo({ ...x, hof: x.hof ?? (x.name as string) }); if (p.einladung && x.name) setName(x.name) })
      .catch(() => setNichtGefunden(true))
  }, [p.hofId, p.einladung])
  const fertig = (r: { zugang: string; karte: string | null }) => {
    if (r.karte) karteOeffnen(r.karte, r.zugang)
    else setFehler('Der Hof hat noch keine Karte.')
  }
  const absenden = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setLaeuft(true); setFehler('')
    try {
      if (p.einladung) fertig(await anfrage(`/api/hoefe/${p.hofId}/beitreten`, 'POST', { code: p.einladung, name: sauber(name) }))
      else fertig(await anfrage(`/api/hoefe/${p.hofId}/anmelden`, 'POST', { name: sauber(name), pin }))
    } catch (e) { setFehler((e as Error).message); setLaeuft(false) }
  }
  return (
    <div className="einstieg">
      <div className="einstieg-karte">
        <img src="/icon.svg" alt="" width="64" height="64" />
        <p className="einstieg-marke">FlockMap</p>
        {nichtGefunden ? <p className="hinweis">Diesen Hof gibt es nicht (mehr) oder er wurde gelöscht. Bitte den Link prüfen.</p> : !info ? <p className="hinweis">Lade …</p> : p.einladung && !info.gueltig ? (
          <>
            <h1>{info.hof}</h1>
            <p className="hinweis">Diese Einladung ist abgelaufen, wurde schon benutzt oder zurückgezogen. Bitte frag nach einer neuen Einladung. Wenn du schon eine PIN hast, kannst du dich <a href={hofAnmeldeLink(p.hofId)}>hier anmelden</a>.</p>
          </>
        ) : (
          <form onSubmit={absenden}>
            <h1>{info.hof}</h1>
            {p.einladung
              ? <p className="hinweis">Du bist eingeladen als <strong>{ROLLEN[info.rolle!].name}</strong> ({ROLLEN[info.rolle!].text}). Wie heißt du? Der Name steht bei deinen Notizen.</p>
              : <p className="hinweis">Anmelden auf diesem Gerät mit deinem Namen und deiner PIN. Noch keine PIN? Dann brauchst du deinen persönlichen Link oder eine Einladung.</p>}
            <label>Dein Name<input autoFocus={!name} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="z. B. Jan" autoComplete="username" /></label>
            {!p.einladung && <label>PIN<input value={pin} inputMode="numeric" autoComplete="current-password" type="password" maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="4–8 Ziffern" /></label>}
            {fehler && <p className="fehler gefahr">{fehler}</p>}
            <button type="submit" className="primaer" disabled={laeuft || !sauber(name) || (!p.einladung && pin.length < 4)}>{p.einladung ? 'Beitreten' : 'Anmelden'}</button>
            <p className="hinweis klein">{p.einladung ? 'Mit dem Beitritt werden dein Name und deine Rolle gespeichert.' : 'Die PIN wird nur verschlüsselt geprüft.'} Kein Tracking, keine Cookies – siehe <a href="#recht/datenschutz">Datenschutz</a>.</p>
          </form>
        )}
        <RechtLinks klein />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------
// Betreiber-Seite (?betreiber): neuen Hof anlegen – später an die Bezahlung gekoppelt
// ---------------------------------------------------------------------------------------
interface HofZeile { id: string; name: string; erstellt: string; karten: number; mitglieder: number; inhaber: string[]; geloescht?: { bis: string }; lizenz?: { art: string } | null }
// 7s-1: Lizenzcodes (manuell, bis der Shop-Webhook kommt). Der Klartext-Code wird nur einmal angezeigt – gespeichert ist nur ein Hash.
interface LizenzZeile { id: string; ende: string; art: string; status: 'offen' | 'eingeloest' | 'gesperrt'; erstellt: string; eingeloest: string | null; hof: { id: string; name: string | null } | null; notiz: string | null }
function LizenzCodes(p: { kopf: Record<string, string> }) {
  const [liste, setListe] = useState<LizenzZeile[]>([])
  const [form, setForm] = useState({ art: 'pilot', anzahl: 1, notiz: '' })
  const [neu, setNeu] = useState<{ code: string; link: string }[]>([])
  const [fehler, setFehler] = useState('')
  const laden = useCallback(() => { anfrage<LizenzZeile[]>('/api/betreiber/lizenzen', 'GET', undefined, p.kopf).then(setListe).catch((e) => setFehler(e.message)) }, [p.kopf['x-betreiber']]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(laden, [laden])
  const kopieren = (t: string) => navigator.clipboard.writeText(t).catch(() => prompt('Kopieren:', t))
  const statusText = (l: LizenzZeile) => l.status === 'eingeloest' ? `eingelöst ${datumText(l.eingeloest!)}${l.hof?.name ? ` · ${l.hof.name}` : ''}` : l.status === 'gesperrt' ? 'gesperrt' : 'offen'
  return (
    <section className="lizenz-codes">
      <h1>Lizenzcodes</h1>
      <p className="hinweis klein">{LIZENZ.produkt}: {LIZENZ.preis}. {LIZENZ.b2b} Code nach Zahlungseingang an den Käufer schicken – er löst ihn unter „/?freischalten“ ein.</p>
      <form onSubmit={(ev) => {
        ev.preventDefault(); setFehler('')
        anfrage<{ code: string; link: string }[]>('/api/betreiber/lizenzen', 'POST', { art: form.art, anzahl: form.anzahl, notiz: form.notiz }, p.kopf)
          .then((r) => { setNeu(r); setForm({ ...form, notiz: '' }); laden() }).catch((e) => setFehler(e.message))
      }}>
        <label>Art<select value={form.art} onChange={(e) => setForm({ ...form, art: e.target.value })}>
          <option value="pilot">{LIZENZ_ART.pilot}</option><option value="hof">{LIZENZ_ART.hof}</option><option value="test">{LIZENZ_ART.test}</option>
        </select></label>
        <label>Anzahl<input type="number" min={1} max={20} value={form.anzahl} onChange={(e) => setForm({ ...form, anzahl: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
        <label>Notiz (Käufer, Bestellnummer)<input value={form.notiz} maxLength={120} onChange={(e) => setForm({ ...form, notiz: e.target.value })} placeholder="z. B. Bestellung 1001 · Schäferei Petersen" /></label>
        {fehler && <p className="fehler gefahr">{fehler}</p>}
        <button type="submit" className="primaer">Code erstellen</button>
      </form>
      {neu.length > 0 && (
        <div className="neu-link">
          <p><strong>Nur jetzt sichtbar</strong> – Code bzw. Link jetzt kopieren und dem Käufer schicken:</p>
          <ul className="code-liste">
            {neu.map((n) => <li key={n.code}><code>{n.code}</code><div className="knoepfe"><button type="button" onClick={() => kopieren(n.code)}>Code kopieren</button><button type="button" onClick={() => kopieren(n.link)}>Link kopieren</button></div></li>)}
          </ul>
          <button type="button" onClick={() => setNeu([])}>Ausblenden</button>
        </div>
      )}
      <h3>Alle Codes ({liste.length})</h3>
      <ul className="code-liste">
        {liste.map((l) => (
          <li key={l.id}>
            <strong>…{l.ende}</strong> · {LIZENZ_ART[l.art] ?? l.art} · {statusText(l)} · erstellt {datumText(l.erstellt)}{l.notiz ? ` · ${l.notiz}` : ''}
            <div className="knoepfe">
              {l.status === 'offen' && <button type="button" onClick={() => anfrage(`/api/betreiber/lizenzen/${l.id}`, 'PATCH', { status: 'gesperrt' }, p.kopf).then(laden).catch((e) => setFehler(e.message))}>Sperren</button>}
              {l.status === 'gesperrt' && !l.eingeloest && <button type="button" onClick={() => anfrage(`/api/betreiber/lizenzen/${l.id}`, 'PATCH', { status: 'offen' }, p.kopf).then(laden).catch((e) => setFehler(e.message))}>Entsperren</button>}
              {!l.eingeloest && <button type="button" className="gefahr" onClick={() => confirm(`Code …${l.ende} löschen?`) && anfrage(`/api/betreiber/lizenzen/${l.id}`, 'DELETE', undefined, p.kopf).then(laden).catch((e) => setFehler(e.message))}>Löschen</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Betreiber() {
  const [schluessel, setSchluessel] = useState(() => sessionStorage.getItem('wt-betreiber') ?? '')
  const [eingabe, setEingabe] = useState('')
  const [liste, setListe] = useState<HofZeile[] | null>(null)
  const [fehler, setFehler] = useState('')
  const [form, setForm] = useState({ name: '', inhaberName: '', kartenName: 'Weidekarte' })
  const [neu, setNeu] = useState<{ name: string; link: string } | null>(null)
  const kopf = { 'x-betreiber': schluessel }
  const laden = useCallback(() => {
    if (!schluessel) return
    anfrage<HofZeile[]>('/api/betreiber/hoefe', 'GET', undefined, { 'x-betreiber': schluessel })
      .then((l) => { setListe(l); setFehler(''); sessionStorage.setItem('wt-betreiber', schluessel) })
      .catch((e) => { setFehler(e.message); setListe(null); setSchluessel(''); sessionStorage.removeItem('wt-betreiber') })
  }, [schluessel])
  useEffect(laden, [laden])
  return (
    <div className="einstieg">
      <div className="einstieg-karte breit">
        <p className="einstieg-marke">FlockMap · Betreiber</p>
        {!liste ? (
          <form onSubmit={(ev) => { ev.preventDefault(); setSchluessel(eingabe.trim()) }}>
            <h1>Höfe verwalten</h1>
            <label>Betreiber-Schlüssel<input type="password" value={eingabe} onChange={(e) => setEingabe(e.target.value)} autoComplete="off" /></label>
            {fehler && <p className="fehler gefahr">{fehler}</p>}
            <button type="submit" className="primaer" disabled={!eingabe.trim()}>Weiter</button>
          </form>
        ) : (
          <>
            <h1>Neuen Hof anlegen</h1>
            <p className="hinweis klein">Direkt anlegen (ohne Code, z. B. für Bestandskunden). Normal: Lizenzcode unten erstellen und dem Käufer schicken. Der Inhaber bekommt einen persönlichen Link.</p>
            <form onSubmit={(ev) => {
              ev.preventDefault()
              anfrage<{ hof: { name: string }; karte: string; zugang: string }>('/api/betreiber/hoefe', 'POST', form, kopf)
                .then((r) => { setNeu({ name: r.hof.name, link: zugangsLink(r.karte, r.zugang) }); setForm({ name: '', inhaberName: '', kartenName: 'Weidekarte' }); laden() })
                .catch((e) => setFehler(e.message))
            }}>
              <label>Name des Hofs<input value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="z. B. Schäferei Petersen" /></label>
              <label>Name des Inhabers<input value={form.inhaberName} maxLength={NAME_MAX} onChange={(e) => setForm({ ...form, inhaberName: e.target.value })} placeholder="z. B. Jens Petersen" /></label>
              <label>Name der ersten Karte<input value={form.kartenName} maxLength={60} onChange={(e) => setForm({ ...form, kartenName: e.target.value })} /></label>
              {fehler && <p className="fehler gefahr">{fehler}</p>}
              <button type="submit" className="primaer" disabled={!sauber(form.name) || !sauber(form.inhaberName)}>Hof anlegen</button>
            </form>
            {neu && (
              <div className="neu-link">
                <p><strong>{neu.name}</strong> ist angelegt. Persönlicher Link für den Inhaber (vertraulich weitergeben):</p>
                <input readOnly value={neu.link} onFocus={(e) => e.target.select()} aria-label="Inhaber-Link" />
                <div className="knoepfe"><button onClick={() => navigator.clipboard.writeText(neu.link).catch(() => prompt('Link kopieren:', neu.link))}>Kopieren</button></div>
              </div>
            )}
            <LizenzCodes kopf={kopf} />
            <h3>Alle Höfe ({liste.length})</h3>
            <ul className="nutzer-liste">
              {liste.map((h) => <li key={h.id}><strong>{h.name}</strong> <span className="hinweis">· {h.inhaber.join(', ') || '–'} · {h.karten} Karte{h.karten === 1 ? '' : 'n'} · {h.mitglieder} Person{h.mitglieder === 1 ? '' : 'en'} · seit {new Date(h.erstellt).toLocaleDateString('de-DE')}{h.lizenz ? ` · ${LIZENZ_ART[h.lizenz.art] ?? h.lizenz.art}` : ''}{h.geloescht ? ` · im Papierkorb bis ${datumText(h.geloescht.bis)}` : ''}</span></li>)}
            </ul>
            <button onClick={() => { sessionStorage.removeItem('wt-betreiber'); setSchluessel(''); setListe(null) }}>Abmelden</button>
          </>
        )}
        <RechtLinks klein />
      </div>
    </div>
  )
}
