// Flächen: genaues Ausmessen, Steckbrief (Art, Eigentum/Pacht, FLIK/Schlag, Förderung + Fristen), Pacht (nur Admin/Inhaber),
// Flächen-Übersicht mit Summen und Sortierung.
import { useMemo, useState } from 'react'
import * as FL from '../../server/flaechen.js'
import type { Frist, Pacht, PachtListe, Steckbrief, FristFaellig } from '../../server/flaechen.js'
import { heute, tageZwischen, flaechenStatus, type Weideplan } from '../../server/weideplan.js'
import { neueId, tagText, type Eintrag, type Flaeche, type LatLng } from '../types'

const zahl = (x: number, d = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const tageText = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tagen'}`

// „7,23 ha · 72.346 m² · Umfang 1.522 m“ (+ Warnung bei überkreuztem Umriss)
export function MessText(p: { punkte: LatLng[]; kurz?: boolean }) {
  if (p.punkte.length < 3) return null
  const m = FL.messen(p.punkte)
  return <span className="mess-text"><strong>{FL.haText(m.ha)}</strong>{!p.kurz && <> · {FL.m2Text(m.m2)}</>} · Umfang {FL.umfangText(m.umfang)}{m.ueberschneidet && <span className="mess-warn"> · ⚠️ Umriss überkreuzt sich – Fläche stimmt so nicht</span>}</span>
}

// Termin-Text einer Frist: „Antrag bis 15.05.2027 · in 12 Tagen“
export function fristText(f: Frist, tag = heute()) {
  const a = FL.fristArt(f.art), d = FL.fristTermin(f, tag), t = tageZwischen(tag, d)
  if (FL.fristErledigt(f, tag)) return `${a.kurz} ${tagText(d)} · erledigt${f.erledigt?.autor ? ` (${f.erledigt.autor})` : ''}`
  const wann = f.art === 'beweiden_ab' ? (FL.sperreBis(f, tag) ? `gesperrt, noch ${t} ${t === 1 ? 'Tag' : 'Tage'}` : 'beweidbar') : t < 0 ? `überfällig seit ${tageText(-t)}` : t === 0 ? 'heute!' : `in ${tageText(t)}`
  return `${a.kurz} ${tagText(d)}${f.jaehrlich ? ' (jährlich)' : ''} · ${wann}`
}
export function faelligText(x: FristFaellig) {
  if (x.quelle === 'pacht') return x.art === 'ende' ? (x.tage < 0 ? `Pacht ist seit ${tageText(-x.tage)} abgelaufen` : `Pacht endet in ${tageText(x.tage)} (${tagText(x.datum)})`) : x.tage < 0 ? `Kündigungsfrist seit ${tageText(-x.tage)} vorbei (${tagText(x.datum)})` : `Pacht kündigen/verlängern bis ${tagText(x.datum)} · in ${tageText(x.tage)}`
  const a = FL.fristArt(x.frist!.art)
  if (x.sperre) return `Beweidung vor Sperrfrist! Frühestens ab ${tagText(x.datum)}`
  if (x.frist!.art === 'beweiden_ab') return `Beweidbar ab ${tagText(x.datum)} (in ${tageText(x.tage)})`
  return `${a.kurz} ${tagText(x.datum)} · ${x.tage < 0 ? `überfällig seit ${tageText(-x.tage)}` : x.tage === 0 ? 'heute' : `in ${tageText(x.tage)}`}`
}

// ---- Steckbrief in der Detailansicht ----
export function SteckbriefDetail(p: { e: Flaeche; pacht?: Pacht; istAdmin: boolean; darfBearbeiten: boolean; onErledigt: (fristId: string, datum: string | null) => void }) {
  const s = p.e.steckbrief, m = FL.messen(p.e.punkte), tag = heute()
  const pa = p.istAdmin && s?.besitz !== 'eigentum' ? p.pacht : undefined
  const kb = FL.kuendigenBis(pa), summe = FL.pachtSumme(pa, m.ha)
  const kopf = [s?.art && FL.flaechenArt(s.art)?.name, s?.besitz && (s.besitz === 'pacht' ? 'Pachtfläche' : 'Eigentum'), s?.flik && `FLIK ${s.flik}`, s?.schlag && `Schlag ${s.schlag}`].filter(Boolean)
  return (
    <div className="steckbrief">
      <p className="mess-zeile">📐 <MessText punkte={p.e.punkte} /></p>
      {kopf.length > 0 && <p className="steck-kopf">{kopf.join(' · ')}</p>}
      {(s?.programme?.length ?? 0) > 0 && <p className="programme">{s!.programme!.map((x) => <span key={x} className="programm-chip">{x}</span>)}</p>}
      {(s?.fristen?.length ?? 0) > 0 && <ul className="fristen">
        {[...s!.fristen!].sort((a, b) => FL.fristTermin(a, tag).localeCompare(FL.fristTermin(b, tag))).map((f) => {
          const erl = FL.fristErledigt(f, tag), d = FL.fristTermin(f, tag), t = tageZwischen(tag, d)
          const fern = t > FL.FRIST_VORLAUF
          const st = erl ? 'erledigt' : f.art === 'beweiden_ab' ? (FL.sperreBis(f, tag) ? 'sperre' : 'ok') : t < 0 ? 'ueberfaellig' : t <= FL.FRIST_DRAN ? 'heute' : fern ? 'ok' : 'bald'
          return (
            <li key={f.id} className={`frist st-${st}`}>
              <span>{fristText(f, tag)}{f.programm && <small> · {f.programm}</small>}{f.text && <small> · {f.text}</small>}</span>
              {p.darfBearbeiten && f.art !== 'beweiden_ab' && (erl
                ? <button className="link-knopf" onClick={() => p.onErledigt(f.id, null)}>rückgängig</button>
                : !(fern && f.erledigt) && <button className="klein-knopf" onClick={() => p.onErledigt(f.id, d)}>✓ Erledigt</button>)}
              {p.darfBearbeiten && f.jaehrlich && f.art !== 'beweiden_ab' && !erl && f.erledigt && <button className="link-knopf" onClick={() => p.onErledigt(f.id, null)}>letztes „erledigt“ zurück</button>}
            </li>
          )
        })}
      </ul>}
      {pa && <div className="pacht-box" aria-label="Pacht (nur für Admins sichtbar)">
        <p className="pacht-titel">🔒 Pacht <small>(nur für Admin/Inhaber sichtbar)</small></p>
        <p>{pa.verpaechter && <>Verpächter: <strong>{pa.verpaechter}</strong><br /></>}
          {pa.preisHa !== undefined && <>{FL.euroText(pa.preisHa)}/ha/Jahr × {zahl(FL.pachtHa(pa, m.ha))} ha{pa.ha !== undefined ? ' (laut Vertrag)' : ''} = <strong>{FL.euroText(summe ?? 0)}/Jahr</strong><br /></>}
          {(pa.beginn || pa.ende) && <>Laufzeit: {pa.beginn ? tagText(pa.beginn) : '…'} – {pa.ende ? tagText(pa.ende) : 'unbefristet'}<br /></>}
          {kb && <>Kündigungsfrist {pa.kuendigungMonate} Monate → kündigen bis <strong>{tagText(kb)}</strong>{pa.erledigt === kb ? ' · erledigt' : ''}<br /></>}
          {pa.notiz && <small>{pa.notiz}</small>}</p>
      </div>}
      {p.istAdmin && s?.besitz === 'pacht' && !p.pacht && <p className="hinweis klein">🔒 Noch keine Pachtdaten – über „Bearbeiten“ eintragen (nur Admin/Inhaber sehen sie).</p>}
    </div>
  )
}

// ---- Steckbrief im Formular ----
type PachtForm = { [K in 'verpaechter' | 'preisHa' | 'ha' | 'beginn' | 'ende' | 'kuendigungMonate' | 'erinnerung' | 'notiz']: string }
export const pachtFormAus = (p?: Pacht): PachtForm => ({ verpaechter: p?.verpaechter ?? '', preisHa: p?.preisHa !== undefined ? String(p.preisHa).replace('.', ',') : '', ha: p?.ha !== undefined ? String(p.ha).replace('.', ',') : '', beginn: p?.beginn ?? '', ende: p?.ende ?? '', kuendigungMonate: p?.kuendigungMonate !== undefined ? String(p.kuendigungMonate) : '', erinnerung: p?.erinnerung ?? '', notiz: p?.notiz ?? '' })
export function pachtAusForm(f: PachtForm, alt?: Pacht): Pacht | null {
  return FL.pachtSauber({ ...f, kuendigungMonate: f.kuendigungMonate === '' ? undefined : Number(f.kuendigungMonate), erledigt: alt?.erledigt })
}
export function SteckbriefFormular(p: { e: Flaeche; setE: (e: Flaeche) => void; istAdmin: boolean; pacht: PachtForm; setPacht: (f: PachtForm) => void }) {
  const s: Steckbrief = p.e.steckbrief ?? {}
  const set = (t: Partial<Steckbrief>) => p.setE({ ...p.e, steckbrief: { ...s, ...t } })
  const [tag, setTag] = useState('')
  const fristen = s.fristen ?? []
  const fristSetzen = (id: string, t: Partial<Frist>) => set({ fristen: fristen.map((f) => (f.id === id ? { ...f, ...t } : f)) })
  const m = FL.messen(p.e.punkte)
  const pf = p.pacht, setPf = (t: Partial<PachtForm>) => p.setPacht({ ...pf, ...t })
  const vorschau = pachtAusForm(pf)
  const kb = FL.kuendigenBis(vorschau), summe = FL.pachtSumme(vorschau, m.ha)
  const tagHinzu = (x: string) => { const v = x.trim().slice(0, 40); if (v && !(s.programme ?? []).includes(v)) set({ programme: [...(s.programme ?? []), v] }); setTag('') }
  return (
    <details className="steckbrief-form" open={!!p.e.steckbrief}>
      <summary>📋 Steckbrief: Art, Eigentum/Pacht, Förderung & Fristen</summary>
      <p className="hinweis klein">📐 <MessText punkte={p.e.punkte} /></p>
      <div className="zeile">
        <label>Flächenart<select value={s.art ?? ''} onChange={(x) => set({ art: (x.target.value || undefined) as Steckbrief['art'] })}>
          <option value="">– nicht angegeben –</option>
          {FL.FLAECHEN_ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.name}</option>)}
        </select></label>
        <label>Eigentum / Pacht<select value={s.besitz ?? ''} onChange={(x) => set({ besitz: (x.target.value || undefined) as Steckbrief['besitz'] })}>
          <option value="">– nicht angegeben –</option>
          {FL.BESITZ.map((a) => <option key={a.wert} value={a.wert}>{a.name}</option>)}
        </select></label>
      </div>
      <div className="zeile">
        <label>Feldblock / FLIK<input value={s.flik ?? ''} maxLength={40} placeholder="z. B. DESHLI0512345678" onChange={(x) => set({ flik: x.target.value || undefined })} /></label>
        <label>Schlag-Nr.<input value={s.schlag ?? ''} maxLength={40} placeholder="optional" onChange={(x) => set({ schlag: x.target.value || undefined })} /></label>
      </div>
      <div className="programme-form">
        <span className="feldname">Förderprogramme / Auflagen</span>
        <p className="programme">{(s.programme ?? []).map((x) => <span key={x} className="programm-chip">{x} <button type="button" aria-label={`${x} entfernen`} onClick={() => set({ programme: (s.programme ?? []).filter((y) => y !== x) })}>×</button></span>)}</p>
        <div className="tag-eingabe">
          <input list="programm-vorschlaege" value={tag} maxLength={40} placeholder="z. B. Vertragsnaturschutz" aria-label="Programm hinzufügen" onChange={(x) => setTag(x.target.value)} onKeyDown={(x) => { if (x.key === 'Enter') { x.preventDefault(); tagHinzu(tag) } }} />
          <button type="button" onClick={() => tagHinzu(tag)} disabled={!tag.trim()}>＋</button>
          <datalist id="programm-vorschlaege">{FL.PROGRAMM_VORSCHLAEGE.map((x) => <option key={x} value={x} />)}</datalist>
        </div>
      </div>
      <div className="fristen-form">
        <span className="feldname">Fristen (erscheinen im Weideplan unter „Jetzt“)</span>
        {fristen.map((f, i) => (
          <div key={f.id} className="frist-zeile">
            <select aria-label={`Art der Frist ${i + 1}`} value={f.art} onChange={(x) => fristSetzen(f.id, { art: x.target.value as Frist['art'] })}>
              {FL.FRIST_ARTEN.map((a) => <option key={a.wert} value={a.wert}>{a.name}</option>)}
            </select>
            <input type="date" aria-label={`Datum der Frist ${i + 1}`} required value={f.datum} onChange={(x) => x.target.value && fristSetzen(f.id, { datum: x.target.value })} />
            <label className="check"><input type="checkbox" checked={!!f.jaehrlich} onChange={(x) => fristSetzen(f.id, { jaehrlich: x.target.checked || undefined })} /> jährlich</label>
            {(s.programme?.length ?? 0) > 0 && <select aria-label={`Programm der Frist ${i + 1}`} value={f.programm ?? ''} onChange={(x) => fristSetzen(f.id, { programm: x.target.value || undefined })}>
              <option value="">– Programm –</option>
              {s.programme!.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>}
            <input aria-label={`Notiz zur Frist ${i + 1}`} value={f.text ?? ''} maxLength={80} placeholder="Notiz (optional)" onChange={(x) => fristSetzen(f.id, { text: x.target.value || undefined })} />
            <button type="button" className="x" aria-label={`Frist ${i + 1} entfernen`} onClick={() => set({ fristen: fristen.filter((x) => x.id !== f.id) })}>×</button>
          </div>
        ))}
        <button type="button" className="tiere-plus" onClick={() => set({ fristen: [...fristen, { id: neueId(), art: 'antrag_bis', datum: heute() }] })}>＋ Frist hinzufügen</button>
      </div>
      {s.besitz === 'pacht' && (p.istAdmin ? (
        <fieldset className="pacht-form">
          <legend>🔒 Pacht <small>(nur Admin/Inhaber sehen das)</small></legend>
          <label>Verpächter (nur Name)<input value={pf.verpaechter} maxLength={80} placeholder="optional" onChange={(x) => setPf({ verpaechter: x.target.value })} /></label>
          <div className="zeile">
            <label>Pachtpreis €/ha/Jahr<input inputMode="decimal" value={pf.preisHa} placeholder="z. B. 320" onChange={(x) => setPf({ preisHa: x.target.value })} /></label>
            <label>Pachtfläche ha<input inputMode="decimal" value={pf.ha} placeholder={`gemessen ${zahl(m.ha)}`} onChange={(x) => setPf({ ha: x.target.value })} /></label>
          </div>
          {summe !== null && <p className="hinweis klein">= <strong>{FL.euroText(summe)} pro Jahr</strong>{vorschau?.ha === undefined ? ' (mit gemessener Fläche)' : ' (Fläche laut Vertrag)'}</p>}
          <div className="zeile">
            <label>Pachtbeginn<input type="date" value={pf.beginn} onChange={(x) => setPf({ beginn: x.target.value })} /></label>
            <label>Pachtende<input type="date" value={pf.ende} onChange={(x) => setPf({ ende: x.target.value })} /></label>
          </div>
          <div className="zeile">
            <label>Kündigungsfrist (Monate)<input type="number" inputMode="numeric" min={0} max={60} value={pf.kuendigungMonate} placeholder="z. B. 12" onChange={(x) => setPf({ kuendigungMonate: x.target.value })} /></label>
            <label>Erinnern ab<input type="date" value={pf.erinnerung} onChange={(x) => setPf({ erinnerung: x.target.value })} /></label>
          </div>
          {kb ? <p className="hinweis klein">Kündigen bzw. verlängern spätestens bis <strong>{tagText(kb)}</strong> – Erinnerung im Weideplan ab {tagText(pf.erinnerung && pf.erinnerung <= kb ? pf.erinnerung : new Date(Date.parse(kb) - FL.PACHT_VORLAUF * 86400000).toISOString().slice(0, 10))}.</p>
            : <p className="hinweis klein">Mit Pachtende + Kündigungsfrist rechnet FlockMap aus, bis wann du kündigen musst, und erinnert dich.</p>}
          <label>Notiz zur Pacht<textarea rows={2} maxLength={500} value={pf.notiz} placeholder="z. B. Verlängerung mündlich zugesagt" onChange={(x) => setPf({ notiz: x.target.value })} /></label>
        </fieldset>
      ) : <p className="hinweis klein">🔒 Pachtpreis, Verpächter und Laufzeit sieht und pflegt nur Admin/Inhaber.</p>)}
    </details>
  )
}

// ---- Flächen-Übersicht (Tabelle mit Summen, sortierbar) ----
type Spalte = 'name' | 'art' | 'besitz' | 'ha' | 'preis' | 'summe' | 'ende' | 'flik' | 'frist'
export function FlaechenUebersicht(p: { eintraege: Eintrag[]; pacht: PachtListe; istAdmin: boolean; onWahl: (e: Eintrag) => void; onExport: (art: 'xlsx' | 'pdf') => void }) {
  const [sort, setSort] = useState<{ s: Spalte; ab: boolean }>({ s: 'name', ab: false })
  const tag = heute()
  const zeilen = useMemo(() => p.eintraege.filter((e): e is Flaeche => e.typ === 'flaeche').map((e) => {
    const m = FL.messen(e.punkte), s = e.steckbrief, pa = p.istAdmin && s?.besitz === 'pacht' ? p.pacht[e.id] : undefined
    const offen = (s?.fristen ?? []).filter((f) => !FL.fristErledigt(f, tag) && !(f.art === 'beweiden_ab' && !FL.sperreBis(f, tag))).map((f) => ({ f, d: FL.fristTermin(f, tag) })).sort((a, b) => a.d.localeCompare(b.d))[0]
    return { e, ha: m.ha, ueber: m.ueberschneidet, art: s?.art ? FL.flaechenArt(s.art)!.name : '', besitz: s?.besitz === 'pacht' ? 'Pacht' : s?.besitz === 'eigentum' ? 'Eigentum' : '', preis: pa?.preisHa, summe: FL.pachtSumme(pa, m.ha) ?? undefined, ende: pa?.ende, flik: [s?.flik, s?.schlag && `S. ${s.schlag}`].filter(Boolean).join(' · '), frist: offen ? `${FL.fristArt(offen.f.art).kurz} ${tagText(offen.d)}` : '', fristD: offen?.d }
  }), [p.eintraege, p.pacht, p.istAdmin, tag])
  const sum = useMemo(() => FL.flaechenSummen(p.eintraege, p.istAdmin ? p.pacht : null), [p.eintraege, p.pacht, p.istAdmin])
  const wert = (z: (typeof zeilen)[number]): string | number => ({ name: (z.e.titel || '').toLowerCase(), art: z.art, besitz: z.besitz, ha: z.ha, preis: z.preis ?? -1, summe: z.summe ?? -1, ende: z.ende ?? '9999', flik: z.flik, frist: z.fristD ?? '9999' })[sort.s]
  const sortiert = [...zeilen].sort((a, b) => { const x = wert(a), y = wert(b); const c = typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y), 'de'); return sort.ab ? -c : c })
  const kopf = (s: Spalte, t: string, rechts = false) => <th className={rechts ? 'r' : ''} aria-sort={sort.s === s ? (sort.ab ? 'descending' : 'ascending') : 'none'}><button onClick={() => setSort((v) => ({ s, ab: v.s === s ? !v.ab : s === 'ha' || s === 'summe' || s === 'preis' }))}>{t}{sort.s === s ? (sort.ab ? ' ▼' : ' ▲') : ''}</button></th>
  if (!zeilen.length) return <p className="leer">Noch keine Flächen. Zeichne eine Fläche (⬠ Fläche) oder importiere sie (Einstellungen → Export & Import).</p>
  return (
    <div className="flaechen-uebersicht">
      <div className="summen-karten">
        <div><small>Flächen gesamt</small><strong>{zahl(sum.ha)} ha</strong><small>{sum.anzahl} {sum.anzahl === 1 ? 'Fläche' : 'Flächen'}</small></div>
        <div><small>Eigentum</small><strong>{zahl(sum.eigentumHa)} ha</strong></div>
        <div><small>Pacht</small><strong>{zahl(sum.pachtHa)} ha</strong></div>
        {p.istAdmin && <div className="pacht-summe"><small>🔒 Pacht pro Jahr</small><strong>{FL.euroText(Math.round(sum.pachtEuro))}</strong>{sum.ohnePreis > 0 && <small>{sum.ohnePreis} ohne Preis</small>}{sum.pachtHa > 0 && sum.pachtEuro > 0 && <small>⌀ {FL.euroText(Math.round(sum.pachtEuro / sum.pachtHa))}/ha</small>}</div>}
      </div>
      <p className="nach-art">{Object.entries(sum.nachArt).sort((a, b) => b[1] - a[1]).map(([a, ha]) => <span key={a} className="programm-chip">{a === 'ohne' ? 'ohne Art' : FL.flaechenArt(a)?.name}: {zahl(ha)} ha</span>)}</p>
      <div className="tabelle-rahmen">
        <table className="flaechen-tabelle">
          <thead><tr>{kopf('name', 'Fläche')}{kopf('art', 'Art')}{kopf('besitz', 'Besitz')}{kopf('ha', 'ha', true)}{p.istAdmin && <>{kopf('preis', '€/ha', true)}{kopf('summe', '€/Jahr', true)}{kopf('ende', 'Pachtende')}</>}{kopf('flik', 'FLIK / Schlag')}{kopf('frist', 'Nächste Frist')}</tr></thead>
          <tbody>
            {sortiert.map((z) => (
              <tr key={z.e.id} onClick={() => p.onWahl(z.e)} tabIndex={0} onKeyDown={(x) => x.key === 'Enter' && p.onWahl(z.e)}>
                <td><button className="link-knopf" onClick={(x) => { x.stopPropagation(); p.onWahl(z.e) }}>{z.e.titel || '(ohne Namen)'}</button>{z.ueber && ' ⚠️'}</td>
                <td>{z.art}</td><td>{z.besitz}</td><td className="r">{zahl(z.ha)}</td>
                {p.istAdmin && <><td className="r">{z.preis !== undefined ? zahl(z.preis, 0) : ''}</td><td className="r">{z.summe !== undefined ? zahl(z.summe, 0) : ''}</td><td>{z.ende ? tagText(z.ende) : ''}</td></>}
                <td>{z.flik}</td><td>{z.frist}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>Summe ({zeilen.length})</td><td className="r">{zahl(sum.ha)}</td>{p.istAdmin && <><td /><td className="r">{zahl(Math.round(sum.pachtEuro), 0)}</td><td /></>}<td colSpan={2} /></tr></tfoot>
        </table>
      </div>
      <div className="knoepfe">
        <button onClick={() => p.onExport('xlsx')}>⬇️ Flächenverzeichnis Excel</button>
        <button onClick={() => p.onExport('pdf')}>⬇️ Flächenverzeichnis PDF</button>
      </div>
      {!p.istAdmin && <p className="hinweis klein">🔒 Pachtpreise und Verpächter sehen nur Admin/Inhaber.</p>}
    </div>
  )
}

// ---- Weideplan „Jetzt“: Fristen + Pacht-Erinnerungen ----
export function FristKarten(p: { liste: FristFaellig[]; darf: boolean; istAdmin: boolean; onErledigt: (eid: string, fid: string, datum: string) => void; onPachtErledigt: (eid: string, datum: string) => void; onZeigen: (id: string) => void }) {
  if (!p.liste.length) return null
  return <>
    <h3>📋 Fristen & Pacht</h3>
    {p.liste.map((x) => (
      <div key={`${x.eintrag.id}-${x.frist?.id ?? x.art}`} className={`wp-karte wp-${x.stufe}`}>
        <div className="wp-karte-kopf"><span className="wp-stufe">{faelligText(x)}</span></div>
        <p><strong>{x.eintrag.titel || '(ohne Namen)'}</strong>{x.frist?.programm && <> · {x.frist.programm}</>}{x.frist?.text && <> · {x.frist.text}</>}{x.quelle === 'pacht' && ' · 🔒 nur für Admins'}</p>
        <div className="knoepfe">
          {x.quelle === 'frist' && p.darf && x.frist!.art !== 'beweiden_ab' && <button className="primaer" onClick={() => p.onErledigt(x.eintrag.id, x.frist!.id, x.datum)}>✓ Erledigt</button>}
          {x.quelle === 'pacht' && p.istAdmin && <button className="primaer" onClick={() => p.onPachtErledigt(x.eintrag.id, x.datum)}>✓ Erledigt</button>}
          <button onClick={() => p.onZeigen(x.eintrag.id)}>Zeigen</button>
        </div>
      </div>
    ))}
  </>
}

// Fristen + Pacht-Erinnerungen der Karte (belegte Flächen aus dem Weideplan -> Sperrfrist-Warnung)
export function fristenListe(eintraege: Eintrag[], pacht: PachtListe | null, plan: Weideplan | null, tag = heute()): FristFaellig[] {
  const st = flaechenStatus(plan, eintraege, tag)
  const belegt = new Set([...st.entries()].filter(([, s]) => s.status === 'belegt').map(([id]) => id))
  return FL.fristenFaellig(eintraege, pacht, tag, belegt)
}
