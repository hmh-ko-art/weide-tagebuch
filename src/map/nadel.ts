// Kleine, schlichte Stecknadel (Kopf + dünne Nadel) als SVG – für Leaflet und Google Maps.
// Die Tippfläche (40×44 px) ist größer als das sichtbare Icon, damit sie fingerfreundlich bleibt.
export const NADEL_BREITE = 40
export const NADEL_HOEHE = 44

export function nadelHtml(farbe: string, aktiv: boolean) {
  const f = /^#[0-9a-f]{3,8}$/i.test(farbe) ? farbe : '#e53935'
  const s = aktiv ? 1.35 : 1
  const w = 14 * s, h = 22 * s
  return `<div class="nadel-tap${aktiv ? ' aktiv' : ''}"><svg width="${w}" height="${h}" viewBox="0 0 14 22" aria-hidden="true">
    <line x1="7" y1="11" x2="7" y2="21.5" stroke="#3a3a3a" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="7" cy="6.5" r="5.5" fill="${f}" stroke="${aktiv ? '#fff' : 'rgba(0,0,0,.65)'}" stroke-width="${aktiv ? 2 : 1.2}"/>
    <circle cx="5.3" cy="4.8" r="1.5" fill="rgba(255,255,255,.7)"/>
  </svg></div>`
}
