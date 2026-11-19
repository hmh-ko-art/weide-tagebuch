// Warnschwelle für die Zaunspannung (pro Karte und Gerät), Standard 4 kV
import { SCHWELLE_STANDARD } from '../../server/spannung.js'
const key = (karte: string) => `wt-spannung-schwelle:${karte}`
export function schwelleLesen(karte: string): number {
  const n = Number(localStorage.getItem(key(karte)))
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : SCHWELLE_STANDARD
}
export function schwelleSetzen(karte: string, n: number) { localStorage.setItem(key(karte), String(n)) }
export const tagKurz = (datum: string, heute: string, gestern: string) => (datum === heute ? 'heute' : datum === gestern ? 'gestern' : datum.split('-').reverse().slice(0, 2).join('.') + '.')
