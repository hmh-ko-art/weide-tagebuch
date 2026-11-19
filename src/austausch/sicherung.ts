// Vollständige Sicherung einer Karte als JSON (Einträge inkl. Notizen und Tierzahlen, Gruppen inkl. Farbe und Nummernfolge).
// Enthält bewusst KEINE Zugänge/Links von Personen – die Datei kann gefahrlos aufbewahrt werden.
import { migrieren, type Eintrag, type Gruppe } from '../types'
import type { Weideplan } from '../../server/weideplan.js'

export interface Sicherung { app: 'flockmap'; art: 'sicherung'; version: 2; exportiert: string; karte: { id: string | null; name: string; hof?: string }; gruppen: Gruppe[]; eintraege: Eintrag[]; weideplan?: Weideplan }

export function sicherungErzeugen(karte: { id: string | null; name: string; hof?: string }, eintraege: Eintrag[], gruppen: Gruppe[], weideplan?: Weideplan | null): Sicherung {
  return {
    app: 'flockmap', art: 'sicherung', version: 2, exportiert: new Date().toISOString(), karte,
    gruppen: gruppen.map((g) => ({ id: g.id, name: g.name, ...(g.farbe ? { farbe: g.farbe } : {}), reihenfolge: g.reihenfolge ?? [] })),
    // Notizen und Geräte-Prüfungen mit Autor-Namen als Text, ohne interne Personen-IDs
    eintraege: eintraege.map((e) => ({ ...e, notizen: e.notizen.map((n) => ({ id: n.id, text: n.text, zeitpunkt: n.zeitpunkt, ...(n.autor ? { autor: n.autor } : {}) })), ...(e.typ === 'pin' && e.geraet ? { geraet: { ...e.geraet, ...(e.geraet.pruefungen ? { pruefungen: e.geraet.pruefungen.map(({ autorId: _a, ...p }) => p) } : {}) } } : {}) })),
    // Weideplan: Herden, Belegungen, Umtriebs-Protokoll (Namen der Erfasser als Text, ohne interne Personen-IDs)
    ...(weideplan && (weideplan.herden.length || weideplan.belegungen.length || weideplan.bewegungen.length) ? { weideplan: {
      ...weideplan,
      belegungen: weideplan.belegungen.map(({ erstelltVon: _e, ...b }) => b),
      bewegungen: weideplan.bewegungen.map(({ autorId: _a, ...b }) => b),
    } } : {}),
  }
}

// Liest neue Sicherungen (v2) und alte Exporte ({ app, version: 1, eintraege } bzw. reine Liste)
export function sicherungLesen(j: unknown): { name: string; exportiert?: string; eintraege: Eintrag[]; gruppen: Gruppe[]; weideplan?: Weideplan } {
  const o = j as Partial<Sicherung> & { eintraege?: unknown }
  const liste = Array.isArray(j) ? j : o?.eintraege
  if (!Array.isArray(liste)) throw new Error('Das ist keine FlockMap-Sicherung')
  const eintraege = liste.filter((e) => e && typeof e.id === 'string' && (e.typ === 'pin' || e.typ === 'flaeche' || e.typ === 'linie') && (e.typ === 'pin' ? e.position && Number.isFinite(e.position.lat) : Array.isArray(e.punkte))).map((e) => migrieren({ notizen: [], erstellt: new Date().toISOString(), geaendert: new Date().toISOString(), titel: '', ...e } as Eintrag))
  const gruppen = (Array.isArray(o?.gruppen) ? o.gruppen : []).filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
  const wp = o?.weideplan && typeof o.weideplan === 'object' && Array.isArray(o.weideplan.herden) && Array.isArray(o.weideplan.belegungen) && Array.isArray(o.weideplan.bewegungen) ? o.weideplan : undefined
  return { name: o?.karte?.name ?? '', exportiert: o?.exportiert, eintraege, gruppen, ...(wp ? { weideplan: wp } : {}) }
}
