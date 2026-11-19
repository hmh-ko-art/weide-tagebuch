// Gerätespeicher für Kartendaten (Offline-Modus): IndexedDB, beim Start einmal komplett in den Arbeitsspeicher geladen,
// danach synchron lesbar. Schreiben geht sofort in den Arbeitsspeicher und kurz verzögert in IndexedDB.
// Ohne IndexedDB (sehr alte Browser, manche private Fenster) wird wie früher localStorage benutzt.
// Alte Daten aus localStorage (wt-karte-*, wt-gruppen-*, wt-lokal*) werden beim ersten Start übernommen.
const DB_NAME = 'flockmap'
const STORE = 'kv'
const mem = new Map<string, unknown>()
let db: IDBDatabase | null = null
const ausstehend = new Map<string, unknown>()
let timer: ReturnType<typeof setTimeout> | null = null

const ALT_SCHLUESSEL = /^wt-(karte-|gruppen-|lokal$|lokal-gruppen$)/
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((ok, fehl) => { r.onsuccess = () => ok(r.result); r.onerror = () => fehl(r.error) })

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((ok, fehl) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fehl(r.error)
    r.onblocked = () => fehl(new Error('IndexedDB blockiert'))
  })
}

export async function speicherStarten() {
  try {
    if (!('indexedDB' in window)) throw new Error('keine IndexedDB')
    db = await Promise.race([oeffnen(), new Promise<never>((_, f) => setTimeout(() => f(new Error('Zeitlimit')), 3000))])
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE)
    const [keys, werte] = await Promise.all([req(tx.getAllKeys()), req(tx.getAll())])
    keys.forEach((k, i) => mem.set(String(k), werte[i]))
    // Übernahme aus localStorage (nur was in IndexedDB noch fehlt), danach dort löschen
    const alt: string[] = []
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (ALT_SCHLUESSEL.test(k)) alt.push(k) }
    if (alt.length) {
      const w = db.transaction(STORE, 'readwrite')
      for (const k of alt) {
        if (!mem.has(k)) { try { const v = JSON.parse(localStorage.getItem(k)!); mem.set(k, v); w.objectStore(STORE).put(v, k) } catch { /* kaputt */ } }
      }
      await new Promise((ok, fehl) => { w.oncomplete = ok; w.onerror = () => fehl(w.error) })
      for (const k of alt) localStorage.removeItem(k)
    }
  } catch {
    db = null // Rückfall: localStorage
  }
  // vor dem Schließen/Wegwechseln alles Ausstehende sofort schreiben
  addEventListener('pagehide', schreibenJetzt)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') schreibenJetzt() })
}
export const speicherArt = () => (db ? 'IndexedDB' : 'localStorage')

export function lesen<T>(key: string, fallback: T): T {
  if (db) return mem.has(key) ? (mem.get(key) as T) : fallback
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
export function schreiben(key: string, wert: unknown) {
  if (!db) { try { localStorage.setItem(key, JSON.stringify(wert)) } catch { /* voll */ } return }
  mem.set(key, wert)
  ausstehend.set(key, wert)
  if (!timer) timer = setTimeout(schreibenJetzt, 250)
}
export function schreibenJetzt() {
  if (timer) { clearTimeout(timer); timer = null }
  if (!db || !ausstehend.size) return
  const tx = db.transaction(STORE, 'readwrite')
  for (const [k, v] of ausstehend) tx.objectStore(STORE).put(v, k)
  ausstehend.clear()
}
