// Kleine, schlichte Stecknadel (Kopf + dünne Nadel) als SVG – für Leaflet und Google Maps.
// Die Tippfläche (40×44 px) ist größer als das sichtbare Icon, damit sie fingerfreundlich bleibt.
export const NADEL_BREITE = 40
export const NADEL_HOEHE = 44

// hervor: dezent hervorgehoben (Schnellauswahl Farbe) – etwas größer, kräftigerer Rand
// Lesbare Ziffernfarbe auf dem Nadelkopf (dunkel auf hellen Farben wie Gelb/Weiß)
function hellFarbe(hex: string) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return false
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 165
}
// Nadel einer Gruppe: größerer runder Kopf mit laufender Nummer (wie in Google My Maps)
function nummerNadel(f: string, nr: number, aktiv: boolean, h2: boolean) {
  const s = aktiv ? 1.3 : h2 ? 1.15 : 1
  const w = 22 * s, h = 31 * s
  const rand = aktiv ? '#fff' : h2 ? '#111' : 'rgba(0,0,0,.6)'
  const txt = String(nr), fs = txt.length >= 3 ? 8 : txt.length === 2 ? 10 : 11.5
  return `<div class="nadel-tap nummer${aktiv ? ' aktiv' : ''}${h2 ? ' hervor' : ''}"><svg width="${w}" height="${h}" viewBox="0 0 22 31" aria-hidden="true">
    <line x1="11" y1="19" x2="11" y2="30.5" stroke="#3a3a3a" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="11" cy="10.5" r="9.5" fill="${f}" stroke="${rand}" stroke-width="${aktiv || h2 ? 2 : 1.3}"/>
    <text x="11" y="10.6" text-anchor="middle" dominant-baseline="central" font-family="Barlow, Arial, sans-serif" font-weight="700" font-size="${fs}" fill="${hellFarbe(f) ? '#1d2a1d' : '#fff'}">${txt}</text>
  </svg></div>`
}

export function nadelHtml(farbe: string, aktiv: boolean, hervor = false, nr?: number) {
  if (nr) return nummerNadel(/^#[0-9a-f]{6}$/i.test(farbe) ? farbe : '#1e88e5', nr, aktiv, hervor && !aktiv)
  const f = /^#[0-9a-f]{3,8}$/i.test(farbe) ? farbe : '#e53935'
  const h2 = hervor && !aktiv
  const s = aktiv ? 1.35 : h2 ? 1.2 : 1
  const w = 14 * s, h = 22 * s
  const rand = aktiv ? '#fff' : h2 ? '#111' : 'rgba(0,0,0,.65)'
  return `<div class="nadel-tap${aktiv ? ' aktiv' : ''}${h2 ? ' hervor' : ''}"><svg width="${w}" height="${h}" viewBox="0 0 14 22" aria-hidden="true">
    <line x1="7" y1="11" x2="7" y2="21.5" stroke="#3a3a3a" stroke-width="${h2 ? 1.9 : 1.6}" stroke-linecap="round"/>
    <circle cx="7" cy="6.5" r="5.5" fill="${f}" stroke="${rand}" stroke-width="${aktiv || h2 ? 2 : 1.2}"/>
    <circle cx="5.3" cy="4.8" r="1.5" fill="rgba(255,255,255,.7)"/>
  </svg></div>`
}
