// Kleine, schlichte Stecknadel (Kopf + dünne Nadel) als SVG – für Leaflet und Google Maps.
// Die Tippfläche (40×44 px) ist größer als das sichtbare Icon, damit sie fingerfreundlich bleibt.
export const NADEL_BREITE = 40
export const NADEL_HOEHE = 44

// hervor: dezent hervorgehoben (Schnellauswahl Farbe) – etwas größer, kräftigerer Rand
export function nadelHtml(farbe: string, aktiv: boolean, hervor = false) {
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
