import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Karte, { HAT_GOOGLE_KEY } from './map/Karte'
import { useKarte, zugangsLink, NAME_MAX, type Ich, type Nutzer } from './daten'
import { googleNaviLink, routeBerechnen, routeText } from './route'
import { TIERARTEN, tierText, tierSymbolHtml, tierSummen, type Einheit, type Tierart, FARBEN, FLAECHEN_FARBEN, FLAECHE_STANDARD, START, STANDARD_FARBE, datum, farbName, hektar, mitte, neueId, notizenSortiert, pinFarbe, type Eintrag, type Notiz, type Fokus, type LatLng, type Route } from './types'

type Modus = 'ansicht' | 'pin' | 'flaeche'
type Panel = null | 'liste' | 'einstellungen' | 'nutzer' | 'profil'

// Aktuell angemeldeter Nutzer (geteilte Karte) – für Autor neuer Notizen
let aktuellerNutzer: Ich | null = null
const autorFelder = (): { autor?: string; autorId?: string } =>
  aktuellerNutzer ? { autor: aktuellerNutzer.name, autorId: aktuellerNutzer.id } : localStorage.getItem('wt-autor') ? { autor: localStorage.getItem('wt-autor')! } : {}

function standortHolen(): Promise<LatLng> {
  return new Promise((ok, fehler) => {
    if (!navigator.geolocation) return fehler(new Error('Standort wird vom Gerät nicht unterstützt'))
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => fehler(new Error('Standort nicht verfügbar – bitte Standortfreigabe erlauben')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  })
}

export default function App() {
  const k = useKarte()
  aktuellerNutzer = k.karteId ? k.ich : null
  // Berechtigungen (der Server prüft zusätzlich): Admin alles, Nutzer nur eigene Einträge/Notizen
  const kannEintrag = (e: Eintrag) => !k.karteId || k.istAdmin || (!!k.ich && e.erstelltVon === k.ich.id)
  const kannNotiz = (n: Notiz) => !k.karteId || k.istAdmin || (!!k.ich && n.autorId === k.ich.id)
  const [modus, setModus] = useState<Modus>('ansicht')
  const [zeichenPunkte, setZeichenPunkte] = useState<LatLng[]>([])
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null)
  const [formular, setFormular] = useState<{ e: Eintrag; neu: boolean } | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [routeInfo, setRouteInfo] = useState<string>('')
  const [standort, setStandort] = useState<LatLng | null>(null)
  // Beschriftung (Namen auf der Karte) an/aus – pro Gerät gespeichert
  const [beschriftung, setBeschriftung] = useState(() => localStorage.getItem('wt-beschriftung') !== 'aus')
  useEffect(() => { localStorage.setItem('wt-beschriftung', beschriftung ? 'an' : 'aus') }, [beschriftung])
  // Schnellauswahl: hervorgehobene Nadelfarben (Mehrfachauswahl)
  const [hervorWahl, setHervorWahl] = useState<string[]>([])
  const verwendeteFarben = useMemo(() => {
    const anzahl = new Map<string, number>()
    for (const e of k.eintraege) { const f = pinFarbe(e); anzahl.set(f, (anzahl.get(f) ?? 0) + 1) }
    // in der Reihenfolge der Vorschlagsfarben, eigene Farben danach
    const rang = (f: string) => { const i = FLAECHEN_FARBEN.findIndex((x) => x.wert === f); return i < 0 ? 99 : i }
    return [...anzahl.entries()].sort((a, b) => rang(a[0]) - rang(b[0])).map(([farbe, n]) => ({ farbe, n }))
  }, [k.eintraege])
  const hervor = hervorWahl.filter((f) => verwendeteFarben.some((x) => x.farbe === f))
  const hervorUmschalten = (f: string) => setHervorWahl((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]))
  const [fokus, setFokus] = useState<Fokus | null>(null)
  const [meldung, setMeldung] = useState<string>('')
  // Zuletzt verschobene Nadel (für „Rückgängig“)
  const [verschoben, setVerschoben] = useState<{ id: string; alt: LatLng; nr: number } | null>(null)
  useEffect(() => {
    if (!verschoben) return
    const t = setTimeout(() => setVerschoben(null), 7000)
    return () => clearTimeout(t)
  }, [verschoben])
  const mitteRef = useRef<LatLng>(START)
  const routeNr = useRef(0)

  const auswahl = useMemo(() => k.eintraege.find((e) => e.id === ausgewaehlt) ?? null, [k.eintraege, ausgewaehlt])

  useEffect(() => {
    if (k.hinweis) { setMeldung(k.hinweis); k.setHinweis('') }
  }, [k.hinweis, k])

  useEffect(() => {
    if (!meldung) return
    const t = setTimeout(() => setMeldung(''), 3500)
    return () => clearTimeout(t)
  }, [meldung])

  const fliege = (p: LatLng, zoom?: number) => setFokus({ ...p, zoom, n: Date.now() })

  const meinStandort = useCallback(async (fliegen = true) => {
    try {
      const p = await standortHolen()
      setStandort(p)
      if (fliegen) fliege(p, 15)
      return p
    } catch (e) {
      setMeldung((e as Error).message)
      return null
    }
  }, [])

  const neuerPin = (p: LatLng) => {
    const jetzt = new Date().toISOString()
    setFormular({ neu: true, e: { id: neueId(), typ: 'pin', position: p, farbe: localStorage.getItem('wt-letzte-farbe') || STANDARD_FARBE, titel: '', notizen: [], ...(k.ich ? { erstelltVon: k.ich.id } : {}), erstellt: jetzt, geaendert: jetzt } })
    setModus('ansicht')
  }

  const routeZu = useCallback(async (e: Eintrag) => {
    const nr = ++routeNr.current
    setRoute(null)
    setRouteInfo('Route wird berechnet …')
    const von = standort ?? (await meinStandort(false))
    if (nr !== routeNr.current) return
    if (!von) { setRouteInfo('Für die Route wird dein Standort benötigt.'); return }
    try {
      const r = await routeBerechnen(von, mitte(e))
      if (nr !== routeNr.current) return
      setRoute(r)
      setRouteInfo(routeText(r))
    } catch (err) {
      if (nr === routeNr.current) setRouteInfo('Route nicht möglich: ' + (err as Error).message)
    }
  }, [standort, meinStandort])

  // Nadel per Drag-and-drop verschoben: Position speichern (Server prüft das Recht), Rückgängig anbieten
  const nadelVerschieben = (id: string, neu: LatLng) => {
    const e = k.eintraege.find((x) => x.id === id)
    if (!e || e.typ !== 'pin') return
    if (Math.abs(e.position.lat - neu.lat) < 1e-9 && Math.abs(e.position.lng - neu.lng) < 1e-9) return
    k.speichern({ ...e, position: neu, geaendert: new Date().toISOString() })
    setMeldung('')
    setVerschoben((v) => ({ id, alt: v?.id === id ? v.alt : e.position, nr: (v?.nr ?? 0) + 1 }))
  }
  const verschiebenRueckgaengig = () => {
    if (!verschoben) return
    const e = k.eintraege.find((x) => x.id === verschoben.id)
    if (e && e.typ === 'pin') k.speichern({ ...e, position: verschoben.alt, geaendert: new Date().toISOString() })
    setVerschoben(null)
  }

  const waehle = (id: string) => {
    if (modus === 'flaeche') return
    setAusgewaehlt(id)
    setPanel(null)
    // Antippen zeigt nur die Details – eine Route gibt es nur über den Knopf „Route anzeigen“
    routeAus()
  }

  const routeAus = () => { routeNr.current++; setRoute(null); setRouteInfo('') }

  const abwaehlen = () => { setAusgewaehlt(null); setRoute(null); setRouteInfo(''); routeNr.current++ }

  const kartenKlick = (p: LatLng) => {
    if (formular) return
    if (modus === 'flaeche') { setZeichenPunkte((l) => [...l, p]); return }
    if (modus === 'ansicht' && ausgewaehlt) { abwaehlen(); return }
    if (!k.darfBearbeiten) return
    neuerPin(p)
  }

  const flaecheFertig = () => {
    if (zeichenPunkte.length < 3) { setMeldung('Bitte mindestens 3 Eckpunkte antippen.'); return }
    const jetzt = new Date().toISOString()
    setFormular({ neu: true, e: { id: neueId(), typ: 'flaeche', punkte: zeichenPunkte, farbe: localStorage.getItem('wt-letzte-flaechenfarbe') || FLAECHE_STANDARD, titel: '', notizen: [], ...(k.ich ? { erstelltVon: k.ich.id } : {}), erstellt: jetzt, geaendert: jetzt } })
    setZeichenPunkte([])
    setModus('ansicht')
  }

  const speichern = (e: Eintrag, basis?: Einheit[]) => {
    const fertig = { ...e, titel: e.titel.trim(), geaendert: new Date().toISOString() }
    if (fertig.farbe) localStorage.setItem(fertig.typ === 'pin' ? 'wt-letzte-farbe' : 'wt-letzte-flaechenfarbe', fertig.farbe)
    k.speichern(fertig, basis)
    setFormular(null)
    setAusgewaehlt(fertig.id)
    setMeldung('Gespeichert')
  }

  const loeschen = (e: Eintrag) => {
    if (!confirm(e.titel ? `„${e.titel}“ wirklich löschen?` : `Diese ${e.typ === 'pin' ? 'Nadel' : 'Fläche'} ohne Namen wirklich löschen?`)) return
    k.loeschen(e.id)
    abwaehlen()
    setFormular(null)
  }

  const statusText = { lokal: 'Nur auf diesem Gerät', verbunden: 'Live geteilt', offline: 'Offline – wird später synchronisiert', verbinde: 'Verbinde …' }[k.status]

  return (
    <div className={`app${panel === 'liste' ? ' liste-offen' : ''}`}>
      <header className="kopf">
        <div>
          <h1>🐑 Weide-Tagebuch</h1>
          <small className={`status ${k.status}`}>{k.kartenName ? `${k.kartenName} · ` : ''}{statusText}{k.karteId && k.ich && <> · <button className="name-knopf" title="Meinen Namen ändern" onClick={() => setPanel(panel === 'profil' ? null : 'profil')}>{k.ich.name}{k.ich.rolle === 'admin' ? ' (Admin)' : ''} ✏️</button></>}{!k.darfBearbeiten && ' · nur ansehen'}</small>
        </div>
        <nav>
          <button onClick={() => setPanel(panel === 'liste' ? null : 'liste')}>📋 Liste</button>
          {k.karteId && k.istAdmin && <button title="Nutzer verwalten" aria-label="Nutzer verwalten" onClick={() => setPanel(panel === 'nutzer' ? null : 'nutzer')}>👥</button>}
          <button onClick={() => setPanel(panel === 'einstellungen' ? null : 'einstellungen')}>⚙️</button>
        </nav>
      </header>

      <main className="haupt">
        <Karte
          eintraege={k.eintraege}
          ausgewaehlt={ausgewaehlt}
          zeichenPunkte={zeichenPunkte}
          route={route}
          standort={standort}
          fokus={fokus}
          beschriftung={beschriftung}
          hervor={hervor}
          verschiebbar={modus === 'ansicht' && !formular ? k.eintraege.filter((e) => e.typ === 'pin' && k.darfBearbeiten && kannEintrag(e)).map((e) => e.id) : []}
          onVerschieben={nadelVerschieben}
          onKlick={kartenKlick}
          onAuswahl={waehle}
          onMitte={(p) => (mitteRef.current = p)}
        />

        {modus === 'pin' && <div className="fadenkreuz">＋</div>}

        {/* Kartenwerkzeuge oben links: Beschriftung an/aus + Farb-Schnellauswahl */}
        <div className="karten-werkzeug">
          <button className={`werkzeug-knopf${beschriftung ? ' an' : ''}`} aria-pressed={beschriftung} title={beschriftung ? 'Beschriftung ausblenden' : 'Beschriftung einblenden'} onClick={() => setBeschriftung((b) => !b)}>
            <span aria-hidden="true">🏷️</span><small>{beschriftung ? 'an' : 'aus'}</small>
          </button>
          {verwendeteFarben.length > 0 && (
            <div className="farb-chips" role="group" aria-label="Nadeln und Flächen einer Farbe hervorheben">
              {verwendeteFarben.map(({ farbe, n }) => (
                <button key={farbe} className={`farb-chip${hervor.includes(farbe) ? ' aktiv' : ''}`} style={{ background: farbe }} aria-pressed={hervor.includes(farbe)}
                  title={`${farbName(farbe)} (${n}) ${hervor.includes(farbe) ? '– Hervorhebung aufheben' : 'hervorheben'}`} aria-label={`${farbName(farbe)} hervorheben`} onClick={() => hervorUmschalten(farbe)} />
              ))}
            </div>
          )}
        </div>

        {modus === 'ansicht' && !formular && (
          <div className="fab-leiste">
            <button className="fab" title="Mein Standort" onClick={() => meinStandort()}>📍<span>Standort</span></button>
            {k.darfBearbeiten && (
              <>
                <button className="fab" onClick={() => { abwaehlen(); if (panel === 'liste') setPanel(null); setZeichenPunkte([]); setModus('flaeche') }}>⬠<span>Fläche</span></button>
                <button className="fab haupt-fab" onClick={() => { abwaehlen(); if (panel === 'liste') setPanel(null); setModus('pin') }}>＋<span>Nadel</span></button>
              </>
            )}
          </div>
        )}

        {modus === 'pin' && (
          <div className="leiste">
            <p>Tippe auf die Karte, um die Nadel zu setzen – oder:</p>
            <div className="knoepfe">
              <button className="primaer" onClick={() => neuerPin(mitteRef.current)}>In Kartenmitte</button>
              <button onClick={async () => { const p = await meinStandort(false); if (p) neuerPin(p) }}>An meinem Standort</button>
              <button onClick={() => setModus('ansicht')}>Abbrechen</button>
            </div>
          </div>
        )}

        {modus === 'flaeche' && (
          <div className="leiste">
            <p>Tippe die Eckpunkte der Fläche an ({zeichenPunkte.length} gesetzt{zeichenPunkte.length >= 3 ? `, ca. ${hektar(zeichenPunkte).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha` : ''}).</p>
            <div className="knoepfe">
              <button className="primaer" onClick={flaecheFertig}>Fertig</button>
              <button onClick={() => setZeichenPunkte((l) => l.slice(0, -1))} disabled={!zeichenPunkte.length}>Rückgängig</button>
              <button onClick={() => { setZeichenPunkte([]); setModus('ansicht') }}>Abbrechen</button>
            </div>
          </div>
        )}

        {auswahl && !formular && modus === 'ansicht' && (
          <Detail
            e={auswahl}
            routeInfo={routeInfo}
            darfBearbeiten={k.darfBearbeiten}
            kannBearbeiten={kannEintrag(auswahl)}
            kannNotiz={kannNotiz}
            onSchliessen={abwaehlen}
            onBearbeiten={() => setFormular({ e: auswahl, neu: false })}
            onLoeschen={() => loeschen(auswahl)}
            onRoute={() => routeZu(auswahl)}
            onRouteAus={routeAus}
            onNotizSpeichern={(n) => k.notizSpeichern(auswahl.id, n)}
            onNotizLoeschen={(id) => k.notizLoeschen(auswahl.id, id)}
          />
        )}

        {formular && <Formular start={formular.e} neu={formular.neu} onSpeichern={speichern} onAbbrechen={() => setFormular(null)} onLoeschen={formular.neu || !kannEintrag(formular.e) ? undefined : () => loeschen(formular.e)} />}

        {panel === 'liste' && (
          <Liste eintraege={k.eintraege} onSchliessen={() => setPanel(null)} onWahl={(e) => { fliege(mitte(e), e.typ === 'pin' ? 15 : undefined); waehle(e.id) }} />
        )}
        {panel === 'einstellungen' && <Einstellungen k={k} onSchliessen={() => setPanel(null)} meldung={setMeldung} onNutzer={() => setPanel('nutzer')} onProfil={() => setPanel('profil')} />}
        {panel === 'profil' && k.ich && <Profil k={k} onSchliessen={() => setPanel(null)} meldung={setMeldung} />}
        {panel === 'nutzer' && k.istAdmin && k.karteId && <NutzerVerwaltung k={k} onSchliessen={() => setPanel(null)} meldung={setMeldung} />}

        {meldung && <div className="toast">{meldung}</div>}
        {!meldung && verschoben && (
          <div className="toast mit-knopf" role="status">Nadel verschoben<button onClick={verschiebenRueckgaengig}>Rückgängig</button></div>
        )}
      </main>
    </div>
  )
}

// Symbol zur Tierart: 🐑 Schaf, 🐏 Schafbock, eigenes SVG für Lamm
function TierSymbol(p: { art: Tierart }) {
  return <span className="tier-symbol" aria-hidden="true" dangerouslySetInnerHTML={{ __html: tierSymbolHtml(p.art) }} />
}
// Alle Tiereinheiten zusammengefasst je Art: „🐑 25 Schafe · 🐏 2 Böcke · [Lamm] 10 Lämmer“
function TierAnzeige(p: { summen: { art: Tierart; n: number }[] }) {
  return <>{p.summen.map((x, i) => <span key={x.art} className="tierzahl">{i > 0 && ' · '}<TierSymbol art={x.art} /> {tierText(x.n, x.art)}</span>)}</>
}

function Detail(p: { e: Eintrag; routeInfo: string; darfBearbeiten: boolean; kannBearbeiten: boolean; kannNotiz: (n: Notiz) => boolean; onSchliessen: () => void; onBearbeiten: () => void; onLoeschen: () => void; onRoute: () => void; onRouteAus: () => void; onNotizSpeichern: (n: Notiz) => void; onNotizLoeschen: (id: string) => void }) {
  const { e } = p
  const ziel = mitte(e)
  return (
    <section className="sheet">
      <div className="sheet-kopf">
        <h2>{e.typ === 'pin' ? <span className="farbpunkt" style={{ background: pinFarbe(e), width: 16, height: 16 }} /> : <span className="flaechen-symbol" style={{ color: pinFarbe(e) }}>⬠</span>} {e.titel || <span className="ohne-name">ohne Namen</span>}</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen">✕</button>
      </div>
      <div className="meta">
        <span>Farbe: {farbName(pinFarbe(e))}</span>
        {tierSummen([e]).length > 0 && <span className="tier-gesamt"><TierAnzeige summen={tierSummen([e])} /></span>}
        {e.herde && <span>Herde: {e.herde}</span>}
        {e.typ === 'flaeche' && <span>≈ {hektar(e.punkte).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha</span>}
        <span>Geändert: {datum(e.geaendert)}</span>
      </div>
      {p.routeInfo && <p className="route-info">🚗 {p.routeInfo}</p>}
      <div className="knoepfe">
        {p.routeInfo ? <button onClick={p.onRouteAus}>Route ausblenden</button> : <button onClick={p.onRoute}>Route anzeigen</button>}
        <a className="btn primaer" href={googleNaviLink(ziel)} target="_blank" rel="noreferrer">In Google Maps navigieren</a>
        {p.kannBearbeiten && <button onClick={p.onBearbeiten}>Bearbeiten</button>}
        {p.kannBearbeiten && <button className="gefahr" onClick={p.onLoeschen}>Löschen</button>}
      </div>
      {e.erstelltVon && !p.kannBearbeiten && p.darfBearbeiten && <p className="hinweis klein">Diesen Eintrag kann nur die Person, die ihn angelegt hat, oder ein Admin ändern. Notizen kannst du trotzdem hinzufügen.</p>}
      <Notizen e={e} darfBearbeiten={p.darfBearbeiten} kannNotiz={p.kannNotiz} onSpeichern={p.onNotizSpeichern} onLoeschen={p.onNotizLoeschen} />
    </section>
  )
}

// ISO <-> Wert für <input type="datetime-local"> (lokale Zeit)
const zuLokal = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const ausLokal = (v: string) => new Date(v).toISOString()

function Notizen(p: { e: Eintrag; darfBearbeiten: boolean; kannNotiz: (n: Notiz) => boolean; onSpeichern: (n: Notiz) => void; onLoeschen: (id: string) => void }) {
  const [text, setText] = useState('')
  const [bearbeite, setBearbeite] = useState<Notiz | null>(null)
  const liste = notizenSortiert(p.e)
  const hinzufuegen = () => {
    if (!text.trim()) return
    p.onSpeichern({ id: neueId(), text: text.trim(), zeitpunkt: new Date().toISOString(), ...autorFelder() })
    setText('')
  }
  return (
    <div className="notizen">
      <h3>Tagebuch ({liste.length} {liste.length === 1 ? 'Notiz' : 'Notizen'})</h3>
      {p.darfBearbeiten && (
        <div className="notiz-neu">
          <textarea rows={2} value={text} placeholder="Neue Notiz, z. B. „Wasser aufgefüllt, 3 Lämmer geboren“" onChange={(x) => setText(x.target.value)} />
          <button className="primaer" onClick={hinzufuegen} disabled={!text.trim()}>Notiz hinzufügen</button>
        </div>
      )}
      {!liste.length && <p className="hinweis">Noch keine Notizen.</p>}
      <ul className="notiz-liste">
        {liste.map((n) =>
          bearbeite?.id === n.id ? (
            <li key={n.id} className="notiz-edit">
              <input type="datetime-local" value={zuLokal(bearbeite.zeitpunkt)} onChange={(x) => x.target.value && setBearbeite({ ...bearbeite, zeitpunkt: ausLokal(x.target.value) })} />
              <textarea rows={3} value={bearbeite.text} onChange={(x) => setBearbeite({ ...bearbeite, text: x.target.value })} />
              <div className="knoepfe">
                <button className="primaer" disabled={!bearbeite.text.trim()} onClick={() => { p.onSpeichern({ ...bearbeite, text: bearbeite.text.trim() }); setBearbeite(null) }}>Speichern</button>
                <button onClick={() => setBearbeite(null)}>Abbrechen</button>
              </div>
            </li>
          ) : (
            <li key={n.id}>
              <div className="notiz-kopf">
                <time dateTime={n.zeitpunkt}>{datum(n.zeitpunkt)}</time>
                {n.autor && <span className="autor">· {n.autor}</span>}
                {p.kannNotiz(n) && (
                  <span className="notiz-aktionen">
                    <button title="Notiz bearbeiten" aria-label="Notiz bearbeiten" onClick={() => setBearbeite(n)}>✏️</button>
                    <button title="Notiz löschen" aria-label="Notiz löschen" onClick={() => confirm('Diese Notiz löschen?') && p.onLoeschen(n.id)}>🗑️</button>
                  </span>
                )}
              </div>
              <p>{n.text}</p>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function Formular(p: { start: Eintrag; neu: boolean; onSpeichern: (e: Eintrag, basis?: Einheit[]) => void; onAbbrechen: () => void; onLoeschen?: () => void }) {
  const [e, setE] = useState<Eintrag>(p.start)
  // Tiereinheiten als Zeilen (Anzahl als Text, damit das Feld beim Tippen leer sein darf)
  const [zeilen, setZeilen] = useState(() => (p.start.einheiten ?? []).map((x) => ({ ...x, anzahl: String(x.anzahl) })))
  const zeileAendern = (id: string, teil: Partial<{ art: Tierart; anzahl: string }>) => setZeilen((l) => l.map((z) => (z.id === id ? { ...z, ...teil } : z)))
  const [ersteNotiz, setErsteNotiz] = useState('')
  const art = e.typ === 'pin' ? 'Nadel' : 'Fläche'
  return (
    <section className="sheet formular">
      <form onSubmit={(ev) => {
        ev.preventDefault()
        const notizen = p.neu && ersteNotiz.trim() ? [{ id: neueId(), text: ersteNotiz.trim(), zeitpunkt: new Date().toISOString(), ...autorFelder() }] : e.notizen
        // leere/ungültige Zeilen fallen weg
        const einheiten: Einheit[] = zeilen.filter((z) => z.anzahl.trim() !== '' && Number(z.anzahl) >= 0).map((z) => ({ id: z.id, art: z.art, anzahl: Math.round(Number(z.anzahl)) }))
        p.onSpeichern({ ...e, notizen, einheiten }, p.start.einheiten ?? [])
      }}>
        <div className="sheet-kopf">
          <h2>{p.neu ? `Neue ${art}` : `${art} bearbeiten`}</h2>
          <button type="button" className="x" onClick={p.onAbbrechen} aria-label="Abbrechen">✕</button>
        </div>
        <label>Name<input autoFocus value={e.titel} placeholder={e.typ === 'pin' ? 'z. B. Mutterschafe Deich Nord' : 'z. B. Koog-Weide 3'} onChange={(x) => setE({ ...e, titel: x.target.value })} /></label>
        {p.neu ? (
          <label>Erste Notiz<textarea rows={3} value={ersteNotiz} placeholder="Was ist hier los? Wasser, Zaun, Lämmer …" onChange={(x) => setErsteNotiz(x.target.value)} /></label>
        ) : (
          <p className="hinweis klein">Notizen ({e.notizen.length}) fügst du in der Detailansicht hinzu bzw. bearbeitest sie dort.</p>
        )}
        {(
          <div className="farbwahl">
            <span className="feldname">{e.typ === 'pin' ? 'Farbe der Nadel' : 'Farbe der Fläche'}</span>
            <div className="farben" role="radiogroup" aria-label={e.typ === 'pin' ? 'Farbe der Nadel' : 'Farbe der Fläche'}>
              {(e.typ === 'pin' ? FARBEN : FLAECHEN_FARBEN).map((f) => (
                <button type="button" key={f.wert} title={f.name} aria-label={f.name} aria-checked={pinFarbe(e) === f.wert} role="radio"
                  className={pinFarbe(e) === f.wert ? 'aktiv' : ''} style={{ background: f.wert }} onClick={() => setE({ ...e, farbe: f.wert })} />
              ))}
              <label className="frei" title="Eigene Farbe">eigene:<input type="color" value={pinFarbe(e)} onChange={(x) => setE({ ...e, farbe: x.target.value })} /></label>
            </div>
          </div>
        )}
        <div className="einheiten">
          <span className="feldname">Tiere</span>
          {zeilen.map((z, i) => (
            <div className="einheit-zeile" key={z.id}>
              <input type="number" inputMode="numeric" min={0} aria-label={`Anzahl (Zeile ${i + 1})`} placeholder="Anzahl" value={z.anzahl} onChange={(x) => zeileAendern(z.id, { anzahl: x.target.value })} />
              <select aria-label={`Tierart (Zeile ${i + 1})`} value={z.art} onChange={(x) => zeileAendern(z.id, { art: x.target.value as Tierart })}>
                {TIERARTEN.map((t) => <option key={t.wert} value={t.wert}>{t.emoji ? `${t.emoji} ` : ''}{t.name}</option>)}
              </select>
              <button type="button" className="x" aria-label={`Zeile ${i + 1} entfernen`} title="Zeile entfernen" onClick={() => setZeilen((l) => l.filter((x) => x.id !== z.id))}>✕</button>
            </div>
          ))}
          <button type="button" className="tiere-plus" onClick={() => setZeilen((l) => [...l, { id: neueId(), art: l.length ? l[l.length - 1].art : 'schaf', anzahl: '' }])}>＋ Tiere hinzufügen</button>
        </div>
        <div className="zeile">
          <label>Herde<input value={e.herde ?? ''} placeholder="optional" onChange={(x) => setE({ ...e, herde: x.target.value || undefined })} /></label>
        </div>
        <div className="knoepfe">
          <button type="submit" className="primaer">Speichern</button>
          <button type="button" onClick={p.onAbbrechen}>Abbrechen</button>
          {p.onLoeschen && <button type="button" className="gefahr" onClick={p.onLoeschen}>Löschen</button>}
        </div>
      </form>
    </section>
  )
}

function Liste(p: { eintraege: Eintrag[]; onWahl: (e: Eintrag) => void; onSchliessen: () => void }) {
  const [suche, setSuche] = useState('')
  const [filter, setFilter] = useState<'alle' | 'pin' | 'flaeche'>('alle')
  const [farbFilter, setFarbFilter] = useState<string | null>(null)
  const vorhandeneFarben = [...new Set(p.eintraege.map((e) => pinFarbe(e)))]
  const liste = [...p.eintraege]
    .filter((e) => filter === 'alle' || e.typ === filter)
    .filter((e) => !farbFilter || pinFarbe(e) === farbFilter)
    .filter((e) => `${e.titel} ${e.herde ?? ''} ${e.notizen.map((n) => `${n.text} ${n.autor ?? ''}`).join(' ')}`.toLowerCase().includes(suche.toLowerCase()))
    .sort((a, b) => b.geaendert.localeCompare(a.geaendert))
  // Summen je Tierart (nur Nadeln), z. B. „50 Schafe · 2 Böcke · 12 Lämmer an Nadeln“
  const summen = tierSummen(p.eintraege.filter((e) => e.typ === 'pin'))
  return (
    <section className="panel">
      <div className="sheet-kopf">
        <h2>Tagebuch</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen">✕</button>
      </div>
      <p className="hinweis">{p.eintraege.filter((e) => e.typ === 'pin').length} Nadeln · {p.eintraege.filter((e) => e.typ === 'flaeche').length} Flächen · {summen.length ? <><TierAnzeige summen={summen} /> an Nadeln</> : '0 Tiere an Nadeln'}</p>
      <input placeholder="Suchen (Name, Herde, alle Notizen) …" value={suche} onChange={(e) => setSuche(e.target.value)} />
      <div className="tabs">
        {(['alle', 'pin', 'flaeche'] as const).map((f) => (
          <button key={f} className={filter === f ? 'aktiv' : ''} onClick={() => setFilter(f)}>{{ alle: 'Alle', pin: 'Nadeln', flaeche: 'Flächen' }[f]}</button>
        ))}
      </div>
      {vorhandeneFarben.length > 1 && (
        <div className="farbfilter" aria-label="Nach Farbe filtern">
          <button className={!farbFilter ? 'aktiv' : ''} onClick={() => setFarbFilter(null)}>Alle Farben</button>
          {vorhandeneFarben.map((f) => (
            <button key={f} className={farbFilter === f ? 'aktiv' : ''} onClick={() => setFarbFilter(farbFilter === f ? null : f)}>
              <span className="farbpunkt" style={{ background: f }} />{farbName(f)} ({p.eintraege.filter((e) => pinFarbe(e) === f).length})
            </button>
          ))}
        </div>
      )}
      {!liste.length && <p className="hinweis">Noch keine Einträge. Tippe auf „+ Nadel“ oder direkt auf die Karte.</p>}
      <ul className="liste">
        {liste.map((e) => (
          <li key={e.id} onClick={() => p.onWahl(e)}>
            <strong>{e.typ === 'pin' ? <span className="farbpunkt" style={{ background: pinFarbe(e) }} /> : <span className="flaechen-symbol" style={{ color: pinFarbe(e) }}>⬠</span>} {e.titel || <span className="ohne-name">ohne Namen</span>}</strong>
            {e.notizen.length > 0 && <span className="notiz-kurz">{notizenSortiert(e)[0].text}</span>}
            <small>📝 {e.notizen.length} {e.notizen.length === 1 ? 'Notiz' : 'Notizen'} · {tierSummen([e]).length > 0 && <><TierAnzeige summen={tierSummen([e])} /> · </>}{e.herde ? `${e.herde} · ` : ''}{datum(e.geaendert)}</small>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Einstellungen(p: { k: ReturnType<typeof useKarte>; onSchliessen: () => void; meldung: (s: string) => void; onNutzer: () => void; onProfil: () => void }) {
  const { k } = p
  const [name, setName] = useState('Weidekarte Deichschäferei')
  const basis = `${location.origin}${location.pathname}?karte=${k.karteId}`
  const kopieren = async (t: string) => {
    try { await navigator.clipboard.writeText(t); p.meldung('Link kopiert') } catch { prompt('Link kopieren:', t) }
  }
  const exportieren = () => {
    const blob = new Blob([JSON.stringify({ app: 'weide-tagebuch', version: 1, exportiert: new Date().toISOString(), eintraege: k.eintraege }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `weide-tagebuch-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  const importieren = async (f: File) => {
    try {
      const j = JSON.parse(await f.text())
      const liste: Eintrag[] = Array.isArray(j) ? j : j.eintraege
      if (!Array.isArray(liste)) throw new Error()
      if (!confirm(`${liste.length} Einträge importieren? Vorhandene Einträge mit gleicher ID werden überschrieben.`)) return
      const ids = new Set(liste.map((e) => e.id))
      await k.alleErsetzen([...k.eintraege.filter((e) => !ids.has(e.id)), ...liste])
      p.meldung('Import erfolgreich')
    } catch { p.meldung('Datei konnte nicht gelesen werden') }
  }
  return (
    <section className="panel">
      <div className="sheet-kopf">
        <h2>Einstellungen</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen">✕</button>
      </div>

      <h3>Karte teilen</h3>
      {!k.karteId ? (
        <>
          <p className="hinweis">Diese Karte liegt nur auf diesem Gerät. Teile sie, damit Mitarbeiter, Familie oder Deichverband Nadeln sehen und bearbeiten können.</p>
          <label>Name der Karte<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <button className="primaer" onClick={() => k.teilen(name).catch((e) => p.meldung(e.message))}>Geteilte Karte erstellen</button>
        </>
      ) : (
        <>
          <p className="hinweis">Status: {k.status === 'verbunden' ? 'live verbunden' : k.status}. Änderungen erscheinen sofort bei allen, die den Link offen haben.</p>
          <button onClick={() => kopieren(basis)}>🔗 Link zum Ansehen kopieren</button>
          <p className="hinweis klein">Der Ansehen-Link ist nur zum Lesen. Zum Mitarbeiten bekommt jede Person einen eigenen Zugangs-Link vom Admin.</p>
          {k.istAdmin && <button className="primaer" onClick={p.onNutzer}>👥 Nutzer verwalten / Leute einladen</button>}
        </>
      )}

      {k.karteId ? (
        <>
          <h3>Dein Zugang</h3>
          {k.ich ? (
            <>
              <p className="hinweis">Angemeldet als <strong>{k.ich.name}</strong> ({k.ich.rolle === 'admin' ? 'Admin' : 'Nutzer'}). Dein persönlicher Link ist auf diesem Gerät gespeichert.</p>
              <button onClick={p.onProfil}>✏️ Meinen Namen ändern</button>
              <button onClick={() => k.zugang && kopieren(zugangsLink(k.karteId!, k.zugang))}>🔑 Meinen persönlichen Link kopieren (für ein weiteres Gerät)</button>
              <button onClick={() => confirm('Auf diesem Gerät abmelden? Du brauchst danach deinen persönlichen Link wieder.') && k.abmelden()}>Abmelden</button>
            </>
          ) : (
            <p className="hinweis">Nur ansehen. Zum Mitarbeiten den persönlichen Link vom Admin öffnen.{k.zugang ? ' (Der gespeicherte Zugang ist nicht mehr gültig.)' : ''}</p>
          )}
        </>
      ) : (
        <>
          <h3>Dein Name</h3>
          <label>Name/Gerät für deine Notizen (optional)<input defaultValue={localStorage.getItem('wt-autor') ?? ''} placeholder="z. B. Henning" onChange={(e) => (e.target.value.trim() ? localStorage.setItem('wt-autor', e.target.value.trim()) : localStorage.removeItem('wt-autor'))} /></label>
        </>
      )}

      <h3>Daten</h3>
      <button onClick={exportieren}>⬇️ Als JSON exportieren</button>
      {k.istAdmin && (
        <label className="btn">⬆️ JSON importieren<input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importieren(e.target.files[0])} /></label>
      )}

      <h3>Karte</h3>
      <p className="hinweis">Kartendienst: {HAT_GOOGLE_KEY ? 'Google Maps (Satellit)' : 'Esri-Satellit / OpenStreetMap (kostenlos) – für Google Maps einen API-Key in VITE_GOOGLE_MAPS_API_KEY eintragen'}.<br />Routen: {HAT_GOOGLE_KEY ? 'Google Directions' : 'OSRM (kostenloser Demo-Server)'}.</p>
      <p className="hinweis klein">Weide-Tagebuch · Prototyp v0.1</p>
    </section>
  )
}

// Kleines Profil-Fenster: eigenen Anzeigenamen ändern
function Profil(p: { k: ReturnType<typeof useKarte>; onSchliessen: () => void; meldung: (s: string) => void }) {
  const { k } = p
  const [name, setName] = useState(k.ich?.name ?? '')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const sauber = name.replace(/\s+/g, ' ').trim()
  const speichern = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!sauber) return setFehler('Der Name darf nicht leer sein.')
    setLaeuft(true); setFehler('')
    try {
      await k.nameAendern(sauber)
      p.meldung('Name gespeichert')
      p.onSchliessen()
    } catch (e) {
      setFehler((e as Error).message)
    } finally { setLaeuft(false) }
  }
  return (
    <section className="panel profil">
      <div className="sheet-kopf"><h2>Mein Name</h2><button className="x" onClick={p.onSchliessen} aria-label="Schließen">✕</button></div>
      <form onSubmit={speichern}>
        <label>Anzeigename<input autoFocus value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="z. B. Henning" /></label>
        <p className="hinweis klein">Erscheint als Autor bei deinen Notizen – auch bei den bisherigen – und bei allen anderen sofort. {[...sauber].length}/{NAME_MAX}</p>
        {fehler && <p className="fehler gefahr">{fehler}</p>}
        <div className="knoepfe">
          <button type="button" onClick={p.onSchliessen}>Abbrechen</button>
          <button type="submit" className="primaer" disabled={laeuft || !sauber || sauber === k.ich?.name}>Speichern</button>
        </div>
      </form>
    </section>
  )
}

function NutzerVerwaltung(p: { k: ReturnType<typeof useKarte>; onSchliessen: () => void; meldung: (s: string) => void }) {
  const { k } = p
  const [liste, setListe] = useState<Nutzer[] | null>(null)
  const [name, setName] = useState('')
  const [rolle, setRolle] = useState<Ich['rolle']>('nutzer')
  const [neu, setNeu] = useState<Nutzer | null>(null)
  const laden = useCallback(() => { k.nutzer.laden().then(setListe).catch((e) => p.meldung(e.message)) }, [k, p])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(laden, [])
  const fehler = (e: Error) => p.meldung(e.message)
  const link = (n: Nutzer) => zugangsLink(k.karteId!, n.zugang)
  const teilen = async (n: Nutzer) => {
    const text = `Hallo ${n.name}, hier ist dein persönlicher Zugang zur Weidekarte „${k.kartenName}“: ${link(n)}`
    if (navigator.share) { try { await navigator.share({ title: 'Weide-Tagebuch', text, url: link(n) }); return } catch { /* abgebrochen */ } }
    try { await navigator.clipboard.writeText(link(n)); p.meldung(`Link für ${n.name} kopiert`) } catch { prompt(`Link für ${n.name} kopieren:`, link(n)) }
  }
  const admins = liste?.filter((n) => n.rolle === 'admin').length ?? 0
  return (
    <section className="panel nutzer-panel">
      <div className="sheet-kopf">
        <h2>Nutzer</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen">✕</button>
      </div>
      <p className="hinweis">Jede Person bekommt einen eigenen Link. <strong>Nutzer</strong> dürfen Nadeln, Flächen und Notizen anlegen und ihre eigenen ändern/löschen. <strong>Admins</strong> dürfen alles und Nutzer verwalten.</p>

      <h3>Person hinzufügen</h3>
      <form className="nutzer-neu" onSubmit={(ev) => {
        ev.preventDefault()
        if (!name.trim()) return
        k.nutzer.anlegen(name.trim(), rolle).then((n) => { setNeu(n); setName(''); setRolle('nutzer'); laden(); k.ichLaden() }).catch(fehler)
      }}>
        <label>Name<input value={name} placeholder="z. B. Jan (Schäfer)" onChange={(e) => setName(e.target.value)} /></label>
        <label>Rolle<select value={rolle} onChange={(e) => setRolle(e.target.value as Ich['rolle'])}><option value="nutzer">Nutzer</option><option value="admin">Admin</option></select></label>
        <button type="submit" className="primaer" disabled={!name.trim()}>Hinzufügen</button>
      </form>
      {neu && (
        <div className="neu-link">
          <p><strong>{neu.name}</strong> wurde angelegt. Schick ihm/ihr diesen persönlichen Link:</p>
          <input readOnly value={link(neu)} onFocus={(e) => e.target.select()} />
          <div className="knoepfe">
            <button className="primaer" onClick={() => teilen(neu)}>Link teilen / kopieren</button>
            <button onClick={() => setNeu(null)}>Fertig</button>
          </div>
        </div>
      )}

      <h3>Alle Personen ({liste?.length ?? '…'})</h3>
      <ul className="nutzer-liste">
        {liste?.map((n) => (
          <li key={n.id}>
            <div className="nutzer-kopf">
              <strong>{n.name}</strong>{n.id === k.ich?.id && <span className="hinweis"> (du)</span>}
              <select value={n.rolle} aria-label={`Rolle von ${n.name}`} disabled={n.rolle === 'admin' && admins <= 1}
                onChange={(e) => k.nutzer.aendern(n.id, { rolle: e.target.value as Ich['rolle'] }).then(() => { laden(); k.ichLaden() }).catch(fehler)}>
                <option value="nutzer">Nutzer</option><option value="admin">Admin</option>
              </select>
            </div>
            <div className="knoepfe">
              <button onClick={() => teilen(n)}>🔗 Link teilen</button>
              <button onClick={() => { const neuName = prompt('Neuer Name:', n.name); if (neuName?.trim()) k.nutzer.aendern(n.id, { name: neuName.trim() }).then(() => { laden(); k.ichLaden() }).catch(fehler) }}>Umbenennen</button>
              <button title="Alter Link wird ungültig" onClick={() => confirm(`Neuen Link für ${n.name} erzeugen? Der alte Link funktioniert dann nicht mehr.`) && k.nutzer.aendern(n.id, { neuerZugang: true }).then((x) => { setNeu(x); laden() }).catch(fehler)}>Neuer Link</button>
              <button className="gefahr" disabled={n.rolle === 'admin' && admins <= 1}
                onClick={() => confirm(`${n.name} entfernen? Der Zugang ist sofort ungültig.`) && k.nutzer.entfernen(n.id).then(() => { laden(); p.meldung(`${n.name} entfernt`) }).catch(fehler)}>Entfernen</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="hinweis klein">Mindestens ein Admin muss bleiben. Wer entfernt wird, kann die Karte nur noch über den Ansehen-Link lesen.</p>
    </section>
  )
}
