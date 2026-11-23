import { useCallback, useEffect, useRef, useState } from 'react'
import { migrieren, type Einheit, type Eintrag, type Gruppe, type Notiz } from './types'
import { lesen, schreiben, schreibenJetzt, entfernen } from './speicher'
import * as WP from '../server/weideplan.js'
import * as IS from '../server/infrastruktur.js'
import type { Pruefung } from '../server/infrastruktur.js'
import * as FL from '../server/flaechen.js'
import * as SP from '../server/spannung.js'
import type { Messung } from '../server/spannung.js'
import type { Pacht, PachtListe } from '../server/flaechen.js'
import type { Weideplan, Herde, Belegung, UmtriebOp } from '../server/weideplan.js'

// Geteilte Karte: ?karte=ID (ansehen) bzw. ?karte=ID&zugang=KEY (persönlicher Zugang; alt: &schluessel=KEY).
// Der Zugang wird am Gerät gespeichert und aus der Adresszeile entfernt.
export const zugangKey = (id: string) => `wt-zugang-${id}`
// 7o: zuletzt geöffnete Karte (Start über das Home-Bildschirm-Symbol bzw. „/“ springt dorthin, siehe main.tsx)
export const LETZTE_KARTE = 'wt-letzte-karte'
export const KARTEN_ID = /^[\w-]{4,40}$/
// iPhone/iPad im Browser (nicht als Home-Bildschirm-App): iOS übernimmt beim „Zum Home-Bildschirm“ die Adresse der Seite
// und gibt der App einen eigenen, leeren Speicher -> dort muss der Zugang in der Adresse stehen bleiben
export function iosBrowser() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && (navigator as Navigator & { standalone?: boolean }).standalone !== true && !window.matchMedia?.('(display-mode: standalone)').matches
}
export function linkParameter() {
  const p = new URLSearchParams(location.search)
  const karteId = p.get('karte')
  const ausLink = p.get('zugang') || p.get('schluessel')
  const einladungLink = p.get('einladung')
  if (karteId && ausLink) localStorage.setItem(zugangKey(karteId), ausLink)
  const zugang = karteId ? localStorage.getItem(zugangKey(karteId)) : null
  if (karteId && KARTEN_ID.test(karteId)) try { localStorage.setItem(LETZTE_KARTE, karteId) } catch { /* egal */ }
  const zugangInAdresse = !!karteId && !!zugang && iosBrowser()
  if (karteId) {
    const q = new URLSearchParams(p)
    q.delete('zugang'); q.delete('schluessel'); q.delete('einladung')
    if (zugangInAdresse) q.set('zugang', zugang!)
    if (q.toString() !== p.toString()) history.replaceState(null, '', `${location.pathname}?${q.toString()}${location.hash}`)
  }
  // Einladungslink: nur relevant, wenn auf diesem Gerät noch kein Zugang gespeichert ist
  return { karteId, zugang, einladung: karteId && !zugang ? einladungLink : null }
}
const PARAMS = linkParameter()

export interface Ich { id: string; name: string; rolle: 'admin' | 'nutzer' | 'ansehen' }
export interface Nutzer extends Ich { zugang: string; erstellt: string; hof?: boolean }
// Hof, zu dem die Karte gehört (rolle = meine Rolle im Hof, falls ich Mitglied bin)
export type HofRolle = 'inhaber' | 'admin' | 'mitarbeiter' | 'ansehen'
export interface HofKurz { id: string; name: string; rolle?: HofRolle }
export const zugangsLink = (karteId: string, zugang: string) => `${location.origin}${location.pathname}?karte=${karteId}&zugang=${zugang}`
export const einladungsLink = (karteId: string, code: string) => `${location.origin}${location.pathname}?karte=${karteId}&einladung=${code}`

type Ausstehend =
  // basis: Tiereinheiten, von denen die Änderung ausging (Server führt damit gleichzeitige Änderungen zusammen)
  // basisGeaendert: Änderungszeitpunkt des Eintrags, wie ihn dieses Gerät kannte -> Server erkennt gleichzeitige Änderungen
  | { art: 'put'; eintrag: Eintrag; basis?: Einheit[]; basisGeaendert?: string }
  | { art: 'delete'; id: string; basisGeaendert?: string; titel?: string }
  | { art: 'notiz-put'; eintragId: string; notiz: Notiz }
  | { art: 'notiz-delete'; eintragId: string; notizId: string }
  | { art: 'gruppe-put'; gruppe: Gruppe }
  | { art: 'gruppe-delete'; id: string }
  | { art: 'zuordnen'; gruppe: string | null; ids: string[] }
  | { art: 'reihenfolge'; gruppe: string; ids: string[] }
  // Weidezaungerät geprüft (ein Tipp; auch an fremden Geräten erlaubt)
  | { art: 'geprueft'; eintragId: string; pruefung: Pruefung }
  // Zaunspannung an einer Nadel (ein Tipp; Mitarbeiter an allen Nadeln, eine Messung pro Tag)
  | { art: 'spannung'; eintragId: string; messung: Messung }
  // Import/Wiederherstellen: viele Einträge + Gruppen in EINER Änderung (nur Neues wird ergänzt, Vorhandenes bleibt unverändert)
  | { art: 'stapel'; eintraege: Eintrag[]; gruppen: Gruppe[]; weideplan?: Weideplan; pacht?: PachtListe }
  // Flächen: Frist erledigt (alle mit Schreibrecht) bzw. Pacht (nur Admin/Inhaber; vertraulich)
  | { art: 'frist-erledigt'; eintragId: string; fristId: string; datum: string | null; autor?: string; autorId?: string }
  | { art: 'pacht'; id: string; pacht: Pacht | null; basisGeaendert?: string }
  // Weideplan (gemeinsame Logik mit dem Server: server/weideplan.js)
  | { art: 'plan-herde'; herde: Pick<Herde, 'id' | 'name'> & { farbe?: string } }
  | { art: 'plan-herde-delete'; id: string }
  | { art: 'plan-belegung'; belegung: Belegung; basisGeaendert?: string }
  | { art: 'plan-belegung-delete'; id: string }
  | { art: 'plan-umtrieb'; op: UmtriebOp }
  | { art: 'plan-zurueck'; id: string }
  | { art: 'plan-bewegung-delete'; id: string }
  | { art: 'plan-einstellungen'; ruhetage?: number; ruhe?: Record<string, number | null> }

// Weideplan-Änderung anwenden – mit derselben Logik wie der Server (Umtriebe ändern ggf. auch Tierzahlen auf der Karte)
function planAnwenden(liste: Eintrag[], plan: Weideplan | null, a: Ausstehend, ich: { id?: string; name?: string } | null): { liste: Eintrag[]; plan: Weideplan | null } {
  if (a.art === 'stapel') {
    if (!a.weideplan) return { liste, plan }
    const k = { weideplan: structuredClone(plan ?? WP.planLeer()), eintraege: liste }
    WP.planErgaenzen(k, a.weideplan, new Set(ich?.id ? [ich.id] : []), new Date().toISOString())
    return { liste, plan: k.weideplan }
  }
  if (!a.art.startsWith('plan-')) return { liste, plan }
  const jetzt = new Date().toISOString()
  const k = { weideplan: plan ? structuredClone(plan) : undefined, eintraege: a.art === 'plan-umtrieb' || a.art === 'plan-zurueck' ? liste.map((e) => ({ ...e })) : liste }
  switch (a.art) {
    case 'plan-herde': WP.herdeSetzen(k, a.herde, ich, jetzt); break
    case 'plan-herde-delete': WP.herdeLoeschen(k, a.id); break
    case 'plan-belegung': WP.belegungSetzen(k, a.belegung, ich, a.belegung.geaendert || jetzt); break
    case 'plan-belegung-delete': WP.belegungLoeschen(k, a.id); break
    case 'plan-umtrieb': WP.umtrieb(k, a.op, ich, jetzt); break
    case 'plan-zurueck': WP.umtriebZurueck(k, a.id, ich, jetzt); break
    case 'plan-bewegung-delete': WP.bewegungLoeschen(k, a.id); break
    case 'plan-einstellungen': WP.einstellungenSetzen(k, a); break
  }
  WP.planAufraeumen(k)
  return { liste: k.eintraege as Eintrag[], plan: k.weideplan ?? null }
}

// Eine Änderung auf eine Liste anwenden (lokal sofort und als Overlay über Serverdaten)
function anwenden(liste: Eintrag[], a: Ausstehend): Eintrag[] {
  switch (a.art) {
    case 'put': {
      const alt = liste.find((x) => x.id === a.eintrag.id)
      const neu = migrieren(a.eintrag)
      // Notizen nie über das Eintragsformular überschreiben – nur über Notiz-Aktionen
      // Gruppe ebenso nur über „zuordnen“ ändern (der Server macht es genauso)
      const e = alt ? FL.erledigtUebernehmen({ ...neu, notizen: alt.notizen, gruppe: alt.gruppe }, alt) : neu
      return alt ? liste.map((x) => (x.id === e.id ? e : x)) : [...liste, e]
    }
    case 'delete':
      return liste.filter((x) => x.id !== a.id)
    case 'notiz-put':
      return liste.map((x) => (x.id === a.eintragId ? { ...x, notizen: [...x.notizen.filter((n) => n.id !== a.notiz.id), a.notiz] } : x))
    case 'notiz-delete':
      return liste.map((x) => (x.id === a.eintragId ? { ...x, notizen: x.notizen.filter((n) => n.id !== a.notizId) } : x))
    case 'geprueft':
      return liste.map((x) => (x.id === a.eintragId ? IS.pruefungEintragen(x, a.pruefung) : x))
    case 'spannung':
      return liste.map((x) => (x.id === a.eintragId ? SP.spannungEintragen(x, a.messung) : x))
    case 'frist-erledigt':
      return liste.map((x) => (x.id === a.eintragId && x.typ === 'flaeche' && x.steckbrief?.fristen ? { ...x, steckbrief: { ...x.steckbrief, fristen: x.steckbrief.fristen.map((f) => (f.id !== a.fristId ? f : a.datum === null ? { ...f, erledigt: undefined } : { ...f, erledigt: { datum: a.datum, am: new Date().toISOString(), ...(a.autor ? { autor: a.autor } : {}), ...(a.autorId ? { autorId: a.autorId } : {}) } })) } } : x))
    case 'gruppe-put':
    case 'reihenfolge':
      return liste
    case 'gruppe-delete':
      return liste.map((x) => (x.gruppe === a.id ? { ...x, gruppe: undefined } : x))
    case 'zuordnen':
      return liste.map((x) => (a.ids.includes(x.id) ? { ...x, gruppe: a.gruppe ?? undefined } : x))
    case 'stapel': {
      const ids = new Set(liste.map((x) => x.id))
      return [...liste, ...a.eintraege.filter((x) => !ids.has(x.id)).map(migrieren)]
    }
    default:
      return liste // Weideplan-Änderungen: siehe planAnwenden
  }
}
// Pacht-Änderung anwenden (Overlay über den Serverstand)
function pachtAnwenden(pacht: PachtListe, a: Ausstehend, liste: Eintrag[]): PachtListe {
  if (a.art === 'pacht') { const n = { ...pacht }; if (a.pacht) n[a.id] = a.pacht; else delete n[a.id]; return n }
  if (a.art === 'delete' && pacht[a.id]) { const n = { ...pacht }; delete n[a.id]; return n }
  if (a.art === 'stapel' && a.pacht) { const n = { ...pacht }; for (const [id, x] of Object.entries(a.pacht)) if (!n[id] && liste.some((e) => e.id === id)) n[id] = x; return n }
  return pacht
}
function gruppenAnwenden(gruppen: Gruppe[], a: Ausstehend): Gruppe[] {
  if (a.art === 'gruppe-put') {
    const alt = gruppen.find((g) => g.id === a.gruppe.id)
    return alt ? gruppen.map((g) => (g.id === a.gruppe.id ? { ...g, name: a.gruppe.name, farbe: a.gruppe.farbe ?? g.farbe } : g)) : [...gruppen, a.gruppe]
  }
  if (a.art === 'gruppe-delete') return gruppen.filter((g) => g.id !== a.id)
  // wie der Server: aus alten Gruppen entfernen, in der neuen hinten anhängen
  if (a.art === 'zuordnen') return gruppen.map((g) => {
    const ohne = (g.reihenfolge ?? []).filter((id) => !a.ids.includes(id))
    return g.id === a.gruppe ? { ...g, reihenfolge: [...ohne, ...a.ids] } : { ...g, reihenfolge: ohne }
  })
  if (a.art === 'reihenfolge') return gruppen.map((g) => (g.id === a.gruppe ? { ...g, reihenfolge: a.ids } : g))
  if (a.art === 'stapel') {
    // wie der Server: neue Gruppen anhängen; neue Nadeln hinten an die Nummernfolge ihrer Gruppe
    const neu = a.gruppen.filter((g) => !gruppen.some((x) => x.id === g.id)).map((g) => ({ ...g, reihenfolge: [] as string[] }))
    return [...gruppen, ...neu].map((g) => {
      const vorgabe = a.gruppen.find((x) => x.id === g.id)?.reihenfolge ?? []
      const mitglieder = a.eintraege.filter((e) => e.gruppe === g.id).map((e) => e.id)
      const dazu = [...vorgabe.filter((id) => mitglieder.includes(id)), ...mitglieder].filter((id) => !(g.reihenfolge ?? []).includes(id))
      return dazu.length ? { ...g, reihenfolge: [...(g.reihenfolge ?? []), ...new Set(dazu)] } : g
    })
  }
  return gruppen
}
// Autor-Anzeige aktuell halten: Notizen mit Nutzer-ID bekommen den aktuellen Namen vom Server.
// Ist die ID nicht (mehr) auflösbar (z. B. Nutzer entfernt, alte Notiz ohne ID), bleibt der gespeicherte Name.
function namenAnwenden(liste: Eintrag[], namen?: Record<string, string>): Eintrag[] {
  if (!namen) return liste
  return liste.map((e) => (e.notizen.some((n) => n.autorId && namen[n.autorId] && namen[n.autorId] !== n.autor)
    ? { ...e, notizen: e.notizen.map((n) => (n.autorId && namen[n.autorId] ? { ...n, autor: namen[n.autorId] } : n)) }
    : e))
}
export const NAME_MAX = 40
export type SyncStatus = 'lokal' | 'verbunden' | 'offline' | 'verbinde'

// Kartendaten (Einträge, Gruppen, Name/Rolle) liegen in IndexedDB (src/speicher.ts).
// Der Postausgang (noch nicht gesendete Änderungen) wird zusätzlich sofort und synchron in localStorage geschrieben,
// damit auch ein Neuladen direkt nach einer Änderung nichts verliert.
const cacheKey = (id: string | null) => (id ? `wt-karte-${id}` : 'wt-lokal')
const queueKey = (id: string) => `wt-queue-${id}`
const ausgangKey = (id: string) => `wt-ausgang-${id}`
const gruppenKey = (id: string | null) => (id ? `wt-gruppen-${id}` : 'wt-lokal-gruppen')
const metaKey = (id: string) => `wt-meta-${id}`
const planKey = (id: string | null) => (id ? `wt-plan-${id}` : 'wt-lokal-plan')
const pachtKey = (id: string | null) => (id ? `wt-pacht-${id}` : 'wt-lokal-pacht')
interface Meta { name?: string; ich?: Ich | null; hof?: HofKurz | null; sync?: string }
function queueLaden(id: string): Ausstehend[] {
  try { const v = localStorage.getItem(queueKey(id)); if (v) return JSON.parse(v) } catch { /* kaputt */ }
  return lesen<Ausstehend[]>(ausgangKey(id), [])
}
// Anfrage mit Zeitlimit (schlechter Empfang am Deich: lieber abbrechen und später erneut senden)
async function mitZeitlimit(url: string, init: RequestInit, ms = 15000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...init, signal: ac.signal }) } finally { clearTimeout(t) }
}
export interface Konflikt { art: 'geaendert' | 'wiederhergestellt' | 'nicht-geloescht' | 'plan-geaendert' | 'umtrieb-doppelt' | 'umtrieb-weg' | 'umtrieb-zurueck' | 'geprueft-weg' | 'spannung-weg' | 'frist-weg' | 'pacht-weg' | 'pacht-geaendert' | 'zaun-doppelt'; titel: string; mit?: string; gewonnen?: boolean }
export function konfliktText(k: Konflikt): string {
  const wer = k.mit ? k.mit : 'jemand anderes'
  const t = k.titel ? `„${k.titel}“` : 'Ein Eintrag'
  if (k.art === 'umtrieb-doppelt') return `Umtrieb von „${k.titel}“ nicht gespeichert: ${wer} hatte die Herde inzwischen schon umgetrieben bzw. abgetrieben.`
  if (k.art === 'umtrieb-weg') return 'Ein Umtrieb wurde nicht gespeichert, weil die Belegung inzwischen gelöscht wurde.'
  if (k.art === 'umtrieb-zurueck') return `Umtrieb von „${k.titel}“ kann nicht mehr rückgängig gemacht werden – die Herde wurde inzwischen weiter umgetrieben.`
  if (k.art === 'plan-geaendert') return k.gewonnen ? `Weideplan „${k.titel}“: ${wer} hatte gleichzeitig geändert – deine Fassung ist neuer und gilt.` : `Weideplan „${k.titel}“: ${wer} hat später geändert – diese Fassung gilt, deine Änderung wurde verworfen.`
  if (k.art === 'frist-weg') return `Eine Frist${k.titel ? ` an „${k.titel}“` : ''} wurde nicht als erledigt gespeichert, weil es sie inzwischen nicht mehr gibt.`
  if (k.art === 'pacht-weg') return 'Pachtdaten wurden nicht gespeichert, weil die Fläche inzwischen gelöscht wurde.'
  if (k.art === 'pacht-geaendert') return k.gewonnen ? `Pacht „${k.titel}“: wurde gleichzeitig auf einem anderen Gerät geändert – deine Fassung ist neuer und gilt.` : `Pacht „${k.titel}“: wurde auf einem anderen Gerät später geändert – diese Fassung gilt, deine Änderung wurde verworfen.`
  if (k.art === 'spannung-weg') return 'Eine Spannungsmessung wurde nicht gespeichert, weil der Eintrag inzwischen gelöscht wurde.'
  if (k.art === 'zaun-doppelt') return `Zaun nicht gespeichert: ${k.titel ? `die Fläche „${k.titel}“` : 'Diese Fläche'} hat schon einen Zaun${k.mit ? ` (von ${k.mit})` : ''}. Pro Fläche gibt es nur einen Zaun – bitte den vorhandenen bearbeiten oder entfernen.`
  if (k.art === 'geprueft-weg') return 'Eine Geräte-Prüfung wurde nicht gespeichert, weil das Weidezaungerät inzwischen gelöscht wurde.'
  if (k.art === 'nicht-geloescht') return `${t} wurde nicht gelöscht, weil ${wer} den Eintrag inzwischen geändert hat.`
  if (k.art === 'wiederhergestellt') return `${t} war inzwischen gelöscht worden – deine Änderung hat den Eintrag wiederhergestellt.`
  return k.gewonnen
    ? `${t}: ${wer} hatte den Eintrag zur selben Zeit geändert. Deine Fassung ist neuer und gilt – die andere steht als Notiz am Eintrag.`
    : `${t}: ${wer} hat den Eintrag später als du geändert. Diese Fassung gilt – deine steht als Notiz am Eintrag.`
}

export interface Geloescht { am: string; bis: string; hof?: boolean }

// 7o: Handy-Karte (lokal, ohne Server) – Einträge, die noch nicht auf eine geteilte Karte übernommen wurden
const UEBERNOMMEN = 'wt-lokal-uebernommen'
export function lokaleKarteOffen(ziel: Eintrag[]): { eintraege: Eintrag[]; gruppen: Gruppe[]; schonDa: string[] } {
  const fertig = new Set(lesenLs<string[]>(UEBERNOMMEN, []))
  const da = new Map(ziel.map((e) => [e.id, e]))
  // gleiche ID mit gleichem Stand liegt schon auf der Karte (z. B. per „Geteilte Karte erstellen“) -> nicht erneut anbieten
  const gleich = (e: Eintrag) => { const z = da.get(e.id); return !!z && z.typ === e.typ && z.geaendert === e.geaendert && (z.titel || '') === (e.titel || '') }
  const offen = lesen<Eintrag[]>(cacheKey(null), []).map(migrieren).filter((e) => !fertig.has(e.id))
  return { eintraege: offen.filter((e) => !gleich(e)), schonDa: offen.filter(gleich).map((e) => e.id), gruppen: lesen<Gruppe[]>(gruppenKey(null), []) }
}
export function lokaleMarkieren(ids: string[], an: boolean) {
  const l = new Set(lesenLs<string[]>(UEBERNOMMEN, []))
  for (const id of ids) if (an) l.add(id); else l.delete(id)
  if (l.size) localStorage.setItem(UEBERNOMMEN, JSON.stringify([...l])); else localStorage.removeItem(UEBERNOMMEN)
}
// Erst NACH bestätigter Übernahme (alle Einträge auf dem Server) aufrufen: entfernt nur die übernommenen Einträge
export async function lokaleUebernommeneEntfernen(ids: string[]) {
  const weg = new Set(ids)
  const rest = lesen<Eintrag[]>(cacheKey(null), []).filter((e) => !weg.has(e.id))
  if (rest.length) schreiben(cacheKey(null), rest)
  else { entfernen(cacheKey(null)); entfernen(gruppenKey(null)) }
  lokaleMarkieren(ids, false)
  await schreibenJetzt()
}
const lesenLs = <T,>(k: string, f: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f } catch { return f } }
// 7p: auch das Cookie (Karte+Zugang) vergessen, sonst leitet „/“ wieder auf die Karte
export const geraetCookieVergessen = () => fetch('/api/geraet/vergessen', { method: 'POST' }).catch(() => null)
export const zurHandyKarte = async () => { localStorage.removeItem(LETZTE_KARTE); await geraetCookieVergessen(); location.href = location.pathname }

// Alles, was dieses Gerät zu einer Karte gespeichert hat, entfernen (Zugang, Kopie, Postausgang)
export async function geraetVergessen(id: string) {
  for (const key of [zugangKey(id), queueKey(id)]) localStorage.removeItem(key)
  if (localStorage.getItem(LETZTE_KARTE) === id) localStorage.removeItem(LETZTE_KARTE)
  for (const key of [cacheKey(id), gruppenKey(id), metaKey(id), ausgangKey(id), planKey(id), pachtKey(id)]) entfernen(key)
  await schreibenJetzt()
}

export function useKarte() {
  const { karteId, zugang, einladung } = PARAMS
  const meta0 = karteId ? lesen<Meta>(metaKey(karteId), {}) : {}
  const [eintraege, setEintraege] = useState<Eintrag[]>(() => lesen<Eintrag[]>(cacheKey(karteId), []).map(migrieren))
  const [gruppen, setGruppen] = useState<Gruppe[]>(() => lesen<Gruppe[]>(gruppenKey(karteId), []))
  const [weideplan, setWeideplan] = useState<Weideplan | null>(() => lesen<Weideplan | null>(planKey(karteId), null))
  // Pacht (Verpächter, Preise, Laufzeiten): nur Admin/Inhaber bekommen sie vom Server; lokale Karte: immer
  const [pacht, setPacht] = useState<PachtListe>(() => lesen<PachtListe>(pachtKey(karteId), {}))
  const pachtVersion = useRef<number | null>(null)
  const pachtHolenRef = useRef<() => void>(() => {})
  const [status, setStatus] = useState<SyncStatus>(karteId ? (navigator.onLine === false ? 'offline' : 'verbinde') : 'lokal')
  const [serverStartet, setServerStartet] = useState(false) // 7s: Verbindung braucht länger (Render-Kaltstart) – Karte kommt vom Gerät
  // Name/Rolle vom letzten Kontakt mit dem Server: so kann man auch nach einem Neustart ohne Netz weiterarbeiten
  const [ich, setIch] = useState<Ich | null>(zugang ? meta0.ich ?? null : null)
  const [hinweis, setHinweis] = useState('')
  const [kartenName, setKartenName] = useState<string>(meta0.name ?? '')
  const [hof, setHof] = useState<HofKurz | null>(meta0.hof ?? null)
  const [letzteSync, setLetzteSync] = useState<string | null>(meta0.sync ?? null)
  const [konflikte, setKonflikte] = useState<Konflikt[]>([])
  // Karte im Papierkorb (gelöscht, 30 Tage wiederherstellbar) – dann ist nichts mehr bearbeitbar
  const [geloescht, setGeloescht] = useState<Geloescht | null>(null)
  const [darfLoeschen, setDarfLoeschen] = useState(false)
  const nutzerVersion = useRef<number | null>(null)
  const [nutzerStand, setNutzerStand] = useState(0) // ändert sich bei jeder Nutzerlisten-Änderung (z. B. Beitritt per Einladung)
  const darfBearbeiten = !karteId || (!!ich && ich.rolle !== 'ansehen' && !geloescht)
  const istAdmin = !karteId || ich?.rolle === 'admin'
  const queue = useRef<Ausstehend[]>(karteId ? queueLaden(karteId) : [])
  const eintraegeRef = useRef(eintraege)
  eintraegeRef.current = eintraege
  const planRef = useRef(weideplan)
  planRef.current = weideplan
  const pachtRef = useRef(pacht)
  pachtRef.current = pacht
  // Wer ändert? (für das Umtriebs-Protokoll; lokale Karte: Name aus den Einstellungen)
  const ichRef = useRef<{ id?: string; name?: string } | null>(null)
  ichRef.current = karteId ? ich : { name: localStorage.getItem('wt-autor') || '' }
  const [wartend, setWartend] = useState(queue.current.length) // Anzahl Änderungen im Postausgang

  const headers = { 'Content-Type': 'application/json', ...(zugang ? { 'x-zugang': zugang } : {}) }

  // Wer bin ich auf dieser Karte? (bei Rollen-/Nutzeränderungen neu laden)
  const ichLaden = useCallback(async (mitEintraegen = false): Promise<boolean> => {
    if (!karteId) return true
    try {
      const r = await mitZeitlimit(`/api/karten/${karteId}`, { headers })
      if (r.status === 410) { const j = await r.json().catch(() => ({})); setGeloescht(j.geloescht ?? { am: '', bis: '' }); setDarfLoeschen(false); return true }
      if (r.status >= 500) return false // Server startet noch (Render: 502/503) -> später erneut
      if (!r.ok) return true
      const k = await r.json()
      setGeloescht(k.geloescht ?? null)
      setDarfLoeschen(!!k.darfLoeschen)
      setKartenName(k.name)
      setHof(k.hof ?? null)
      schreiben(metaKey(karteId), { ...lesen<Meta>(metaKey(karteId), {}), name: k.name, ich: k.ich ?? null, hof: k.hof ?? null })
      nutzerVersion.current = k.nutzerVersion
      setIch((alt) => {
        if (zugang && alt && !k.ich) setHinweis('Dein Zugang ist nicht mehr gültig – du kannst die Karte nur noch ansehen.')
        return k.ich
      })
      if (mitEintraegen) {
        let liste: Eintrag[] = namenAnwenden(k.eintraege.map(migrieren), k.namen)
        let gl: Gruppe[] = k.gruppen ?? []
        let plan: Weideplan | null = k.weideplan ?? null
        for (const a of queue.current) { liste = anwenden(liste, a); gl = gruppenAnwenden(gl, a); ({ liste, plan } = planAnwenden(liste, plan, a, k.ich)) }
        setEintraege(liste)
        setGruppen(gl)
        setWeideplan(plan)
      }
      // Pacht nur für Admins/Inhaber (sonst auch die Kopie auf dem Gerät leeren, z. B. nach Rollenwechsel)
      if (k.ich?.rolle === 'admin') {
        pachtVersion.current = k.pachtVersion ?? 0
        let pa: PachtListe = k.pacht ?? {}
        for (const a of queue.current) pa = pachtAnwenden(pa, a, eintraegeRef.current)
        setPacht(pa)
      } else { pachtVersion.current = null; setPacht({}) }
      return true
    } catch { return false /* offline oder Zeitlimit (Server wacht noch auf) */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  // Offline-Speicher aktuell halten (IndexedDB)
  useEffect(() => { schreiben(cacheKey(karteId), eintraege) }, [eintraege, karteId])
  useEffect(() => { schreiben(gruppenKey(karteId), gruppen) }, [gruppen, karteId])
  useEffect(() => { schreiben(planKey(karteId), weideplan) }, [weideplan, karteId])
  useEffect(() => { schreiben(pachtKey(karteId), pacht) }, [pacht, karteId])

  const queueSpeichern = () => {
    if (!karteId) return
    setWartend(queue.current.length)
    try { localStorage.setItem(queueKey(karteId), JSON.stringify(queue.current)) } catch { /* voll – IndexedDB hat die Kopie */ }
    schreiben(ausgangKey(karteId), queue.current)
  }
  const synchronisiert = () => {
    if (!karteId) return
    const jetzt = new Date().toISOString()
    setLetzteSync(jetzt)
    schreiben(metaKey(karteId), { ...lesen<Meta>(metaKey(karteId), {}), sync: jetzt })
  }
  const konfliktMelden = (k: Konflikt) => { setKonflikte((l) => [...l.slice(-19), k]); setHinweis(konfliktText(k)) }

  const senden = useCallback(async (a: Ausstehend) => {
    const basis = `/api/karten/${karteId}/eintraege/`
    const wp = `/api/karten/${karteId}/weideplan`
    const [url, method, body] =
      a.art === 'put' ? [basis + a.eintrag.id, 'PUT', { ...a.eintrag, ...(a.basis ? { einheitenBasis: a.basis } : {}), ...(a.basisGeaendert ? { basisGeaendert: a.basisGeaendert } : {}) }]
      : a.art === 'delete' ? [basis + a.id + (a.basisGeaendert ? `?basis=${encodeURIComponent(a.basisGeaendert)}` : ''), 'DELETE', undefined]
      : a.art === 'notiz-put' ? [`${basis}${a.eintragId}/notizen/${a.notiz.id}`, 'PUT', a.notiz]
      : a.art === 'notiz-delete' ? [`${basis}${a.eintragId}/notizen/${a.notizId}`, 'DELETE', undefined]
      : a.art === 'geprueft' ? [`${basis}${a.eintragId}/geprueft`, 'POST', { id: a.pruefung.id, datum: a.pruefung.datum, kv: a.pruefung.kv, stand: a.pruefung.stand }]
      : a.art === 'spannung' ? [`${basis}${a.eintragId}/spannung`, 'POST', { datum: a.messung.datum, kv: a.messung.kv, zeitpunkt: a.messung.zeitpunkt }]
      : a.art === 'gruppe-put' ? [`/api/karten/${karteId}/gruppen/${a.gruppe.id}`, 'PUT', { name: a.gruppe.name, ...(a.gruppe.farbe ? { farbe: a.gruppe.farbe } : {}) }]
      : a.art === 'reihenfolge' ? [`/api/karten/${karteId}/gruppen/${a.gruppe}/reihenfolge`, 'PUT', { ids: a.ids }]
      : a.art === 'gruppe-delete' ? [`/api/karten/${karteId}/gruppen/${a.id}`, 'DELETE', undefined]
      : a.art === 'stapel' ? [`/api/karten/${karteId}/stapel`, 'POST', { eintraege: a.eintraege, gruppen: a.gruppen, ...(a.weideplan ? { weideplan: a.weideplan } : {}), ...(a.pacht ? { pacht: a.pacht } : {}) }]
      : a.art === 'frist-erledigt' ? [`${basis}${a.eintragId}/fristen/${a.fristId}/erledigt`, 'POST', { datum: a.datum }]
      : a.art === 'pacht' ? [`/api/karten/${karteId}/pacht/${a.id}`, 'PUT', { pacht: a.pacht, ...(a.basisGeaendert ? { basisGeaendert: a.basisGeaendert } : {}) }]
      : a.art === 'plan-herde' ? [`${wp}/herden/${a.herde.id}`, 'PUT', a.herde]
      : a.art === 'plan-herde-delete' ? [`${wp}/herden/${a.id}`, 'DELETE', undefined]
      : a.art === 'plan-belegung' ? [`${wp}/belegungen/${a.belegung.id}`, 'PUT', { belegung: a.belegung, ...(a.basisGeaendert ? { basisGeaendert: a.basisGeaendert } : {}) }]
      : a.art === 'plan-belegung-delete' ? [`${wp}/belegungen/${a.id}`, 'DELETE', undefined]
      : a.art === 'plan-umtrieb' ? [`${wp}/umtrieb`, 'POST', a.op]
      : a.art === 'plan-zurueck' ? [`${wp}/umtrieb/${a.id}/zurueck`, 'POST', {}]
      : a.art === 'plan-bewegung-delete' ? [`${wp}/bewegungen/${a.id}`, 'DELETE', undefined]
      : a.art === 'plan-einstellungen' ? [`${wp}/einstellungen`, 'PUT', { ruhetage: a.ruhetage, ruhe: a.ruhe }]
      : [`/api/karten/${karteId}/gruppe-zuordnen`, 'POST', { gruppe: a.gruppe, ids: a.ids }]
    const r = await mitZeitlimit(url, { method, headers, body: body ? JSON.stringify(body) : undefined }, a.art === 'stapel' ? 60000 : 15000)
    const j = await r.json().catch(() => ({}))
    // Löschen abgelehnt, weil inzwischen von jemand anderem geändert -> nichts geht verloren, Nutzer wird informiert
    if (r.status === 409 && j.konflikt) throw Object.assign(new Error('Konflikt'), { endgueltig: true, konflikt: j.konflikt as Konflikt })
    // Karte gelöscht: Änderung bleibt im Postausgang (falls die Karte wiederhergestellt wird, geht nichts verloren)
    if (r.status === 410) { setGeloescht(j.geloescht ?? { am: '', bis: '' }); throw new Error('Karte gelöscht') }
    // Ungültige Daten werden auch beim nächsten Versuch abgelehnt -> verwerfen und Grund anzeigen (statt Postausgang zu blockieren)
    if (r.status === 400) throw Object.assign(new Error('Abgelehnt'), { endgueltig: true, meldung: `Eine Änderung wurde vom Server abgelehnt: ${j.fehler || 'ungültig'}` })
    if (r.status === 403 || r.status === 404) throw Object.assign(new Error('Nur Lesezugriff'), { endgueltig: true })
    if (!r.ok) throw new Error('Serverfehler ' + r.status)
    if (j.konflikt) konfliktMelden(j.konflikt as Konflikt)
    // Pacht-Konflikt verloren: Serverfassung holen (sonst bliebe die verworfene lokale Fassung stehen)
    if (a.art === 'pacht' && j.konflikt && !j.konflikt.gewonnen) setTimeout(() => pachtHolenRef.current(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  const laeuft = useRef(false)
  const queueAbarbeiten = useCallback(async () => {
    if (laeuft.current) return // nur ein Durchlauf gleichzeitig, sonst werden Einträge doppelt/gar nicht gesendet
    laeuft.current = true
    let abgelehnt = false
    try {
    while (queue.current.length) {
      try {
        await senden(queue.current[0])
      } catch (e) {
        const f = e as { endgueltig?: boolean; konflikt?: Konflikt; meldung?: string }
        // 7s: während die Verbindung noch aufgebaut wird (Server startet) bleibt es bei „Verbinde …“
        if (!f.endgueltig) { setStatus((st) => (st === 'verbinde' && navigator.onLine !== false ? st : 'offline')); break }
        if (f.konflikt) konfliktMelden(f.konflikt)
        // Vom Server abgelehnt (keine Berechtigung): Hinweis + Serverstand wiederherstellen
        else setHinweis(f.meldung ?? 'Eine Änderung wurde vom Server abgelehnt (keine Berechtigung mehr) und verworfen.')
        abgelehnt = true
      }
      queue.current.shift()
      queueSpeichern()
    }
    } finally { laeuft.current = false }
    if (!queue.current.length) { synchronisiert(); if (navigator.onLine !== false) setStatus((st) => (st === 'offline' ? 'verbunden' : st)) }
    if (abgelehnt) ichLaden(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senden, ichLaden])

  const pachtHolen = useCallback(async () => {
    if (!karteId || !zugang) return
    try {
      const r = await mitZeitlimit(`/api/karten/${karteId}/pacht`, { headers })
      if (r.status === 403) { setPacht({}); return }
      if (!r.ok) return
      const j = await r.json()
      pachtVersion.current = j.pachtVersion ?? 0
      let pa: PachtListe = j.pacht ?? {}
      for (const a of queue.current) pa = pachtAnwenden(pa, a, eintraegeRef.current)
      setPacht(pa)
    } catch { /* offline */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])
  useEffect(() => { pachtHolenRef.current = pachtHolen }, [pachtHolen])

  // Live-Verbindung (SSE) zum Server
  // 7s: Render Free schläft – der erste Aufruf kann ~1 min dauern. Bis dahin zeigt die App die Karte vom Gerät,
  // Status „Verbinde …“ (nicht „Offline“, solange das Handy Netz hat) und versucht es mit wachsendem Abstand erneut.
  useEffect(() => {
    if (!karteId) return
    const STUFEN = [2000, 5000, 15000, 30000, 90000]
    let weg = false, es: EventSource | null = null, esTimer = 0, ladeTimer = 0, esVersuch = 0, ladeVersuch = 0, ichOk = false
    const langsam = window.setTimeout(() => setServerStartet(true), 2500)
    const laden = async () => {
      window.clearTimeout(ladeTimer)
      if (weg) return
      ichOk = await ichLaden()
      if (!ichOk && !weg) ladeTimer = window.setTimeout(laden, STUFEN[Math.min(ladeVersuch++, STUFEN.length - 1)])
      else ladeVersuch = 0
    }
    laden()
    const aufbauen = () => {
      window.clearTimeout(esTimer)
      if (weg) return
      es?.close()
      es = new EventSource(`/api/karten/${karteId}/live`)
      es.addEventListener('karte', (ev) => {
        esVersuch = 0
        window.clearTimeout(langsam); setServerStartet(false)
        if (!ichOk) laden()
        const k = JSON.parse((ev as MessageEvent).data)
        setKartenName(k.name)
        setHof((alt) => (k.hof ? { ...alt, ...k.hof } : null))
        setStatus('verbunden')
        if (!queue.current.length) synchronisiert()
        // Nutzerliste geändert (z. B. Rolle geändert oder Zugang entfernt) -> eigene Rechte neu holen
        if (nutzerVersion.current !== null && k.nutzerVersion !== nutzerVersion.current) { ichLaden(); setNutzerStand(k.nutzerVersion) }
        // Lokale, noch nicht gesendete Änderungen obenauf legen
        let liste: Eintrag[] = namenAnwenden(k.eintraege.map(migrieren), k.namen)
        let gl: Gruppe[] = k.gruppen ?? []
        let plan: Weideplan | null = k.weideplan ?? null
        for (const a of queue.current) { liste = anwenden(liste, a); gl = gruppenAnwenden(gl, a); ({ liste, plan } = planAnwenden(liste, plan, a, ichRef.current)) }
        setEintraege(liste)
        setGruppen(gl)
        setWeideplan(plan)
        // Pacht kommt nie über den (öffentlichen) Live-Stream – nur der Zähler; Admins holen den neuen Stand mit ihrem Zugang
        if (pachtVersion.current !== null && (k.pachtVersion ?? 0) !== pachtVersion.current) pachtHolen()
        if (queue.current.length) queueAbarbeiten()
      })
      // Fehler: ohne Netz „Offline“; mit Netz „Verbinde … Server startet“ und neu aufbauen nach 2/5/15/30/90 s.
      // Erst wenn alle Stufen durch sind (~2,5 min), gilt es als offline – weiterversucht wird trotzdem alle 90 s.
      es.onerror = () => {
        const zu = es?.readyState === EventSource.CLOSED
        es?.close()
        const n = esVersuch++
        if (navigator.onLine === false) setStatus('offline')
        else { setServerStartet(true); setStatus((st) => (n >= STUFEN.length ? 'offline' : st === 'verbunden' ? 'verbinde' : st)) }
        // Verbindung endgültig abgelehnt (z. B. Karte gelöscht) -> Stand vom Server holen
        if (zu) laden()
        window.clearTimeout(esTimer)
        esTimer = window.setTimeout(aufbauen, STUFEN[Math.min(n, STUFEN.length - 1)])
      }
    }
    aufbauen()
    const online = () => { setStatus((s) => (s === 'offline' ? 'verbinde' : s)); esVersuch = 0; ladeVersuch = 0; queueAbarbeiten(); laden(); aufbauen() }
    const offline = () => setStatus('offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    // Postausgang regelmäßig erneut versuchen (z. B. wenn der Empfang nur kurz da war)
    const t = setInterval(() => { if (queue.current.length && navigator.onLine !== false) queueAbarbeiten() }, 20000)
    return () => { weg = true; es?.close(); clearInterval(t); window.clearTimeout(esTimer); window.clearTimeout(ladeTimer); window.clearTimeout(langsam); window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId])

  const ausfuehren = useCallback((a: Ausstehend) => {
    if (a.art.startsWith('plan-') || (a.art === 'stapel' && a.weideplan)) {
      const r = planAnwenden(anwenden(eintraegeRef.current, a), planRef.current, a, ichRef.current)
      eintraegeRef.current = r.liste; planRef.current = r.plan
      setEintraege(r.liste); setWeideplan(r.plan)
      if (a.art === 'stapel') { setGruppen((g) => gruppenAnwenden(g, a)); const pa = pachtAnwenden(pachtRef.current, a, r.liste); pachtRef.current = pa; setPacht(pa) }
      if (karteId) { queue.current.push(a); queueSpeichern(); queueAbarbeiten() }
      return
    }
    const liste = anwenden(eintraegeRef.current, a)
    eintraegeRef.current = liste
    setEintraege(liste)
    setGruppen((g) => gruppenAnwenden(g, a))
    const pa = pachtAnwenden(pachtRef.current, a, liste)
    if (pa !== pachtRef.current) { pachtRef.current = pa; setPacht(pa) }
    if (karteId) { queue.current.push(a); queueSpeichern(); queueAbarbeiten() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, queueAbarbeiten])

  // basis: Stand der Tiereinheiten beim Öffnen des Formulars; ohne Angabe der aktuelle Stand auf diesem Gerät
  const speichern = useCallback((e: Eintrag, basis?: Einheit[]) => {
    const alt = eintraegeRef.current.find((x) => x.id === e.id)
    ausfuehren({ art: 'put', eintrag: e, basis: basis ?? alt?.einheiten ?? [], ...(alt ? { basisGeaendert: alt.geaendert } : {}) })
  }, [ausfuehren])
  const loeschen = useCallback((id: string) => {
    const alt = eintraegeRef.current.find((x) => x.id === id)
    ausfuehren({ art: 'delete', id, ...(alt ? { basisGeaendert: alt.geaendert, titel: alt.titel } : {}) })
  }, [ausfuehren])
  const notizSpeichern = useCallback((eintragId: string, notiz: Notiz) => ausfuehren({ art: 'notiz-put', eintragId, notiz }), [ausfuehren])
  const notizLoeschen = useCallback((eintragId: string, notizId: string) => ausfuehren({ art: 'notiz-delete', eintragId, notizId }), [ausfuehren])
  const geprueft = useCallback((eintragId: string, p: Omit<Pruefung, 'id' | 'autor' | 'autorId' | 'zeitpunkt'>) => {
    const ich = ichRef.current
    ausfuehren({ art: 'geprueft', eintragId, pruefung: { ...p, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), zeitpunkt: new Date().toISOString(), ...(ich?.name ? { autor: ich.name } : {}), ...(ich?.id ? { autorId: ich.id } : {}) } })
  }, [ausfuehren])
  // Zaunspannung messen: Datum/Uhrzeit/Person automatisch; gleicher Tag überschreibt
  const spannungMessen = useCallback((eintragId: string, kv: number) => {
    const ich = ichRef.current
    ausfuehren({ art: 'spannung', eintragId, messung: { datum: SP.heute(), kv, zeitpunkt: new Date().toISOString(), ...(ich?.name ? { autor: ich.name } : {}), ...(ich?.id ? { autorId: ich.id } : {}) } })
  }, [ausfuehren])

  // Frist erledigt / wieder offen (datum = Termin, der erledigt ist)
  const fristErledigt = useCallback((eintragId: string, fristId: string, datum: string | null) => {
    const ich = ichRef.current
    ausfuehren({ art: 'frist-erledigt', eintragId, fristId, datum, ...(ich?.name ? { autor: ich.name } : {}), ...(ich?.id ? { autorId: ich.id } : {}) })
  }, [ausfuehren])
  // Pacht einer Fläche speichern (null = löschen); nur Admin/Inhaber
  const pachtSpeichern = useCallback((id: string, p: Pacht | null) => {
    const alt = pachtRef.current[id]
    const neu = p ? FL.pachtSauber({ ...p, geaendert: new Date().toISOString() }) : null
    ausfuehren({ art: 'pacht', id, pacht: neu, ...(alt?.geaendert ? { basisGeaendert: alt.geaendert } : {}) })
  }, [ausfuehren])

  // Eigene Gruppen: anlegen/umbenennen, löschen (Nadeln bleiben, werden ungruppiert), Nadeln zuordnen
  const gruppeSpeichern = useCallback((g: Gruppe) => ausfuehren({ art: 'gruppe-put', gruppe: g }), [ausfuehren])
  const gruppeLoeschen = useCallback((id: string) => ausfuehren({ art: 'gruppe-delete', id }), [ausfuehren])
  const reihenfolge = useCallback((gruppe: string, ids: string[]) => ausfuehren({ art: 'reihenfolge', gruppe, ids }), [ausfuehren])
  const zuordnen = useCallback((gruppe: string | null, ids: string[]) => { if (ids.length) ausfuehren({ art: 'zuordnen', gruppe, ids }) }, [ausfuehren])
  // Import/Wiederherstellen (Admin): ergänzt nur fehlende Einträge/Gruppen – geht offline in den Postausgang
  const stapel = useCallback((eintraege: Eintrag[], gruppen: Gruppe[], plan?: Weideplan, pa?: PachtListe) => { const mitPacht = pa && Object.keys(pa).length ? pa : undefined; if (eintraege.length || gruppen.length || plan || mitPacht) ausfuehren({ art: 'stapel', eintraege, gruppen, ...(plan ? { weideplan: plan } : {}), ...(mitPacht ? { pacht: mitPacht } : {}) }) }, [ausfuehren])
  // Sicherung als NEUE geteilte Karte anlegen (braucht Netz); danach wird die neue Karte geöffnet
  const alsNeueKarte = useCallback(async (name: string, eintraege: Eintrag[], gruppen: Gruppe[], plan?: Weideplan, pa?: PachtListe) => {
    const r = await fetch('/api/karten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, eintraege, gruppen, ...(plan ? { weideplan: plan } : {}), ...(pa && Object.keys(pa).length ? { pacht: pa } : {}), ...(ich?.name ? { adminName: ich.name } : {}) }) })
    if (!r.ok) throw new Error('Server nicht erreichbar – zum Anlegen einer neuen Karte wird Netz gebraucht')
    const k = await r.json()
    localStorage.setItem(zugangKey(k.id), k.zugang)
    schreibenJetzt()
    return { id: k.id as string, zugang: k.zugang as string }
  }, [ich])

  const alleErsetzen = useCallback(async (roh: Eintrag[]) => {
    const liste = roh.map(migrieren)
    setEintraege(liste)
    if (karteId) await fetch(`/api/karten/${karteId}/eintraege`, { method: 'PUT', headers, body: JSON.stringify(liste) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  // Lokale Karte in eine geteilte Server-Karte umwandeln
  const teilen = useCallback(async (name: string) => {
    const r = await fetch('/api/karten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, eintraege, gruppen, ...(weideplan ? { weideplan } : {}), ...(Object.keys(pacht).length ? { pacht } : {}) }) })
    if (!r.ok) throw new Error('Server nicht erreichbar')
    const k = await r.json()
    schreiben(cacheKey(k.id), eintraege)
    schreiben(gruppenKey(k.id), gruppen)
    if (k.weideplan) schreiben(planKey(k.id), k.weideplan)
    if (Object.keys(pacht).length) schreiben(pachtKey(k.id), pacht)
    schreibenJetzt()
    localStorage.setItem(zugangKey(k.id), k.zugang)
    location.href = `${location.pathname}?karte=${k.id}`
  }, [eintraege, gruppen, weideplan, pacht])

  const abmelden = useCallback(() => {
    if (karteId) localStorage.removeItem(zugangKey(karteId))
    location.reload()
  }, [karteId])

  // Eigenen Anzeigenamen ändern (jeder angemeldete Nutzer)
  const nameAendern = useCallback(async (name: string) => {
    const r = await fetch(`/api/karten/${karteId}/ich`, { method: 'PATCH', headers, body: JSON.stringify({ name }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.fehler || `Fehler ${r.status}`)
    setIch(j as Ich)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  // Selbstregistrierung per Einladungslink: Name eingeben -> Server legt Rolle „nutzer“ an -> Zugang am Gerät speichern
  const einladungPruefen = useCallback(async (): Promise<{ gueltig: boolean; karte: string }> => {
    const r = await fetch(`/api/karten/${karteId}/einladung/${encodeURIComponent(einladung ?? '')}`)
    if (!r.ok) return { gueltig: false, karte: '' }
    return r.json()
  }, [karteId, einladung])
  const beitreten = useCallback(async (name: string) => {
    const r = await fetch(`/api/karten/${karteId}/beitreten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: einladung, name }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.fehler || `Fehler ${r.status}`)
    localStorage.setItem(zugangKey(karteId!), j.zugang)
    location.href = `${location.pathname}?karte=${karteId}`
  }, [karteId, einladung])

  // Kartenname ändern (nur Admin, gilt für alle)
  const kartenNameAendern = useCallback(async (name: string) => {
    const r = await fetch(`/api/karten/${karteId}`, { method: 'PATCH', headers, body: JSON.stringify({ name }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.fehler || `Fehler ${r.status}`)
    setKartenName(j.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  // ---- Weideplan ----
  const plan = {
    herdeSpeichern: (herde: Pick<Herde, 'id' | 'name'> & { farbe?: string }) => ausfuehren({ art: 'plan-herde', herde }),
    herdeLoeschen: (id: string) => ausfuehren({ art: 'plan-herde-delete', id }),
    belegungSpeichern: (b: Belegung) => {
      const alt = planRef.current?.belegungen.find((x) => x.id === b.id)
      ausfuehren({ art: 'plan-belegung', belegung: { ...b, geaendert: new Date().toISOString() }, ...(alt ? { basisGeaendert: alt.geaendert } : {}) })
    },
    belegungLoeschen: (id: string) => ausfuehren({ art: 'plan-belegung-delete', id }),
    umtrieb: (op: UmtriebOp) => ausfuehren({ art: 'plan-umtrieb', op }),
    zurueck: (id: string) => ausfuehren({ art: 'plan-zurueck', id }),
    bewegungLoeschen: (id: string) => ausfuehren({ art: 'plan-bewegung-delete', id }),
    einstellungen: (e: { ruhetage?: number; ruhe?: Record<string, number | null> }) => ausfuehren({ art: 'plan-einstellungen', ...e }),
  }

  // ---- Datenschutz: Meine Daten, eigener Zugang, Karte löschen ----
  const ichApi = async <T,>(pfad: string, method = 'GET', body?: unknown): Promise<T> => {
    const r = await fetch(`/api/karten/${karteId}${pfad}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.fehler || (r.status >= 500 ? 'Server nicht erreichbar – bitte gleich nochmal.' : `Fehler ${r.status}`))
    return j as T
  }
  const datenschutz = {
    meineDaten: () => ichApi<Record<string, unknown>>('/ich/daten'),
    // Eigenen Zugang löschen: danach Zugang und Kartenkopie von diesem Gerät entfernen
    zugangLoeschen: async () => { await ichApi('/ich', 'DELETE'); await geraetVergessen(karteId!) },
    karteLoeschen: async (name: string) => { const j = await ichApi<{ geloescht: Geloescht }>('/loeschen', 'POST', { name }); setGeloescht(j.geloescht); return j },
    wiederherstellen: async () => {
      if (geloescht?.hof && hof?.id) await fetch(`/api/hoefe/${hof.id}/wiederherstellen`, { method: 'POST', headers }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).fehler || 'Fehler') })
      else await ichApi('/wiederherstellen', 'POST')
      setGeloescht(null)
      location.reload()
    },
    endgueltig: async (name: string) => {
      if (geloescht?.hof && hof?.id) await fetch(`/api/hoefe/${hof.id}/endgueltig`, { method: 'POST', headers, body: JSON.stringify({ name }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).fehler || 'Fehler') })
      else await ichApi('/endgueltig', 'POST', { name })
      await geraetVergessen(karteId!)
    },
  }

  // ---- Nutzerverwaltung (Admin) ----
  const api = useCallback(async <T,>(pfad: string, method = 'GET', body?: unknown): Promise<T> => {
    const r = await fetch(`/api/karten/${karteId}/nutzer${pfad}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.fehler || `Fehler ${r.status}`)
    return j as T
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])
  const nutzer = {
    laden: () => api<Nutzer[]>(''),
    anlegen: (name: string, rolle: Ich['rolle']) => api<Nutzer>('', 'POST', { name, rolle }),
    aendern: (id: string, daten: { name?: string; rolle?: Ich['rolle']; neuerZugang?: boolean }) => api<Nutzer>(`/${id}`, 'PATCH', daten),
    entfernen: (id: string) => api<{ ok: boolean }>(`/${id}`, 'DELETE'),
  }
  const einladungApi = async (method: string) => {
    const r = await fetch(`/api/karten/${karteId}/einladung`, { method, headers })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.fehler || `Fehler ${r.status}`)
    return j as { code: string | null }
  }
  const einladungVerwalten = { laden: () => einladungApi('GET'), erzeugen: () => einladungApi('POST'), deaktivieren: () => einladungApi('DELETE') }

  return { geprueft, spannungMessen, fristErledigt, pacht, pachtSpeichern, weideplan, plan, geloescht, darfLoeschen, datenschutz, stapel, alsNeueKarte, jetztSenden: queueAbarbeiten, wartend, letzteSync, konflikte, hof, setHof, eintraege, gruppen, gruppeSpeichern, gruppeLoeschen, zuordnen, reihenfolge, speichern, loeschen, notizSpeichern, notizLoeschen, alleErsetzen, teilen, abmelden, nameAendern, einladung, einladungPruefen, beitreten, kartenNameAendern, einladungVerwalten, nutzerStand, status, serverStartet, darfBearbeiten, istAdmin, ich, ichLaden, hinweis, setHinweis, nutzer, karteId, zugang, kartenName }
}
