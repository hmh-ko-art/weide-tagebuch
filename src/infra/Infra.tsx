// Zäune & Wasser: Zaunlinien/Wege/Gräben und Weide-Technik (Tränke, Weidezaungerät; Tor/Unterstand/Salzleckstein nur noch als Altbestand)
import { useEffect, useState } from 'react'
import { INFRA_ALT, INFRA_ARTEN, LINIEN_ARTEN, NETZ_LAENGE, PRUEF_STANDARD, STAENDE, STROM_ARTEN, infraArt, infraWaehlbar, istInfra, istLinie, laengeText, linienArt, linienLaenge, netzAnzahl, type Geraet, type InfraArt, type LinienArt } from '../../server/infrastruktur.js'
import { heute, tagPlus, tageZwischen } from '../../server/weideplan.js'
import { pinFarbe, tagText, type Eintrag, type Linie, type Pin } from '../types'
import { infraSvg } from '../map/symbole'

export const INFRA_SYMBOL: Record<InfraArt, string> = { traenke: '💧', geraet: '⚡', tor: '🚪', unterstand: '🏠', salz: '🧂' }

export function InfraSymbol(p: { art: InfraArt; groesse?: number; warn?: boolean }) {
  return <span className="infra-symbol" aria-hidden="true" dangerouslySetInnerHTML={{ __html: infraSvg(p.art, p.groesse ?? 22, false, !!p.warn) }} />
}
export function LinienSymbol(p: { e?: Linie; art?: LinienArt; farbe?: string }) {
  const a = linienArt(p.e?.linienArt ?? p.art)
  const f = p.farbe ?? (p.e ? pinFarbe(p.e) : a.farbe)
  return (
    <svg className="linien-symbol" width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
      <line x1="2" y1="7" x2="24" y2="7" stroke="#0006" strokeWidth={a.breite + 2.5} strokeLinecap="round" />
      <line x1="2" y1="7" x2="24" y2="7" stroke={f} strokeWidth={a.breite} strokeDasharray={a.strich ? a.strich.split(' ').map((x) => Number(x) / 2).join(' ') : undefined} />
    </svg>
  )
}

// Ein-/Ausblenden pro Gerät: Liste der ausgeblendeten Arten, '__alle' = ganze Ebene aus
export function useInfraAus() {
  const [aus, setAus] = useState<string[]>(() => { try { const x = JSON.parse(localStorage.getItem('wt-infra-aus') || '[]'); return Array.isArray(x) ? x.filter((v) => typeof v === 'string') : [] } catch { return [] } })
  useEffect(() => { localStorage.setItem('wt-infra-aus', JSON.stringify(aus)) }, [aus])
  const umschalten = (w: string) => setAus((l) => (l.includes(w) ? l.filter((x) => x !== w) : [...l, w]))
  const sichtbar = (e: Eintrag) => {
    if (istLinie(e)) return !aus.includes('__alle') && !aus.includes(linienArt(e.linienArt).wert)
    if (istInfra(e)) return !aus.includes('__alle') && !aus.includes(e.infra)
    return true
  }
  return { aus, umschalten, sichtbar }
}

const strichText = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
export const netzText = (m: number) => `${netzAnzahl(m)} ${netzAnzahl(m) === 1 ? 'Netz' : 'Netze'} à ${NETZ_LAENGE} m`

// Zustand eines Weidezaungeräts in Worten (für Detail und Liste)
export function geraetStatus(e: Pin): { text: string; stufe: 'ok' | 'bald' | 'heute' | 'ueberfaellig'; faellig: string } {
  const g = e.geraet ?? {}
  const t = heute()
  const intervall = g.intervall ?? PRUEF_STANDARD
  if (!g.geprueft) return { text: 'Noch nie geprüft', stufe: 'ueberfaellig', faellig: t }
  const faellig = tagPlus(g.geprueft, intervall)
  const vor = tageZwischen(g.geprueft, t)
  const bis = tageZwischen(t, faellig)
  const wann = vor === 0 ? 'heute' : vor === 1 ? 'gestern' : `vor ${vor} Tagen`
  const stufe = bis < 0 || g.stand === 'leer' ? 'ueberfaellig' : bis === 0 ? 'heute' : bis === 1 ? 'bald' : 'ok'
  return { text: `Geprüft ${wann} (${tagText(g.geprueft)})`, stufe, faellig }
}
export function geraetZeile(g: Geraet | undefined) {
  if (!g) return ''
  return [g.kv != null && `${strichText(g.kv)} kV`, g.strom && STROM_ARTEN.find((x) => x.wert === g.strom)?.name, g.stand && `Ladestand ${STAENDE.find((x) => x.wert === g.stand)?.name}`].filter(Boolean).join(' · ')
}
export const faelligText = (s: ReturnType<typeof geraetStatus>) => {
  const d = tageZwischen(s.faellig, heute())
  return s.stufe === 'ueberfaellig' ? (d > 0 ? `Prüfung überfällig seit ${d} ${d === 1 ? 'Tag' : 'Tagen'}` : 'Prüfung fällig') : s.stufe === 'heute' ? 'Prüfung heute fällig' : s.stufe === 'bald' ? 'Prüfung morgen fällig' : `Nächste Prüfung ${tagText(s.faellig)}`
}

// Geprüft-Knopf mit optionaler Spannung und Ladestand (ein Tipp genügt; Werte sind freiwillig)
export function PruefKnopf(p: { e: Pin; onGeprueft: (x: { datum: string; kv?: number; stand?: 'voll' | 'halb' | 'leer' }) => void; klein?: boolean }) {
  const [offen, setOffen] = useState(false)
  const [kv, setKv] = useState('')
  const [stand, setStand] = useState<'' | 'voll' | 'halb' | 'leer'>('')
  const strom = p.e.geraet?.strom
  const mitStand = strom !== 'netz'
  const senden = () => {
    const v = Number(kv.replace(',', '.'))
    p.onGeprueft({ datum: heute(), ...(kv.trim() && v >= 0 && v <= 20 ? { kv: Math.round(v * 10) / 10 } : {}), ...(stand ? { stand } : {}) })
    setOffen(false); setKv(''); setStand('')
  }
  if (p.klein) return <button className="primaer" onClick={() => p.onGeprueft({ datum: heute() })}>✓ Geprüft</button>
  return (
    <div className="pruef-knopf">
      <div className="knoepfe">
        <button className="primaer" onClick={senden}>✓ Heute geprüft</button>
        <button type="button" className="link-knopf" aria-expanded={offen} onClick={() => setOffen((o) => !o)}>{offen ? 'weniger' : '+ Spannung / Akku'}</button>
      </div>
      {offen && (
        <div className="zeile pruef-werte">
          <label>Spannung (kV)<input inputMode="decimal" placeholder="z. B. 6,5" value={kv} onChange={(x) => setKv(x.target.value)} /></label>
          {mitStand && <label>{strom === 'batterie' ? 'Batterie' : 'Akku'}<select value={stand} onChange={(x) => setStand(x.target.value as typeof stand)}>
            <option value="">– unverändert –</option>
            {STAENDE.map((s) => <option key={s.wert} value={s.wert}>{s.name}</option>)}
          </select></label>}
        </div>
      )}
    </div>
  )
}

// Zusatz in der Detailansicht: Linie (Länge, Netze, Punkte/Tore), Gerät (Status, Prüfen), Fläche (Zäune darum)
export function InfraDetail(p: { e: Eintrag; alle: Eintrag[]; darfBearbeiten: boolean; kannBearbeiten: boolean; onGeprueft: (x: { datum: string; kv?: number; stand?: 'voll' | 'halb' | 'leer' }) => void; onPunkte: () => void; onTore: () => void; onZaun: () => void; onWahl: (id: string) => void; onZaunWeg?: (z: Linie, ev: { clientX: number; clientY: number }) => void; kannEintrag?: (e: Eintrag) => boolean }) {
  const { e } = p
  if (istLinie(e)) {
    const a = linienArt(e.linienArt), m = linienLaenge(e)
    const f = e.flaeche ? p.alle.find((x) => x.id === e.flaeche && x.typ === 'flaeche') : undefined
    return (
      <div className="infra-detail">
        <p className="infra-werte"><LinienSymbol e={e} /> <strong>{a.name}</strong> · <strong>{laengeText(m)}</strong>{e.geschlossen ? ' (geschlossen)' : ''}
          {e.linienArt === 'elektronetz' && <> · ≈ {netzText(m)}</>}
          {(e.tore?.length ?? 0) > 0 && <> · {e.tore!.length} {e.tore!.length === 1 ? 'Tor' : 'Tore'} (Lücke abgezogen)</>}
          {f && <> · um <button className="link-knopf" onClick={() => p.onWahl(f.id)}>{f.titel || 'Fläche'}</button></>}</p>
        {e.linienArt !== 'elektronetz' && e.linienArt !== 'weg' && e.linienArt !== 'graben' && <p className="hinweis klein">Als Elektronetz wären das ≈ {netzText(m)}.</p>}
        {p.kannBearbeiten && <div className="knoepfe">
          <button onClick={p.onPunkte}>✏️ Punkte bearbeiten</button>
          {e.linienArt !== 'weg' && e.linienArt !== 'graben' && <button onClick={p.onTore}>🚪 Tore setzen</button>}
          {e.linienArt !== 'weg' && e.linienArt !== 'graben' && p.onZaunWeg && <button className="gefahr zaun-weg" onClick={(ev) => p.onZaunWeg!(e, ev)}>🗑 Zaun entfernen</button>}
        </div>}
      </div>
    )
  }
  if (istInfra(e)) {
    const a = infraArt(e.infra)!
    if (e.infra !== 'geraet') return <p className="infra-werte"><InfraSymbol art={e.infra} /> <strong>{a.name}</strong></p>
    const s = geraetStatus(e)
    const letzte = [...(e.geraet?.pruefungen ?? [])].sort((x, y) => (y.zeitpunkt ?? y.datum).localeCompare(x.zeitpunkt ?? x.datum)).slice(0, 3)
    return (
      <div className={`infra-detail geraet-${s.stufe}`}>
        <p className="infra-werte"><InfraSymbol art="geraet" warn={s.stufe === 'ueberfaellig' || s.stufe === 'heute'} /> <strong>Weidezaungerät</strong>{geraetZeile(e.geraet) && <> · {geraetZeile(e.geraet)}</>}</p>
        <p className={`geraet-status st-${s.stufe}`}>{s.text} · <strong>{faelligText(s)}</strong>{e.geraet?.stand === 'leer' && ' · Akku/Batterie leer!'}</p>
        {p.darfBearbeiten && <PruefKnopf e={e} onGeprueft={p.onGeprueft} />}
        {letzte.length > 0 && <details className="pruef-verlauf"><summary>Letzte Prüfungen</summary><ul>{letzte.map((x) => <li key={x.id}>{tagText(x.datum)}{x.kv != null && ` · ${strichText(x.kv)} kV`}{x.stand && ` · ${STAENDE.find((s2) => s2.wert === x.stand)?.name}`}{x.autor && ` · ${x.autor}`}</li>)}</ul></details>}
      </div>
    )
  }
  if (e.typ === 'flaeche') {
    const zaeune = p.alle.filter((x): x is Linie => istLinie(x) && x.flaeche === e.id)
    if (!zaeune.length && !p.darfBearbeiten) return null
    return (
      <div className="infra-detail">
        {zaeune.map((z) => <div key={z.id} className="zaun-zeile">
          <p className="infra-werte"><LinienSymbol e={z} /> <button className="link-knopf" onClick={() => p.onWahl(z.id)}>{z.titel || linienArt(z.linienArt).name}</button> · {laengeText(linienLaenge(z))}{z.linienArt === 'elektronetz' && <> · ≈ {netzText(linienLaenge(z))}</>}</p>
          {p.darfBearbeiten && (p.kannEintrag?.(z) ?? true) && <div className="knoepfe">
            <button onClick={() => p.onWahl(z.id)}>✏️ Zaun bearbeiten</button>
            {p.onZaunWeg && <button className="gefahr zaun-weg" onClick={(ev) => p.onZaunWeg!(z, ev)}>🗑 Zaun entfernen</button>}
          </div>}
        </div>)}
        {zaeune.length > 1 && <p className="hinweis klein">⚠️ Diese Fläche hat {zaeune.length} Zäune – pro Fläche gilt nur einer. Überzählige bitte entfernen.</p>}
        {p.darfBearbeiten && (zaeune.length
          ? (p.kannEintrag?.(zaeune[0]) ?? true) && <button className="zaun-neu" onClick={p.onZaun}>↻ Zaun neu um Fläche legen (ersetzt)</button>
          : <button className="zaun-setzen" onClick={p.onZaun}>〰 Zaun setzen</button>)}
      </div>
    )
  }
  return null
}

// Felder im Formular: Art der Nadel (normale Nadel oder Weide-Technik), Gerätedaten; Linienart
export interface PruefNeu { an: boolean; kv: string; stand: '' | 'voll' | 'halb' | 'leer' }
export function InfraFormular(p: { e: Eintrag; setE: (e: Eintrag) => void; neu: boolean; pruef: PruefNeu; setPruef: (x: PruefNeu) => void }) {
  const { e } = p
  if (e.typ === 'linie') {
    const m = linienLaenge(e)
    return (
      <div className="infra-form">
        <label>Art der Linie<select value={linienArt(e.linienArt).wert} onChange={(x) => p.setE({ ...e, linienArt: x.target.value as LinienArt, farbe: undefined })}>
          {LINIEN_ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.name}</option>)}
        </select></label>
        <p className="hinweis"><LinienSymbol e={e} /> Länge <strong>{laengeText(m)}</strong>{e.linienArt === 'elektronetz' ? <> · ≈ {netzText(m)}</> : ''}</p>
        {e.punkte.length >= 3 && <label className="check"><input type="checkbox" checked={!!e.geschlossen} onChange={(x) => p.setE({ ...e, geschlossen: x.target.checked || undefined })} /> Geschlossen (Ring, letzter Punkt zurück zum ersten)</label>}
      </div>
    )
  }
  if (e.typ !== 'pin') return null
  const g = e.geraet ?? {}
  const setG = (teil: Partial<Geraet>) => p.setE({ ...e, geraet: { ...g, ...teil } })
  return (
    <div className="infra-form">
      <span className="feldname">Was ist hier?</span>
      <div className="infra-chips" role="radiogroup" aria-label="Art der Nadel">
        <button type="button" role="radio" aria-checked={!e.infra} className={!e.infra ? 'aktiv' : ''} onClick={() => p.setE({ ...e, infra: undefined, geraet: undefined })}>📍 Nadel</button>
        {infraWaehlbar(e.infra).map((a) => (
          <button type="button" key={a.wert} role="radio" aria-checked={e.infra === a.wert} className={e.infra === a.wert ? 'aktiv' : ''}
            onClick={() => p.setE({ ...e, infra: a.wert, geraet: a.wert === 'geraet' ? { intervall: PRUEF_STANDARD, strom: 'akku', ...e.geraet } : undefined })}>
            <InfraSymbol art={a.wert} groesse={18} /> {a.kurz}{INFRA_ALT.includes(a.wert) && <small> (alt)</small>}
          </button>
        ))}
      </div>
      {e.infra === 'geraet' && (
        <>
          <div className="zeile">
            <label>Strom<select value={g.strom ?? ''} onChange={(x) => setG({ strom: (x.target.value || undefined) as Geraet['strom'] })}>
              <option value="">– k. A. –</option>
              {STROM_ARTEN.map((s) => <option key={s.wert} value={s.wert}>{s.name}</option>)}
            </select></label>
            <label>Prüfen alle<select value={g.intervall ?? PRUEF_STANDARD} onChange={(x) => setG({ intervall: Number(x.target.value) })}>
              {[1, 2, 3, 5, 7, 10, 14, 21, 28].map((n) => <option key={n} value={n}>{n === 1 ? 'jeden Tag' : `${n} Tage`}</option>)}
            </select></label>
          </div>
          {p.neu && (
            <>
              <label className="check"><input type="checkbox" checked={p.pruef.an} onChange={(x) => p.setPruef({ ...p.pruef, an: x.target.checked })} /> Heute geprüft</label>
              {p.pruef.an && <div className="zeile">
                <label>Spannung (kV)<input inputMode="decimal" placeholder="optional" value={p.pruef.kv} onChange={(x) => p.setPruef({ ...p.pruef, kv: x.target.value })} /></label>
                {g.strom !== 'netz' && <label>Ladestand<select value={p.pruef.stand} onChange={(x) => p.setPruef({ ...p.pruef, stand: x.target.value as PruefNeu['stand'] })}>
                  <option value="">– k. A. –</option>
                  {STAENDE.map((s) => <option key={s.wert} value={s.wert}>{s.name}</option>)}
                </select></label>}
              </div>}
            </>
          )}
          {!p.neu && <p className="hinweis klein">Prüfungen (Spannung, Akku) trägst du in der Detailansicht mit „✓ Heute geprüft“ ein.</p>}
        </>
      )}
    </div>
  )
}

// Reiter „Zäune & Wasser“ in der Liste
export function InfraListe(p: { eintraege: Eintrag[]; aus: string[]; onUmschalten: (w: string) => void; onWahl: (e: Eintrag) => void; darfBearbeiten: boolean; onGeprueft: (id: string) => void }) {
  const linien = p.eintraege.filter(istLinie)
  const punkte = p.eintraege.filter(istInfra)
  const geraete = punkte.filter((e) => e.infra === 'geraet').map((e) => ({ e, s: geraetStatus(e) })).sort((a, b) => a.s.faellig.localeCompare(b.s.faellig))
  const proArt = LINIEN_ARTEN.map((a) => { const l = linien.filter((x) => linienArt(x.linienArt).wert === a.wert); return { a, l, m: l.reduce((s, x) => s + linienLaenge(x), 0) } }).filter((x) => x.l.length)
  const proInfra = INFRA_ARTEN.map((a) => ({ a, l: punkte.filter((x) => x.infra === a.wert) })).filter((x) => x.l.length)
  const zaunM = proArt.filter((x) => !['weg', 'graben'].includes(x.a.wert)).reduce((s, x) => s + x.m, 0)
  const alleAus = p.aus.includes('__alle')
  if (!linien.length && !punkte.length) {
    return (
      <div className="infra-liste leer">
        <p className="hinweis">Noch keine Zäune, Wege oder Wasserstellen eingetragen.</p>
        <ul className="hinweis-liste">
          <li><strong>Zaun, Weg oder Graben:</strong> unten auf „〰 Zaun“ tippen und die Punkte entlang der Linie antippen.</li>
          <li><strong>Zaun um eine Fläche:</strong> Fläche antippen → „Zaun setzen“. Pro Fläche gibt es einen Zaun; „Zaun entfernen“ nimmt ihn wieder weg (die Fläche bleibt).</li>
          <li><strong>Tränke oder Weidezaungerät:</strong> eine Nadel setzen und oben im Formular die Art wählen.</li>
        </ul>
      </div>
    )
  }
  return (
    <div className="infra-liste">
      <p className="hinweis summe">{linien.length} {linien.length === 1 ? 'Linie' : 'Linien'}{zaunM > 0 && <> · Zäune gesamt <strong>{laengeText(zaunM)}</strong></>} · {punkte.length} {punkte.length === 1 ? 'Punkt' : 'Punkte'}</p>
      <label className="check infra-alle"><input type="checkbox" checked={!alleAus} onChange={() => p.onUmschalten('__alle')} /> Zäune &amp; Wasser auf der Karte zeigen</label>
      <div className={`infra-filter${alleAus ? ' aus' : ''}`} role="group" aria-label="Auf der Karte zeigen">
        {proArt.map(({ a, l, m }) => (
          <label key={a.wert} className="check"><input type="checkbox" disabled={alleAus} checked={!p.aus.includes(a.wert)} onChange={() => p.onUmschalten(a.wert)} /> <LinienSymbol art={a.wert} /> {a.name} <small>({l.length} · {laengeText(m)}{a.wert === 'elektronetz' ? ` · ${netzAnzahl(m)} Netze` : ''})</small></label>
        ))}
        {proInfra.map(({ a, l }) => (
          <label key={a.wert} className="check"><input type="checkbox" disabled={alleAus} checked={!p.aus.includes(a.wert)} onChange={() => p.onUmschalten(a.wert)} /> <InfraSymbol art={a.wert} groesse={18} /> {a.name} <small>({l.length})</small></label>
        ))}
      </div>
      {geraete.length > 0 && (
        <>
          <h3>⚡ Weidezaungeräte</h3>
          <ul className="liste">
            {geraete.map(({ e, s }) => (
              <li key={e.id} className={`geraet-zeile st-${s.stufe}`}>
                <button className="zeile-knopf" onClick={() => p.onWahl(e)}><InfraSymbol art="geraet" warn={s.stufe === 'ueberfaellig' || s.stufe === 'heute'} /> <strong>{e.titel || 'Weidezaungerät'}</strong>
                  <small>{faelligText(s)} · {s.text}{geraetZeile(e.geraet) && ` · ${geraetZeile(e.geraet)}`}</small></button>
                {p.darfBearbeiten && <button className="primaer klein" onClick={() => p.onGeprueft(e.id)}>✓ Geprüft</button>}
              </li>
            ))}
          </ul>
        </>
      )}
      {proArt.map(({ a, l }) => (
        <div key={a.wert}>
          <h3><LinienSymbol art={a.wert} /> {a.name}</h3>
          <ul className="liste">
            {l.sort((x, y) => linienLaenge(y) - linienLaenge(x)).map((e) => (
              <li key={e.id}><button className="zeile-knopf" onClick={() => p.onWahl(e)}><LinienSymbol e={e} /> <strong>{e.titel || <span className="ohne-name">ohne Namen</span>}</strong>
                <small>{laengeText(linienLaenge(e))}{a.wert === 'elektronetz' && ` · ≈ ${netzText(linienLaenge(e))}`}{(e.tore?.length ?? 0) > 0 && ` · ${e.tore!.length} ${e.tore!.length === 1 ? 'Tor' : 'Tore'}`}</small></button></li>
            ))}
          </ul>
        </div>
      ))}
      {proInfra.filter((x) => x.a.wert !== 'geraet').map(({ a, l }) => (
        <div key={a.wert}>
          <h3><InfraSymbol art={a.wert} groesse={18} /> {a.name}</h3>
          <ul className="liste">
            {l.map((e) => <li key={e.id}><button className="zeile-knopf" onClick={() => p.onWahl(e)}><strong>{e.titel || <span className="ohne-name">ohne Namen</span>}</strong>{e.notizen.length > 0 && <small>{e.notizen.length} {e.notizen.length === 1 ? 'Notiz' : 'Notizen'}</small>}</button></li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
