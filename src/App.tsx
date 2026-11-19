import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Karte, { HAT_GOOGLE_KEY } from './map/Karte'
import { useKarte, zugangsLink, einladungsLink, NAME_MAX, type Ich, type Nutzer } from './daten'
import { HofPanel, HofEinrichten, ROLLEN } from './Hof'
import { OfflineAbschnitt } from './OfflineAbschnitt'
import { Austausch, type ExportFilter } from './Austausch'
import { RechtLinks } from './recht/Recht'
import { MeineDaten } from './recht/MeineDaten'
import { WeideplanPanel, PlanZeile, type PlanStart } from './weideplan/Weideplan'
import { planFarben as planFarbenAnwenden, faelligAnzahl } from './weideplan/hilfen'
import { STATUS_FARBEN, heute } from '../server/weideplan.js'
import { FlaechenUebersicht, MessText, SteckbriefDetail, SteckbriefFormular, fristenListe, pachtAusForm, pachtFormAus } from './flaechen/Flaechen'
import { nadelHtml } from './map/nadel'
import { SpannungZeile } from './spannung/Spannung'
import { schwelleLesen, schwelleSetzen } from './spannung/schwelle'
import * as SP from '../server/spannung.js'
import { KreisDetail, KreisLeiste, KreisPop, kreisAendern, kreisAnzahl, kreisAusEdit, kreisNachVerschieben, kreisStart, kreisVorgaben, kreisVorgabenSetzen, type KreisEdit } from './kreis/Kreis'
import * as FL from '../server/flaechen.js'
import type { Pacht } from '../server/flaechen.js'
import { InfraDetail, InfraFormular, InfraListe, InfraSymbol, LinienSymbol, useInfraAus, type PruefNeu } from './infra/Infra'
import { geraeteFaellig, istInfra, istLinie, istNormal, laengeText, linienArt, linienLaenge, naechsteStelle, netzAnzahl, pruefungEintragen, zaunUmFlaeche, TOR_BREITE, gesamtLaenge } from '../server/infrastruktur.js'
import { KarteLoeschenAbschnitt, GeloeschtHinweis } from './recht/Loeschen'
import { googleNaviLink, routeBerechnen, routeText } from './route'
import { eintragDatum, tagText, monatText, istAusblendbar, TIERARTEN, tierText, tierSymbolHtml, tierSummen, type Einheit, type Tierart, FARBEN, FLAECHEN_FARBEN, FLAECHE_STANDARD, START, STANDARD_FARBE, datum, farbName, hektar, mitte, neueId, notizenSortiert, pinFarbe, gruppenVorschlag, gruppenFarbe, gruppenOrdnung, naechsteGruppenFarbe, tierKurz, GRUPPEN_FARBEN, type Gruppe, type Eintrag, type Notiz, type Fokus, type LatLng, type Route, type Pin } from './types'

type Modus = 'ansicht' | 'pin' | 'flaeche' | 'linie' | 'punkte' | 'tor' | 'kreis'
type Panel = null | 'liste' | 'einstellungen' | 'nutzer' | 'profil' | 'hof' | 'austausch' | 'meinedaten' | 'weideplan' | 'flaechen'

// Aktuell angemeldeter Nutzer (geteilte Karte) – für Autor neuer Notizen
let aktuellerNutzer: Ich | null = null
const autorFelder = (): { autor?: string; autorId?: string } =>
  aktuellerNutzer ? { autor: aktuellerNutzer.name, autorId: aktuellerNutzer.id } : localStorage.getItem('wt-autor') ? { autor: localStorage.getItem('wt-autor')! } : {}

// Ist eine Farbe hell? (für lesbare Schrift auf der Kopfleiste)
function hell(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16)
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.4
}

// Handy/Touch: Standort als erste Option; Desktop (Maus): freies Antippen + Kartenmitte zuerst
function istHandy() {
  return window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 560
}

// Desktop/PC (≥ 900 px): Werkzeuge (Nadel/Standort/Fläche/Zaun) in der rechten Seitenleiste statt über der Karte
const DESKTOP_MQ = '(min-width: 900px)'
function useDesktop() {
  const [d, setD] = useState(() => !!window.matchMedia?.(DESKTOP_MQ).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(DESKTOP_MQ); if (!mq) return
    const f = () => setD(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f)
  }, [])
  return d
}
// Ziehen aus der Seitenleiste: Vorschaubild = Nadel, Spitze unter dem Mauszeiger (Ablegepunkt = Nadelposition)
const ZIEH_TYP = 'application/x-flockmap'
function ziehStart(ev: React.DragEvent, art: 'pin' | 'flaeche' | 'linie', farbe: string) {
  ev.dataTransfer.setData(ZIEH_TYP, art); ev.dataTransfer.setData('text/plain', `flockmap:${art}`); ev.dataTransfer.effectAllowed = 'copy'
  if (art !== 'pin') return
  const el = document.createElement('div'); el.className = 'zieh-bild'; el.innerHTML = nadelHtml(farbe, true)
  document.body.appendChild(el)
  const b = el.getBoundingClientRect()
  ev.dataTransfer.setDragImage(el, b.width / 2, b.height)
  setTimeout(() => el.remove(), 0)
}

const KOPF_STANDARD = '#1e4d2b'

// Flache Linien-Icons (Farbe = currentColor)
const ICONS: Record<string, string> = {
  liste: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  nutzer: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.25 3.25 0 0 1 0 6.2',
  zahnrad: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  stift: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z',
  x: 'M18 6 6 18M6 6l12 12',
  kalender: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  etikett: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82ZM7 7h.01',
}
function Icon({ name }: { name: string }) {
  return <svg className={`icon icon-${name}`} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name]} /></svg>
}

function standortHolen(): Promise<LatLng> {
  return new Promise((ok, fehler) => {
    if (!navigator.geolocation) return fehler(new Error('Dieses Gerät bzw. dieser Browser kann den Standort nicht bestimmen.'))
    if (!window.isSecureContext) return fehler(new Error('Der Standort ist nur über eine sichere Verbindung (https) verfügbar.'))
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => fehler(new Error(
        err.code === 1 ? 'Kein Zugriff auf deinen Standort. Bitte die Standortfreigabe für diese Seite in den Browser- bzw. Handy-Einstellungen erlauben.'
          : err.code === 3 ? 'Der Standort konnte nicht rechtzeitig bestimmt werden. Bitte noch einmal versuchen (im Freien klappt es besser).'
            : 'Der Standort ist gerade nicht verfügbar (kein GPS-/Ortungssignal). Bitte später erneut versuchen.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    )
  })
}

export default function App() {
  const k = useKarte()
  aktuellerNutzer = k.karteId ? k.ich : null
  // Berechtigungen (der Server prüft zusätzlich): Admin alles, Nutzer nur eigene Einträge/Notizen
  const kannEintrag = (e: Eintrag) => !k.karteId || k.istAdmin || (!!k.ich && e.erstelltVon === k.ich.id)
  const kannGruppe = (g: Gruppe) => !k.karteId || k.istAdmin || (!!k.ich && g.von === k.ich.id)
  const kannNotiz = (n: Notiz) => !k.karteId || k.istAdmin || (!!k.ich && n.autorId === k.ich.id)
  const [modus, setModus] = useState<Modus>('ansicht')
  const [kreisEdit, setKreisEdit] = useState<KreisEdit | null>(null)
  const modusRef = useRef<Modus>('ansicht')
  modusRef.current = modus
  const [zeichenPunkte, setZeichenPunkte] = useState<LatLng[]>([])
  const [ausgewaehlt, setAusgewaehlt] = useState<string | null>(null)
  const [formular, setFormular] = useState<{ e: Eintrag; neu: boolean } | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [exportFilter, setExportFilter] = useState<ExportFilter>(null)
  const [route, setRoute] = useState<Route | null>(null)
  const [routeInfo, setRouteInfo] = useState<string>('')
  const [standort, setStandort] = useState<LatLng | null>(null)
  // Beschriftung (Namen auf der Karte) an/aus – pro Gerät gespeichert
  const [schwelle, setSchwelleRoh] = useState(() => schwelleLesen(k.karteId || 'lokal'))
  const setSchwelle = (n: number) => { schwelleSetzen(k.karteId || 'lokal', n); setSchwelleRoh(n) }
  const desktop = useDesktop()
  const [fabAuf, setFabAuf] = useState(false) // Handy: Speed-Dial offen?
  const [rueckS, setRueckS] = useState(() => { const n = Number(localStorage.getItem('wt-rueckgaengig-s')); return [5, 10, 20].includes(n) ? n : 10 })
  useEffect(() => { localStorage.setItem('wt-rueckgaengig-s', String(rueckS)) }, [rueckS])
  const [beschriftung, setBeschriftung] = useState(() => localStorage.getItem('wt-beschriftung') !== 'aus')
  useEffect(() => { localStorage.setItem('wt-beschriftung', beschriftung ? 'an' : 'aus') }, [beschriftung])
  // Farbe der Kopfleiste (rein optisch, pro Gerät); Textfarbe automatisch hell/dunkel
  const [kopfFarbe, setKopfFarbe] = useState<string | null>(() => localStorage.getItem('wt-kopf-farbe'))
  useEffect(() => {
    if (kopfFarbe) localStorage.setItem('wt-kopf-farbe', kopfFarbe); else localStorage.removeItem('wt-kopf-farbe')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', kopfFarbe || KOPF_STANDARD)
  }, [kopfFarbe])
  // Ausblendbare Tierlisten: eingeklappte Einträge pro Gerät merken
  const [tiereZu, setTiereZu] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('wt-tiere-zu') || '[]') } catch { return [] } })
  useEffect(() => { localStorage.setItem('wt-tiere-zu', JSON.stringify(tiereZu)) }, [tiereZu])
  const tiereUmschalten = (id: string) => setTiereZu((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  // Schnellauswahl: hervorgehobene Nadelfarben (Mehrfachauswahl)
  const [hervorWahl, setHervorWahl] = useState<string[]>([])
  // Gruppen: Nadeln einer Gruppe in Gruppenfarbe (eigene Farbe bleibt gespeichert) mit laufender Nummer 1..n
  const anzeige = useMemo(() => {
    const nummern: Record<string, number> = {}
    const farbeVon = new Map<string, string>()
    for (const g of k.gruppen) {
      const f = gruppenFarbe(g, k.gruppen)
      gruppenOrdnung(g, k.eintraege).forEach((e, i) => { nummern[e.id] = i + 1; farbeVon.set(e.id, f) })
    }
    return { nummern, eintraege: k.eintraege.map((e) => (farbeVon.has(e.id) ? { ...e, farbe: farbeVon.get(e.id) } : e)) }
  }, [k.eintraege, k.gruppen])
  // Häkchen je Gruppe: auf der Karte ein-/ausblenden (pro Gerät)
  const [gruppenAus, setGruppenAus] = useState<string[]>(() => { try { const x = JSON.parse(localStorage.getItem('wt-gruppen-aus') || '[]'); return Array.isArray(x) ? x.filter((v) => typeof v === 'string') : [] } catch { return [] } })
  useEffect(() => { localStorage.setItem('wt-gruppen-aus', JSON.stringify(gruppenAus)) }, [gruppenAus])
  // Zäune & Wasser: Ebene bzw. einzelne Arten ein-/ausblenden (pro Gerät)
  const infraAus = useInfraAus()
  // Eckpunkte bearbeiten (Linie/Fläche) bzw. Tore setzen (Linie)
  const [bearbeiten, setBearbeiten] = useState<{ id: string; punkte: LatLng[]; sel: number | null } | null>(null)
  const [torId, setTorId] = useState<string | null>(null)
  const aufKarte = useMemo(() => anzeige.eintraege.filter((e) => !(e.gruppe && anzeige.nummern[e.id] && gruppenAus.includes(e.gruppe)) && infraAus.sichtbar(e) && !(modus === 'punkte' && e.id === bearbeiten?.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anzeige, gruppenAus, infraAus.aus, modus, bearbeiten?.id])
  const verwendeteFarben = useMemo(() => {
    const anzahl = new Map<string, number>()
    for (const e of anzeige.eintraege) { if (!istNormal(e)) continue; const f = pinFarbe(e); anzahl.set(f, (anzahl.get(f) ?? 0) + 1) }
    // in der Reihenfolge der Vorschlagsfarben, eigene Farben danach
    const rang = (f: string) => { const i = FLAECHEN_FARBEN.findIndex((x) => x.wert === f); return i < 0 ? 99 : i }
    return [...anzahl.entries()].sort((a, b) => rang(a[0]) - rang(b[0])).map(([farbe, n]) => ({ farbe, n }))
  }, [anzeige])
  const hervor = hervorWahl.filter((f) => verwendeteFarben.some((x) => x.farbe === f))
  const hervorUmschalten = (f: string) => setHervorWahl((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]))
  const [fokus, setFokus] = useState<Fokus | null>(null)
  const [meldung, setMeldung] = useState<string>('')
  const [planStart, setPlanStart] = useState<PlanStart>(null)
  const [planFarben, setPlanFarbenRoh] = useState(() => localStorage.getItem('wt-planfarben') === 'an')
  const setPlanFarben = (b: boolean) => { setPlanFarbenRoh(b); localStorage.setItem('wt-planfarben', b ? 'an' : 'aus') }
  // Fällige Geräte-Prüfungen (überfällig, heute, Akku leer) zählen im Weideplan-Abzeichen mit
  const geraeteDran = useMemo(() => geraeteFaellig(k.eintraege).filter((x) => x.stufe !== 'bald'), [k.eintraege])
  // Flächen-Fristen (Antrag, Schnitt, Sperrfrist-Verstoß) und – nur Admins – Pacht-Erinnerungen
  const fristenDran = useMemo(() => FL.fristenDran(fristenListe(k.eintraege, k.istAdmin ? k.pacht : null, k.weideplan)), [k.eintraege, k.pacht, k.istAdmin, k.weideplan])
  const faellig = useMemo(() => faelligAnzahl(k.weideplan), [k.weideplan]) + geraeteDran.length + fristenDran.length
  const planAn = planFarben && !!k.weideplan?.belegungen.length
  // Zuletzt verschobene Nadel (für „Rückgängig“)
  const [verschoben, setVerschoben] = useState<{ id: string; alt: LatLng; nr: number; seit?: number; kreise?: Pick<Pin, 'kreis' | 'kreiseStehen'>; neuerKreis?: boolean } | null>(null)
  const [neuGesetzt, setNeuGesetzt] = useState<{ id: string; n: number } | null>(null)
  useEffect(() => { if (!neuGesetzt) return; const t = setTimeout(() => setNeuGesetzt(null), rueckS * 1000); return () => clearTimeout(t) }, [neuGesetzt, rueckS])
  const [kreisPop, setKreisPop] = useState<{ id: string; stehenId: string | null; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!verschoben) return
    const t = setTimeout(() => setVerschoben(null), rueckS * 1000)
    return () => clearTimeout(t)
  }, [verschoben, rueckS])
  const mitteRef = useRef<LatLng>(START)
  const routeNr = useRef(0)

  const auswahl = useMemo(() => k.eintraege.find((e) => e.id === ausgewaehlt) ?? null, [k.eintraege, ausgewaehlt])

  useEffect(() => {
    if (k.hinweis) { setMeldung(k.hinweis); k.setHinweis('') }
  }, [k.hinweis, k])

  useEffect(() => {
    if (!meldung) return
    const t = setTimeout(() => setMeldung(''), Math.max(3500, meldung.length * 65)) // lange Hinweise (z. B. Konflikte) länger zeigen
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

  const [standortSucht, setStandortSucht] = useState(false)
  const nadelAmStandort = async () => {
    setStandortSucht(true)
    const p = await meinStandort(false)
    setStandortSucht(false)
    // Nur setzen, wenn der Setz-Modus noch aktiv ist (nicht inzwischen abgebrochen oder auf die Karte getippt)
    if (p && modusRef.current === 'pin') { fliege(p, 16); neuerPin(p) }
  }
  // Nadel sofort genau an der angetippten Stelle setzen und speichern (sichtbar, verschiebbar); Name usw. danach über „Benennen“/„Bearbeiten“
  const neuerPin = (p: LatLng) => {
    const jetzt = new Date().toISOString()
    const e: Eintrag = { id: neueId(), typ: 'pin', position: { lat: p.lat, lng: p.lng }, farbe: localStorage.getItem('wt-letzte-farbe') || STANDARD_FARBE, titel: '', notizen: [], einheiten: [], ...(k.ich ? { erstelltVon: k.ich.id } : {}), erstellt: jetzt, geaendert: jetzt }
    k.speichern(e)
    setModus('ansicht')
    setVerschoben(null)
    setAusgewaehlt(e.id)
    setNeuGesetzt({ id: e.id, n: Date.now() })
    setFokus({ ...e.position, n: Date.now(), nurSichtbar: true })
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
    const kr = kreisNachVerschieben(e, neu, k.karteId || 'lokal')
    k.speichern({ ...e, position: neu, ...(kr ?? {}), geaendert: new Date().toISOString() })
    setMeldung('')
    const vorher = { kreis: e.kreis ?? null, kreiseStehen: e.kreiseStehen ?? [] }
    setVerschoben((v) => ({ id, alt: v?.id === id ? v.alt : e.position, nr: (v?.nr ?? 0) + 1, seit: Date.now(), kreise: v?.id === id && v.kreise ? v.kreise : vorher, neuerKreis: !!kr || (v?.id === id && !!v.neuerKreis) }))
  }
  const verschiebenRueckgaengig = () => {
    if (!verschoben) return
    const e = k.eintraege.find((x) => x.id === verschoben.id)
    if (e && e.typ === 'pin') k.speichern({ ...e, position: verschoben.alt, ...(verschoben.kreise ?? {}), geaendert: new Date().toISOString() })
    setVerschoben(null)
  }

  const waehle = (id: string, pos?: LatLng) => {
    if (modus === 'tor') { if (id === torId && pos) torUmschalten(pos); return }
    if ((modus === 'linie' || modus === 'flaeche') && pos) { setZeichenPunkte((l) => [...l, pos]); return } // darf an/in anderen Einträgen ansetzen
    if (modus === 'pin' && pos) { if (!formular) neuerPin(pos); return } // Nadel auf eine Fläche/Linie setzen
    if (modus !== 'ansicht' && modus !== 'pin') return
    setAusgewaehlt(id)
    setPanel(null)
    // Antippen zeigt nur die Details – eine Route gibt es nur über den Knopf „Route anzeigen“
    routeAus()
  }

  const routeAus = () => { routeNr.current++; setRoute(null); setRouteInfo('') }

  const abwaehlen = () => { setAusgewaehlt(null); setRoute(null); setRouteInfo(''); routeNr.current++ }

  // Werkzeuge (Handy: Speed-Dial, Tablet: Knopfstapel, Desktop: rechte Seitenleiste)
  const listeZuHandy = () => { if (panel === 'liste' && !desktop) setPanel(null) }
  const starteNadel = () => { setFabAuf(false); abwaehlen(); listeZuHandy(); setModus('pin') }
  const starteFlaeche = (start?: LatLng) => { setFabAuf(false); abwaehlen(); listeZuHandy(); setZeichenPunkte(start ? [start] : []); setModus('flaeche') }
  const starteZaun = (start?: LatLng) => { setFabAuf(false); abwaehlen(); listeZuHandy(); setZeichenPunkte(start ? [start] : []); if (infraAus.aus.includes('__alle')) infraAus.umschalten('__alle'); setModus('linie') }
  const kartenAblage = (art: string, p: LatLng) => {
    if (!k.darfBearbeiten || formular || modus !== 'ansicht') return
    setKreisPop(null)
    if (art === 'pin') { abwaehlen(); neuerPin(p) } else if (art === 'flaeche') starteFlaeche(p); else if (art === 'linie') starteZaun(p)
  }
  const werkzeugeFrei = modus === 'ansicht' && !formular
  const ziehFarbe = localStorage.getItem('wt-letzte-farbe') || STANDARD_FARBE
  const werkzeuge = (art: 'leiste' | 'kopf') => (
    <div className={art === 'leiste' ? 'wz-gruppe' : 'liste-werkzeuge'} role="toolbar" aria-label="Werkzeuge">
      {k.darfBearbeiten && <button className="wz wz-nadel" disabled={!werkzeugeFrei} draggable={werkzeugeFrei} onDragStart={(ev) => ziehStart(ev, 'pin', ziehFarbe)} onClick={starteNadel} title="Nadel setzen – klicken und dann in die Karte klicken, oder auf die Karte ziehen"><span className="wz-i">＋</span><span>Nadel</span></button>}
      <button className="wz" disabled={!werkzeugeFrei} onClick={() => meinStandort()} title="Mein Standort"><span className="wz-i">📍</span><span>Standort</span></button>
      {k.darfBearbeiten && <button className="wz" disabled={!werkzeugeFrei} draggable={werkzeugeFrei} onDragStart={(ev) => ziehStart(ev, 'flaeche', ziehFarbe)} onClick={() => starteFlaeche()} title="Fläche zeichnen – klicken, oder auf die Karte ziehen (erster Eckpunkt)"><span className="wz-i">⬠</span><span>Fläche</span></button>}
      {k.darfBearbeiten && <button className="wz" disabled={!werkzeugeFrei} draggable={werkzeugeFrei} onDragStart={(ev) => ziehStart(ev, 'linie', ziehFarbe)} onClick={() => starteZaun()} title="Zaun, Weg oder Graben zeichnen – klicken, oder auf die Karte ziehen (erster Punkt)"><span className="wz-i">〰</span><span>Zaun</span></button>}
    </div>
  )

  const kartenKlick = (p: LatLng) => {
    if (kreisPop) { setKreisPop(null); return }
    if (formular) return
    if (modus === 'flaeche' || modus === 'linie') { setZeichenPunkte((l) => [...l, p]); return }
    if (modus === 'punkte') { setBearbeiten((b) => (b ? { ...b, sel: null } : b)); return }
    if (modus === 'kreis') { setKreisEdit((x) => (x ? { ...x, mitte: p, gebunden: false } : x)); return } // Tippen setzt die Mitte fest (bleibt am Standort)
    if (modus === 'tor') { const e = k.eintraege.find((x) => x.id === torId); if (e && istLinie(e)) torUmschalten(p); return }
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

  // Linie (Zaun/Weg/Graben) fertig gezeichnet -> Formular
  const linieFertig = () => {
    if (zeichenPunkte.length < 2) { setMeldung('Bitte mindestens 2 Punkte entlang der Linie antippen.'); return }
    const jetzt = new Date().toISOString()
    const art = (localStorage.getItem('wt-letzte-linienart') as never) || 'elektronetz'
    setFormular({ neu: true, e: { id: neueId(), typ: 'linie', punkte: zeichenPunkte, linienArt: linienArt(art).wert, titel: '', notizen: [], ...(k.ich ? { erstelltVon: k.ich.id } : {}), erstellt: jetzt, geaendert: jetzt } })
    setZeichenPunkte([])
    setModus('ansicht')
  }
  // Eckpunkte bearbeiten
  const punkteStart = (e: Eintrag) => { if (e.typ === 'pin') return; setBearbeiten({ id: e.id, punkte: e.punkte, sel: null }); setModus('punkte') }
  const punkteFertig = () => {
    const e = k.eintraege.find((x) => x.id === bearbeiten?.id)
    if (e && bearbeiten && e.typ !== 'pin') {
      if (bearbeiten.punkte.length < (e.typ === 'flaeche' ? 3 : 2)) { setMeldung(e.typ === 'flaeche' ? 'Eine Fläche braucht mindestens 3 Eckpunkte.' : 'Eine Linie braucht mindestens 2 Punkte.'); return }
      // Tore liegen in Metern ab Anfang – bei geänderter Länge auf die Linie begrenzen
      const neu = { ...e, punkte: bearbeiten.punkte, geaendert: new Date().toISOString() } as Eintrag
      if (neu.typ === 'linie') { if (neu.punkte.length < 3) delete neu.geschlossen; const L2 = gesamtLaenge(neu); if (neu.tore) neu.tore = neu.tore.filter((t) => t.pos < L2) }
      k.speichern(neu)
      setMeldung('Punkte gespeichert')
    }
    setBearbeiten(null); setModus('ansicht')
  }
  // Tor an der angetippten Stelle setzen; Tippen auf ein bestehendes Tor entfernt es
  const torUmschalten = (q: LatLng) => {
    const e = k.eintraege.find((x) => x.id === torId)
    if (!e || !istLinie(e)) return
    const st = naechsteStelle(e, q)
    if (st.abstand > 30) { setMeldung('Bitte direkt auf die Linie tippen.'); return }
    const tore = e.tore ?? []
    const alt = tore.find((t) => Math.abs(t.pos - st.pos) <= Math.max(6, t.breite))
    const neu = alt ? tore.filter((t) => t !== alt) : [...tore, { id: neueId(), pos: Math.round(st.pos * 10) / 10, breite: TOR_BREITE }]
    k.speichern({ ...e, tore: neu.length ? neu : undefined, geaendert: new Date().toISOString() })
    setMeldung(alt ? 'Tor entfernt' : `Tor gesetzt (${TOR_BREITE} m Lücke)`)
  }
  const zaunUm = (f: Eintrag) => {
    if (f.typ !== 'flaeche') return
    const z = zaunUmFlaeche({ id: f.id, titel: f.titel, punkte: f.punkte }, 'elektronetz', neueId(), new Date().toISOString())
    setFormular({ neu: true, e: { ...z, ...(k.ich ? { erstelltVon: k.ich.id } : {}) } })
  }

  const speichern = (e: Eintrag, basis?: Einheit[]) => {
    const fertig = { ...e, titel: e.titel.trim(), geaendert: new Date().toISOString() }
    if (fertig.typ === 'linie') localStorage.setItem('wt-letzte-linienart', fertig.linienArt)
    if (fertig.farbe && istNormal(fertig)) localStorage.setItem(fertig.typ === 'pin' ? 'wt-letzte-farbe' : 'wt-letzte-flaechenfarbe', fertig.farbe)
    k.speichern(fertig, basis)
    setFormular(null)
    setAusgewaehlt(fertig.id)
    setMeldung('Gespeichert')
  }

  const loeschen = (e: Eintrag) => {
    if (!confirm(e.titel ? `„${e.titel}“ wirklich löschen?` : `Diese ${istInfra(e) ? 'Markierung' : e.typ === 'pin' ? 'Nadel' : e.typ === 'linie' ? 'Linie' : 'Fläche'} ohne Namen wirklich löschen?`)) return
    k.loeschen(e.id)
    abwaehlen()
    setFormular(null)
  }

  // ---- Eigene Gruppen ----
  // Neue Gruppe mit Namensfeld (Vorschlag „Gruppe N“); null = abgebrochen
  const neueGruppe = (): Gruppe | null => {
    const name = prompt('Name der neuen Gruppe:', gruppenVorschlag(k.gruppen))?.replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!name) return null
    const g: Gruppe = { id: neueId(), name, farbe: naechsteGruppenFarbe(k.gruppen), reihenfolge: [], ...(k.ich ? { von: k.ich.id } : {}), erstellt: new Date().toISOString() }
    k.gruppeSpeichern(g)
    return g
  }
  // Nadeln in eine Gruppe (oder ohne Gruppe): Nutzer nur eigene, Admin alle – fremde werden übersprungen und genannt
  const inGruppe = (g: Gruppe | null, liste: Eintrag[]) => {
    const pins = liste.filter((e) => e.typ === 'pin')
    const ok = pins.filter(kannEintrag)
    const fremd = pins.length - ok.length
    if (ok.length) k.zuordnen(g?.id ?? null, ok.map((e) => e.id))
    const n = (x: number) => `${x} ${x === 1 ? 'Nadel' : 'Nadeln'}`
    setMeldung(`${ok.length ? (g ? `${n(ok.length)} in „${g.name}“` : `${n(ok.length)} ohne Gruppe`) : 'Keine Nadel verschoben'}${fremd ? ` · ${n(fremd)} anderer Nutzer übersprungen (nur eigene oder als Admin)` : ''}`)
  }

  // ---- Neue App-Version erkennen (z. B. Handy-App lange im Hintergrund) ----
  const [neueVersion, setNeueVersion] = useState(false)
  const formularRef = useRef(formular)
  formularRef.current = formular
  useEffect(() => {
    const eigenes = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src.split('/assets/')[1]
    if (!eigenes) return // Entwicklung
    let aus = false
    const pruefen = async (zurueck = false) => {
      try {
        navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {})
        const html = await (await fetch('/', { cache: 'no-store' })).text()
        const neu = /\/assets\/(index-[\w-]+\.js)/.exec(html)?.[1]
        if (aus || !neu || neu === eigenes) return
        // Beim Zurückkehren in die App ohne offenes Formular gleich neu laden, sonst Hinweis mit Knopf
        if (zurueck && !formularRef.current) location.reload()
        else setNeueVersion(true)
      } catch { /* offline */ }
    }
    const sichtbar = () => { if (document.visibilityState === 'visible') pruefen(true) }
    document.addEventListener('visibilitychange', sichtbar)
    const t = setInterval(() => pruefen(), 10 * 60 * 1000)
    const t0 = setTimeout(() => pruefen(), 20000)
    return () => { aus = true; document.removeEventListener('visibilitychange', sichtbar); clearInterval(t); clearTimeout(t0) }
  }, [])

  // Status: offline / X Änderungen warten / synchronisiert
  const aend = (n: number) => `${n} ${n === 1 ? 'Änderung wartet' : 'Änderungen warten'}`
  const statusText = k.status === 'lokal' ? 'Nur auf diesem Gerät'
    : k.geloescht ? 'Im Papierkorb (gelöscht)'
    : k.status === 'offline' ? (k.wartend ? `Offline · ${aend(k.wartend)}` : 'Offline · alles gespeichert')
    : k.wartend ? `Sende ${aend(k.wartend).replace(' wartet', '').replace(' warten', '')} …`
    : k.status === 'verbinde' ? 'Verbinde …' : 'Live · synchronisiert'

  return (
    <div className={`app${panel === 'liste' ? ' liste-offen' : ''}${desktop ? ' desktop-leiste' : ''}`}>
      <header className={`kopf${kopfFarbe && hell(kopfFarbe) ? ' kopf-hell' : ''}`} style={kopfFarbe ? { background: kopfFarbe, color: hell(kopfFarbe) ? '#1d2a1d' : '#f4ecd8' } : undefined}>
        <img className="marke" src="/icon.svg" alt="" width="36" height="36" />
        <div className="kopf-text">
          <div className="kopf-zeile">
            {k.kartenName && <span className="marke-wort" aria-hidden="true">FlockMap</span>}
            <h1 className="kopf-titel" title={k.kartenName || 'FlockMap'}>{k.kartenName || 'FlockMap'}</h1>
          </div>
          <small className={`status ${k.status}${k.wartend ? ' wartend' : ''}`} role="status" aria-live="polite"><span className="status-punkt" aria-hidden="true" />{statusText}{k.karteId && k.ich && <> · <button className="name-knopf" title="Meinen Namen ändern" onClick={() => setPanel(panel === 'profil' ? null : 'profil')}>{k.ich.name}{k.hof?.rolle ? ` (${ROLLEN[k.hof.rolle].name})` : k.ich.rolle === 'admin' ? ' (Admin)' : ''} <Icon name="stift" /></button></>}{!k.darfBearbeiten && !(k.ich?.rolle === 'ansehen') && ' · nur ansehen'}</small>
        </div>
        <nav>
          <button className="kopf-knopf mit-text" aria-pressed={panel === 'liste'} title="Liste" aria-label="Liste" onClick={() => setPanel(panel === 'liste' ? null : 'liste')}><Icon name="liste" /><span>Liste</span></button>
          <button className="kopf-knopf wp-kopf" aria-pressed={panel === 'weideplan'} title={faellig ? `Weideplan – ${faellig} fällig` : 'Weideplan'} aria-label={faellig ? `Weideplan, ${faellig} fällig` : 'Weideplan'} onClick={() => { setPlanStart(null); setPanel(panel === 'weideplan' ? null : 'weideplan') }}><Icon name="kalender" />{faellig > 0 && <span className="wp-badge" aria-hidden="true">{faellig}</span>}</button>
          {k.karteId && k.hof?.rolle && <button className="kopf-knopf" aria-pressed={panel === 'hof'} title="Mein Hof" aria-label="Mein Hof" onClick={() => setPanel(panel === 'hof' ? null : 'hof')}><Icon name="nutzer" /></button>}
          {k.karteId && !k.hof && k.istAdmin && <button className="kopf-knopf" aria-pressed={panel === 'nutzer'} title="Nutzer verwalten" aria-label="Nutzer verwalten" onClick={() => setPanel(panel === 'nutzer' ? null : 'nutzer')}><Icon name="nutzer" /></button>}
          <button className="kopf-knopf" aria-pressed={panel === 'einstellungen'} title="Einstellungen" aria-label="Einstellungen" onClick={() => setPanel(panel === 'einstellungen' ? null : 'einstellungen')}><Icon name="zahnrad" /></button>
        </nav>
      </header>

      <main className="haupt">
        <Karte
          eintraege={planAn ? planFarbenAnwenden(aufKarte, k.weideplan) : aufKarte}
          nummern={anzeige.nummern}
          ausgewaehlt={ausgewaehlt}
          zeichenPunkte={zeichenPunkte}
          zeichenLinie={modus === 'linie'}
          bearbeiten={modus === 'punkte' && bearbeiten ? { punkte: bearbeiten.punkte, sel: bearbeiten.sel, linie: k.eintraege.find((x) => x.id === bearbeiten.id)?.typ === 'linie', geschlossen: !!(k.eintraege.find((x) => x.id === bearbeiten.id) as { geschlossen?: boolean } | undefined)?.geschlossen } : null}
          onPunktZiehen={(i, q) => setBearbeiten((b) => (b ? { ...b, punkte: b.punkte.map((x, j) => (j === i ? q : x)), sel: i } : b))}
          onPunktWahl={(i) => setBearbeiten((b) => (b ? { ...b, sel: i } : b))}
          onPunktEinfuegen={(i, q) => setBearbeiten((b) => (b ? { ...b, punkte: [...b.punkte.slice(0, i), q, ...b.punkte.slice(i)], sel: i } : b))}
          kreisBearbeiten={modus === 'kreis' && kreisEdit ? (() => { const pe = k.eintraege.find((x) => x.id === kreisEdit.id); return { id: kreisEdit.id, mitte: kreisEdit.gebunden && pe?.typ === 'pin' ? pe.position : kreisEdit.mitte, radius: kreisEdit.radius, farbe: kreisEdit.farbe } })() : null}
          onKreisKlick={modus === 'ansicht' && !formular ? (id, sid, x, y) => { setAusgewaehlt(id); const e = k.eintraege.find((q) => q.id === id); if (e && k.darfBearbeiten && kannEintrag(e)) setKreisPop({ id, stehenId: sid, x, y }) } : undefined}
          onLangDruck={modus === 'ansicht' && !formular ? (q, x, y) => {
            // innerster eigener Kreis unter dem Finger → Farbpalette
            let best: { id: string; sid: string | null; r: number } | null = null
            for (const e of k.eintraege) {
              if (e.typ !== 'pin' || !k.darfBearbeiten || !kannEintrag(e)) continue
              for (const ak of FL.alleKreise(e)) if (FL.abstand(ak.mitte, q) <= ak.kreis.radius && (!best || ak.kreis.radius < best.r)) best = { id: e.id, sid: ak.stehenId, r: ak.kreis.radius }
            }
            if (best) { setAusgewaehlt(best.id); setKreisPop({ id: best.id, stehenId: best.sid, x, y }) }
          } : undefined}
          onKreisRadius={(r) => setKreisEdit((x) => (x ? { ...x, radius: Math.min(FL.KREIS_MAX, r) } : x))}
          spannungSchwelle={schwelle}
          warnIds={geraeteDran.map((x) => x.eintrag.id)}
          route={route}
          standort={standort}
          fokus={fokus}
          beschriftung={beschriftung}
          tiereZu={tiereZu}
          onTiereUmschalten={tiereUmschalten}
          hervor={hervor}
          verschiebbar={modus === 'ansicht' && !formular ? k.eintraege.filter((e) => e.typ === 'pin' && k.darfBearbeiten && kannEintrag(e)).map((e) => e.id) : []}
          onVerschieben={nadelVerschieben}
          onKlick={kartenKlick}
          onAblegen={kartenAblage}
          onAuswahl={waehle}
          onMitte={(p) => (mitteRef.current = p)}
        />


        {/* Kartenwerkzeuge oben links: Beschriftung an/aus + Farb-Schnellauswahl */}
        <div className="karten-werkzeug">
          <button className={`werkzeug-knopf${beschriftung ? ' an' : ''}`} aria-pressed={beschriftung} title={beschriftung ? 'Beschriftung ausblenden' : 'Beschriftung einblenden'} onClick={() => setBeschriftung((b) => !b)}>
            <Icon name="etikett" /><small>{beschriftung ? 'an' : 'aus'}</small>
          </button>
          {k.eintraege.some((e) => !istNormal(e)) && (
            <button className={`werkzeug-knopf${!infraAus.aus.includes('__alle') ? ' an' : ''}`} aria-pressed={!infraAus.aus.includes('__alle')} title={infraAus.aus.includes('__alle') ? 'Zäune & Wasser einblenden' : 'Zäune & Wasser ausblenden'} aria-label="Zäune und Wasser auf der Karte" onClick={() => infraAus.umschalten('__alle')}>
              <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 5v15M12 5v15M20 5v15M4 9h16M4 15h16" /></svg><small>{infraAus.aus.includes('__alle') ? 'aus' : 'Zaun'}</small>
            </button>
          )}
          {verwendeteFarben.length > 0 && (
            <div className="farb-chips" role="group" aria-label="Nadeln und Flächen einer Farbe hervorheben">
              {verwendeteFarben.map(({ farbe, n }) => (
                <button key={farbe} className={`farb-chip${hervor.includes(farbe) ? ' aktiv' : ''}`} style={{ background: farbe }} aria-pressed={hervor.includes(farbe)}
                  title={`${farbName(farbe)} (${n}) ${hervor.includes(farbe) ? '– Hervorhebung aufheben' : 'hervorheben'}`} aria-label={`${farbName(farbe)} hervorheben`} onClick={() => hervorUmschalten(farbe)} />
              ))}
            </div>
          )}
          {planAn && (
            <div className="wp-karten-legende" role="note" aria-label="Weideplan-Farben">
              {(['belegt', 'ruht', 'bereit', 'frei'] as const).map((st) => <span key={st}><i style={{ background: STATUS_FARBEN[st] }} />{st === 'frei' ? 'k. A.' : st}</span>)}
              <button className="link-knopf" onClick={() => setPlanFarben(false)}>aus</button>
            </div>
          )}
        </div>

        {/* Handy (≤ 600 px): ein runder ＋-Knopf klappt Nadel/Standort/Fläche/Zaun als Menü auf (Speed-Dial); Desktop unverändert */}
        {!desktop && modus === 'ansicht' && !formular && fabAuf && k.darfBearbeiten && <div className="fab-schleier" aria-hidden="true" onClick={(x) => { x.stopPropagation(); setFabAuf(false) }} />}
        {!desktop && modus === 'ansicht' && !formular && (
          <div className={`fab-leiste${k.darfBearbeiten ? ' mit-menue' : ''}${fabAuf ? ' auf' : ''}`}>
            <button className="fab" title="Mein Standort" onClick={() => { setFabAuf(false); meinStandort() }}>📍<span>Standort</span></button>
            {k.darfBearbeiten && (
              <>
                <button className="fab" onClick={() => starteFlaeche()}>⬠<span>Fläche</span></button>
                <button className="fab" title="Zaun, Weg oder Graben zeichnen" onClick={() => starteZaun()}>〰<span>Zaun</span></button>
                <button className="fab haupt-fab" onClick={starteNadel}>＋<span>Nadel</span></button>
                <button className="fab fab-schalter" aria-expanded={fabAuf} aria-label={fabAuf ? 'Menü schließen' : 'Hinzufügen: Nadel, Standort, Fläche, Zaun'} onClick={() => setFabAuf(!fabAuf)}><span className="fab-plus" aria-hidden="true">＋</span></button>
              </>
            )}
          </div>
        )}
        {desktop && panel !== 'liste' && (
          <aside className="werkzeug-leiste" aria-label="Seitenleiste (eingeklappt)">
            <button className="wz wz-auf" onClick={() => setPanel('liste')} title="Seitenleiste mit Liste aufklappen" aria-label="Seitenleiste aufklappen"><span className="wz-i">«</span><span>Liste</span></button>
            {werkzeuge('leiste')}
          </aside>
        )}

        {modus === 'pin' && (() => {
          const handy = istHandy()
          const standortKnopf = <button key="s" disabled={standortSucht} onClick={nadelAmStandort}>{standortSucht ? 'Standort wird bestimmt …' : '📍 An meinem Standort'}</button>
          return (
            <div className={`leiste setz-leiste${handy ? ' handy' : ' desktop'}`} role="dialog" aria-label="Nadel setzen">
              <p className="setz-hinweis">👆 <strong>{handy ? 'Tippe' : 'Klicke'} auf die Karte – die Nadel erscheint genau dort</strong>{handy ? '' : ' (Karte lässt sich weiter verschieben)'}. Oder:</p>
              <div className="knoepfe">
                {standortKnopf}
                <button onClick={() => setModus('ansicht')}>Abbrechen</button>
              </div>
            </div>
          )
        })()}

        {modus === 'flaeche' && (
          <div className="leiste">
            <p>Tippe die Eckpunkte der Fläche an ({zeichenPunkte.length} gesetzt){zeichenPunkte.length >= 3 && <> · <MessText punkte={zeichenPunkte} /></>}</p>
            <div className="knoepfe">
              <button className="primaer" onClick={flaecheFertig}>Fertig</button>
              <button onClick={() => setZeichenPunkte((l) => l.slice(0, -1))} disabled={!zeichenPunkte.length}>Rückgängig</button>
              <button onClick={() => { setZeichenPunkte([]); setModus('ansicht') }}>Abbrechen</button>
            </div>
          </div>
        )}

        {modus === 'linie' && (() => {
          const m = zeichenPunkte.length >= 2 ? linienLaenge({ punkte: zeichenPunkte }) : 0
          return (
            <div className="leiste">
              <p>Tippe die Punkte entlang des Zauns, Wegs oder Grabens an ({zeichenPunkte.length} gesetzt{m ? <> · <strong>{laengeText(m)}</strong> · ≈ {netzAnzahl(m)} {netzAnzahl(m) === 1 ? 'Netz' : 'Netze'} à 50 m</> : ''}).</p>
              <div className="knoepfe">
                <button className="primaer" onClick={linieFertig}>Fertig</button>
                <button onClick={() => setZeichenPunkte((l) => l.slice(0, -1))} disabled={!zeichenPunkte.length}>Rückgängig</button>
                <button onClick={() => { setZeichenPunkte([]); setModus('ansicht') }}>Abbrechen</button>
              </div>
            </div>
          )
        })()}

        {modus === 'punkte' && bearbeiten && (() => {
          const e = k.eintraege.find((x) => x.id === bearbeiten.id)
          const m = e?.typ === 'linie' ? linienLaenge({ ...e, punkte: bearbeiten.punkte }) : 0
          return (
            <div className="leiste">
              <p><strong>Punkte ziehen</strong> zum Verschieben · <strong>＋</strong> fügt einen Punkt ein · Punkt antippen und „Punkt löschen“{e?.typ === 'linie' ? <> · {laengeText(m)}</> : e?.typ === 'flaeche' ? <> · <MessText punkte={bearbeiten.punkte} /></> : ''}</p>
              <div className="knoepfe">
                <button className="primaer" onClick={punkteFertig}>Fertig</button>
                <button disabled={bearbeiten.sel == null} onClick={() => setBearbeiten((b) => (b && b.sel != null ? { ...b, punkte: b.punkte.filter((_, j) => j !== b.sel), sel: null } : b))}>Punkt löschen</button>
                <button onClick={() => { setBearbeiten(null); setModus('ansicht') }}>Abbrechen</button>
              </div>
            </div>
          )
        })()}

        {modus === 'kreis' && kreisEdit && (() => {
          const pe = k.eintraege.find((x) => x.id === kreisEdit.id)
          if (!pe || pe.typ !== 'pin') return null
          const kid = k.karteId || 'lokal'
          const andere = k.eintraege.filter((x) => x.typ === 'pin' && x.kreis && x.id !== pe.id && kannEintrag(x) && x.kreis.radius !== Math.round(kreisEdit.radius))
          return <KreisLeiste k={kreisEdit} name={pe.titel} set={setKreisEdit} standard={kreisVorgaben(kid).radius} andere={andere.length}
            onSpeichern={(gebunden) => {
              const ke = { ...kreisEdit, gebunden }
              const kr = kreisAusEdit(ke, pe)
              if (kr) {
                k.speichern({ ...pe, kreis: kr, geaendert: new Date().toISOString() })
                kreisVorgabenSetzen(kid, { gebunden, ...(kr.farbe ? { farbe: kr.farbe } : {}), ...(ke.alsStandard ? { radius: kr.radius } : {}) })
                setMeldung(`${ke.neu ? 'Eingekreist ◯' : 'Kreis gespeichert'} · ${kr.radius} m · ${gebunden ? 'an Nadel gebunden' : 'bleibt am Standort'}`)
              }
              setKreisEdit(null); setModus('ansicht'); setAusgewaehlt(pe.id)
            }}
            onAlle={() => {
              const r = Math.max(FL.KREIS_MIN, Math.round(kreisEdit.radius))
              if (!window.confirm(`Radius ${r} m auf ${andere.length === 1 ? 'den anderen Kreis' : `alle ${andere.length} anderen Kreise`} übernehmen?`)) return
              const jetzt = new Date().toISOString()
              andere.forEach((x) => { if (x.typ !== 'pin' || !x.kreis) return; const kr = FL.kreisSauber({ ...x.kreis, radius: r }, x.position); if (kr) k.speichern({ ...x, kreis: kr, geaendert: jetzt }) })
              kreisVorgabenSetzen(kid, { radius: r })
              setKreisEdit({ ...kreisEdit, radius: r, alsStandard: true })
              setMeldung(`Radius ${r} m für ${andere.length} ${andere.length === 1 ? 'Kreis' : 'Kreise'} übernommen – auch Standard für neue`)
            }}
            onAbbrechen={() => { setKreisEdit(null); setModus('ansicht'); setAusgewaehlt(pe.id) }} />
        })()}

        {modus === 'tor' && (() => {
          const e = k.eintraege.find((x) => x.id === torId)
          const n = e && istLinie(e) ? e.tore?.length ?? 0 : 0
          return (
            <div className="leiste">
              <p>🚪 <strong>Tippe auf die Linie</strong>, wo ein Tor bzw. Durchgang ist ({TOR_BREITE} m Lücke, wird von der Länge abgezogen). Tippen auf ein Tor entfernt es. {n} {n === 1 ? 'Tor' : 'Tore'}{e && istLinie(e) ? <> · {laengeText(linienLaenge(e))}</> : ''}</p>
              <div className="knoepfe"><button className="primaer" onClick={() => { setTorId(null); setModus('ansicht') }}>Fertig</button></div>
            </div>
          )
        })()}

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
            tiereZu={tiereZu.includes(auswahl.id)}
            onTiereUmschalten={() => tiereUmschalten(auswahl.id)}
            gruppen={k.gruppen}
            nummer={anzeige.nummern[auswahl.id]}
            kannGruppieren={k.darfBearbeiten && kannEintrag(auswahl)}
            onGruppe={(v) => { const g = v === '__neu' ? neueGruppe() : v ? k.gruppen.find((x) => x.id === v) ?? null : null; if (v === '__neu' && !g) return; inGruppe(g, [auswahl]) }}
            planZeile={<>
              {istNormal(auswahl) && <PlanZeile k={k} e={auswahl} onOeffnen={(s) => { setPlanStart(s); setPanel('weideplan') }} />}
              <InfraDetail e={auswahl} alle={k.eintraege} darfBearbeiten={k.darfBearbeiten} kannBearbeiten={k.darfBearbeiten && kannEintrag(auswahl)}
                onGeprueft={(x) => { k.geprueft(auswahl.id, x); setMeldung('Prüfung eingetragen ✓') }}
                onPunkte={() => punkteStart(auswahl)} onTore={() => { setTorId(auswahl.id); setModus('tor') }} onZaun={() => zaunUm(auswahl)}
                onWahl={(id) => { const e = k.eintraege.find((x) => x.id === id); if (e) { fliege(mitte(e)); waehle(id) } }} />
              {auswahl.typ === 'pin' && !auswahl.infra && <SpannungZeile e={auswahl} darf={k.darfBearbeiten} schwelle={schwelle} onMessen={(kv) => { k.spannungMessen(auswahl.id, kv); setMeldung(`⚡ ${SP.kvText(kv)} gespeichert${kv < schwelle ? ' – unter der Warnschwelle!' : ''}`) }} />}
              {auswahl.typ === 'pin' && <KreisDetail e={auswahl} karte={k.karteId || 'lokal'} darf={k.darfBearbeiten && kannEintrag(auswahl)}
                onEinkreisen={() => { const ke = kreisStart(auswahl, k.karteId || 'lokal'); setKreisEdit(ke); setModus('kreis'); setFokus({ ...(auswahl.kreis && auswahl.kreis.gebunden === false ? auswahl.kreis.mitte : auswahl.position), n: Date.now(), nurSichtbar: true }) }}
                onAbgebaut={(sid) => { k.speichern({ ...auswahl, ...kreisAendern(auswahl, sid ?? null, () => null), geaendert: new Date().toISOString() }); setMeldung('Kreis entfernt – abgebaut ✂️') }} />}
              {auswahl.typ === 'flaeche' && <SteckbriefDetail e={auswahl} pacht={k.pacht[auswahl.id]} istAdmin={k.istAdmin} darfBearbeiten={k.darfBearbeiten} onErledigt={(fid, d) => { k.fristErledigt(auswahl.id, fid, d); setMeldung(d ? 'Frist erledigt ✓' : 'Wieder offen') }} />}
              {auswahl.typ === 'flaeche' && k.darfBearbeiten && kannEintrag(auswahl) && <button className="link-knopf punkte-link" onClick={() => punkteStart(auswahl)}>✏️ Eckpunkte bearbeiten</button>}
            </>}
          />
        )}

        {formular && <Formular gruppeName={k.gruppen.find((g) => g.id === formular.e.gruppe)?.name} start={formular.e} neu={formular.neu} istAdmin={k.istAdmin} pacht={k.pacht[formular.e.id]} onPacht={(p) => k.pachtSpeichern(formular.e.id, p)} onSpeichern={speichern} onAbbrechen={() => setFormular(null)} onLoeschen={formular.neu || !kannEintrag(formular.e) ? undefined : () => loeschen(formular.e)} />}

        {panel === 'liste' && (
          <Liste werkzeuge={desktop ? werkzeuge('kopf') : undefined} schwelle={schwelle} eintraege={anzeige.eintraege} gruppen={k.gruppen} nummern={anzeige.nummern} gruppenAus={gruppenAus}
            onSichtbar={(gid) => setGruppenAus((l) => (l.includes(gid) ? l.filter((x) => x !== gid) : [...l, gid]))} onReihenfolge={k.reihenfolge} onSchliessen={() => setPanel(null)} onWahl={(e) => { fliege(mitte(e), e.typ === 'pin' ? 15 : undefined); waehle(e.id) }}
            darfBearbeiten={k.darfBearbeiten} kannEintrag={kannEintrag} kannGruppe={kannGruppe} ichId={k.ich?.id}
            onGruppeSpeichern={k.gruppeSpeichern} onGruppeLoeschen={k.gruppeLoeschen} onInGruppe={inGruppe} neueGruppe={neueGruppe}
            onExport={(f) => { setExportFilter(f); setPanel('austausch') }} onUebersicht={() => setPanel('flaechen')}
            infraAus={infraAus.aus} onInfraUmschalten={infraAus.umschalten} onGeprueft={(id) => { k.geprueft(id, { datum: heute() }); setMeldung('Prüfung eingetragen ✓') }} />
        )}
        {panel === 'flaechen' && (
          <section className="panel flaechen-panel">
            <div className="sheet-kopf"><h2>⬠ Flächen-Übersicht</h2><button className="x" onClick={() => setPanel(null)} aria-label="Schließen"><Icon name="x" /></button></div>
            <FlaechenUebersicht eintraege={k.eintraege} pacht={k.pacht} istAdmin={k.istAdmin} onWahl={(e) => { fliege(mitte(e)); waehle(e.id) }} onExport={async (art) => {
              const pacht = k.istAdmin && Object.keys(k.pacht).length ? k.pacht : null
              const { dateiName, herunterladen } = await import('./austausch/zeilen')
              const name = k.kartenName || 'FlockMap'
              try {
                if (art === 'xlsx') {
                  const [{ xlsxErzeugen }, { flaechenBlaetter }] = await Promise.all([import('./austausch/xlsx'), import('./austausch/flaechenliste')])
                  herunterladen(new Blob([xlsxErzeugen(flaechenBlaetter(k.eintraege, pacht)) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), dateiName(`${name}-Flaechenverzeichnis`, 'xlsx'))
                } else {
                  const { flaechenverzeichnisPdf } = await import('./austausch/pdf')
                  herunterladen(await flaechenverzeichnisPdf({ karte: name, hof: k.hof?.name, autor: k.ich?.name, eintraege: k.eintraege, pacht }), dateiName(`${name}-Flaechenverzeichnis`, 'pdf'))
                }
                setMeldung(`Flächenverzeichnis erstellt${pacht ? ' (mit Pachtdaten – vertraulich)' : ''}`)
              } catch (x) { setMeldung(`Export fehlgeschlagen: ${(x as Error).message}`) }
            }} />
          </section>
        )}
        {panel === 'austausch' && <Austausch k={k} eintraege={anzeige.eintraege} filter={exportFilter} meldung={setMeldung} onSchliessen={() => setPanel(null)} />}
        {panel === 'einstellungen' && <Einstellungen k={k} onMeineDaten={() => setPanel('meinedaten')} onAustausch={() => { setExportFilter(null); setPanel('austausch') }} onSchliessen={() => setPanel(null)} meldung={setMeldung} onNutzer={() => setPanel(k.hof?.rolle ? 'hof' : 'nutzer')} onHof={() => setPanel('hof')} onProfil={() => setPanel('profil')} kopfFarbe={kopfFarbe} setKopfFarbe={setKopfFarbe} rueckS={rueckS} setRueckS={setRueckS} schwelle={schwelle} setSchwelle={setSchwelle} />}
        {panel === 'weideplan' && <WeideplanPanel k={k} start={planStart} meldung={setMeldung} planFarben={planFarben} setPlanFarben={setPlanFarben} onSchliessen={() => { setPanel(null); setPlanStart(null) }}
          onZeigen={(id) => { const e = k.eintraege.find((x) => x.id === id); if (e) { fliege(mitte(e), e.typ === 'pin' ? 15 : undefined); waehle(e.id) } }} />}
        {panel === 'meinedaten' && <MeineDaten k={k} meldung={setMeldung} onSchliessen={() => setPanel(null)} />}
        {k.geloescht && panel !== 'austausch' && <GeloeschtHinweis k={k} meldung={setMeldung} onExport={() => { setExportFilter(null); setPanel('austausch') }} />}
        {k.einladung && !k.ich && k.status !== 'verbinde' && <Beitreten k={k} />}
        {panel === 'profil' && k.ich && <Profil k={k} onSchliessen={() => setPanel(null)} meldung={setMeldung} />}
        {panel === 'hof' && k.hof && <HofPanel k={k} onSchliessen={() => setPanel(null)} meldung={setMeldung} />}
        {panel === 'nutzer' && k.istAdmin && k.karteId && <NutzerVerwaltung k={k} onSchliessen={() => setPanel(null)} meldung={setMeldung} />}

        {neueVersion && (
          <div className="update-hinweis" role="status">Neue Version von FlockMap verfügbar<button className="primaer" onClick={() => location.reload()}>Jetzt neu laden</button><button className="x" aria-label="Später" onClick={() => setNeueVersion(false)}><Icon name="x" /></button></div>
        )}
        {meldung && <div className="toast">{meldung}</div>}
        {kreisPop && modus === 'ansicht' && (() => {
          const pe = k.eintraege.find((x) => x.id === kreisPop.id)
          if (!pe || pe.typ !== 'pin') return null
          const kr = kreisPop.stehenId == null ? pe.kreis : pe.kreiseStehen?.find((x) => x.id === kreisPop.stehenId)
          if (!kr) return null
          const zu = () => setKreisPop(null)
          return <KreisPop x={kreisPop.x} y={kreisPop.y} titel={`${pe.titel || 'Nadel'}${kreisPop.stehenId ? ' · alter Standort' : ''} · ${kr.radius} m`} farbe={kr.farbe || pinFarbe(pe)} onZu={zu}
            onFarbe={(f) => { k.speichern({ ...pe, ...kreisAendern(pe, kreisPop.stehenId, (x) => ({ ...x, farbe: f })), geaendert: new Date().toISOString() }); kreisVorgabenSetzen(k.karteId || 'lokal', { farbe: f }); setMeldung(`Kreisfarbe: ${farbName(f)}`); zu() }}
            onAendern={kreisPop.stehenId == null ? () => { zu(); setKreisEdit(kreisStart(pe, k.karteId || 'lokal')); setModus('kreis') } : undefined}
            onAbgebaut={() => { k.speichern({ ...pe, ...kreisAendern(pe, kreisPop.stehenId, () => null), geaendert: new Date().toISOString() }); setMeldung('Kreis entfernt – abgebaut ✂️'); zu() }} />
        })()}
        {!meldung && !verschoben && neuGesetzt && k.eintraege.some((x) => x.id === neuGesetzt.id) && (
          <div className="toast mit-knopf" role="status">📍 Nadel gesetzt
            <button onClick={() => { const e = k.eintraege.find((x) => x.id === neuGesetzt.id); if (e) setFormular({ neu: false, e }); setNeuGesetzt(null) }}>Benennen</button>
            <button onClick={() => { k.loeschen(neuGesetzt.id); if (ausgewaehlt === neuGesetzt.id) abwaehlen(); setNeuGesetzt(null) }}>Rückgängig <Rest bis={neuGesetzt.n + rueckS * 1000} /></button>
          </div>
        )}
        {!meldung && verschoben && (
          <div className={`toast mit-knopf${verschoben.neuerKreis ? ' lang' : ''}`} role="status">{verschoben.neuerKreis ? 'Nadel verschoben · alter Kreis bleibt stehen, neuer Kreis gesetzt' : 'Nadel verschoben'}<button onClick={verschiebenRueckgaengig}>Rückgängig <Rest bis={(verschoben.seit ?? Date.now()) + rueckS * 1000} /></button></div>
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
  return <>{p.summen.map((x, i) => <Fragment key={x.art}>{i > 0 && ' · '}<span className="tierzahl"><TierSymbol art={x.art} /> {tierText(x.n, x.art)}</span></Fragment>)}</>
}

function Detail(p: { e: Eintrag; routeInfo: string; darfBearbeiten: boolean; kannBearbeiten: boolean; kannNotiz: (n: Notiz) => boolean; onSchliessen: () => void; onBearbeiten: () => void; onLoeschen: () => void; onRoute: () => void; onRouteAus: () => void; onNotizSpeichern: (n: Notiz) => void; onNotizLoeschen: (id: string) => void; tiereZu: boolean; onTiereUmschalten: () => void; gruppen: Gruppe[]; nummer?: number; kannGruppieren: boolean; onGruppe: (v: string) => void; planZeile?: React.ReactNode }) {
  const { e } = p
  const gruppe = e.gruppe ? p.gruppen.find((g) => g.id === e.gruppe) : undefined
  const gf = gruppe ? gruppenFarbe(gruppe, p.gruppen) : null
  const ziel = mitte(e)
  return (
    <section className="sheet">
      <div className="sheet-kopf">
        <h2>{istInfra(e) ? <InfraSymbol art={e.infra} groesse={24} /> : istLinie(e) ? <LinienSymbol e={e} /> : e.typ === 'pin' ? (gf && p.nummer ? <span className="nr-kreis" style={{ background: gf, color: hell(gf) ? '#1d2a1d' : '#fff' }}>{p.nummer}</span> : <span className="farbpunkt" style={{ background: pinFarbe(e), width: 16, height: 16 }} />) : <span className="flaechen-symbol" style={{ color: pinFarbe(e) }}>⬠</span>} {e.titel || <span className="ohne-name">ohne Namen</span>}</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><Icon name="x" /></button>
      </div>
      <div className="meta">
        {istNormal(e) && <span>Farbe: {gf ? <>{farbName(gf)} (Gruppe) · eigene {farbName(pinFarbe(e))}</> : farbName(pinFarbe(e))}</span>}
        {e.typ === 'pin' && istNormal(e) && (p.kannGruppieren
          ? <label className="gruppe-wahl">In Gruppe<select value={gruppe?.id ?? ''} onChange={(x) => p.onGruppe(x.target.value)}>
              <option value="">– ohne Gruppe –</option>
              {p.gruppen.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__neu">＋ Neue Gruppe …</option>
            </select></label>
          : gruppe && <span>Gruppe: {gruppe.name}</span>)}
        {tierSummen([e]).length > 0 && (istAusblendbar(e)
          ? <button type="button" className="tiere-umschalten" aria-expanded={!p.tiereZu} title={p.tiereZu ? 'Tiere einblenden' : 'Tiere ausblenden'} onClick={p.onTiereUmschalten}>
              {p.tiereZu ? '▸ Tiere' : <>▾ <span className="tier-gesamt"><TierAnzeige summen={tierSummen([e])} /></span></>}
            </button>
          : <span className="tier-gesamt"><TierAnzeige summen={tierSummen([e])} /></span>)}
        {e.herde && <span>Herde: {e.herde}</span>}
        {e.typ === 'flaeche' && <span>{FL.haText(hektar(e.punkte))}</span>}
        <span>Datum: {tagText(eintragDatum(e))}</span>
        <span>Geändert: {datum(e.geaendert)}</span>
      </div>
      {p.planZeile}
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

function Formular(p: { gruppeName?: string; start: Eintrag; neu: boolean; istAdmin: boolean; pacht?: Pacht; onPacht: (p: Pacht | null) => void; onSpeichern: (e: Eintrag, basis?: Einheit[]) => void; onAbbrechen: () => void; onLoeschen?: () => void }) {
  const [e, setE] = useState<Eintrag>(p.start)
  // Tiereinheiten als Zeilen (Anzahl als Text, damit das Feld beim Tippen leer sein darf)
  const [zeilen, setZeilen] = useState(() => (p.start.einheiten ?? []).map((x) => ({ ...x, anzahl: String(x.anzahl) })))
  const zeileAendern = (id: string, teil: Partial<{ art: Tierart; anzahl: string }>) => setZeilen((l) => l.map((z) => (z.id === id ? { ...z, ...teil } : z)))
  const [ersteNotiz, setErsteNotiz] = useState('')
  const [pruef, setPruef] = useState<PruefNeu>({ an: true, kv: '', stand: '' })
  const [pachtForm, setPachtForm] = useState(() => pachtFormAus(p.pacht))
  const normal = istNormal(e)
  const art = istInfra(e) ? 'Markierung' : e.typ === 'pin' ? 'Nadel' : e.typ === 'linie' ? 'Linie' : 'Fläche'
  return (
    <section className="sheet formular">
      <form onSubmit={(ev) => {
        ev.preventDefault()
        const notizen = p.neu && ersteNotiz.trim() ? [{ id: neueId(), text: ersteNotiz.trim(), zeitpunkt: new Date().toISOString(), ...autorFelder() }] : e.notizen
        // leere/ungültige Zeilen fallen weg
        const einheiten: Einheit[] = normal ? zeilen.filter((z) => z.anzahl.trim() !== '' && Number(z.anzahl) >= 0).map((z) => ({ id: z.id, art: z.art, anzahl: Math.round(Number(z.anzahl)) })) : []
        let fertig: Eintrag = { ...e, notizen, einheiten }
        // Weide-Technik und Linien: keine Tiere, keine Herde, keine Gruppe; alte App-Versionen erkennen „keine Technik“ an infra: null
        if (!normal) fertig = { ...fertig, herde: undefined, gruppe: undefined, tierlisteModus: undefined }
        if (fertig.typ === 'pin' && !fertig.infra) fertig = { ...fertig, infra: null as never, geraet: undefined }
        if (fertig.typ === 'pin' && fertig.infra === 'geraet' && p.neu && pruef.an) {
          const v = Number(pruef.kv.replace(',', '.'))
          fertig = pruefungEintragen(fertig, { id: neueId(), datum: heute(), zeitpunkt: new Date().toISOString(), ...(pruef.kv.trim() && v >= 0 && v <= 20 ? { kv: Math.round(v * 10) / 10 } : {}), ...(pruef.stand ? { stand: pruef.stand } : {}), ...autorFelder() })
        }
        // Flächen: leeren Steckbrief entfernen (alte App-Versionen: null = „bewusst leer“)
        if (fertig.typ === 'flaeche') { const sb = FL.steckbriefSauber(fertig.steckbrief); fertig = { ...fertig, steckbrief: (sb ?? null) as never } }
        p.onSpeichern(fertig, p.start.einheiten ?? [])
        // Pacht getrennt und nur für Admin/Inhaber speichern (vertraulich)
        if (fertig.typ === 'flaeche' && p.istAdmin) { const neu = pachtAusForm(pachtForm, p.pacht); if (!FL.pachtGleich(neu, p.pacht ?? null)) p.onPacht(neu) }
      }}>
        <div className="sheet-kopf">
          <h2>{p.neu ? `Neue ${art}` : `${art} bearbeiten`}</h2>
          <button type="button" className="x" onClick={p.onAbbrechen} aria-label="Abbrechen"><Icon name="x" /></button>
        </div>
        {(e.typ === 'pin' || e.typ === 'linie') && <InfraFormular e={e} setE={setE} neu={p.neu} pruef={pruef} setPruef={setPruef} />}
        <label>Name<input autoFocus={e.typ !== 'pin' || !p.neu} value={e.titel} placeholder={istInfra(e) ? (e.infra === 'geraet' ? 'z. B. Gerät Deich Nord' : e.infra === 'traenke' ? 'z. B. Tränke am Siel' : 'optional') : e.typ === 'linie' ? 'z. B. Netz Koog-Weide 3' : e.typ === 'pin' ? 'z. B. Mutterschafe Deich Nord' : 'z. B. Koog-Weide 3'} onChange={(x) => setE({ ...e, titel: x.target.value })} /></label>
        {p.neu ? (
          <label>Erste Notiz<textarea rows={3} value={ersteNotiz} placeholder="Was ist hier los? Wasser, Zaun, Lämmer …" onChange={(x) => setErsteNotiz(x.target.value)} /></label>
        ) : (
          <p className="hinweis klein">Notizen ({e.notizen.length}) fügst du in der Detailansicht hinzu bzw. bearbeitest sie dort.</p>
        )}
        {!istInfra(e) && (
          <div className="farbwahl">
            <span className="feldname">{e.typ === 'pin' ? 'Farbe der Nadel' : e.typ === 'linie' ? 'Farbe der Linie' : 'Farbe der Fläche'}</span>
            {p.gruppeName && <p className="hinweis klein">Solange die Nadel in der Gruppe „{p.gruppeName}“ ist, zeigt die Karte sie in der Gruppenfarbe. Diese Farbe gilt wieder ohne Gruppe.</p>}
            <div className="farben" role="radiogroup" aria-label={e.typ === 'pin' ? 'Farbe der Nadel' : 'Farbe der Fläche'}>
              {(e.typ === 'pin' ? FARBEN : e.typ === 'linie' ? [{ wert: linienArt(e.linienArt).farbe, name: `Standard (${linienArt(e.linienArt).name})` }, ...FLAECHEN_FARBEN.filter((f) => f.wert !== linienArt(e.linienArt).farbe)] : FLAECHEN_FARBEN).map((f) => (
                <button type="button" key={f.wert} title={f.name} aria-label={f.name} aria-checked={pinFarbe(e) === f.wert} role="radio"
                  className={pinFarbe(e) === f.wert ? 'aktiv' : ''} style={{ background: f.wert }} onClick={() => setE({ ...e, farbe: f.wert })} />
              ))}
              <label className="frei" title="Eigene Farbe">eigene:<input type="color" value={pinFarbe(e)} onChange={(x) => setE({ ...e, farbe: x.target.value })} /></label>
            </div>
          </div>
        )}
        {normal && <div className="einheiten">
          <span className="feldname">Tiere</span>
          {zeilen.map((z, i) => (
            <div className="einheit-zeile" key={z.id}>
              <input type="number" inputMode="numeric" min={0} aria-label={`Anzahl (Zeile ${i + 1})`} placeholder="Anzahl" value={z.anzahl} onChange={(x) => zeileAendern(z.id, { anzahl: x.target.value })} />
              <select aria-label={`Tierart (Zeile ${i + 1})`} value={z.art} onChange={(x) => zeileAendern(z.id, { art: x.target.value as Tierart })}>
                {TIERARTEN.map((t) => <option key={t.wert} value={t.wert}>{t.name}</option>)}
              </select>
              <button type="button" className="x" aria-label={`Zeile ${i + 1} entfernen`} title="Zeile entfernen" onClick={() => setZeilen((l) => l.filter((x) => x.id !== z.id))}><Icon name="x" /></button>
            </div>
          ))}
          <label className="tierliste-modus">Tierliste<select value={e.tierlisteModus ?? 'fest'} onChange={(x) => setE({ ...e, tierlisteModus: x.target.value as 'fest' | 'ausblendbar' })}>
            <option value="fest">fest anzeigen (immer sichtbar)</option>
            <option value="ausblendbar">ausblendbar (Betrachter kann sie einklappen)</option>
          </select></label>
          <button type="button" className="tiere-plus" onClick={() => setZeilen((l) => [...l, { id: neueId(), art: l.length ? l[l.length - 1].art : 'schaf', anzahl: '' }])}>＋ Tiere hinzufügen</button>
        </div>}
        {e.typ === 'flaeche' && <SteckbriefFormular e={e} setE={(x) => setE(x)} istAdmin={p.istAdmin} pacht={pachtForm} setPacht={setPachtForm} />}
        <div className="zeile">
          <label>Datum<input type="date" required value={eintragDatum(e)} onChange={(x) => x.target.value && setE({ ...e, datum: x.target.value })} /></label>
          {normal && <label>Herde<input value={e.herde ?? ''} placeholder="optional" onChange={(x) => setE({ ...e, herde: x.target.value || undefined })} /></label>}
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

type ListeProps = {
  werkzeuge?: React.ReactNode
  schwelle: number
  eintraege: Eintrag[]; gruppen: Gruppe[]; onWahl: (e: Eintrag) => void; onSchliessen: () => void
  darfBearbeiten: boolean; kannEintrag: (e: Eintrag) => boolean; kannGruppe: (g: Gruppe) => boolean
  onGruppeSpeichern: (g: Gruppe) => void; onGruppeLoeschen: (id: string) => void
  onInGruppe: (g: Gruppe | null, liste: Eintrag[]) => void; neueGruppe: () => Gruppe | null; ichId?: string
  nummern: Record<string, number>; gruppenAus: string[]; onSichtbar: (gid: string) => void; onReihenfolge: (gid: string, ids: string[]) => void
  onExport: (f: ExportFilter) => void
  onUebersicht: () => void
  infraAus: string[]; onInfraUmschalten: (w: string) => void; onGeprueft: (id: string) => void
}
function Liste(p: ListeProps) {
  // Zwei strikt getrennte Listen: Nadeln | Flächen – jeweils vollständig; aktive Filter werden deutlich angezeigt
  const [reiter, setReiter] = useState<'pin' | 'flaeche' | 'infra'>(() => { const r = localStorage.getItem('wt-liste-reiter'); return r === 'flaeche' || r === 'infra' ? r : 'pin' })
  useEffect(() => { localStorage.setItem('wt-liste-reiter', reiter) }, [reiter])
  const [suche, setSuche] = useState('')
  const [farbFilter, setFarbFilter] = useState<string | null>(null)
  const typListe = p.eintraege.filter((e) => e.typ === reiter && istNormal(e))
  // Zeitraum (nach Datum des Eintrags): alle | Jahr | Monat | frei von–bis (Grenzen inklusive, leer = offen)
  const [zeitraum, setZeitraum] = useState('alle')
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const jahre = [...new Set(typListe.map((e) => eintragDatum(e).slice(0, 4)))].sort().reverse()
  const monate = [...new Set(typListe.map((e) => eintragDatum(e).slice(0, 7)))].sort().reverse()
  const zr = zeitraum === 'frei' || (zeitraum.startsWith('j:') && jahre.includes(zeitraum.slice(2))) || (zeitraum.startsWith('m:') && monate.includes(zeitraum.slice(2))) ? zeitraum : 'alle'
  const imZeitraum = (e: Eintrag) => {
    const d = eintragDatum(e)
    if (zr === 'frei') return (!von || d >= von) && (!bis || d <= bis)
    if (zr !== 'alle') return d.startsWith(zr.slice(2))
    return true
  }
  const zeitraumAktiv = zr === 'frei' ? !!(von || bis) : zr !== 'alle'
  const zeitraumText = zr === 'frei' ? `${von ? tagText(von) : '…'} – ${bis ? tagText(bis) : '…'}` : zr.startsWith('j:') ? `Jahr ${zr.slice(2)}` : zr.startsWith('m:') ? monatText(zr.slice(2)) : ''
  const neuesteZuerst = (a: Eintrag, b: Eintrag) => eintragDatum(b).localeCompare(eintragDatum(a)) || b.geaendert.localeCompare(a.geaendert)
  const alle = typListe.filter(imZeitraum) // Basis für Summen und Farbübersicht
  const anzahl = { pin: p.eintraege.filter((e) => e.typ === 'pin' && istNormal(e)).length, flaeche: p.eintraege.filter((e) => e.typ === 'flaeche').length, infra: p.eintraege.filter((e) => !istNormal(e)).length }
  const vorhandeneFarben = [...new Set(alle.map((e) => pinFarbe(e)))]
    .sort((a, b) => { const r = (f: string) => { const i = FLAECHEN_FARBEN.findIndex((x) => x.wert === f); return i < 0 ? 99 : i }; return r(a) - r(b) })
  // Übersicht „Nach Farbe“: je Farbe Anzahl Einträge, Tiere je Art (und bei Flächen Hektar) – nur aktiver Reiter
  const gruppen = vorhandeneFarben.map((f) => {
    const l = alle.filter((e) => pinFarbe(e) === f).sort(neuesteZuerst)
    return { farbe: f, n: l.length, eintraege: l, summen: tierSummen(l), ha: l.reduce((s, e) => s + (e.typ === 'flaeche' ? hektar(e.punkte) : 0), 0) }
  })
  const [farbenOffen, setFarbenOffen] = useState(() => localStorage.getItem('wt-liste-farben') !== 'zu')
  useEffect(() => { localStorage.setItem('wt-liste-farben', farbenOffen ? 'auf' : 'zu') }, [farbenOffen])
  // Unter einer Farbe die einzelnen Einträge zeigen (gewählte Farbe immer, andere per ▸ aufklappbar)
  const [farbAuf, setFarbAuf] = useState<string[]>([])
  // Eingeklappte Monatsgruppen pro Gerät, Schlüssel „reiter:YYYY-MM“ (Standard: aufgeklappt)
  const [monateZu, setMonateZu] = useState<string[]>(() => { try { const x = JSON.parse(localStorage.getItem('wt-monate-zu') || '[]'); return Array.isArray(x) ? x.filter((v) => typeof v === 'string') : [] } catch { return [] } })
  useEffect(() => { localStorage.setItem('wt-monate-zu', JSON.stringify(monateZu)) }, [monateZu])
  const monatUmschalten = (m: string) => { const key = `${reiter}:${m}`; setMonateZu((z) => (z.includes(key) ? z.filter((x) => x !== key) : [...z, key])) }
  // Eingeklappte eigene Gruppen pro Gerät
  const [gruppenZu, setGruppenZu] = useState<string[]>(() => { try { const x = JSON.parse(localStorage.getItem('wt-gruppen-zu') || '[]'); return Array.isArray(x) ? x.filter((v) => typeof v === 'string') : [] } catch { return [] } })
  useEffect(() => { localStorage.setItem('wt-gruppen-zu', JSON.stringify(gruppenZu)) }, [gruppenZu])
  const farbe = farbFilter && vorhandeneFarben.includes(farbFilter) ? farbFilter : null // Filter nur, wenn die Farbe im Reiter vorkommt
  const liste = alle
    .filter((e) => !farbe || pinFarbe(e) === farbe)
    .filter((e) => `${e.titel} ${e.herde ?? ''} ${e.notizen.map((n) => `${n.text} ${n.autor ?? ''}`).join(' ')}`.toLowerCase().includes(suche.trim().toLowerCase()))
    .sort(neuesteZuerst)
  // Eigene Gruppen (nur Nadeln). Unbekannte Gruppen-IDs (z. B. inzwischen gelöscht) gelten als „ohne Gruppe“.
  const gruppenIds = new Set(p.gruppen.map((g) => g.id))
  const gid = (e: Eintrag) => (e.gruppe && gruppenIds.has(e.gruppe) ? e.gruppe : null)
  const mitGruppen = reiter === 'pin' && p.gruppen.length > 0
  const ungruppiert = mitGruppen ? liste.filter((e) => !gid(e)) : liste
  // Monatsgruppen (der Einträge ohne Gruppe), neueste zuerst
  const monatsGruppen: { monat: string; eintraege: Eintrag[] }[] = []
  for (const e of ungruppiert) {
    const m = eintragDatum(e).slice(0, 7)
    const g = monatsGruppen.find((x) => x.monat === m)
    if (g) g.eintraege.push(e); else monatsGruppen.push({ monat: m, eintraege: [e] })
  }
  const filterAktiv = !!farbe || !!suche.trim() || zeitraumAktiv
  // Nadeln der gewählten Farbe, die nur der Zeitraum ausblendet (wird klar angezeigt statt still versteckt)
  const farbeAusserhalb = farbe && zeitraumAktiv ? typListe.filter((e) => pinFarbe(e) === farbe && !imZeitraum(e)).length : 0
  // Bei Farbauswahl die gewählte Farbe (mit ihren einzelnen Einträgen darunter) ins Bild holen
  useEffect(() => {
    if (farbe) document.querySelector('.panel .farb-gruppe.aktiv')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [farbe])
  const allesZeigen = () => { setSuche(''); setFarbFilter(null); setZeitraum('alle'); setVon(''); setBis('') }
  const wort = reiter === 'pin' ? ['Nadel', 'Nadeln'] : ['Fläche', 'Flächen']
  const anz = (n: number) => `${n} ${n === 1 ? wort[0] : wort[1]}`
  // Summen passend zum Reiter
  const summen = tierSummen(alle)
  const ha = reiter === 'flaeche' ? alle.reduce((s, e) => s + (e.typ === 'flaeche' ? hektar(e.punkte) : 0), 0) : 0

  // Summe je Tierart einer Gruppe (bzw. „Ohne Gruppe“) – immer aus den angezeigten Nadeln; bei Filter mit Hinweis
  const summenZeile = (sichtbar: Eintrag[], gesamt: number, zahlenfolge: boolean) => {
    const s = tierSummen(sichtbar)
    const gefiltert = filterAktiv && sichtbar.length < gesamt
    if (!gesamt) return null
    return (
      <div className="gruppe-summe" aria-label="Summe der Tiere">
        <span className="gs-tiere">
          {sichtbar.length > 0 && <><b className="gs-sigma" aria-hidden="true">Σ</b>{'\u00a0'}
          {s.length ? s.map((x, i) => <span key={x.art} className={`gs-art gs-${x.art}`}>{i > 0 && ' · '}{tierText(x.n, x.art)}</span>) : <span className="gs-keine">keine Tierzahlen</span>}</>}
          {gefiltert && <span className="gs-filter" title="Nur die angezeigten Nadeln sind addiert">{sichtbar.length > 0 ? ' · ' : ''}gefiltert: {sichtbar.length} von {anz(gesamt)}</span>}
        </span>
        {zahlenfolge && <span className="gs-folge">Zahlenfolge</span>}
      </div>
    )
  }

  // ---- Gruppen anlegen / umbenennen ----
  // Formular für neue Gruppe bzw. Bearbeiten (Name + Farbe); id null = neue Gruppe
  const [gForm, setGForm] = useState<{ id: string | null; name: string; farbe: string } | null>(null)
  const nameSauber = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 40)
  const gFormSpeichern = () => {
    if (!gForm) return
    const name = nameSauber(gForm.name)
    if (!name) return
    const alt = gForm.id ? p.gruppen.find((g) => g.id === gForm.id) : undefined
    p.onGruppeSpeichern(alt ? { ...alt, name, farbe: gForm.farbe } : { id: neueId(), name, farbe: gForm.farbe, reihenfolge: [], ...(p.ichId ? { von: p.ichId } : {}), erstellt: new Date().toISOString() })
    setGForm(null)
  }
  const gruppenFormular = (
    gForm && (
      <form className="gruppe-form" onSubmit={(ev) => { ev.preventDefault(); gFormSpeichern() }}>
        <div className="gruppe-name-form">
          <input autoFocus aria-label={gForm.id ? 'Name der Gruppe' : 'Name der neuen Gruppe'} maxLength={40} value={gForm.name} onFocus={(x) => x.target.select()} onChange={(x) => setGForm({ ...gForm, name: x.target.value })} />
        </div>
        <div className="farben gruppe-farben" role="radiogroup" aria-label="Farbe der Gruppe">
          {GRUPPEN_FARBEN.map((f) => (
            <button type="button" key={f} role="radio" aria-checked={gForm.farbe === f} aria-label={farbName(f)} title={farbName(f)} className={gForm.farbe === f ? 'aktiv' : ''} style={{ background: f }} onClick={() => setGForm({ ...gForm, farbe: f })} />
          ))}
          <label className="frei" title="Eigene Farbe">eigene:<input type="color" value={gForm.farbe} onChange={(x) => setGForm({ ...gForm, farbe: x.target.value.toLowerCase() })} /></label>
        </div>
        <div className="gruppe-name-form">
          <button type="submit" className="primaer" disabled={!nameSauber(gForm.name)}>{gForm.id ? 'Speichern' : 'Anlegen'}</button>
          <button type="button" onClick={() => setGForm(null)}>Abbrechen</button>
        </div>
      </form>
    )
  )

  // ---- Ziehen am Griff ≡ (Maus: sofort; Touch: langes Drücken) ----
  const panelRef = useRef<HTMLElement>(null)
  const zug = useRef<{ id: string; x0: number; y0: number; x: number; y: number; aktiv: boolean; timer?: number; scroll?: number } | null>(null)
  type Ziel = { gruppe: string | null | undefined; vor?: { id: string; vorher: boolean } }
  const [zieh, setZieh] = useState<{ id: string; x: number; y: number; ziel: string | null | undefined; vor?: { id: string; vorher: boolean } } | null>(null)
  // Ziel unter dem Finger: Gruppe (bzw. null = ohne Gruppe) und – über einer Gruppenzeile – Einfügen davor/danach
  const zielGenau = (x: number, y: number): Ziel => {
    const el = document.elementFromPoint(x, y)
    const drop = el?.closest('[data-drop]') as HTMLElement | null
    if (!drop) return { gruppe: undefined }
    const gruppe = drop.dataset.drop || null
    const li = el?.closest('.gruppe li[data-id]') as HTMLElement | null
    if (gruppe && li) { const r = li.getBoundingClientRect(); return { gruppe, vor: { id: li.dataset.id!, vorher: y < r.top + r.height / 2 } } }
    return { gruppe }
  }
  const ziehStand = (id: string, x: number, y: number) => { const z = zielGenau(x, y); return { id, x, y, ziel: z.gruppe, vor: z.vor } }
  const zugEnde = () => { const z = zug.current; if (z) { clearTimeout(z.timer); clearInterval(z.scroll) } zug.current = null; setZieh(null) }
  const zugStart = (z: NonNullable<typeof zug.current>) => {
    z.aktiv = true
    navigator.vibrate?.(15)
    setZieh(ziehStand(z.id, z.x, z.y))
    // Liste automatisch weiterscrollen, wenn der Finger/Zeiger am oberen oder unteren Rand steht
    z.scroll = window.setInterval(() => {
      const pn = panelRef.current
      if (!pn || !zug.current) return
      const r = pn.getBoundingClientRect()
      const d = z.y < r.top + 44 ? -Math.ceil((r.top + 44 - z.y) / 3) : z.y > r.bottom - 44 ? Math.ceil((z.y - r.bottom + 44) / 3) : 0 // je näher am Rand, desto schneller
      if (d) { pn.scrollTop += d; setZieh((s) => (s ? ziehStand(z.id, z.x, z.y) : s)) }
    }, 30)
  }
  const griffRunter = (ev: React.PointerEvent, e: Eintrag) => {
    ev.stopPropagation()
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    ev.preventDefault()
    ;(ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId)
    const z = { id: e.id, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, aktiv: false } as NonNullable<typeof zug.current>
    zug.current = z
    if (ev.pointerType !== 'mouse') z.timer = window.setTimeout(() => zug.current === z && zugStart(z), 300)
  }
  const griffBewegt = (ev: React.PointerEvent) => {
    const z = zug.current
    if (!z) return
    z.x = ev.clientX; z.y = ev.clientY
    const weg = Math.hypot(z.x - z.x0, z.y - z.y0)
    if (!z.aktiv) {
      if (ev.pointerType === 'mouse' && weg > 4) zugStart(z)
      else if (ev.pointerType !== 'mouse' && weg > 12) zugEnde() // Finger bewegt, bevor das lange Drücken erkannt wurde
      return
    }
    setZieh(ziehStand(z.id, z.x, z.y))
  }
  const griffLos = () => {
    const z = zug.current
    if (z?.aktiv) {
      const { gruppe: ziel, vor } = zielGenau(z.x, z.y)
      const e = p.eintraege.find((x) => x.id === z.id)
      const zg = ziel ? p.gruppen.find((g) => g.id === ziel) ?? null : null
      if (e && ziel !== undefined) {
        const wechsel = ziel !== gid(e)
        if (wechsel) p.onInGruppe(zg, [e])
        // Nummernfolge: an der Einfügestelle einsortieren (ohne Stelle: neu hinten, innerhalb der Gruppe unverändert)
        if (zg && vor && vor.id !== e.id && (!wechsel || p.kannEintrag(e))) {
          const ids = gruppenOrdnung(zg, p.eintraege).map((x) => x.id).filter((id) => id !== e.id)
          let i = ids.indexOf(vor.id)
          i = i < 0 ? ids.length : vor.vorher ? i : i + 1
          ids.splice(i, 0, e.id)
          p.onReihenfolge(zg.id, ids)
        }
      }
    }
    zugEnde()
  }
  const gezogen = zieh ? p.eintraege.find((x) => x.id === zieh.id) : null

  const griffFuer = (e: Eintrag) => (
    <span className="zieh-griff" role="button" tabIndex={-1} title="Ziehen: in eine Gruppe verschieben oder Reihenfolge ändern (Handy: lange drücken)" aria-label="Ziehen, um zu verschieben oder umzusortieren"
      onPointerDown={(ev) => griffRunter(ev, e)} onPointerMove={griffBewegt} onPointerUp={griffLos} onPointerCancel={zugEnde}
      onClick={(ev) => ev.stopPropagation()} onContextMenu={(ev) => ev.preventDefault()}>≡</span>
  )
  // Kompakte Zeile in einer Gruppe (wie My Maps): Nummernkreis in Gruppenfarbe, Tierzahl kurz, Name klein
  const gruppenZeile = (e: Eintrag, farbe: string) => {
    // Umsortieren darf jeder mit Zugang; in andere Gruppen verschieben nur eigene (Admin: alle)
    const griff = p.darfBearbeiten
    const einf = zieh?.vor?.id === e.id && zieh.id !== e.id ? (zieh.vor.vorher ? ' einf-vor' : ' einf-nach') : ''
    const kurz = tierKurz(e)
    return (
      <li key={e.id} data-id={e.id} className={`gz${zieh?.id === e.id ? ' wird-gezogen' : ''}${einf}`} onClick={() => p.onWahl(e)}>
        <span className="nr-kreis" style={{ background: farbe, color: hell(farbe) ? '#1d2a1d' : '#fff' }}>{p.nummern[e.id] ?? '·'}</span>
        <span className="gz-tiere">{kurz || '–'}</span>
        <span className="gz-name">{e.titel}</span>
        {griff && griffFuer(e)}
      </li>
    )
  }
  const zeile = (e: Eintrag) => {
    const griff = reiter === 'pin' && p.darfBearbeiten && p.kannEintrag(e) && p.gruppen.length > 0
    return (
      <li key={e.id} data-id={e.id} className={zieh?.id === e.id ? 'wird-gezogen' : undefined} onClick={() => p.onWahl(e)}>
        <div className="zeile-oben">
          <strong>{e.typ === 'pin' ? <span className="farbpunkt" style={{ background: pinFarbe(e) }} /> : <span className="flaechen-symbol" style={{ color: pinFarbe(e) }}>⬠</span>} {e.titel || <span className="ohne-name">ohne Namen</span>}{e.typ === 'pin' && SP.spannungLetzte(e) && <span className={`spannung-marke klein${SP.spannungLetzte(e)!.kv < p.schwelle ? ' tief' : ''}`} title={`Zaunspannung ${SP.spannungLetzte(e)!.datum.split('-').reverse().join('.')}`}>⚡ {SP.kvText(SP.spannungLetzte(e)!.kv)}</span>}{e.typ === 'pin' && kreisAnzahl(e) > 0 && <span className="kreis-marke" title={e.kreis ? `Eingezäunt: Kreis ${e.kreis.radius} m` : 'Kreise am alten Standort'} style={{ borderColor: e.kreis?.farbe || e.kreiseStehen?.[0]?.farbe || pinFarbe(e) }}>◯ {e.kreis ? `${e.kreis.radius} m` : ''}{(e.kreiseStehen?.length ?? 0) > 0 ? `${e.kreis ? ' ' : ''}+${e.kreiseStehen!.length} alt` : ''}</span>}</strong>
          {griff && griffFuer(e)}
        </div>
        {e.notizen.length > 0 && <span className="notiz-kurz">{notizenSortiert(e)[0].text}</span>}
        <small>📅 {tagText(eintragDatum(e))} · 📝 {e.notizen.length} {e.notizen.length === 1 ? 'Notiz' : 'Notizen'} · {e.typ === 'flaeche' && <>≈ {hektar(e.punkte).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha · </>}{tierSummen([e]).length > 0 && <><TierAnzeige summen={tierSummen([e])} /> · </>}{e.herde ? `${e.herde}` : ''}</small>
      </li>
    )
  }

  return (
    <section className={`panel liste-panel${zieh ? ' zieht' : ''}`} ref={panelRef}>
      {p.werkzeuge && <div className="liste-werkzeug-kopf">{p.werkzeuge}<button className="wz wz-zu" onClick={p.onSchliessen} title="Seitenleiste einklappen" aria-label="Seitenleiste einklappen"><span className="wz-i">»</span></button></div>}
      <div className="sheet-kopf">
        <h2>Tagebuch</h2>
        <button className="kopf-export" title={filterAktiv ? 'Angezeigte exportieren (Excel, PDF, KML)' : 'Exportieren (Excel, PDF, KML)'} onClick={() => p.onExport(filterAktiv ? { ids: liste.map((e) => e.id), text: [`nur ${wort[1]}`, farbe && `Farbe ${farbName(farbe)}`, suche.trim() && `Suche „${suche.trim()}“`, zeitraumAktiv && `Zeitraum ${zeitraumText}`].filter(Boolean).join(' · ') } : null)}>⬇️ Export{filterAktiv ? ` (${liste.length})` : ''}</button>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><Icon name="x" /></button>
      </div>
      <div className="tabs reiter" role="tablist">
        {(['pin', 'flaeche', 'infra'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={reiter === f} className={reiter === f ? 'aktiv' : ''} onClick={() => { setReiter(f); setFarbFilter(null) }}>
            {f === 'pin' ? '📍 Nadeln' : f === 'flaeche' ? '⬠ Flächen' : <>〰 Zäune<span className="nur-breit"> &amp; Wasser</span></>} ({anzahl[f]})
          </button>
        ))}
      </div>
      {reiter === 'infra' ? <InfraListe eintraege={p.eintraege} aus={p.infraAus} onUmschalten={p.onInfraUmschalten} onWahl={p.onWahl} darfBearbeiten={p.darfBearbeiten} onGeprueft={p.onGeprueft} /> : <>
      <p className="hinweis summe">
        {zeitraumAktiv && <strong>{zeitraumText}: </strong>}{alle.length} {alle.length === 1 ? wort[0] : wort[1]}
        {reiter === 'pin' && alle.some((e) => e.typ === 'pin' && kreisAnzahl(e) > 0) && <> · ◯ {alle.reduce((n, e) => n + (e.typ === 'pin' ? kreisAnzahl(e) : 0), 0)} eingezäunt</>}
        {reiter === 'flaeche' && alle.length > 0 && <> · {FL.haText(ha)} · <button className="link-knopf" onClick={p.onUebersicht}>📊 Übersicht, Pacht & Summen</button></>}
        {summen.length > 0 ? <> · <TierAnzeige summen={summen} /></> : reiter === 'pin' ? ' · 0 Tiere' : ''}
      </p>
      <div className="zeitraum">
        <label>Zeitraum<select value={zr} onChange={(x) => setZeitraum(x.target.value)}>
          <option value="alle">Alle Zeiträume</option>
          {jahre.length > 0 && <optgroup label="Jahr">{jahre.map((j) => <option key={j} value={`j:${j}`}>{j}</option>)}</optgroup>}
          {monate.length > 0 && <optgroup label="Monat">{monate.map((m) => <option key={m} value={`m:${m}`}>{monatText(m)}</option>)}</optgroup>}
          <option value="frei">Von – bis …</option>
        </select></label>
        {zr === 'frei' && (
          <div className="von-bis">
            <label>von<input type="date" value={von} max={bis || undefined} onChange={(x) => setVon(x.target.value)} /></label>
            <label>bis<input type="date" value={bis} min={von || undefined} onChange={(x) => setBis(x.target.value)} /></label>
          </div>
        )}
      </div>
      <input placeholder={`${wort[1]} durchsuchen (Name, Herde, Notizen) …`} value={suche} onChange={(e) => setSuche(e.target.value)} />
      {gruppen.length > 0 && (
        <div className="nach-farbe">
          <button className="nach-farbe-kopf" aria-expanded={farbenOffen} onClick={() => setFarbenOffen((o) => !o)}>
            {farbenOffen ? '▾' : '▸'} Nach Farbe <small>({gruppen.length} {gruppen.length === 1 ? 'Farbe' : 'Farben'}{farbenOffen ? ' · antippen filtert' : ''})</small>
          </button>
          {farbenOffen && (
            <ul>
              {gruppen.map((g) => {
                const einzeln = farbe === g.farbe || farbAuf.includes(g.farbe)
                return (
                  <li key={g.farbe}>
                    <div className="farb-zeile">
                      <button className={`farb-gruppe${farbe === g.farbe ? ' aktiv' : ''}`} aria-pressed={farbe === g.farbe} onClick={() => setFarbFilter(farbe === g.farbe ? null : g.farbe)}>
                        <span className="farb-gruppe-name"><span className="farbpunkt" style={{ background: g.farbe }} />{farbName(g.farbe)} <small>({anz(g.n)}{reiter === 'flaeche' ? ` · ≈ ${g.ha.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha` : ''})</small></span>
                        <span className="farb-gruppe-tiere">{g.summen.length ? <TierAnzeige summen={g.summen} /> : <span className="ohne-tiere">keine Tiere</span>}</span>
                      </button>
                      <button className="farb-auf" aria-expanded={einzeln} disabled={farbe === g.farbe} title={einzeln ? 'Einzelne ausblenden' : 'Einzeln zeigen'} aria-label={`${farbName(g.farbe)}: ${wort[1]} ${einzeln ? 'ausblenden' : 'einzeln zeigen'}`}
                        onClick={() => setFarbAuf((l) => (l.includes(g.farbe) ? l.filter((x) => x !== g.farbe) : [...l, g.farbe]))}>{einzeln ? '▾' : '▸'}</button>
                    </div>
                    {einzeln && (
                      <ul className="farb-einzeln">
                        {g.eintraege.map((e) => {
                          const gr = gid(e) ? p.gruppen.find((x) => x.id === e.gruppe) : null
                          return (
                            <li key={e.id}><button onClick={() => p.onWahl(e)}>
                              <span className="fe-name">{e.titel || <span className="ohne-name">ohne Namen</span>}</span>
                              <small>{tagText(eintragDatum(e))}{gr ? ` · ${gr.name}` : ''}{tierSummen([e]).length > 0 && <> · <TierAnzeige summen={tierSummen([e])} /></>}</small>
                            </button></li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      {filterAktiv && (
        <div className="filter-hinweis" role="status">
          <span>🔎 Filter aktiv{farbe ? ` · Farbe ${farbName(farbe)}` : ''}{suche.trim() ? ` · Suche „${suche.trim()}“` : ''}{zeitraumAktiv ? ` · Zeitraum ${zeitraumText}` : ''}: <strong>{liste.length} von {typListe.length}</strong> {wort[1]} angezeigt</span>
          <button onClick={allesZeigen}>Alle zeigen</button>
        </div>
      )}
      {farbeAusserhalb > 0 && (
        <div className="filter-hinweis ausserhalb" role="status">
          <span>{farbeAusserhalb} weitere {farbName(farbe!)}-{farbeAusserhalb === 1 ? wort[0] : wort[1]} außerhalb des Zeitraums</span>
          <button onClick={() => { setZeitraum('alle'); setVon(''); setBis('') }}>Zeitraum aufheben</button>
        </div>
      )}
      {farbe && reiter === 'pin' && p.darfBearbeiten && liste.some(p.kannEintrag) && (
        <select className="sammel-gruppe" value="" aria-label={`Alle ${liste.length} ${farbName(farbe)}-Nadeln in eine Gruppe`} onChange={(x) => {
          const v = x.target.value
          if (!v) return
          const g = v === '__neu' ? p.neueGruppe() : v === '__ohne' ? null : p.gruppen.find((y) => y.id === v) ?? null
          if (v === '__neu' && !g) return
          p.onInGruppe(g, liste)
        }}>
          <option value="">{`📂 Alle ${liste.length} ${farbName(farbe)}-${liste.length === 1 ? 'Nadel' : 'Nadeln'} in Gruppe …`}</option>
          {p.gruppen.map((g) => <option key={g.id} value={g.id}>{`→ ${g.name}`}</option>)}
          <option value="__neu">＋ Neue Gruppe …</option>
          {liste.some((e) => gid(e)) && <option value="__ohne">Aus ihren Gruppen nehmen (ohne Gruppe)</option>}
        </select>
      )}
      {!typListe.length && <p className="hinweis">{reiter === 'pin' ? 'Noch keine Nadeln. Tippe auf „+ Nadel“ oder direkt auf die Karte.' : 'Noch keine Flächen. Tippe auf „Fläche“ und dann die Eckpunkte.'}</p>}
      {typListe.length > 0 && !liste.length && <p className="hinweis">Keine {wort[1]} für diese Auswahl.</p>}

      {reiter === 'pin' && (p.gruppen.length > 0 || p.darfBearbeiten) && typListe.length > 0 && (
        <div className="gruppen">
          <div className="gruppen-kopf">
            <span>Gruppen{p.gruppen.length ? ` (${p.gruppen.length})` : ''}</span>
            {p.darfBearbeiten && !(gForm && !gForm.id) && <button onClick={() => setGForm({ id: null, name: gruppenVorschlag(p.gruppen), farbe: naechsteGruppenFarbe(p.gruppen) })}>＋ Neue Gruppe</button>}
          </div>
          {gForm && !gForm.id && gruppenFormular}
          {p.gruppen.map((g) => {
            const gf = gruppenFarbe(g, p.gruppen)
            const alleG = typListe.filter((e) => gid(e) === g.id)
            const sichtbar = new Set(liste.map((e) => e.id))
            const treffer = gruppenOrdnung(g, p.eintraege).filter((e) => sichtbar.has(e.id))
            const offen = !!farbe || !gruppenZu.includes(g.id)
            const aufKarte = !p.gruppenAus.includes(g.id)
            return (
              <div key={g.id} className={`gruppe${zieh?.ziel === g.id ? ' drop-aktiv' : ''}${aufKarte ? '' : ' ausgeblendet'}`} data-drop={g.id} style={{ borderLeftColor: gf }}>
                {gForm?.id === g.id ? gruppenFormular : (
                  <div className="gruppe-kopf">
                    <label className="gruppe-haken" title={aufKarte ? 'Auf der Karte ausblenden' : 'Auf der Karte einblenden'}>
                      <input type="checkbox" checked={aufKarte} onChange={() => p.onSichtbar(g.id)} aria-label={`Gruppe „${g.name}“ auf der Karte zeigen`} />
                    </label>
                    <button className="gruppe-auf" aria-expanded={offen} disabled={!!farbe} onClick={() => setGruppenZu((z) => (z.includes(g.id) ? z.filter((x) => x !== g.id) : [...z, g.id]))}>
                      <span className="gruppe-name">{g.name}</span>
                      <small> {filterAktiv ? `${treffer.length}/${alleG.length}` : alleG.length}{!farbe && <span className="pfeil"> {offen ? '▾' : '▸'}</span>}</small>
                    </button>
                    {p.darfBearbeiten && p.kannGruppe(g) && (
                      <>
                        <button className="mini" title="Name und Farbe ändern" aria-label={`Gruppe „${g.name}“ bearbeiten`} onClick={() => setGForm({ id: g.id, name: g.name, farbe: gf })}><Icon name="stift" /></button>
                        <button className="mini" title="Gruppe löschen" aria-label={`Gruppe „${g.name}“ löschen`} onClick={() => confirm(`Gruppe „${g.name}“ löschen?\n\nDie ${anz(alleG.length)} bleiben erhalten und sind danach ohne Gruppe.`) && p.onGruppeLoeschen(g.id)}><Icon name="x" /></button>
                      </>
                    )}
                  </div>
                )}
                {gForm?.id !== g.id && summenZeile(treffer, alleG.length, offen && treffer.length > 0)}
                {offen && (treffer.length
                  ? <><ul className="liste gruppen-liste">{treffer.map((e) => gruppenZeile(e, gf))}</ul></>
                  : <p className="gruppe-leer">{alleG.length ? `Keine ${wort[1]} für diese Auswahl.` : p.darfBearbeiten ? 'Noch leer – Nadeln am ≡ hierher ziehen oder in der Nadel „In Gruppe“ wählen.' : 'Noch leer.'}</p>)}
              </div>
            )
          })}
        </div>
      )}

      <div className={`ohne-gruppe${mitGruppen ? ' mit-rahmen' : ''}${zieh?.ziel === null ? ' drop-aktiv' : ''}`} {...(mitGruppen ? { 'data-drop': '' } : {})}>
        {mitGruppen && <h3 className="ohne-gruppe-kopf">Ohne Gruppe <small>· {anz(ungruppiert.length)}</small></h3>}
        {mitGruppen && summenZeile(ungruppiert, typListe.filter((e) => !gid(e)).length, false)}
        {mitGruppen && !ungruppiert.length && liste.length > 0 && <p className="gruppe-leer">Alle {filterAktiv ? 'angezeigten ' : ''}{wort[1]} sind in Gruppen{zieh ? ' – hier ablegen, um eine Nadel aus ihrer Gruppe zu nehmen' : ''}.</p>}
        {monatsGruppen.length > 1 && !farbe && (() => {
          const keys = monatsGruppen.map((g) => `${reiter}:${g.monat}`)
          const einerOffen = keys.some((x) => !monateZu.includes(x))
          return (
            <div className="monate-alle">
              <button onClick={() => setMonateZu((z) => (einerOffen ? [...new Set([...z, ...keys])] : z.filter((x) => !keys.includes(x))))}>{einerOffen ? '▸ Alle Monate zuklappen' : '▾ Alle Monate aufklappen'}</button>
            </div>
          )
        })()}
        {monatsGruppen.map((g) => {
          const ms = tierSummen(g.eintraege)
          const mha = g.eintraege.reduce((s, e) => s + (e.typ === 'flaeche' ? hektar(e.punkte) : 0), 0)
          // Bei Farbauswahl immer alle Treffer einzeln zeigen – eingeklappte Monate bleiben gespeichert, gelten aber erst wieder ohne Farbfilter
          const offen = !!farbe || !monateZu.includes(`${reiter}:${g.monat}`)
          return (
            <div className="monat" key={g.monat}>
              <h3 className="monat-kopf"><button aria-expanded={offen} disabled={!!farbe} onClick={() => monatUmschalten(g.monat)}>{!farbe && <span className="pfeil">{offen ? '▾' : '▸'}</span>} {monatText(g.monat)} <small>· {anz(g.eintraege.length)}{reiter === 'flaeche' ? ` · ≈ ${mha.toLocaleString('de-DE', { maximumFractionDigits: 2 })} ha` : ''}{ms.length > 0 && <> · <TierAnzeige summen={ms} /></>}</small></button></h3>
              {offen && <ul className="liste">{g.eintraege.map(zeile)}</ul>}
            </div>
          )
        })}
      </div>
      </>}
      {zieh && gezogen && (
        <div className="zieh-geist" style={{ left: zieh.x, top: zieh.y }} aria-hidden="true">
          <span className="farbpunkt" style={{ background: pinFarbe(gezogen) }} /> {gezogen.titel || 'ohne Namen'}
          <small>{zieh.ziel === undefined ? 'auf eine Gruppe ziehen' : zieh.ziel === null ? '→ ohne Gruppe' : `→ ${p.gruppen.find((g) => g.id === zieh.ziel)?.name ?? ''}`}</small>
        </div>
      )}
    </section>
  )
}

function Einstellungen(p: { k: ReturnType<typeof useKarte>; onMeineDaten: () => void; onAustausch: () => void; onSchliessen: () => void; meldung: (s: string) => void; onNutzer: () => void; onHof: () => void; onProfil: () => void; kopfFarbe: string | null; setKopfFarbe: (f: string | null) => void; rueckS: number; setRueckS: (n: number) => void; schwelle: number; setSchwelle: (n: number) => void }) {
  const { k } = p
  const [name, setName] = useState('Weidekarte Deichschäferei')
  const [kartenName, setKartenName] = useState(k.kartenName)
  useEffect(() => setKartenName(k.kartenName), [k.kartenName])
  const kartenNameSauber = kartenName.replace(/\s+/g, ' ').trim()
  const basis = `${location.origin}${location.pathname}?karte=${k.karteId}`
  const kopieren = async (t: string) => {
    try { await navigator.clipboard.writeText(t); p.meldung('Link kopiert') } catch { prompt('Link kopieren:', t) }
  }
  return (
    <section className="panel">
      <div className="sheet-kopf">
        <h2>Einstellungen</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><Icon name="x" /></button>
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
          {k.istAdmin && <button className="primaer" onClick={p.onNutzer}>👥 {k.hof ? 'Leute einladen / Personen verwalten' : 'Nutzer verwalten / Leute einladen'}</button>}

          <h3>Hof</h3>
          {k.hof ? (
            <>
              <p className="hinweis">Diese Karte gehört zum Hof <strong>„{k.hof.name}“</strong>.{k.hof.rolle ? ` Deine Rolle: ${ROLLEN[k.hof.rolle].name}.` : ''}</p>
              {k.hof.rolle && <button onClick={p.onHof}>🏡 Mein Hof: Karten, Personen, PIN</button>}
            </>
          ) : k.istAdmin ? (
            <>
              <p className="hinweis klein">Ein Hof bündelt mehrere Karten (z. B. Sommer- und Winterweiden) mit <strong>einem</strong> Team: Jede Person hat einen Link für alle Karten und eine Rolle (Admin, Mitarbeiter, Nur ansehen).</p>
              <HofEinrichten k={k} meldung={p.meldung} onHof={p.onHof} />
            </>
          ) : <p className="hinweis klein">Diese Karte gehört zu keinem Hof.</p>}

          <h3>Name der Karte</h3>
          {k.istAdmin ? (
            <form className="karten-name" onSubmit={(ev) => { ev.preventDefault(); k.kartenNameAendern(kartenNameSauber).then(() => p.meldung('Kartenname gespeichert')).catch((e) => p.meldung(e.message)) }}>
              <input value={kartenName} maxLength={60} onChange={(e) => setKartenName(e.target.value)} aria-label="Name der Karte" />
              <button type="submit" className="primaer" disabled={!kartenNameSauber || kartenNameSauber === k.kartenName}>Speichern</button>
              <p className="hinweis klein">Wird oben in der Kopfzeile angezeigt – bei allen, sofort.</p>
            </form>
          ) : (
            <p className="hinweis">„{k.kartenName}“ <span className="klein">(ändern können nur Admins)</span></p>
          )}
        </>
      )}

      {k.karteId ? (
        <>
          <h3>Dein Zugang</h3>
          {k.ich ? (
            <>
              <p className="hinweis">Angemeldet als <strong>{k.ich.name}</strong> ({k.hof?.rolle ? ROLLEN[k.hof.rolle].name : k.ich.rolle === 'admin' ? 'Admin' : k.ich.rolle === 'ansehen' ? 'Nur ansehen' : 'Nutzer'}). Dein persönlicher Link ist auf diesem Gerät gespeichert.</p>
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

      <OfflineAbschnitt k={k} meldung={p.meldung} />

      <h3>Darstellung</h3>
      <div className="kopf-farbe">
        <label className="frei">Farbe der Kopfleiste<input type="color" value={p.kopfFarbe || KOPF_STANDARD} onChange={(e) => p.setKopfFarbe(e.target.value)} /></label>
        <button onClick={() => p.setKopfFarbe(null)} disabled={!p.kopfFarbe}>Standard</button>
      </div>
      <p className="hinweis klein">Nur auf diesem Gerät, rein optisch.</p>
      <div className="rueck-dauer" role="radiogroup" aria-label="Zeit für Rückgängig">
        <span>„Rückgängig“ nach Setzen/Verschieben einer Nadel:</span>
        <div className="knoepfe">{[5, 10, 20].map((n) => <button key={n} role="radio" aria-checked={p.rueckS === n} className={p.rueckS === n ? 'primaer' : ''} onClick={() => p.setRueckS(n)}>{n} s</button>)}</div>
      </div>
      <p className="hinweis klein">So lange zählt der Hinweis mit „Rückgängig“ herunter (Standard 10 s), nur auf diesem Gerät.</p>

      <h3>Zaunspannung</h3>
      <label className="spannung-schwelle">⚡ Warnschwelle<span><input type="text" inputMode="decimal" defaultValue={String(p.schwelle).replace('.', ',')} aria-label="Warnschwelle in kV" onBlur={(x) => { const n = Number(x.target.value.replace(',', '.')); if (Number.isFinite(n) && n > 0 && n <= 20) p.setSchwelle(Math.round(n * 10) / 10); else x.target.value = String(p.schwelle).replace('.', ',') }} /> kV</span></label>
      <p className="hinweis klein">Darunter wird das ⚡-Schild an der Nadel rot (Standard 4 kV). Gilt für diese Karte auf diesem Gerät.</p>

      <h3>Daten: Export &amp; Import</h3>
      <button className="primaer" onClick={p.onAustausch}>⬇️⬆️ Export &amp; Import öffnen</button>
      <p className="hinweis klein">Excel-Liste, PDF-Bericht, KML für Google Earth/My Maps{k.istAdmin ? ', vollständige Sicherung und Import aus Google My Maps' : ''}.</p>

      <h3>Datenschutz &amp; Rechtliches</h3>
      <button onClick={p.onMeineDaten}>🛡️ Meine Daten ansehen, herunterladen oder löschen</button>
      <RechtLinks />

      <KarteLoeschenAbschnitt k={k} meldung={p.meldung} onExport={p.onAustausch} />

      <h3>Karte</h3>
      <p className="hinweis">Kartendienst: {HAT_GOOGLE_KEY ? 'Google Maps (Satellit)' : 'Esri-Satellit / OpenStreetMap (kostenlos) – für Google Maps einen API-Key in VITE_GOOGLE_MAPS_API_KEY eintragen'}.<br />Routen: {HAT_GOOGLE_KEY ? 'Google Directions' : 'OSRM (kostenloser Demo-Server)'}.</p>
      <p className="hinweis klein">FlockMap · Prototyp v0.1</p>
    </section>
  )
}

// Beitritt per Einladungslink: Name eingeben -> als „Nutzer“ angelegt, Zugang am Gerät gespeichert
function Beitreten(p: { k: ReturnType<typeof useKarte> }) {
  const { k } = p
  const [gueltig, setGueltig] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [fehler, setFehler] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { k.einladungPruefen().then((x) => setGueltig(x.gueltig)).catch(() => setGueltig(false)) }, [])
  const sauber = name.replace(/\s+/g, ' ').trim()
  return (
    <section className="panel profil beitreten">
      <div className="sheet-kopf"><h2>Einladung</h2></div>
      {gueltig === null ? <p className="hinweis">Prüfe Einladung …</p> : !gueltig ? (
        <p className="hinweis">Dieser Einladungslink ist ungültig oder wurde deaktiviert. Du kannst die Karte nur ansehen – frag den Admin nach einem neuen Link.</p>
      ) : (
        <form onSubmit={async (ev) => {
          ev.preventDefault()
          if (!sauber) return
          setLaeuft(true); setFehler('')
          try { await k.beitreten(sauber) } catch (e) { setFehler((e as Error).message); setLaeuft(false) }
        }}>
          <p className="hinweis">Du wurdest zur Karte <strong>„{k.kartenName}“</strong> eingeladen. Wie heißt du? Der Name erscheint bei deinen Notizen.</p>
          <label>Dein Name<input autoFocus value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="z. B. Jan (Schäfer)" /></label>
          {fehler && <p className="fehler gefahr">{fehler}</p>}
          <div className="knoepfe"><button type="submit" className="primaer" disabled={laeuft || !sauber}>Beitreten</button></div>
          <p className="hinweis klein">Mit dem Beitritt werden dein Name und deine Rolle gespeichert. Mehr dazu in der <a href="#recht/datenschutz">Datenschutzerklärung</a>.</p>
        </form>
      )}
      <RechtLinks klein />
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
      <div className="sheet-kopf"><h2>Mein Name</h2><button className="x" onClick={p.onSchliessen} aria-label="Schließen"><Icon name="x" /></button></div>
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
  useEffect(laden, [k.nutzerStand])
  const fehler = (e: Error) => p.meldung(e.message)
  const link = (n: Nutzer) => zugangsLink(k.karteId!, n.zugang)
  // Einladungslink (Selbstregistrierung als „Nutzer“)
  const [einl, setEinl] = useState<string | null | undefined>(undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { k.einladungVerwalten.laden().then((x) => setEinl(x.code)).catch(fehler) }, [])
  const einlLink = einl ? einladungsLink(k.karteId!, einl) : ''
  const einlTeilen = async () => {
    const text = `Einladung zur Weidekarte „${k.kartenName}“ in FlockMap – Link öffnen und Namen eingeben: ${einlLink}`
    if (navigator.share) { try { await navigator.share({ title: 'FlockMap', text, url: einlLink }); return } catch { /* abgebrochen */ } }
    try { await navigator.clipboard.writeText(einlLink); p.meldung('Einladungslink kopiert') } catch { prompt('Einladungslink kopieren:', einlLink) }
  }
  const teilen = async (n: Nutzer) => {
    const text = `Hallo ${n.name}, hier ist dein persönlicher Zugang zur Weidekarte „${k.kartenName}“ in FlockMap: ${link(n)}`
    if (navigator.share) { try { await navigator.share({ title: 'FlockMap', text, url: link(n) }); return } catch { /* abgebrochen */ } }
    try { await navigator.clipboard.writeText(link(n)); p.meldung(`Link für ${n.name} kopiert`) } catch { prompt(`Link für ${n.name} kopieren:`, link(n)) }
  }
  const admins = liste?.filter((n) => n.rolle === 'admin').length ?? 0
  return (
    <section className="panel nutzer-panel">
      <div className="sheet-kopf">
        <h2>Nutzer</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><Icon name="x" /></button>
      </div>
      <p className="hinweis">Jede Person bekommt einen eigenen Link. <strong>Nutzer</strong> dürfen Nadeln, Flächen und Notizen anlegen und ihre eigenen ändern/löschen. <strong>Admins</strong> dürfen alles und Nutzer verwalten.</p>

      <h3>Einladungslink</h3>
      <p className="hinweis klein">Wer diesen Link öffnet, gibt seinen Namen ein und wird automatisch als <strong>Nutzer</strong> angelegt (nie als Admin). Du kannst die Rolle danach jederzeit ändern.</p>
      {einl === undefined ? <p className="hinweis klein">Lade …</p> : einl ? (
        <div className="neu-link einladung">
          <input readOnly value={einlLink} onFocus={(e) => e.target.select()} aria-label="Einladungslink" />
          <div className="knoepfe">
            <button className="primaer" onClick={einlTeilen}>Einladung teilen / kopieren</button>
            <button onClick={() => confirm('Neuen Einladungslink erzeugen? Der bisherige Link funktioniert dann nicht mehr.') && k.einladungVerwalten.erzeugen().then((x) => { setEinl(x.code); p.meldung('Neuer Einladungslink erzeugt') }).catch(fehler)}>Neuer Link</button>
            <button className="gefahr" onClick={() => k.einladungVerwalten.deaktivieren().then((x) => { setEinl(x.code); p.meldung('Einladungslink deaktiviert') }).catch(fehler)}>Deaktivieren</button>
          </div>
        </div>
      ) : (
        <button onClick={() => k.einladungVerwalten.erzeugen().then((x) => setEinl(x.code)).catch(fehler)}>🔗 Einladungslink erzeugen</button>
      )}

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
              {n.hof && <span className="hinweis klein"> · Hof</span>}
              <select value={n.rolle} aria-label={`Rolle von ${n.name}`} disabled={n.hof || (n.rolle === 'admin' && admins <= 1)}
                onChange={(e) => k.nutzer.aendern(n.id, { rolle: e.target.value as Ich['rolle'] }).then(() => { laden(); k.ichLaden() }).catch(fehler)}>
                <option value="nutzer">Nutzer</option><option value="admin">Admin</option>{n.rolle === 'ansehen' && <option value="ansehen">Nur ansehen</option>}
              </select>
            </div>
            {!n.hof && <div className="knoepfe">
              <button onClick={() => teilen(n)}>🔗 Link teilen</button>
              <button onClick={() => { const neuName = prompt('Neuer Name:', n.name); if (neuName?.trim()) k.nutzer.aendern(n.id, { name: neuName.trim() }).then(() => { laden(); k.ichLaden() }).catch(fehler) }}>Umbenennen</button>
              <button title="Alter Link wird ungültig" onClick={() => confirm(`Neuen Link für ${n.name} erzeugen? Der alte Link funktioniert dann nicht mehr.`) && k.nutzer.aendern(n.id, { neuerZugang: true }).then((x) => { setNeu(x); laden() }).catch(fehler)}>Neuer Link</button>
              <button className="gefahr" disabled={n.rolle === 'admin' && admins <= 1}
                onClick={() => confirm(`${n.name} entfernen? Der Zugang ist sofort ungültig.`) && k.nutzer.entfernen(n.id).then(() => { laden(); p.meldung(`${n.name} entfernt`) }).catch(fehler)}>Entfernen</button>
            </div>}
          </li>
        ))}
      </ul>
      <p className="hinweis klein">Mindestens ein Admin muss bleiben. Wer entfernt wird, kann die Karte nur noch über den Ansehen-Link lesen.</p>
    </section>
  )
}

// Sekunden-Countdown im Rückgängig-Knopf
function Rest(p: { bis: number }) {
  const [, setT] = useState(0)
  useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 250); return () => clearInterval(i) }, [])
  const s = Math.max(0, Math.ceil((p.bis - Date.now()) / 1000))
  return <span className="rest">({s} s)</span>
}
