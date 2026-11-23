// 7s-1: Hof-Lizenzen (Einmalkauf). Codes werden nur gehasht gespeichert (HMAC-SHA256 mit geheimem Pepper),
// der Klartext erscheint genau einmal – in der Antwort an den Betreiber, der ihn dem Käufer schickt.
import crypto from 'node:crypto'

// Crockford-artiges Alphabet ohne 0/O/1/I/L (keine Verwechslung beim Abtippen)
export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const ARTEN = ['pilot', 'hof', 'test']
export const STATUS = ['offen', 'eingeloest', 'gesperrt']

// FM-XXXX-XXXX-XXXX: 12 Zeichen aus 31 -> ~59 Bit Zufall (ohne Verzerrung: Ablehnung von Bytes ≥ 248)
export function codeErzeugen() {
  const z = []
  while (z.length < 12) for (const b of crypto.randomBytes(16)) if (b < 248 && z.length < 12) z.push(ALPHABET[b % 31])
  return `FM-${z.slice(0, 4).join('')}-${z.slice(4, 8).join('')}-${z.slice(8).join('')}`
}
// Eingabe normalisieren: Groß/klein, Leerzeichen, Bindestriche egal; verwechselbare Zeichen angleichen (O->0 gibt es nicht, also O/0 ungültig)
export function normal(roh) {
  if (typeof roh !== 'string') return null
  let s = roh.toUpperCase().replace(/[\s\-_.]/g, '')
  if (s.startsWith('FM')) s = s.slice(2)
  if (s.length !== 12) return null
  for (const c of s) if (!ALPHABET.includes(c)) return null
  return s
}
// Pepper: FLOCKMAP_LIZENZ_PEPPER, sonst aus dem Betreiber-Schlüssel abgeleitet (nie im Frontend, nie in der Datenbank)
export function pepper(env = process.env) {
  if (env.FLOCKMAP_LIZENZ_PEPPER && env.FLOCKMAP_LIZENZ_PEPPER.length >= 16) return env.FLOCKMAP_LIZENZ_PEPPER
  const t = env.FLOCKMAP_ADMIN_TOKEN
  if (!t || t.length < 16) return null
  return crypto.createHash('sha256').update('flockmap-lizenz-pepper:' + t).digest('hex')
}
export const codeHash = (normalisiert, p) => crypto.createHmac('sha256', p).update(normalisiert).digest('hex')
export const codeEnde = (code) => code.replace(/-/g, '').slice(-4)
