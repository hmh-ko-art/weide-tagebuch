import { useCallback, useEffect, useRef, useState } from 'react'
import { migrieren, type Einheit, type Eintrag, type Gruppe, type Notiz } from './types'

// Geteilte Karte: ?karte=ID (ansehen) bzw. ?karte=ID&zugang=KEY (persönlicher Zugang; alt: &schluessel=KEY).
// Der Zugang wird am Gerät gespeichert und aus der Adresszeile entfernt.
const zugangKey = (id: string) => `wt-zugang-${id}`
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

export interface Ich { id: string; name: string; rolle: 'admin' | 'nutzer' }
export interface Nutzer extends Ich { zugang: string; erstellt: string }
export const zugangsLink = (karteId: string, zugang: string) => `${location.origin}${location.pathname}?karte=${karteId}&zugang=${zugang}`
export const einladungsLink = (karteId: string, code: string) => `${location.origin}${location.pathname}?karte=${karteId}&einladung=${code}`

type Ausstehend =
  // basis: Tiereinheiten, von denen die Änderung ausging (Server führt damit gleichzeitige Änderungen zusammen)
  | { art: 'put'; eintrag: Eintrag; basis?: Einheit[] }
  | { art: 'delete'; id: string }
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

const cacheKey = (id: string | null) => (id ? `wt-karte-${id}` : 'wt-lokal')
const queueKey = (id: string) => `wt-queue-${id}`
const gruppenKey = (id: string | null) => (id ? `wt-gruppen-${id}` : 'wt-lokal-gruppen')

function lesen<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function useKarte() {
  const { karteId, zugang, einladung } = PARAMS
  const [eintraege, setEintraege] = useState<Eintrag[]>(() => lesen<Eintrag[]>(cacheKey(karteId), []).map(migrieren))
  const [gruppen, setGruppen] = useState<Gruppe[]>(() => lesen<Gruppe[]>(gruppenKey(karteId), []))
  const [status, setStatus] = useState<SyncStatus>(karteId ? 'verbinde' : 'lokal')
  const [ich, setIch] = useState<Ich | null>(null)
  const [hinweis, setHinweis] = useState('')
  const [kartenName, setKartenName] = useState<string>('')
  const nutzerVersion = useRef<number | null>(null)
  const [nutzerStand, setNutzerStand] = useState(0) // ändert sich bei jeder Nutzerlisten-Änderung (z. B. Beitritt per Einladung)
  const darfBearbeiten = !karteId || !!ich
  const istAdmin = !karteId || ich?.rolle === 'admin'
  const queue = useRef<Ausstehend[]>(karteId ? lesen(queueKey(karteId), []) : [])

  const headers = { 'Content-Type': 'application/json', ...(zugang ? { 'x-zugang': zugang } : {}) }

  // Wer bin ich auf dieser Karte? (bei Rollen-/Nutzeränderungen neu laden)
  const ichLaden = useCallback(async (mitEintraegen = false) => {
    if (!karteId) return
    try {
      const r = await fetch(`/api/karten/${karteId}`, { headers })
      if (!r.ok) return
      const k = await r.json()
      setKartenName(k.name)
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

  // Offline-Cache aktuell halten
  useEffect(() => {
    localStorage.setItem(cacheKey(karteId), JSON.stringify(eintraege))
  }, [eintraege, karteId])
  useEffect(() => { localStorage.setItem(gruppenKey(karteId), JSON.stringify(gruppen)) }, [gruppen, karteId])

  const queueSpeichern = () => karteId && localStorage.setItem(queueKey(karteId), JSON.stringify(queue.current))

  const senden = useCallback(async (a: Ausstehend) => {
    const basis = `/api/karten/${karteId}/eintraege/`
    const [url, method, body] =
      a.art === 'put' ? [basis + a.eintrag.id, 'PUT', a.basis ? { ...a.eintrag, einheitenBasis: a.basis } : a.eintrag]
      : a.art === 'delete' ? [basis + a.id, 'DELETE', undefined]
      : a.art === 'notiz-put' ? [`${basis}${a.eintragId}/notizen/${a.notiz.id}`, 'PUT', a.notiz]
      : a.art === 'notiz-delete' ? [`${basis}${a.eintragId}/notizen/${a.notizId}`, 'DELETE', undefined]
      : a.art === 'gruppe-put' ? [`/api/karten/${karteId}/gruppen/${a.gruppe.id}`, 'PUT', { name: a.gruppe.name, ...(a.gruppe.farbe ? { farbe: a.gruppe.farbe } : {}) }]
      : a.art === 'reihenfolge' ? [`/api/karten/${karteId}/gruppen/${a.gruppe}/reihenfolge`, 'PUT', { ids: a.ids }]
      : a.art === 'gruppe-delete' ? [`/api/karten/${karteId}/gruppen/${a.id}`, 'DELETE', undefined]
      : [`/api/karten/${karteId}/gruppe-zuordnen`, 'POST', { gruppe: a.gruppe, ids: a.ids }]
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    if (r.status === 403 || r.status === 404) throw Object.assign(new Error('Nur Lesezugriff'), { endgueltig: true })
    if (!r.ok) throw new Error('Serverfehler ' + r.status)
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
        if (!(e as { endgueltig?: boolean }).endgueltig) { setStatus('offline'); break }
        // Vom Server abgelehnt (keine Berechtigung): Hinweis + Serverstand wiederherstellen
        setHinweis('Diese Änderung ist nicht erlaubt und wurde verworfen.')
        abgelehnt = true
      }
      queue.current.shift()
      queueSpeichern()
    }
    } finally { laeuft.current = false }
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
      setStatus('verbunden')
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
    const online = () => queueAbarbeiten()
    window.addEventListener('online', online)
    return () => { es.close(); window.removeEventListener('online', online) }
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
    ausfuehren({ art: 'put', eintrag: e, basis: basis ?? alt?.einheiten ?? [] })
  }, [ausfuehren])
  const loeschen = useCallback((id: string) => ausfuehren({ art: 'delete', id }), [ausfuehren])
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
    localStorage.setItem(cacheKey(k.id), JSON.stringify(eintraege))
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

  return { eintraege, gruppen, gruppeSpeichern, gruppeLoeschen, zuordnen, reihenfolge, speichern, loeschen, notizSpeichern, notizLoeschen, alleErsetzen, teilen, abmelden, nameAendern, einladung, einladungPruefen, beitreten, kartenNameAendern, einladungVerwalten, nutzerStand, status, darfBearbeiten, istAdmin, ich, ichLaden, hinweis, setHinweis, nutzer, karteId, zugang, kartenName }
}
