import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HofEinstieg, Betreiber } from './Hof.tsx'
import { speicherStarten } from './speicher.ts'

// Einstieg: ?betreiber (Höfe anlegen), ?hof=ID[&einladung=CODE] (Hof beitreten / mit PIN anmelden), sonst die Karte
const p = new URLSearchParams(location.search)
const hofId = !p.get('karte') ? p.get('hof') : null
// Gerätespeicher (IndexedDB) zuerst laden, damit die Karte auch ohne Netz sofort mit dem letzten Stand erscheint
await speicherStarten()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {p.has('betreiber') ? <Betreiber /> : hofId ? <HofEinstieg hofId={hofId} einladung={p.get('einladung')} /> : <App />}
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
