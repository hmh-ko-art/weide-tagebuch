// Eigene Symbole für Weide-Technik (rund, gut auf Satellitenbild erkennbar) – Karte, Liste und Detail
import { infraArt, type InfraArt } from '../../server/infrastruktur.js'

const GLYPHE: Record<InfraArt, string> = {
  // Tropfen
  traenke: '<path d="M12 4.5c3 4 5 6.6 5 9.2a5 5 0 0 1-10 0c0-2.6 2-5.2 5-9.2Z" fill="#fff"/>',
  // Blitz
  geraet: '<path d="M13.2 3.8 7 13.2h4.4l-1 7 6.6-9.6h-4.6l.8-6.8Z" fill="#1d2a1d"/>',
  // Tor: zwei Pfosten, Querlatten, Diagonale
  tor: '<g stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M6 6v12M18 6v12M6 9h12M6 15h12M6 15 18 9"/></g>',
  // Unterstand: Dach + Pfosten
  unterstand: '<g stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M4.5 11 12 5.5l7.5 5.5M7 10v8M17 10v8M7 14h10"/></g>',
  // Salzleckstein: Würfel
  salz: '<g stroke="#455a64" stroke-width="1.5" stroke-linejoin="round"><path d="M12 5 18.5 8.5v7L12 19l-6.5-3.5v-7Z" fill="#fff"/><path d="M5.5 8.5 12 12l6.5-3.5M12 12v7" fill="none"/></g>',
}

// warn: rote Umrandung (Gerät: Prüfung fällig/überfällig oder Akku leer)
export function infraSvg(art: InfraArt, groesse = 28, aktiv = false, warn = false) {
  const a = infraArt(art)!
  const rand = warn ? '#d32f2f' : aktiv ? '#f57c00' : '#fff'
  return `<svg width="${groesse}" height="${groesse}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${warn || aktiv ? 10.2 : 10.6}" fill="${a.farbe}" stroke="${rand}" stroke-width="${warn || aktiv ? 2.6 : 1.8}"/>${GLYPHE[art]}</svg>`
}
