import type { LatLng, Eintrag, Linie, Pin } from '../src/types'
export type LinienArt = 'elektronetz' | 'festzaun' | 'litze' | 'weg' | 'graben' | 'sonstiges'
export type InfraArt = 'traenke' | 'geraet' | 'tor' | 'unterstand' | 'salz'
export interface Pruefung { id: string; datum: string; kv?: number; stand?: 'voll' | 'halb' | 'leer'; autor?: string; autorId?: string; zeitpunkt?: string }
export interface Geraet { strom?: 'akku' | 'batterie' | 'solar' | 'netz'; stand?: 'voll' | 'halb' | 'leer'; geprueft?: string; kv?: number; intervall?: number; pruefungen?: Pruefung[] }
export interface Tor { id: string; pos: number; breite: number }
export interface GeraetFaellig { eintrag: Pin; datum: string; tage: number; nie: boolean; leer: boolean; stufe: 'ueberfaellig' | 'heute' | 'bald' }
export const LINIEN_ARTEN: { wert: LinienArt; name: string; farbe: string; strich: string; breite: number }[]
export const INFRA_ARTEN: { wert: InfraArt; name: string; kurz: string; farbe: string }[]
export const STROM_ARTEN: { wert: NonNullable<Geraet['strom']>; name: string }[]
export const STAENDE: { wert: 'voll' | 'halb' | 'leer'; name: string }[]
export const PRUEF_STANDARD: number
export const NETZ_LAENGE: number
export const TOR_BREITE: number
export function linienArt(w?: string): (typeof LINIEN_ARTEN)[number]
export function infraArt(w?: string): (typeof INFRA_ARTEN)[number] | null
export function istLinie(e: Eintrag | undefined | null): e is Linie
export function istInfra(e: Eintrag | undefined | null): e is Pin & { infra: InfraArt }
export function istNormal(e: Eintrag): boolean
export function abstandM(a: LatLng, b: LatLng): number
export function linienPunkte(e: { punkte: LatLng[]; geschlossen?: boolean }): LatLng[]
export function gesamtLaenge(e: { punkte: LatLng[]; geschlossen?: boolean }): number
export function linienLaenge(e: { punkte: LatLng[]; geschlossen?: boolean; tore?: Tor[] }): number
export function netzAnzahl(m: number): number
export function laengeText(m: number): string
export function punktBei(e: { punkte: LatLng[]; geschlossen?: boolean }, pos: number): LatLng
export function naechsteStelle(e: { punkte: LatLng[]; geschlossen?: boolean }, q: LatLng): { pos: number; abstand: number }
export function linienStuecke(e: { punkte: LatLng[]; geschlossen?: boolean; tore?: Tor[] }): LatLng[][]
export function geraetFaellig(e: Eintrag, tag?: string): GeraetFaellig | null
export function geraeteFaellig(eintraege: Eintrag[] | null | undefined, tag?: string): GeraetFaellig[]
export function pruefungEintragen<T extends Eintrag>(e: T, p: Pruefung): T
export function eintragSauber(e: Record<string, unknown>): string | null
export function zaunUmFlaeche(f: { id: string; titel: string; punkte: LatLng[] }, art: LinienArt, id: string, jetzt: string): Linie
export function linienArtRaten(name?: string): LinienArt
export function infraRaten(name?: string): InfraArt | null
