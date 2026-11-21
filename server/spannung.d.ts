export interface Messung { datum: string; kv: number; zeitpunkt?: string; autor?: string; autorId?: string }
export const SPANNUNG_MAX: number
export const SCHWELLE_STANDARD: number
export function kvWert(x: unknown): number | undefined
export function spannungSauber(l: unknown): Messung[]
export function spannungEintragen<T>(e: T, m: Partial<Messung>): T
export function spannungLetzte(e: unknown): Messung | null
export const ZAUN_ARTEN: string[]
export function mitSpannung(e: unknown): boolean
export function kvText(kv: number): string
export function spannungFeld(e: Record<string, unknown>): void
export function heute(d?: Date): string
