// 7s-1: öffentliche Adresse der App für Links (Admin-, Einladungs-, Freischalt-Links).
// Vorbereitet für die eigene Domain: beim Build VITE_APP_BASIS=https://flockmap.de setzen, sobald die Domain auf den Server zeigt.
// Ohne Variable: die Adresse, unter der die App gerade läuft (z. B. …onrender.com) – Render bleibt so erreichbar.
const roh = (import.meta.env.VITE_APP_BASIS as string | undefined)?.trim()
export const APP_BASIS = (roh && /^https?:\/\//.test(roh) ? roh : location.origin).replace(/\/+$/, '')
export const appLink = (query: string) => `${APP_BASIS}/?${query}`
