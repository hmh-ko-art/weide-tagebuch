import { useCallback, useEffect, useRef, useState } from 'react'
import { migrieren, type Einheit, type Eintrag, type Gruppe, type Notiz } from './types'
import { lesen, schreiben, schreibenJetzt } from './speicher'

// Geteilte Karte: ?karte=ID (ansehen) bzw. ?karte=ID&zugang=KEY (persönlicher Zugang; alt: &schluessel=KEY).
// Der Zugang wird am Gerät gespeichert und aus der Adresszeile entfernt.
export const zugangKey = (id: string) => `wt-zugang-${id}`
export function linkParameter() {
  const p = new URLSearchParams(location.search)
  const karteId = p.get('karte')
  const ausLink = p.get('zugang') || p.get('schluessel')
  const einladungLink = p.get('einladung')
  if (karteId && ausLink) localStorage.setItem(zugangKey(karteId), ausLink)
  if (karteId && (ausLink || einladungLink)) {
    p.delete('zugang'); p.delete('schluessel'); p.delete('einladung')
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`)
  }
  const zugang = karteId ? localStorage.getItem(zugangKey(karteId)) : null
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

// Eine Änderung auf eine Liste anwenden (lokal sofort und als Overlay über Serverdaten)
function anwenden(liste: Eintrag[], a: Ausstehend): Eintrag[] {
  switch (a.art) {
    case 'put': {
      const alt = liste.find((x) => x.id === a.eintrag.id)
      const neu = migrieren(a.eintrag)
      // Notizen nie über das Eintragsformular überschreiben – nur über Notiz-Aktionen
      // Gruppe ebenso nur über „zuordnen“ ändern (der Server macht es genauso)
      const e = alt ? { ...neu, notizen: alt.notizen, gruppe: alt.gruppe } : neu
      return alt ? liste.map((x) => (x.id === e.id ? e : x)) : [...liste, e]
    }
    case 'delete':
      return liste.filter((x) => x.id !== a.id)
    case 'notiz-put':
      return liste.map((x) => (x.id === a.eintragId ? { ...x, notizen: [...x.notizen.filter((n) => n.id !== a.notiz.id), a.notiz] } : x))
    case 'notiz-delete':
      return liste.map((x) => (x.id === a.eintragId ? { ...x, notizen: x.notizen.filter((n) => n.id !== a.notizId) } : x))
    case 'gruppe-put':
    case 'reihenfolge':
      return liste
    case 'gruppe-delete':
      return liste.map((x) => (x.gruppe === a.id ? { ...x, gruppe: undefined } : x))
    case 'zuordnen':
      return liste.map((x) => (a.ids.includes(x.id) ? { ...x, gruppe: a.gruppe ?? undefined } : x))
  }
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
export interface Konflikt { art: 'geaendert' | 'wiederhergestellt' | 'nicht-geloescht'; titel: string; mit?: string; gewonnen?: boolean }
export function konfliktText(k: Konflikt): string {
  const wer = k.mit ? k.mit : 'jemand anderes'
  const t = k.titel ? `„${k.titel}“` : 'Ein Eintrag'
  if (k.art === 'nicht-geloescht') return `${t} wurde nicht gelöscht, weil ${wer} den Eintrag inzwischen geändert hat.`
  if (k.art === 'wiederhergestellt') return `${t} war inzwischen gelöscht worden – deine Änderung hat den Eintrag wiederhergestellt.`
  return k.gewonnen
    ? `${t}: ${wer} hatte den Eintrag zur selben Zeit geändert. Deine Fassung ist neuer und gilt – die andere steht als Notiz am Eintrag.`
    : `${t}: ${wer} hat den Eintrag später als du geändert. Diese Fassung gilt – deine steht als Notiz am Eintrag.`
}

export function useKarte() {
  const { karteId, zugang, einladung } = PARAMS
  const meta0 = karteId ? lesen<Meta>(metaKey(karteId), {}) : {}
  const [eintraege, setEintraege] = useState<Eintrag[]>(() => lesen<Eintrag[]>(cacheKey(karteId), []).map(migrieren))
  const [gruppen, setGruppen] = useState<Gruppe[]>(() => lesen<Gruppe[]>(gruppenKey(karteId), []))
  const [status, setStatus] = useState<SyncStatus>(karteId ? (navigator.onLine === false ? 'offline' : 'verbinde') : 'lokal')
  // Name/Rolle vom letzten Kontakt mit dem Server: so kann man auch nach einem Neustart ohne Netz weiterarbeiten
  const [ich, setIch] = useState<Ich | null>(zugang ? meta0.ich ?? null : null)
  const [hinweis, setHinweis] = useState('')
  const [kartenName, setKartenName] = useState<string>(meta0.name ?? '')
  const [hof, setHof] = useState<HofKurz | null>(meta0.hof ?? null)
  const [letzteSync, setLetzteSync] = useState<string | null>(meta0.sync ?? null)
  const [konflikte, setKonflikte] = useState<Konflikt[]>([])
  const nutzerVersion = useRef<number | null>(null)
  const [nutzerStand, setNutzerStand] = useState(0) // ändert sich bei jeder Nutzerlisten-Änderung (z. B. Beitritt per Einladung)
  const darfBearbeiten = !karteId || (!!ich && ich.rolle !== 'ansehen')
  const istAdmin = !karteId || ich?.rolle === 'admin'
  const queue = useRef<Ausstehend[]>(karteId ? queueLaden(karteId) : [])
  const [wartend, setWartend] = useState(queue.current.length) // Anzahl Änderungen im Postausgang

  const headers = { 'Content-Type': 'application/json', ...(zugang ? { 'x-zugang': zugang } : {}) }

  // Wer bin ich auf dieser Karte? (bei Rollen-/Nutzeränderungen neu laden)
  const ichLaden = useCallback(async (mitEintraegen = false) => {
    if (!karteId) return
    try {
      const r = await mitZeitlimit(`/api/karten/${karteId}`, { headers })
      if (!r.ok) return
      const k = await r.json()
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
        for (const a of queue.current) { liste = anwenden(liste, a); gl = gruppenAnwenden(gl, a) }
        setEintraege(liste)
        setGruppen(gl)
      }
    } catch { /* offline */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  // Offline-Speicher aktuell halten (IndexedDB)
  useEffect(() => { schreiben(cacheKey(karteId), eintraege) }, [eintraege, karteId])
  useEffect(() => { schreiben(gruppenKey(karteId), gruppen) }, [gruppen, karteId])

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
    const [url, method, body] =
      a.art === 'put' ? [basis + a.eintrag.id, 'PUT', { ...a.eintrag, ...(a.basis ? { einheitenBasis: a.basis } : {}), ...(a.basisGeaendert ? { basisGeaendert: a.basisGeaendert } : {}) }]
      : a.art === 'delete' ? [basis + a.id + (a.basisGeaendert ? `?basis=${encodeURIComponent(a.basisGeaendert)}` : ''), 'DELETE', undefined]
      : a.art === 'notiz-put' ? [`${basis}${a.eintragId}/notizen/${a.notiz.id}`, 'PUT', a.notiz]
      : a.art === 'notiz-delete' ? [`${basis}${a.eintragId}/notizen/${a.notizId}`, 'DELETE', undefined]
      : a.art === 'gruppe-put' ? [`/api/karten/${karteId}/gruppen/${a.gruppe.id}`, 'PUT', { name: a.gruppe.name, ...(a.gruppe.farbe ? { farbe: a.gruppe.farbe } : {}) }]
      : a.art === 'reihenfolge' ? [`/api/karten/${karteId}/gruppen/${a.gruppe}/reihenfolge`, 'PUT', { ids: a.ids }]
      : a.art === 'gruppe-delete' ? [`/api/karten/${karteId}/gruppen/${a.id}`, 'DELETE', undefined]
      : [`/api/karten/${karteId}/gruppe-zuordnen`, 'POST', { gruppe: a.gruppe, ids: a.ids }]
    const r = await mitZeitlimit(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json().catch(() => ({}))
    // Löschen abgelehnt, weil inzwischen von jemand anderem geändert -> nichts geht verloren, Nutzer wird informiert
    if (r.status === 409 && j.konflikt) throw Object.assign(new Error('Konflikt'), { endgueltig: true, konflikt: j.konflikt as Konflikt })
    if (r.status === 403 || r.status === 404) throw Object.assign(new Error('Nur Lesezugriff'), { endgueltig: true })
    if (!r.ok) throw new Error('Serverfehler ' + r.status)
    if (j.konflikt) konfliktMelden(j.konflikt as Konflikt)
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
        const f = e as { endgueltig?: boolean; konflikt?: Konflikt }
        if (!f.endgueltig) { setStatus('offline'); break }
        if (f.konflikt) konfliktMelden(f.konflikt)
        // Vom Server abgelehnt (keine Berechtigung): Hinweis + Serverstand wiederherstellen
        else setHinweis('Eine Änderung wurde vom Server abgelehnt (keine Berechtigung mehr) und verworfen.')
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

  // Live-Verbindung (SSE) zum Server
  useEffect(() => {
    if (!karteId) return
    ichLaden()
    const es = new EventSource(`/api/karten/${karteId}/live`)
    es.addEventListener('karte', (ev) => {
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
      for (const a of queue.current) { liste = anwenden(liste, a); gl = gruppenAnwenden(gl, a) }
      setEintraege(liste)
      setGruppen(gl)
      if (queue.current.length) queueAbarbeiten()
    })
    es.onerror = () => setStatus('offline')
    const online = () => { setStatus((s) => (s === 'offline' ? 'verbinde' : s)); queueAbarbeiten(); ichLaden() }
    const offline = () => setStatus('offline')
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    // Postausgang regelmäßig erneut versuchen (z. B. wenn der Empfang nur kurz da war)
    const t = setInterval(() => { if (queue.current.length && navigator.onLine !== false) queueAbarbeiten() }, 20000)
    return () => { es.close(); clearInterval(t); window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId])

  const ausfuehren = useCallback((a: Ausstehend) => {
    setEintraege((l) => anwenden(l, a))
    setGruppen((g) => gruppenAnwenden(g, a))
    if (karteId) { queue.current.push(a); queueSpeichern(); queueAbarbeiten() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, queueAbarbeiten])

  const eintraegeRef = useRef(eintraege)
  eintraegeRef.current = eintraege
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

  // Eigene Gruppen: anlegen/umbenennen, löschen (Nadeln bleiben, werden ungruppiert), Nadeln zuordnen
  const gruppeSpeichern = useCallback((g: Gruppe) => ausfuehren({ art: 'gruppe-put', gruppe: g }), [ausfuehren])
  const gruppeLoeschen = useCallback((id: string) => ausfuehren({ art: 'gruppe-delete', id }), [ausfuehren])
  const reihenfolge = useCallback((gruppe: string, ids: string[]) => ausfuehren({ art: 'reihenfolge', gruppe, ids }), [ausfuehren])
  const zuordnen = useCallback((gruppe: string | null, ids: string[]) => { if (ids.length) ausfuehren({ art: 'zuordnen', gruppe, ids }) }, [ausfuehren])

  const alleErsetzen = useCallback(async (roh: Eintrag[]) => {
    const liste = roh.map(migrieren)
    setEintraege(liste)
    if (karteId) await fetch(`/api/karten/${karteId}/eintraege`, { method: 'PUT', headers, body: JSON.stringify(liste) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, zugang])

  // Lokale Karte in eine geteilte Server-Karte umwandeln
  const teilen = useCallback(async (name: string) => {
    const r = await fetch('/api/karten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, eintraege, gruppen }) })
    if (!r.ok) throw new Error('Server nicht erreichbar')
    const k = await r.json()
    schreiben(cacheKey(k.id), eintraege)
    schreiben(gruppenKey(k.id), gruppen)
    schreibenJetzt()
    localStorage.setItem(zugangKey(k.id), k.zugang)
    location.href = `${location.pathname}?karte=${k.id}`
  }, [eintraege, gruppen])

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

  return { jetztSenden: queueAbarbeiten, wartend, letzteSync, konflikte, hof, setHof, eintraege, gruppen, gruppeSpeichern, gruppeLoeschen, zuordnen, reihenfolge, speichern, loeschen, notizSpeichern, notizLoeschen, alleErsetzen, teilen, abmelden, nameAendern, einladung, einladungPruefen, beitreten, kartenNameAendern, einladungVerwalten, nutzerStand, status, darfBearbeiten, istAdmin, ich, ichLaden, hinweis, setHinweis, nutzer, karteId, zugang, kartenName }
}
