import type { LatLng, Eintrag, Flaeche } from '../src/types'
export type FlaechenArt = 'gruenland' | 'deich' | 'vorland' | 'ackerfutter' | 'sonstiges'
export type FristArt = 'beweiden_ab' | 'schnitt_bis' | 'antrag_bis' | 'sonstige'
export interface Frist { id: string; art: FristArt; datum: string; text?: string; programm?: string; jaehrlich?: boolean; erledigt?: { datum: string; am?: string; autor?: string; autorId?: string } }
export interface Steckbrief { art?: FlaechenArt; besitz?: 'eigentum' | 'pacht'; flik?: string; schlag?: string; programme?: string[]; fristen?: Frist[] }
export interface Pacht { verpaechter?: string; preisHa?: number; ha?: number; beginn?: string; ende?: string; kuendigungMonate?: number; erinnerung?: string; erledigt?: string; notiz?: string; geaendert?: string }
export type PachtListe = Record<string, Pacht>
export interface FristFaellig { quelle: 'frist' | 'pacht'; eintrag: Flaeche; frist?: Frist; datum: string; tage: number; stufe: 'ueberfaellig' | 'heute' | 'bald'; sperre?: boolean; art?: 'kuendigung' | 'ende' }
export interface Messung { m2: number; ha: number; umfang: number; ueberschneidet: boolean }
export const FLAECHEN_ARTEN: { wert: FlaechenArt; name: string }[]
export const BESITZ: { wert: 'eigentum' | 'pacht'; name: string }[]
export const FRIST_ARTEN: { wert: FristArt; name: string; kurz: string }[]
export const PROGRAMM_VORSCHLAEGE: string[]
export const FRIST_VORLAUF: number
export const FRIST_DRAN: number
export const PACHT_VORLAUF: number
export const PACHT_FELDER: string[]
export function flaechenArt(w?: string): { wert: FlaechenArt; name: string } | null
export function fristArt(w?: string): { wert: FristArt; name: string; kurz: string }
export function projizieren(p: LatLng[]): { x: number; y: number }[]
export function messen(p: LatLng[]): Messung
export function haText(ha: number): string
export function m2Text(m2: number): string
export function umfangText(m: number): string
export function euroText(x: number): string
export function steckbriefSauber(s: unknown): Steckbrief | null
export function flaecheSauber(e: Record<string, unknown>): string | null
export function erledigtUebernehmen<T>(neu: T, alt: unknown): T
export function fristTermin(f: Frist, tag?: string): string
export function sperreBis(f: Frist, tag?: string): string | null
export function fristErledigt(f: Frist, tag?: string): boolean
export function fristenFaellig(eintraege: Eintrag[] | null | undefined, pacht: PachtListe | null | undefined, tag?: string, belegt?: Set<string>): FristFaellig[]
export function fristenDran(l: FristFaellig[]): FristFaellig[]
export function kuendigenBis(p: Pacht | null | undefined): string | null
export function pachtSauber(p: unknown): Pacht | null
export function pachtHa(p: Pacht | null | undefined, gemessenHa: number): number
export function pachtSumme(p: Pacht | null | undefined, gemessenHa: number): number | null
export function pachtGleich(a: Pacht | null | undefined, b: Pacht | null | undefined): boolean
export function flaechenSummen(eintraege: Eintrag[], pacht: PachtListe | null | undefined): { anzahl: number; ha: number; pachtHa: number; eigentumHa: number; pachtEuro: number; ohnePreis: number; nachArt: Record<string, number> }
