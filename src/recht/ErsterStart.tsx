// Kurzer Hinweis beim ersten Öffnen – keine Einwilligung nötig (kein Tracking, nur technisch notwendige Speicherung),
// aber transparent. Blockiert die App nicht; wird pro Gerät einmal bestätigt (versioniert).
import { useEffect, useState } from 'react'
import { HINWEIS_VERSION } from './betreiber.ts'

const KEY = 'wt-hinweis-ok'
export function ErsterStart() {
  const [zeigen, setZeigen] = useState(() => { try { return localStorage.getItem(KEY) !== HINWEIS_VERSION } catch { return false } })
  // Platz unten freihalten, damit der Hinweis keine Knöpfe/Links der Einstiegsseiten verdeckt
  useEffect(() => { document.body.classList.toggle('mit-hinweis', zeigen) }, [zeigen])
  if (!zeigen) return null
  const ok = () => { try { localStorage.setItem(KEY, HINWEIS_VERSION) } catch { /* privat-Modus */ } setZeigen(false) }
  return (
    <div className="erster-start" role="region" aria-label="Hinweis zum Datenschutz">
      <p><b>Willkommen bei FlockMap.</b> Keine Werbung, kein Tracking, keine Cookies. Die App speichert nur, was sie zum Arbeiten braucht – auch auf diesem Gerät, damit sie offline funktioniert. Kartenbilder kommen von Esri bzw. OpenStreetMap (dabei wird deine IP-Adresse übertragen).</p>
      <div className="erster-start-knoepfe">
        <a href="#recht/datenschutz">Datenschutz</a>
        <button className="primaer" onClick={ok}>Verstanden</button>
      </div>
    </div>
  )
}
