import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { HofEinstieg, Betreiber } from './Hof.tsx'

// Einstieg: ?betreiber (Höfe anlegen), ?hof=ID[&einladung=CODE] (Hof beitreten / mit PIN anmelden), sonst die Karte
const p = new URLSearchParams(location.search)
const hofId = !p.get('karte') ? p.get('hof') : null
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {p.has('betreiber') ? <Betreiber /> : hofId ? <HofEinstieg hofId={hofId} einladung={p.get('einladung')} /> : <App />}
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')
