// Export & Import: Excel, PDF-Bericht, KML (Google Earth / My Maps), vollständige Sicherung (JSON) + Wiederherstellen,
// Import aus Google My Maps (KML/KMZ), GeoJSON und CSV – mit Vorschau und Bestätigung.
import { useMemo, useState } from 'react'
import type { useKarte } from './daten'
import { FLAECHE_STANDARD, STANDARD_FARBE, isoTag, tierText, mitte, neueId, type Einheit, type Eintrag, type Gruppe, type LatLng } from './types'
import { dateiName, herunterladen, summenBauen, zahl, zeilenBauen } from './austausch/zeilen'
import { sicherungErzeugen, sicherungLesen } from './austausch/sicherung'
import type { ImportErgebnis, Vorschlag } from './austausch/kml'
import * as WP from '../server/weideplan.js'
import type { Weideplan } from '../server/weideplan.js'
import type { Blatt } from './austausch/xlsx'

// Excel: Blatt „Weideplan“ (alle Belegungen) und „Umtriebe“ (Protokoll – Grundlage für Tierbewegungen)
function planBlaetter(plan: Weideplan, eintraege: Eintrag[]): Blatt[] {
  const heute = WP.heute()
  const name = (id?: string) => (id ? eintraege.find((e) => e.id === id)?.titel || '' : '')
  const st = (b: Weideplan['belegungen'][number]) => (b.status === 'beendet' ? 'beendet' : b.status === 'geplant' || b.von > heute ? 'geplant' : 'auf der Fläche')
  const t = (x: { schaf?: number; bock?: number; lamm?: number }) => [x.schaf ?? 0, x.bock ?? 0, x.lamm ?? 0]
  const ART = { auftrieb: 'Auftrieb', umtrieb: 'Umtrieb', abtrieb: 'Abtrieb' }
  return [
    {
      name: 'Weideplan',
      kopf: ['Herde', 'Fläche', 'Status', 'Von', 'Geplant bis', 'Beendet am', 'Tage', 'Schafe', 'Böcke', 'Lämmer', 'Danach', 'Notiz'],
      breiten: [18, 24, 14, 11, 11, 11, 7, 8, 8, 8, 22, 40],
      zeilen: [...plan.belegungen].sort((a, b) => b.von.localeCompare(a.von)).map((b) => [WP.herdeVon(plan, b.herde)?.name ?? b.herdeName ?? '', b.flaecheName, st(b), { datum: b.von }, b.bis ? { datum: b.bis } : null, b.ende ? { datum: b.ende } : null, b.status === 'geplant' ? null : Math.max(0, WP.tageZwischen(b.von, b.ende ?? heute)), ...t(b.tiere), name(b.naechste), b.notiz ?? '']),
    },
    {
      name: 'Umtriebe',
      kopf: ['Datum', 'Art', 'Herde', 'Von', 'Nach', 'Schafe', 'Böcke', 'Lämmer', 'Breite (nach)', 'Länge (nach)', 'Erfasst von', 'Erfasst am'],
      breiten: [11, 10, 18, 24, 24, 8, 8, 8, 12, 12, 16, 17],
      zeilen: [...plan.bewegungen].sort((a, b) => b.datum.localeCompare(a.datum) || b.zeitpunkt.localeCompare(a.zeitpunkt)).map((b) => [{ datum: b.datum }, ART[b.art], b.herdeName, b.von?.name ?? '', b.nach?.name ?? '', ...t(b.tiere), b.nach?.lat !== undefined ? { zahl: b.nach.lat, format: 'koord' } : null, b.nach?.lng !== undefined ? { zahl: b.nach.lng, format: 'koord' } : null, b.autor ?? '', new Date(b.zeitpunkt).toLocaleString('de-DE')]),
    },
  ]
}

type K = ReturnType<typeof useKarte>
export type ExportFilter = { ids: string[]; text: string } | null

const abstandM = (a: LatLng, b: LatLng) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r; return Math.sqrt(x * x + y * y) * 6371000 }
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function Austausch(p: { k: K; eintraege: Eintrag[]; filter: ExportFilter; meldung: (s: string) => void; onSchliessen: () => void }) {
  const { k } = p
  const [nurGefiltert, setNurGefiltert] = useState(!!p.filter)
  const [mitKarte, setMitKarte] = useState(true)
  const [jeGruppe, setJeGruppe] = useState(false)
  const [mitPlan, setMitPlan] = useState(true)
  const hatPlan = !!(k.weideplan && (k.weideplan.belegungen.length || k.weideplan.bewegungen.length))
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const auswahl = useMemo(() => (nurGefiltert && p.filter ? p.eintraege.filter((e) => p.filter!.ids.includes(e.id)) : p.eintraege), [nurGefiltert, p.filter, p.eintraege])
  const zeilen = useMemo(() => zeilenBauen(auswahl, k.gruppen), [auswahl, k.gruppen])
  const name = k.kartenName || 'FlockMap'
  const leer = !zeilen.length
  const filterText = nurGefiltert && p.filter ? p.filter.text : undefined

  const mit = async (was: string, f: () => Promise<void>) => {
    setLaeuft(was)
    try { await f() } catch (e) { p.meldung(`${was} fehlgeschlagen: ${(e as Error).message}`) }
    setLaeuft(null)
  }

  const excel = () => mit('Excel-Export', async () => {
    const { xlsxErzeugen } = await import('./austausch/xlsx')
    const s = summenBauen(zeilen, k.gruppen)
    const daten = xlsxErzeugen([
      {
        name: 'Nadeln und Flächen',
        kopf: ['Nr', 'Typ', 'Name', 'Gruppe', 'Schafe', 'Böcke', 'Lämmer', 'Tiere kurz', 'Herde', 'Farbe', 'Datum', 'Breite', 'Länge', 'Hektar', 'Notizen', 'Geändert', 'ID'],
        breiten: [5, 8, 26, 18, 8, 8, 8, 12, 14, 10, 11, 12, 12, 9, 60, 17, 16],
        zeilen: zeilen.map((z) => [z.nr ?? null, z.typ, z.name, z.gruppe, z.schafe, z.boecke, z.laemmer, z.kurz, z.herde, z.farbName, { datum: z.datum }, { zahl: z.lat, format: 'koord' }, { zahl: z.lng, format: 'koord' }, z.typ === 'Fläche' ? { zahl: z.ha, format: 'ha' } : null, z.notizen, new Date(z.e.geaendert).toLocaleString('de-DE'), z.e.id]),
        summenZeile: [null, null, 'Summe', null, s.gesamt.schafe, s.gesamt.boecke, s.gesamt.laemmer, null, null, null, null, null, null, s.gesamt.ha ? { zahl: s.gesamt.ha, format: 'ha' } : null],
      },
      {
        name: 'Summen je Gruppe',
        kopf: ['Gruppe', 'Einträge', 'Schafe', 'Böcke', 'Lämmer', 'Hektar'],
        breiten: [28, 10, 10, 10, 10, 10],
        zeilen: s.gruppen.map((g) => [g.name, g.anzahl, g.schafe, g.boecke, g.laemmer, g.ha ? { zahl: g.ha, format: 'ha' } : null]),
        summenZeile: ['Gesamt', s.gesamt.anzahl, s.gesamt.schafe, s.gesamt.boecke, s.gesamt.laemmer, s.gesamt.ha ? { zahl: s.gesamt.ha, format: 'ha' } : null],
      },
      {
        name: 'Notizen',
        kopf: ['Eintrag', 'Gruppe', 'Datum', 'Autor', 'Notiz'],
        breiten: [26, 18, 17, 16, 80],
        zeilen: zeilen.flatMap((z) => [...z.e.notizen].sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt)).map((n) => [z.name, z.gruppe, new Date(n.zeitpunkt).toLocaleString('de-DE'), n.autor ?? '', n.text])),
      },
      ...(hatPlan ? planBlaetter(k.weideplan!, k.eintraege) : []),
    ])
    herunterladen(new Blob([daten as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), dateiName(name, 'xlsx'))
    p.meldung(`Excel-Liste mit ${zeilen.length} Einträgen erstellt`)
  })

  const pdf = () => mit('PDF-Bericht', async () => {
    const { pdfErzeugen } = await import('./austausch/pdf')
    const blob = await pdfErzeugen(zeilen, k.gruppen, { karte: name, hof: k.hof?.name, autor: k.ich?.name, filterText, gesamtAnzahl: p.eintraege.length, jeGruppe, mitKarte, ...(mitPlan && hatPlan ? { weideplan: { plan: k.weideplan!, eintraege: k.eintraege } } : {}) })
    herunterladen(blob, dateiName(name, 'pdf'))
    p.meldung('PDF-Bericht erstellt')
  })

  const kml = () => mit('KML-Export', async () => {
    const { kmlErzeugen } = await import('./austausch/kml')
    const s = summenBauen(zeilen, k.gruppen)
    const reihe = [
      ...k.gruppen.map((g) => ({ id: g.id as string | null, name: g.name, farbe: s.gruppen.find((x) => x.name === g.name)?.farbe ?? '#999999' })),
      { id: null, name: k.gruppen.length ? 'Ohne Gruppe' : 'Nadeln', farbe: '#9e9e9e' },
      { id: '__flaechen', name: 'Flächen', farbe: FLAECHE_STANDARD },
    ]
    herunterladen(new Blob([kmlErzeugen(name, zeilen, reihe)], { type: 'application/vnd.google-earth.kml+xml' }), dateiName(name, 'kml'))
    p.meldung(`KML mit ${zeilen.length} Einträgen erstellt`)
  })

  const sicherung = () => {
    const s = sicherungErzeugen({ id: k.karteId, name, ...(k.hof ? { hof: k.hof.name } : {}) }, k.eintraege, k.gruppen, k.weideplan)
    herunterladen(new Blob([JSON.stringify(s, null, 1)], { type: 'application/json' }), dateiName(`${name}-Sicherung`, 'json'))
    p.meldung(`Sicherung mit ${s.eintraege.length} Einträgen und ${s.gruppen.length} Gruppen${s.weideplan ? ` sowie Weideplan (${s.weideplan.belegungen.length} Belegungen, ${s.weideplan.bewegungen.length} Umtriebe)` : ''} gespeichert`)
  }

  return (
    <section className="panel austausch">
      <div className="sheet-kopf">
        <h2>Export &amp; Import</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen">✕</button>
      </div>

      <h3>Exportieren</h3>
      {p.filter && (
        <div className="auswahl-wahl" role="radiogroup" aria-label="Was exportieren?">
          <label><input type="radio" checked={nurGefiltert} onChange={() => setNurGefiltert(true)} /> Nur gefilterte exportieren <small>({p.filter.ids.length}: {p.filter.text})</small></label>
          <label><input type="radio" checked={!nurGefiltert} onChange={() => setNurGefiltert(false)} /> Alles exportieren <small>({p.eintraege.length})</small></label>
        </div>
      )}
      <p className="hinweis klein">{zahl(zeilen.length)} {zeilen.length === 1 ? 'Eintrag' : 'Einträge'} · {zahl(zeilen.reduce((s, z) => s + z.schafe, 0))} Schafe · {zahl(zeilen.reduce((s, z) => s + z.boecke, 0))} Böcke · {zahl(zeilen.reduce((s, z) => s + z.laemmer, 0))} Lämmer{!p.filter ? ' · Tipp: In der Liste filtern und dort „Export“ tippen, um nur einen Teil zu exportieren.' : ''}</p>

      <div className="export-karte">
        <button className="primaer" disabled={leer || !!laeuft} onClick={excel}>📊 {laeuft === 'Excel-Export' ? 'Erstelle …' : 'Excel-Liste (.xlsx)'}</button>
        <p className="hinweis klein">Alle Nadeln und Flächen mit Gruppe, Nummer, Schafen, Böcken, Lämmern, Farbe, Koordinaten, Datum und Notizen. Dazu ein Blatt „Summen je Gruppe“, ein Blatt mit allen Notizen und – falls genutzt – die Blätter „Weideplan“ und „Umtriebe“. Öffnet sich in Excel, Numbers und LibreOffice.</p>
      </div>
      <div className="export-karte">
        <button className="primaer" disabled={leer || !!laeuft} onClick={pdf}>📄 {laeuft === 'PDF-Bericht' ? 'Erstelle … (Karte wird gezeichnet)' : 'PDF-Bericht'}</button>
        <label className="frei klein-option"><input type="checkbox" checked={mitKarte} onChange={(e) => setMitKarte(e.target.checked)} /> Übersichtskarte (Satellitenbild)</label>
        {hatPlan && <label className="frei klein-option"><input type="checkbox" checked={mitPlan} onChange={(e) => setMitPlan(e.target.checked)} /> Weideplan (aktuelle Belegung, Flächenstatus, letzte Umtriebe)</label>}
        <label className="frei klein-option"><input type="checkbox" checked={jeGruppe} onChange={(e) => setJeGruppe(e.target.checked)} /> Je Gruppe eine eigene Seite (mit Karte und allen Notizen)</label>
        <p className="hinweis klein">Zum Ausdrucken oder Weitergeben (Deichverband, Tierarzt, Kontrolle): Hof- und Kartenname, Datum, Kennzahlen, Karte, Summen je Gruppe und eine Tabelle aller Einträge.</p>
      </div>
      <div className="export-karte">
        <button className="primaer" disabled={leer || !!laeuft} onClick={kml}>🌍 {laeuft === 'KML-Export' ? 'Erstelle …' : 'KML für Google Earth / My Maps'}</button>
        <p className="hinweis klein">Jede Gruppe wird ein eigener Ordner (in My Maps: eine Ebene), mit Farben. Flächen werden als Flächen (Polygone) übertragen. In My Maps: „Importieren“ in einer neuen Ebene.</p>
      </div>

      {k.istAdmin ? (
        <>
          <h3>Sicherung</h3>
          <div className="export-karte">
            <button onClick={sicherung} disabled={!k.eintraege.length && !k.gruppen.length && !k.weideplan?.belegungen.length}>💾 Vollständige Sicherung herunterladen (JSON)</button>
            <p className="hinweis klein">Die ganze Karte in einer Datei: alle Einträge, Notizen mit Autor, Tierzahlen, Gruppen mit Farben und Nummernfolge sowie der Weideplan (Herden, Belegungen, Umtriebs-Protokoll). Ohne persönliche Links – die Datei kann gefahrlos aufbewahrt werden. Tipp: einmal im Monat sichern.</p>
          </div>
          <Wiederherstellen k={k} meldung={p.meldung} />
          <h3>Importieren</h3>
          <Importieren k={k} meldung={p.meldung} onFertig={p.onSchliessen} />
        </>
      ) : (
        <p className="hinweis klein">Sicherung, Wiederherstellen und Import können nur Admins bzw. der Hof-Inhaber.</p>
      )}
    </section>
  )
}

// ---------------- Sicherung wiederherstellen ----------------
function Wiederherstellen(p: { k: K; meldung: (s: string) => void }) {
  const { k } = p
  const [s, setS] = useState<ReturnType<typeof sicherungLesen> | null>(null)
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const lesen = async (f: File) => {
    setFehler(''); setS(null)
    try { setS(sicherungLesen(JSON.parse(await f.text()))) } catch (e) { setFehler(e instanceof SyntaxError ? 'Die Datei ist kein gültiges JSON.' : (e as Error).message) }
  }
  const vorhanden = s ? s.eintraege.filter((e) => k.eintraege.some((x) => x.id === e.id)).length : 0
  const fehlend = s ? s.eintraege.length - vorhanden : 0
  const gruppenNeu = s ? s.gruppen.filter((g) => !k.gruppen.some((x) => x.id === g.id)).length : 0
  const planNeu = s?.weideplan ? s.weideplan.belegungen.filter((b) => !k.weideplan?.belegungen.some((x) => x.id === b.id)).length + s.weideplan.bewegungen.filter((b) => !k.weideplan?.bewegungen.some((x) => x.id === b.id)).length : 0
  return (
    <div className="export-karte">
      <label className="btn">♻️ Sicherung wiederherstellen …<input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) lesen(f) }} /></label>
      {fehler && <p className="fehler gefahr">{fehler}</p>}
      {s && (
        <div className="vorschau-box" role="region" aria-label="Sicherung – Vorschau">
          <p><strong>Sicherung{s.name ? ` „${s.name}“` : ''}</strong>{s.exportiert ? ` vom ${new Date(s.exportiert).toLocaleString('de-DE')}` : ''}: {s.eintraege.length} Einträge, {s.gruppen.length} Gruppen{s.weideplan ? `, Weideplan mit ${s.weideplan.herden.length} Herden, ${s.weideplan.belegungen.length} Belegungen, ${s.weideplan.bewegungen.length} Umtrieben` : ''}.</p>
          {k.eintraege.length > 0 && <p className="hinweis klein">Auf dieser Karte sind schon {k.eintraege.length} Einträge. {vorhanden ? `${vorhanden} aus der Sicherung gibt es hier bereits – die bleiben unverändert.` : ''} Übernommen werden nur die {fehlend} fehlenden{gruppenNeu ? ` und ${gruppenNeu} fehlende Gruppen` : ''}{planNeu ? ` sowie ${planNeu} fehlende Weideplan-Einträge` : ''}. Gelöscht oder überschrieben wird nichts.</p>}
          <div className="knoepfe">
            <button className="primaer" disabled={laeuft || (!fehlend && !gruppenNeu && !planNeu)} onClick={() => {
              if (!confirm(`${fehlend} Einträge${gruppenNeu ? ` und ${gruppenNeu} Gruppen` : ''} in die Karte „${k.kartenName || 'diese Karte'}“ übernehmen?`)) return
              k.stapel(s.eintraege.filter((e) => !k.eintraege.some((x) => x.id === e.id)), s.gruppen, planNeu ? s.weideplan : undefined)
              p.meldung(`${fehlend} Einträge übernommen${k.karteId ? ' – werden gesendet' : ''}`); setS(null)
            }}>{k.eintraege.length ? `Fehlende ${fehlend} in diese Karte übernehmen` : `In diese (leere) Karte übernehmen`}</button>
            {k.karteId && <button disabled={laeuft} onClick={async () => {
              const n = prompt('Name der neuen Karte:', `${s.name || 'Weidekarte'} (wiederhergestellt)`)
              if (!n) return
              setLaeuft(true)
              try { const r = await k.alsNeueKarte(n.slice(0, 100), s.eintraege, s.gruppen, s.weideplan); location.href = `${location.pathname}?karte=${r.id}` } catch (e) { p.meldung((e as Error).message); setLaeuft(false) }
            }}>{laeuft ? 'Lege an …' : 'Als neue Karte anlegen'}</button>}
            <button onClick={() => setS(null)}>Abbrechen</button>
          </div>
          {k.karteId && <p className="hinweis klein">„Als neue Karte“: Du wirst Admin der neuen Karte und bekommst einen eigenen Link; andere Personen musst du dort neu einladen.{k.hof ? ' Die neue Karte gehört nicht automatisch zum Hof.' : ''}</p>}
        </div>
      )}
    </div>
  )
}

// ---------------- Import (My Maps KML/KMZ, GeoJSON, CSV) ----------------
interface Zeile { v: Vorschlag; doppelt: boolean; an: boolean }
function Importieren(p: { k: K; meldung: (s: string) => void; onFertig: () => void }) {
  const { k } = p
  const [erg, setErg] = useState<(ImportErgebnis & { datei: string }) | null>(null)
  const [fehler, setFehler] = useState('')
  const [ebenenAlsGruppen, setEbenenAlsGruppen] = useState(true)
  const [ausNamen, setAusNamen] = useState(true)
  const [doppelteWeg, setDoppelteWeg] = useState(true)
  const [aus, setAus] = useState<Set<number>>(new Set())
  const [kml, setKml] = useState<typeof import('./austausch/kml') | null>(null)
  const lesen = async (f: File) => {
    setFehler(''); setErg(null); setAus(new Set())
    try {
      const m = await import('./austausch/kml'); setKml(m)
      const r = await m.dateiLesen(f)
      if (r.vorschlaege.length > 3000) throw new Error(`Zu viele Einträge (${r.vorschlaege.length}) – höchstens 3.000 auf einmal`)
      if (!r.vorschlaege.length) throw new Error(`In der Datei wurden keine Nadeln oder Flächen gefunden${r.uebersprungen.length ? ` (${r.uebersprungen.length} übersprungen: ${r.uebersprungen[0].grund})` : ''}`)
      setErg({ ...r, datei: f.name })
    } catch (e) { setFehler((e as Error).message) }
  }
  const zeilen: Zeile[] = useMemo(() => {
    if (!erg || !kml) return []
    return erg.vorschlaege.map((roh, i) => {
      const v = kml.namenAuswerten(roh, ausNamen)
      const pos = v.position ?? (v.punkte ? mitte({ typ: 'flaeche', punkte: v.punkte } as Eintrag) : null)
      const doppelt = (!!v.flockmapId && k.eintraege.some((e) => e.id === v.flockmapId)) || (!!pos && k.eintraege.some((e) => e.typ === v.typ && abstandM(mitte(e), pos) < 15 && (norm(e.titel) === norm(v.titel) || norm(e.titel) === norm(v.rohName))))
      return { v, doppelt, an: !aus.has(i) && !(doppelt && doppelteWeg) }
    })
  }, [erg, kml, ausNamen, doppelteWeg, aus, k.eintraege])
  const gewaehlt = zeilen.filter((z) => z.an)
  const ebenen = [...new Set(gewaehlt.filter((z) => z.v.typ === 'pin' && z.v.ebene).map((z) => z.v.ebene.replace(/\s+/g, ' ').trim().slice(0, 40)))]
  const neueEbenen = ebenen.filter((n) => !k.gruppen.some((g) => norm(g.name) === norm(n)))

  const importieren = () => {
    if (!gewaehlt.length) return
    const jetzt = new Date().toISOString()
    const gruppen: Gruppe[] = []
    const gruppeFuer = (ebene: string): string | undefined => {
      if (!ebenenAlsGruppen || !ebene.trim()) return undefined
      const n = ebene.replace(/\s+/g, ' ').trim().slice(0, 40)
      const da = k.gruppen.find((g) => norm(g.name) === norm(n)) ?? gruppen.find((g) => norm(g.name) === norm(n))
      if (da) return da.id
      if (k.gruppen.length + gruppen.length >= 100) return undefined
      // Gruppenfarbe = häufigste Farbe der Nadeln dieser Ebene (wie in My Maps)
      const farben = gewaehlt.filter((z) => z.v.ebene.replace(/\s+/g, ' ').trim().slice(0, 40) === n && z.v.farbe).map((z) => z.v.farbe!)
      const haeufig = farben.sort((a, b) => farben.filter((x) => x === b).length - farben.filter((x) => x === a).length)[0]
      const g: Gruppe = { id: 'g' + neueId(), name: n, ...(haeufig ? { farbe: kml!.naechstePalette(haeufig) } : {}), reihenfolge: [] }
      gruppen.push(g)
      return g.id
    }
    const eintraege: Eintrag[] = gewaehlt.map(({ v }) => {
      const id = v.flockmapId && !k.eintraege.some((e) => e.id === v.flockmapId) && /^[\w-]{1,64}$/.test(v.flockmapId) ? v.flockmapId : neueId()
      const einheiten: Einheit[] = [['schaf', v.schafe], ['bock', v.boecke], ['lamm', v.laemmer]].filter(([, n]) => (n as number) > 0).map(([art, n]) => ({ id: `${id}-${art}`, art: art as Einheit['art'], anzahl: Math.round(n as number) }))
      const notiz = v.notiz.trim()
      const basis = {
        id, titel: v.titel.slice(0, 200), einheiten, farbe: v.farbe ?? (v.typ === 'pin' ? STANDARD_FARBE : FLAECHE_STANDARD), datum: v.datum ?? isoTag(new Date()),
        ...(v.herde ? { herde: v.herde } : {}),
        notizen: notiz ? [{ id: `${id}-imp`, text: `${v.flockmapId ? '' : `Aus ${erg!.format}-Import („${erg!.datei}“${v.ebene ? `, Ebene „${v.ebene}“` : ''}):\n`}${notiz}`.slice(0, 5000), zeitpunkt: jetzt, ...(k.ich ? { autor: k.ich.name, autorId: k.ich.id } : {}) }] : [],
        erstellt: jetzt, geaendert: jetzt,
      }
      return v.typ === 'pin' ? { ...basis, typ: 'pin', position: v.position!, ...(gruppeFuer(v.ebene) ? { gruppe: gruppeFuer(v.ebene) } : {}) } : { ...basis, typ: 'flaeche', punkte: v.punkte! }
    })
    // Reihenfolge in der Gruppe wie in der Datei
    const reihe = (g: Gruppe) => ({ ...g, reihenfolge: eintraege.filter((e) => e.gruppe === g.id).map((e) => e.id) })
    const mitReihe = [...gruppen.map(reihe), ...k.gruppen.map(reihe).filter((g) => g.reihenfolge.length)]
    k.stapel(eintraege, mitReihe)
    p.meldung(`${eintraege.length} Einträge importiert${gruppen.length ? `, ${gruppen.length} neue Gruppen` : ''}${k.karteId ? (navigator.onLine === false ? ' – werden gesendet, sobald Netz da ist' : ' – werden gesendet') : ''}`)
    setErg(null)
    p.onFertig()
  }

  return (
    <div className="export-karte">
      <label className="btn primaer">📥 Datei importieren (My Maps KML/KMZ, GeoJSON, CSV) …<input type="file" accept=".kml,.kmz,.geojson,.json,.csv,.tsv,.txt,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) lesen(f) }} /></label>
      <p className="hinweis klein">Aus Google My Maps: Karte öffnen → ⋮ → „In KML/KMZ exportieren“ → ganze Karte. Ebenen werden zu Gruppen, Namen und Beschreibungen werden übernommen, Tierzahlen wie „50 + 1“ oder „+12 L“ im Namen werden erkannt. Vor dem Speichern siehst du eine Vorschau.</p>
      {fehler && <p className="fehler gefahr">{fehler}</p>}
      {erg && (
        <div className="vorschau-box" role="region" aria-label="Import – Vorschau">
          <p><strong>{erg.datei}</strong> ({erg.format}{erg.titel ? `, „${erg.titel}“` : ''}): {(() => { const n = erg.vorschlaege.filter((v) => v.typ === 'pin').length, f = erg.vorschlaege.length - n; return `${n} ${n === 1 ? 'Nadel' : 'Nadeln'}, ${f} ${f === 1 ? 'Fläche' : 'Flächen'}` })()}{ebenen.length ? ` in ${ebenen.length} ${ebenen.length === 1 ? 'Ebene' : 'Ebenen'}` : ''}.</p>
          {erg.uebersprungen.length > 0 && <p className="hinweis klein">Nicht übernommen: {erg.uebersprungen.slice(0, 5).map((u) => `„${u.name}“ (${u.grund})`).join(', ')}{erg.uebersprungen.length > 5 ? ` und ${erg.uebersprungen.length - 5} weitere` : ''}.</p>}
          <label className="frei klein-option"><input type="checkbox" checked={ebenenAlsGruppen} onChange={(e) => setEbenenAlsGruppen(e.target.checked)} /> Ebenen/Ordner als Gruppen anlegen{neueEbenen.length ? ` (neu: ${neueEbenen.join(', ')})` : ebenen.length ? ' (gibt es schon – werden ergänzt)' : ''}</label>
          <label className="frei klein-option"><input type="checkbox" checked={ausNamen} onChange={(e) => setAusNamen(e.target.checked)} /> Tierzahlen aus den Namen lesen („50 + 1“ = 50 Schafe + 1 Bock, „+12 L“ = 12 Lämmer)</label>
          {zeilen.some((z) => z.doppelt) && <label className="frei klein-option"><input type="checkbox" checked={doppelteWeg} onChange={(e) => setDoppelteWeg(e.target.checked)} /> {zeilen.filter((z) => z.doppelt).length} schon vorhandene überspringen (gleicher Name an gleicher Stelle)</label>}
          <div className="vorschau-tabelle" tabIndex={0}>
            <table>
              <thead><tr><th aria-label="Übernehmen" /><th>Name in FlockMap</th><th>Gruppe</th><th title="Schafe">Sch.</th><th title="Böcke">Bö.</th><th title="Lämmer">Lä.</th></tr></thead>
              <tbody>
                {zeilen.slice(0, 400).map((z, i) => (
                  <tr key={i} className={z.an ? '' : 'aus'}>
                    <td><input type="checkbox" checked={z.an} aria-label={`${z.v.titel || z.v.rohName} übernehmen`} onChange={() => setAus((s) => { const n = new Set(s); if (z.an) n.add(i); else { n.delete(i); if (z.doppelt) setDoppelteWeg(false) } return n })} /></td>
                    <td><span className={z.v.typ === 'pin' ? 'farbpunkt' : 'flaechen-symbol'} style={z.v.typ === 'pin' ? { background: z.v.farbe ?? STANDARD_FARBE } : { color: z.v.farbe ?? FLAECHE_STANDARD }}>{z.v.typ === 'flaeche' ? '⬠' : ''}</span> {z.v.titel || <span className="ohne-name">ohne Namen</span>}
                      {z.v.ausName && z.v.titel !== z.v.rohName && <small className="roh"> ← „{z.v.rohName}“</small>}
                      {z.doppelt && <small className="doppelt"> · schon vorhanden</small>}
                      {z.v.notiz && <small className="roh" title={z.v.notiz}> · 📝</small>}</td>
                    <td>{z.v.typ === 'pin' && ebenenAlsGruppen ? z.v.ebene : ''}</td>
                    <td className="zahl">{z.v.schafe || ''}</td><td className="zahl">{z.v.boecke || ''}</td><td className="zahl">{z.v.laemmer || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {zeilen.length > 400 && <p className="hinweis klein">… und {zeilen.length - 400} weitere</p>}
          </div>
          <p className="hinweis klein">Zusammen: {tierText(gewaehlt.reduce((s, z) => s + z.v.schafe, 0), 'schaf')} · {tierText(gewaehlt.reduce((s, z) => s + z.v.boecke, 0), 'bock')} · {tierText(gewaehlt.reduce((s, z) => s + z.v.laemmer, 0), 'lamm')}. Es wird nur ergänzt – vorhandene Einträge werden nicht verändert.</p>
          <div className="knoepfe">
            <button className="primaer" disabled={!gewaehlt.length} onClick={() => confirm(`${gewaehlt.length} Einträge in „${k.kartenName || 'diese Karte'}“ importieren?`) && importieren()}>✅ {gewaehlt.length} {gewaehlt.length === 1 ? 'Eintrag' : 'Einträge'} importieren</button>
            <button onClick={() => setErg(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  )
}
