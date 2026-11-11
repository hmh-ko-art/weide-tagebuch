import { useCallback, useEffect, useRef, useState } from 'react'
import { migrieren, type Eintrag, type Notiz } from './types'

// Geteilte Karte: ?karte=ID (ansehen) bzw. ?karte=ID&schluessel=KEY (bearbeiten)
export function linkParameter() {
  const p = new URLSearchParams(location.search)
  return { karteId: p.get('karte'), schluessel: p.get('schluessel') }
}

type Ausstehend =
  | { art: 'put'; eintrag: Eintrag }
  | { art: 'delete'; id: string }
  | { art: 'notiz-put'; eintragId: string; notiz: Notiz }
  | { art: 'notiz-delete'; eintragId: string; notizId: string }

// Eine Änderung auf eine Liste anwenden (lokal sofort und als Overlay über Serverdaten)
function anwenden(liste: Eintrag[], a: Ausstehend): Eintrag[] {
  switch (a.art) {
    case 'put': {
      const alt = liste.find((x) => x.id === a.eintrag.id)
      const neu = migrieren(a.eintrag)
      // Notizen nie über das Eintragsformular überschreiben – nur über Notiz-Aktionen
      const e = alt ? { ...neu, notizen: alt.notizen } : neu
      return alt ? liste.map((x) => (x.id === e.id ? e : x)) : [...liste, e]
    }
    case 'delete':
      return liste.filter((x) => x.id !== a.id)
    case 'notiz-put':
      return liste.map((x) => (x.id === a.eintragId ? { ...x, notizen: [...x.notizen.filter((n) => n.id !== a.notiz.id), a.notiz] } : x))
    case 'notiz-delete':
      return liste.map((x) => (x.id === a.eintragId ? { ...x, notizen: x.notizen.filter((n) => n.id !== a.notizId) } : x))
  }
}
export type SyncStatus = 'lokal' | 'verbunden' | 'offline' | 'verbinde'

const cacheKey = (id: string | null) => (id ? `wt-karte-${id}` : 'wt-lokal')
const queueKey = (id: string) => `wt-queue-${id}`

function lesen<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

export function useKarte() {
  const { karteId, schluessel } = linkParameter()
  const [eintraege, setEintraege] = useState<Eintrag[]>(() => lesen<Eintrag[]>(cacheKey(karteId), []).map(migrieren))
  const [status, setStatus] = useState<SyncStatus>(karteId ? 'verbinde' : 'lokal')
  const [darfBearbeiten, setDarfBearbeiten] = useState<boolean>(!karteId || !!schluessel)
  const [kartenName, setKartenName] = useState<string>('')
  const queue = useRef<Ausstehend[]>(karteId ? lesen(queueKey(karteId), []) : [])

  const headers = { 'Content-Type': 'application/json', ...(schluessel ? { 'x-bearbeiten-schluessel': schluessel } : {}) }

  // Offline-Cache aktuell halten
  useEffect(() => {
    localStorage.setItem(cacheKey(karteId), JSON.stringify(eintraege))
  }, [eintraege, karteId])

  const queueSpeichern = () => karteId && localStorage.setItem(queueKey(karteId), JSON.stringify(queue.current))

  const senden = useCallback(async (a: Ausstehend) => {
    const basis = `/api/karten/${karteId}/eintraege/`
    const [url, method, body] =
      a.art === 'put' ? [basis + a.eintrag.id, 'PUT', a.eintrag]
      : a.art === 'delete' ? [basis + a.id, 'DELETE', undefined]
      : a.art === 'notiz-put' ? [`${basis}${a.eintragId}/notizen/${a.notiz.id}`, 'PUT', a.notiz]
      : [`${basis}${a.eintragId}/notizen/${a.notizId}`, 'DELETE', undefined]
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    if (r.status === 403 || r.status === 404) throw Object.assign(new Error('Nur Lesezugriff'), { endgueltig: true })
    if (!r.ok) throw new Error('Serverfehler ' + r.status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, schluessel])

  const laeuft = useRef(false)
  const queueAbarbeiten = useCallback(async () => {
    if (laeuft.current) return // nur ein Durchlauf gleichzeitig, sonst werden Einträge doppelt/gar nicht gesendet
    laeuft.current = true
    try {
    while (queue.current.length) {
      try {
        await senden(queue.current[0])
      } catch (e) {
        if (!(e as { endgueltig?: boolean }).endgueltig) { setStatus('offline'); break }
      }
      queue.current.shift()
      queueSpeichern()
    }
    } finally { laeuft.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senden])

  // Live-Verbindung (SSE) zum Server
  useEffect(() => {
    if (!karteId) return
    fetch(`/api/karten/${karteId}`, { headers }).then(async (r) => {
      if (r.ok) {
        const k = await r.json()
        setDarfBearbeiten(k.darfBearbeiten)
        setKartenName(k.name)
      }
    }).catch(() => setStatus('offline'))
    const es = new EventSource(`/api/karten/${karteId}/live`)
    es.addEventListener('karte', (ev) => {
      const k = JSON.parse((ev as MessageEvent).data)
      setKartenName(k.name)
      setStatus('verbunden')
      // Lokale, noch nicht gesendete Änderungen obenauf legen
      let liste: Eintrag[] = k.eintraege.map(migrieren)
      for (const a of queue.current) liste = anwenden(liste, a)
      setEintraege(liste)
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
    if (karteId) { queue.current.push(a); queueSpeichern(); queueAbarbeiten() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, queueAbarbeiten])

  const speichern = useCallback((e: Eintrag) => ausfuehren({ art: 'put', eintrag: e }), [ausfuehren])
  const loeschen = useCallback((id: string) => ausfuehren({ art: 'delete', id }), [ausfuehren])
  const notizSpeichern = useCallback((eintragId: string, notiz: Notiz) => ausfuehren({ art: 'notiz-put', eintragId, notiz }), [ausfuehren])
  const notizLoeschen = useCallback((eintragId: string, notizId: string) => ausfuehren({ art: 'notiz-delete', eintragId, notizId }), [ausfuehren])

  const alleErsetzen = useCallback(async (roh: Eintrag[]) => {
    const liste = roh.map(migrieren)
    setEintraege(liste)
    if (karteId) await fetch(`/api/karten/${karteId}/eintraege`, { method: 'PUT', headers, body: JSON.stringify(liste) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karteId, schluessel])

  // Lokale Karte in eine geteilte Server-Karte umwandeln
  const teilen = useCallback(async (name: string) => {
    const r = await fetch('/api/karten', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, eintraege }) })
    if (!r.ok) throw new Error('Server nicht erreichbar')
    const k = await r.json()
    localStorage.setItem(cacheKey(k.id), JSON.stringify(eintraege))
    location.href = `${location.pathname}?karte=${k.id}&schluessel=${k.schluessel}`
  }, [eintraege])

  return { eintraege, speichern, loeschen, notizSpeichern, notizLoeschen, alleErsetzen, teilen, status, darfBearbeiten, karteId, schluessel, kartenName }
}
