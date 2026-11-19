// Typen für die gemeinsame Weideplan-Logik (server/weideplan.js) – genutzt von der App
export type TierArt = 'schaf' | 'bock' | 'lamm'
export type Tiere = Partial<Record<TierArt, number>>
export interface Herde { id: string; name: string; farbe: string; erstellt: string; von?: string }
export type BelegungStatus = 'geplant' | 'aktiv' | 'beendet'
export interface Belegung { id: string; herde: string; herdeName?: string; flaeche: string; flaecheName: string; tiere: Tiere; von: string; bis?: string; ende?: string; naechste?: string; status: BelegungStatus; notiz?: string; erstellt: string; erstelltVon?: string; geaendert: string; geaendertVon?: string }
export interface Ort { id: string; name: string; lat?: number; lng?: number }
export interface Bewegung { id: string; art: 'auftrieb' | 'umtrieb' | 'abtrieb'; datum: string; zeitpunkt: string; herde: string; herdeName: string; tiere: Tiere; von: Ort | null; nach: Ort | null; belegungAlt?: string; belegungNeu?: string; neuAngelegt?: boolean; karte?: Tiere; autor: string; autorId?: string }
export interface Weideplan { ruhetage: number; ruhe: Record<string, number>; herden: Herde[]; belegungen: Belegung[]; bewegungen: Bewegung[] }
export interface UmtriebOp { id: string; belegung: string; nach: string | null; datum: string; neu: string; bis?: string; naechste?: string; tiere?: Tiere; karte?: boolean }
export interface PlanKonflikt { art: 'plan-geaendert' | 'umtrieb-doppelt' | 'umtrieb-weg' | 'umtrieb-zurueck'; titel: string; mitId?: string; gewonnen?: boolean }
export interface PlanErgebnis { ok?: boolean; fehler?: string; konflikt?: PlanKonflikt; schon?: boolean; bewegung?: Bewegung }
interface KarteLike { weideplan?: Weideplan; eintraege: unknown[] }
interface IchLike { id?: string; name?: string }
export type FlaechenStatus = { status: 'belegt' | 'ruht' | 'bereit' | 'frei'; tage: number | null; seit?: string; ruhezeit: number; bereitAb?: string; belegungen: Belegung[]; geplant: Belegung[] }
export interface Faellig { belegung: Belegung; art: 'umtrieb' | 'auftrieb'; datum: string; tage: number; stufe: 'ueberfaellig' | 'heute' | 'bald' }

export const RUHE_STANDARD: number
export const PLAN_MAX: { herden: number; belegungen: number; bewegungen: number }
export const TIER_ARTEN: TierArt[]
export const HERDEN_FARBEN: string[]
export const STATUS_FARBEN: Record<'belegt' | 'ruht' | 'bereit' | 'frei', string>
export function tagOk(s: unknown): boolean
export function heute(d?: Date): string
export function tageZwischen(a: string, b: string): number
export function tagPlus(tag: string, n: number): string
export function planLeer(): Weideplan
export function tiereSauber(t: unknown): Tiere
export function tiereSumme(t?: Tiere): number
export function tiereAusEinheiten(einheiten?: { art: string; anzahl: number }[]): Tiere
export function herdeVon(p: Weideplan | undefined | null, id: string): Herde | null
export function herdeSetzen(k: KarteLike, roh: Partial<Herde>, ich: IchLike | null, jetzt: string): PlanErgebnis
export function herdeLoeschen(k: KarteLike, id: string): PlanErgebnis
export function belegungSetzen(k: KarteLike, roh: Partial<Belegung>, ich: IchLike | null, jetzt: string, basisGeaendert?: string | null): PlanErgebnis
export function belegungLoeschen(k: KarteLike, id: string): PlanErgebnis
export function umtrieb(k: KarteLike, op: UmtriebOp, ich: IchLike | null, jetzt: string): PlanErgebnis
export function umtriebZurueck(k: KarteLike, id: string, ich: IchLike | null, jetzt: string): PlanErgebnis
export function bewegungLoeschen(k: KarteLike, id: string): PlanErgebnis
export function einstellungenSetzen(k: KarteLike, op: { ruhetage?: number; ruhe?: Record<string, number | null> }): PlanErgebnis
export function planErgaenzen(k: KarteLike, roh: unknown, nutzerIds: Set<string>, jetzt: string): { neu: number }
export function flaechenStatus(p: Weideplan | undefined | null, eintraege: { id: string; typ: string }[], tag?: string): Map<string, FlaechenStatus>
export function faellige(p: Weideplan | undefined | null, tag?: string): Faellig[]
export function planAnonymisieren(k: KarteLike, id: string, ersatz: string): void
export function planAufraeumen(k: { weideplan?: Weideplan | null }): void
