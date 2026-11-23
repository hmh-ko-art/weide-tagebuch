import type { LatLng } from './types'

// 7s-1: Keine Routenberechnung in der App (der OSRM-Demo-Server ist nur für nicht-kommerzielle Nutzung freigegeben).
// Navigation läuft ausschließlich über Google Maps (öffnet die Google-Maps-App bzw. -Seite mit dem Ziel).
export const googleNaviLink = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
