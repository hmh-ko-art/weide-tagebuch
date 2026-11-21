// 7p: Hilfsfunktionen für „Karte verbinden“ (Home-Bildschirm-App)
export const NUR_HANDY = 'wt-nur-handy'
export function istStandalone() {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
    || !!window.matchMedia?.('(display-mode: standalone)').matches || !!window.matchMedia?.('(display-mode: fullscreen)').matches
}

// Persönlichen Link (oder nur den Teil „?karte=…&zugang=…“) in eine Adresse dieser App umwandeln
export function linkLesen(text: string): string | null {
  const s = text.trim().replace(/[\s<>"']+$/g, '').replace(/^[\s<>"']+/g, '')
  if (!s) return null
  let u: URL
  try { u = new URL(s) } catch {
    try { u = new URL(s.includes('?') ? s.slice(s.indexOf('?')) : `?${s}`, location.origin) } catch { return null }
  }
  const q = u.searchParams
  const karte = q.get('karte'), zugang = q.get('zugang') || q.get('schluessel'), hof = q.get('hof')
  if (karte && /^[\w-]{4,40}$/.test(karte)) {
    const r = new URLSearchParams({ karte })
    if (zugang && /^[\w-]{8,80}$/.test(zugang)) r.set('zugang', zugang)
    else if (q.get('einladung')) r.set('einladung', q.get('einladung')!)
    return `/?${r}`
  }
  if (hof && /^[\w-]{4,40}$/.test(hof)) {
    const r = new URLSearchParams({ hof })
    if (q.get('einladung')) r.set('einladung', q.get('einladung')!)
    return `/?${r}`
  }
  return null
}
