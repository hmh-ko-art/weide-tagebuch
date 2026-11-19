// ZENTRALE ANGABEN für Impressum, Datenschutz und Nutzungsbedingungen – hier ändern, nirgends sonst.
// Quelle Betreiberdaten: Impressum auf https://heckernatur.de/impressum (abgerufen 19.11.2026).
// ENTWURF – vor dem Verkauf anwaltlich prüfen lassen (siehe docs/RECHTLICHES.md).

export const BETREIBER = {
  firma: 'Hecker Natur GbR',
  strasse: 'Sönke-Nissen-Koog 41',
  ort: '25821 Reußenköge',
  land: 'Deutschland',
  vertreten: ['Femke Hecker', 'Henning Hecker'], // vertretungsberechtigte Gesellschafter
  telefon: '+49 4674 431',
  email: 'info@heckernatur.de',
  web: 'https://heckernatur.de',
  webText: 'heckernatur.de',
  ustId: 'DE341638964',
}

// Hoster: per Build-Variable VITE_HOSTER=hetzner umschalten (Standard: render). Texte hier pflegen.
export interface Hoster { name: string; adresse: string; standort: string; drittland: boolean; grundlage: string; datenschutz: string; logs: string }
export const HOSTER: Record<'render' | 'hetzner', Hoster> = {
  render: {
    name: 'Render Services, Inc.',
    adresse: '525 Brannan Street, Suite 300, San Francisco, CA 94107, USA',
    standort: 'Server und Datenbank im Rechenzentrum Frankfurt am Main (EU)',
    drittland: true,
    grundlage: 'Render ist ein Unternehmen mit Sitz in den USA. Ein Zugriff aus den USA kann daher nicht ausgeschlossen werden. Grundlage sind der Auftragsverarbeitungsvertrag von Render mit den EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) und – soweit Render zertifiziert ist – das EU-US Data Privacy Framework (Art. 45 DSGVO).',
    datenschutz: 'https://render.com/privacy',
    logs: 'Render speichert Zugriffsprotokolle (u. a. IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-Kennung) für einen begrenzten Zeitraum zur Sicherstellung des Betriebs.',
  },
  hetzner: {
    name: 'Hetzner Online GmbH',
    adresse: 'Industriestr. 25, 91710 Gunzenhausen, Deutschland',
    standort: 'Rechenzentrum in Deutschland',
    drittland: false,
    grundlage: 'Mit Hetzner besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO. Die Daten verlassen Deutschland nicht.',
    datenschutz: 'https://www.hetzner.com/de/legal/privacy-policy',
    logs: 'Der Webserver schreibt keine Zugriffsprotokolle; protokolliert werden nur technische Fehlermeldungen des Programms (ohne IP-Adressen).',
  },
}
export const AKTIVER_HOSTER = HOSTER[import.meta.env.VITE_HOSTER === 'hetzner' ? 'hetzner' : 'render']
export const GEPLANTER_HOSTER = import.meta.env.VITE_HOSTER === 'hetzner' ? null : HOSTER.hetzner

export const STAND = '19. November 2026'
export const AUFSICHT = 'Unabhängiges Landeszentrum für Datenschutz Schleswig-Holstein (ULD), Holstenstraße 98, 24103 Kiel, www.datenschutzzentrum.de'
// Version des Hinweises beim ersten Start – erhöhen, wenn sich am Datenschutz Wesentliches ändert
export const HINWEIS_VERSION = '1'
