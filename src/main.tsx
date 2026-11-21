import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HofEinstieg, Betreiber } from './Hof.tsx'
import { speicherStarten } from './speicher.ts'
import { RechtOverlay } from './recht/Recht.tsx'
import { ErsterStart } from './recht/ErsterStart.tsx'
import { LETZTE_KARTE, KARTEN_ID } from './daten.ts'

// Einstieg: ?betreiber (Höfe anlegen), ?hof=ID[&einladung=CODE] (Hof beitreten / mit PIN anmelden), sonst die Karte
const p = new URLSearchParams(location.search)
const hofId = !p.get('karte') ? p.get('hof') : null
// 7o: Start ohne Karte (Home-Bildschirm-Symbol mit start_url „/“, Lesezeichen) -> sofort zur zuletzt geöffneten Karte;
// der Zugang liegt schon auf dem Gerät. Die Handy-Karte (nur dieses Gerät) bleibt über „?lokal“ erreichbar.
const letzte = localStorage.getItem(LETZTE_KARTE)
if (!p.has('karte') && !p.has('hof') && !p.has('betreiber') && !p.has('lokal') && letzte && KARTEN_ID.test(letzte)) {
  location.replace(`${location.pathname}?karte=${encodeURIComponent(letzte)}${location.hash}`)
  await new Promise(() => {}) // nichts rendern, die Weiterleitung läuft
}
// Gerätespeicher (IndexedDB) zuerst laden, damit die Karte auch ohne Netz sofort mit dem letzten Stand erscheint
await speicherStarten()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {p.has('betreiber') ? <Betreiber /> : hofId ? <HofEinstieg hofId={hofId} einladung={p.get('einladung')} /> : <App />}
    {!p.has('betreiber') && <ErsterStart />}
    <RechtOverlay />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
