// Weideplan: welche Herde steht wann wo, Ruhezeiten, fällige Umtriebe, „Umtrieb durchgeführt“ mit einem Tipp.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as WP from '../../server/weideplan.js'
import type { Belegung, Herde, Tiere, UmtriebOp, FlaechenStatus } from '../../server/weideplan.js'
import type { useKarte } from '../daten'
import { TIERARTEN, type Eintrag } from '../types'
import { geraeteFaellig, istNormal } from '../../server/infrastruktur.js'
import { geraetZeile } from '../infra/Infra'
import { FristKarten, fristenListe } from '../flaechen/Flaechen'
import * as FL from '../../server/flaechen.js'
import { tagKurz, tagLang, tiereText, tageText, neueId, statusText, STATUS_NAMEN } from './hilfen'

type K = ReturnType<typeof useKarte>
export type PlanStart = { belegenFuer?: string; umtriebFuer?: string; belegung?: string } | null
const X = () => <svg className="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
const MITZIEHEN = 'wt-plan-mitziehen'
const mitziehenStandard = () => localStorage.getItem(MITZIEHEN) !== 'aus'

export function WeideplanPanel(p: { k: K; onSchliessen: () => void; meldung: (s: string) => void; onZeigen: (id: string) => void; start: PlanStart; planFarben: boolean; setPlanFarben: (b: boolean) => void }) {
  const { k } = p
  const plan = k.weideplan ?? WP.planLeer()
  const heute = WP.heute()
  const [reiter, setReiter] = useState<'jetzt' | 'zeitplan' | 'flaechen' | 'verlauf'>('jetzt')
  const [formular, setFormular] = useState<Partial<Belegung> | null>(null)
  const [umtrieb, setUmtrieb] = useState<Belegung | null>(null)
  const [zuletzt, setZuletzt] = useState<{ id: string; text: string } | null>(null)
  const status = useMemo(() => WP.flaechenStatus(k.weideplan, k.eintraege, heute), [k.weideplan, k.eintraege, heute])
  const faellig = useMemo(() => WP.faellige(k.weideplan, heute), [k.weideplan, heute])
  // Weidezaungeräte: Prüfung überfällig/heute/morgen oder Akku leer
  const geraete = useMemo(() => geraeteFaellig(k.eintraege, heute), [k.eintraege, heute])
  const geraeteDran = geraete.filter((g) => g.stufe !== 'bald').length
  // Flächen-Fristen + Pacht-Erinnerungen (Pacht nur für Admin/Inhaber)
  const fristen = useMemo(() => fristenListe(k.eintraege, k.istAdmin ? k.pacht : null, k.weideplan, heute), [k.eintraege, k.pacht, k.istAdmin, k.weideplan, heute])
  const fristenDran = fristen.filter((f) => f.stufe !== 'bald').length
  const darf = k.darfBearbeiten
  const name = (id?: string) => (id ? k.eintraege.find((e) => e.id === id)?.titel || 'ohne Namen' : '')

  // Aufruf aus der Detailansicht einer Fläche
  useEffect(() => {
    const s = p.start
    if (!s) return
    if (s.umtriebFuer) { const b = plan.belegungen.find((x) => x.id === s.umtriebFuer); if (b) setUmtrieb(b) }
    else if (s.belegung) { const b = plan.belegungen.find((x) => x.id === s.belegung); if (b) setFormular(b) }
    else if (s.belegenFuer) setFormular({ flaeche: s.belegenFuer })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.start])
  useEffect(() => { if (!zuletzt) return; const t = setTimeout(() => setZuletzt(null), 12000); return () => clearTimeout(t) }, [zuletzt])

  const umtriebAusfuehren = (op: UmtriebOp, b: Belegung) => {
    k.plan.umtrieb(op)
    const h = WP.herdeVon(plan, b.herde)?.name ?? b.herdeName ?? 'Herde'
    setZuletzt({ id: op.id, text: op.nach ? `${h}: ${b.flaecheName} → ${name(op.nach)} (${tagKurz(op.datum)})` : `${h} von ${b.flaecheName} abgetrieben` })
    setUmtrieb(null)
  }
  // Ein Tipp: zur geplanten nächsten Fläche, heute, gleiche Tierzahl
  const einTipp = (b: Belegung) => {
    if (!b.naechste || !k.eintraege.some((e) => e.id === b.naechste)) return setUmtrieb(b)
    umtriebAusfuehren({ id: neueId(), belegung: b.id, nach: b.naechste, datum: heute, neu: neueId(), karte: mitziehenStandard() }, b)
  }

  const aktivJeHerde = new Map<string, Belegung[]>()
  for (const b of plan.belegungen) if (b.status === 'aktiv') aktivJeHerde.set(b.herde, [...(aktivJeHerde.get(b.herde) ?? []), b])

  return (
    <section className="panel weideplan-panel">
      <div className="sheet-kopf">
        <h2>Weideplan</h2>
        <button className="x" onClick={p.onSchliessen} aria-label="Schließen"><X /></button>
      </div>
      <div className="wp-leiste">
        {darf && <button className="primaer" onClick={() => setFormular({})}>＋ Belegung eintragen</button>}
        <label className="haken wp-farben"><input type="checkbox" checked={p.planFarben} onChange={(e) => p.setPlanFarben(e.target.checked)} /><span>Status auf der Karte</span></label>
      </div>
      {zuletzt && plan.bewegungen.some((b) => b.id === zuletzt.id) && (
        <div className="wp-zuletzt" role="status">✓ Umtrieb gespeichert – {zuletzt.text}
          {darf && <button onClick={() => { k.plan.zurueck(zuletzt.id); setZuletzt(null); p.meldung('Umtrieb rückgängig gemacht') }}>Rückgängig</button>}
        </div>
      )}
      <div className="tabs wp-reiter" role="tablist">
        {([['jetzt', `Jetzt${faellig.some((f) => f.stufe !== 'bald') || geraeteDran || fristenDran ? ` (${faellig.filter((f) => f.stufe !== 'bald').length + geraeteDran + fristenDran})` : ''}`], ['zeitplan', 'Zeitplan'], ['flaechen', 'Flächen'], ['verlauf', 'Verlauf']] as const).map(([w, t]) => (
          <button key={w} role="tab" aria-selected={reiter === w} className={reiter === w ? 'aktiv' : ''} onClick={() => setReiter(w)}>{t}</button>
        ))}
      </div>

      {reiter === 'jetzt' && (
        <>
          {!plan.herden.length && (
            <div className="wp-leer">
              <p><strong>So geht's:</strong></p>
              <ol>
                <li>„＋ Belegung eintragen“: Herde benennen (z. B. „Mutterschafe“), Fläche wählen, Tierzahl und Datum.</li>
                <li>Optional „geplant bis“ und „danach“ (nächste Fläche) – dann erinnert FlockMap rechtzeitig.</li>
                <li>Beim Umtrieb einfach „✓ Umtrieb durchgeführt“ tippen – fertig. Ruhezeiten zählt die App selbst.</li>
              </ol>
            </div>
          )}
          <FristKarten liste={fristen} darf={darf} istAdmin={k.istAdmin} onZeigen={p.onZeigen}
            onErledigt={(eid, fid, d) => { k.fristErledigt(eid, fid, d); p.meldung('Frist erledigt ✓') }}
            onPachtErledigt={(eid, d) => { const pa = k.pacht[eid]; if (pa) { k.pachtSpeichern(eid, { ...pa, erledigt: d }); p.meldung('Pacht-Erinnerung erledigt ✓') } }} />
          {geraete.length > 0 && <h3>⚡ Weidezaungeräte prüfen</h3>}
          {geraete.map((g) => (
            <div key={g.eintrag.id} className={`wp-karte wp-${g.stufe}`}>
              <div className="wp-karte-kopf"><span className="wp-stufe">{g.leer ? 'Akku/Batterie leer' : g.nie ? 'Noch nie geprüft' : g.stufe === 'ueberfaellig' ? `Prüfung überfällig seit ${tageText(-g.tage)}` : g.stufe === 'heute' ? 'Prüfung heute fällig' : `Prüfung morgen (${tagKurz(g.datum)})`}</span></div>
              <p><strong>{g.eintrag.titel || 'Weidezaungerät'}</strong>{geraetZeile(g.eintrag.geraet) && <> · {geraetZeile(g.eintrag.geraet)}</>}</p>
              <div className="knoepfe">
                {darf && <button className="primaer" onClick={() => { k.geprueft(g.eintrag.id, { datum: heute }); p.meldung(`${g.eintrag.titel || 'Weidezaungerät'}: Prüfung eingetragen ✓`) }}>✓ Geprüft</button>}
                <button onClick={() => p.onZeigen(g.eintrag.id)}>Zeigen</button>
              </div>
            </div>
          ))}
          {faellig.length > 0 && <h3>Fällig</h3>}
          {faellig.map((f) => {
            const b = f.belegung
            const h = WP.herdeVon(plan, b.herde)
            return (
              <div key={b.id} className={`wp-karte wp-${f.stufe}`}>
                <div className="wp-karte-kopf"><span className="wp-stufe">{f.stufe === 'ueberfaellig' ? `Überfällig seit ${tageText(-f.tage)}` : f.stufe === 'heute' ? 'Heute fällig' : `In ${tageText(f.tage)} (${tagKurz(f.datum)})`}</span></div>
                <p><HerdenPunkt h={h} /> <strong>{h?.name ?? b.herdeName}</strong> · {tiereText(b.tiere)}</p>
                <p className="hinweis">{f.art === 'umtrieb' ? <>Umtrieb von <strong>{b.flaecheName}</strong>{b.naechste ? <> nach <strong>{name(b.naechste)}</strong></> : ' – nächste Fläche noch offen'}</> : <>Auftrieb auf <strong>{b.flaecheName}</strong> geplant</>}</p>
                {darf && (
                  <div className="knoepfe">
                    {f.art === 'umtrieb'
                      ? <button className="primaer" onClick={() => einTipp(b)}>✓ Umtrieb durchgeführt</button>
                      : <button className="primaer" onClick={() => { k.plan.belegungSpeichern({ ...b, status: 'aktiv', von: b.von < heute ? heute : b.von }); p.meldung(`${h?.name ?? 'Herde'} steht jetzt auf ${b.flaecheName}`) }}>✓ Aufgetrieben</button>}
                    {f.art === 'umtrieb' && <button onClick={() => setUmtrieb(b)}>Anders …</button>}
                    <button onClick={() => k.plan.belegungSpeichern(f.art === 'umtrieb' ? { ...b, bis: WP.tagPlus(b.bis! < heute ? heute : b.bis!, 3) } : { ...b, von: WP.tagPlus(b.von < heute ? heute : b.von, 3), ...(b.bis && b.bis < WP.tagPlus(b.von < heute ? heute : b.von, 3) ? { bis: undefined } : {}) })}>+3 Tage</button>
                  </div>
                )}
              </div>
            )
          })}
          {plan.herden.length > 0 && <h3>Herden</h3>}
          {plan.herden.map((h) => {
            const akt = aktivJeHerde.get(h.id) ?? []
            const naechsteGeplant = plan.belegungen.filter((b) => b.herde === h.id && b.status === 'geplant').sort((a, b) => a.von.localeCompare(b.von))[0]
            return (
              <div key={h.id} className="wp-herde">
                <p className="wp-herde-kopf"><HerdenPunkt h={h} /> <strong>{h.name}</strong></p>
                {akt.length ? akt.map((b) => (
                  <div key={b.id} className="wp-herde-ort">
                    <p>auf <button className="link-knopf" onClick={() => p.onZeigen(b.flaeche)}>{b.flaecheName}</button> seit {tageText(Math.max(0, WP.tageZwischen(b.von, heute)))} ({tagKurz(b.von)}) · {tiereText(b.tiere)}</p>
                    <p className="hinweis klein">{b.bis ? `geplant bis ${tagLang(b.bis)}` : 'ohne Enddatum'}{b.naechste ? ` · danach ${name(b.naechste)}` : ''}{b.notiz ? ` · ${b.notiz}` : ''}</p>
                    {darf && <div className="knoepfe"><button className="primaer" onClick={() => setUmtrieb(b)}>Umtrieb</button><button onClick={() => setFormular(b)}>Bearbeiten</button></div>}
                  </div>
                )) : (
                  <div className="wp-herde-ort">
                    <p className="hinweis">nicht auf der Weide{naechsteGeplant ? ` · geplant: ${naechsteGeplant.flaecheName} ab ${tagKurz(naechsteGeplant.von)}` : ''}</p>
                    {darf && <div className="knoepfe"><button onClick={() => setFormular({ herde: h.id })}>Auftreiben …</button>{naechsteGeplant && <button onClick={() => setFormular(naechsteGeplant)}>Planung ändern</button>}</div>}
                  </div>
                )}
              </div>
            )
          })}
          <RuhezeitEinstellung k={k} />
        </>
      )}

      {reiter === 'zeitplan' && <Zeitplan k={k} heute={heute} onBelegung={(b) => setFormular(b)} name={name} />}

      {reiter === 'flaechen' && <FlaechenListe k={k} status={status} onBelegen={(id) => setFormular({ flaeche: id })} onZeigen={p.onZeigen} />}

      {reiter === 'verlauf' && <Verlauf k={k} />}

      {formular && <BelegungFormular k={k} start={formular} status={status} onFertig={(t) => { setFormular(null); if (t) p.meldung(t) }} onUmtrieb={(b) => { setFormular(null); setUmtrieb(b) }} />}
      {umtrieb && <UmtriebDialog k={k} b={umtrieb} status={status} onAbbrechen={() => setUmtrieb(null)} onSpeichern={(op) => umtriebAusfuehren(op, umtrieb)} />}
    </section>
  )
}

const HerdenPunkt = ({ h }: { h?: Herde | null }) => <span className="wp-punkt" style={{ background: h?.farbe ?? '#9e9e9e' }} aria-hidden="true" />
const StatusPunkt = ({ s }: { s?: FlaechenStatus }) => <span className={`wp-status wp-status-${s?.status ?? 'frei'}`} style={{ background: WP.STATUS_FARBEN[s?.status ?? 'frei'] }} aria-hidden="true" />

function RuhezeitEinstellung({ k }: { k: K }) {
  const tage = k.weideplan?.ruhetage ?? WP.RUHE_STANDARD
  const [wert, setWert] = useState(String(tage))
  useEffect(() => setWert(String(tage)), [tage])
  return (
    <div className="wp-ruhe">
      <h3>Ruhezeit</h3>
      <form className="wp-zeile" onSubmit={(e) => { e.preventDefault(); const n = Number(wert); if (Number.isInteger(n) && n >= 0 && n <= 365) k.plan.einstellungen({ ruhetage: n }) }}>
        <label>Standard für alle Flächen (Tage)<input type="number" min={0} max={365} inputMode="numeric" value={wert} onChange={(e) => setWert(e.target.value)} disabled={!k.darfBearbeiten} /></label>
        {k.darfBearbeiten && <button type="submit" disabled={Number(wert) === tage || wert === ''}>Speichern</button>}
      </form>
      <p className="hinweis klein">Nach so vielen Tagen ohne Tiere gilt eine Fläche als „bereit“. Für einzelne Flächen abweichend: Reiter „Flächen“.</p>
    </div>
  )
}

// Auswahl einer Fläche/Nadel mit Status im Text
// Sperrfrist („frühestens beweiden ab“) einer Fläche, wenn sie noch in der Zukunft liegt
function sperreBis(e: Eintrag): string | null {
  if (e.typ !== 'flaeche') return null
  const t = WP.heute()
  const d = (e.steckbrief?.fristen ?? []).map((f) => FL.sperreBis(f, t)).filter((x): x is string => !!x).sort()[0]
  return d ?? null
}
function FlaechenWahl(p: { k: K; status: Map<string, FlaechenStatus>; value: string; onChange: (v: string) => void; ohne?: string; leer: string; label: string }) {
  const liste = [...p.k.eintraege].filter((e) => e.id !== p.ohne && istNormal(e)).sort((a, b) => (a.typ === b.typ ? (a.titel || '').localeCompare(b.titel || '', 'de') : a.typ === 'flaeche' ? -1 : 1))
  return (
    <label>{p.label}
      <select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
        <option value="">{p.leer}</option>
        {liste.map((e) => { const s = p.status.get(e.id); const sp = sperreBis(e); return <option key={e.id} value={e.id}>{e.typ === 'flaeche' ? '⬠ ' : '📍 '}{e.titel || 'ohne Namen'}{s ? ` – ${statusText(s, true)}` : ''}{sp ? ` – gesperrt bis ${tagKurz(sp)}` : ''}</option> })}
      </select>
      {(() => { const e = p.k.eintraege.find((x) => x.id === p.value); const sp = e && sperreBis(e); return sp ? <small className="wp-warn">⚠️ Laut Steckbrief frühestens ab {tagLang(sp)} beweiden.</small> : null })()}
    </label>
  )
}

function TiereEingabe(p: { tiere: Tiere; onChange: (t: Tiere) => void; vonKarte?: Eintrag | null }) {
  return (
    <div className="wp-tiere">
      <div className="wp-tiere-felder">
        {TIERARTEN.map((a) => (
          <label key={a.wert}>{a.mehr}<input type="number" min={0} inputMode="numeric" value={p.tiere[a.wert] ?? ''} placeholder="0" onChange={(e) => p.onChange(WP.tiereSauber({ ...p.tiere, [a.wert]: e.target.value }))} /></label>
        ))}
      </div>
      {p.vonKarte && WP.tiereSumme(WP.tiereAusEinheiten(p.vonKarte.einheiten)) > 0 && <button type="button" className="link-knopf" onClick={() => p.onChange(WP.tiereAusEinheiten(p.vonKarte!.einheiten))}>Zahlen von „{p.vonKarte.titel || 'Fläche'}“ übernehmen ({tiereText(WP.tiereAusEinheiten(p.vonKarte.einheiten))})</button>}
    </div>
  )
}

const BIS_CHIPS = [7, 14, 21, 28]
function BelegungFormular(p: { k: K; start: Partial<Belegung>; status: Map<string, FlaechenStatus>; onFertig: (meldung?: string) => void; onUmtrieb: (b: Belegung) => void }) {
  const { k } = p
  const plan = k.weideplan ?? WP.planLeer()
  const alt = p.start.id ? plan.belegungen.find((b) => b.id === p.start.id) ?? null : null
  const heute = WP.heute()
  const [herde, setHerde] = useState(p.start.herde ?? (plan.herden.length === 1 ? plan.herden[0].id : ''))
  const [neueHerde, setNeueHerde] = useState(plan.herden.length ? '' : 'Mutterschafe')
  const [flaeche, setFlaeche] = useState(p.start.flaeche ?? '')
  const flE = k.eintraege.find((e) => e.id === flaeche) ?? null
  const letzte = herde ? [...plan.belegungen].filter((b) => b.herde === herde).sort((a, b) => b.von.localeCompare(a.von))[0] : undefined
  const [tiere, setTiere] = useState<Tiere>(p.start.tiere ?? letzte?.tiere ?? (flE ? WP.tiereAusEinheiten(flE.einheiten) : {}))
  const [von, setVon] = useState(p.start.von ?? heute)
  const [bis, setBis] = useState(p.start.bis ?? '')
  const [naechste, setNaechste] = useState(p.start.naechste ?? '')
  const [notiz, setNotiz] = useState(p.start.notiz ?? '')
  const [fehler, setFehler] = useState('')
  const herdeNeu = herde === '__neu' || (!plan.herden.length && !herde)
  const aktivWoanders = herde && !herdeNeu ? plan.belegungen.find((b) => b.herde === herde && b.status === 'aktiv' && b.id !== alt?.id) : undefined
  const s = flaeche ? p.status.get(flaeche) : undefined

  const speichern = (e: React.FormEvent) => {
    e.preventDefault()
    if (!flaeche) return setFehler('Bitte eine Fläche wählen')
    if (bis && bis < von) return setFehler('„Geplant bis“ liegt vor dem Startdatum')
    let hid = herde
    if (herdeNeu) {
      const n = neueHerde.replace(/\s+/g, ' ').trim()
      if (!n) return setFehler('Bitte einen Namen für die Herde eingeben')
      hid = neueId()
      k.plan.herdeSpeichern({ id: hid, name: n.slice(0, 40) })
    }
    if (!hid) return setFehler('Bitte eine Herde wählen')
    const status = alt?.status === 'beendet' ? 'beendet' : von > heute ? 'geplant' : 'aktiv'
    const jetzt = new Date().toISOString()
    k.plan.belegungSpeichern({
      id: alt?.id ?? neueId(), herde: hid, flaeche, flaecheName: flE?.titel || 'ohne Namen', tiere, von, ...(bis ? { bis } : {}), ...(naechste ? { naechste } : {}),
      ...(alt?.ende ? { ende: alt.ende } : {}), status, ...(notiz.trim() ? { notiz: notiz.trim() } : {}), erstellt: alt?.erstellt ?? jetzt, geaendert: jetzt,
    })
    p.onFertig(alt ? 'Belegung gespeichert' : status === 'geplant' ? `Eingeplant ab ${tagKurz(von)}` : `Herde steht jetzt auf ${flE?.titel || 'der Fläche'}`)
  }
  return (
    <div className="wp-dialog" role="dialog" aria-modal="true" aria-label="Belegung">
      <form className="wp-dialog-inhalt" onSubmit={speichern}>
        <div className="sheet-kopf"><h2>{alt ? 'Belegung bearbeiten' : 'Belegung eintragen'}</h2><button type="button" className="x" onClick={() => p.onFertig()} aria-label="Schließen"><X /></button></div>
        <label>Herde
          <select value={herdeNeu ? '__neu' : herde} onChange={(e) => setHerde(e.target.value)}>
            {plan.herden.length > 0 && <option value="">– Herde wählen –</option>}
            {plan.herden.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            <option value="__neu">＋ Neue Herde …</option>
          </select>
        </label>
        {herdeNeu && <label>Name der neuen Herde<input value={neueHerde} maxLength={40} onChange={(e) => setNeueHerde(e.target.value)} placeholder="z. B. Mutterschafe, Böcke, Lämmer 2026" autoFocus /></label>}
        {aktivWoanders && !alt && von <= heute && (
          <p className="wp-warnung">Diese Herde steht schon auf <strong>{aktivWoanders.flaecheName}</strong>. Wenn sie umzieht: <button type="button" className="link-knopf" onClick={() => p.onUmtrieb(aktivWoanders)}>Umtrieb eintragen</button> (dann wird die alte Fläche automatisch frei).</p>
        )}
        <FlaechenWahl k={k} status={p.status} value={flaeche} onChange={(v) => { setFlaeche(v); const x = k.eintraege.find((e) => e.id === v); if (x && !WP.tiereSumme(tiere)) setTiere(WP.tiereAusEinheiten(x.einheiten)) }} leer="– Fläche wählen –" label="Fläche" />
        {s && s.status === 'ruht' && <p className="wp-warnung">Achtung: Diese Fläche ruht erst seit {tageText(s.tage ?? 0)} (Ruhezeit {s.ruhezeit} Tage, bereit ab {tagKurz(s.bereitAb!)}).</p>}
        {s && s.status === 'belegt' && !s.belegungen.some((b) => b.id === alt?.id) && <p className="wp-warnung">Dort steht schon: {s.belegungen.map((b) => b.herdeName).join(', ')}.</p>}
        <span className="wp-feld-titel">Tiere</span>
        <TiereEingabe tiere={tiere} onChange={setTiere} vonKarte={flE} />
        <div className="zeile">
          <label>{von > heute ? 'Auftrieb geplant am' : 'Auf der Fläche seit'}<input type="date" value={von} required onChange={(e) => setVon(e.target.value)} /></label>
          <label>Geplant bis (optional)<input type="date" value={bis} min={von} onChange={(e) => setBis(e.target.value)} /></label>
        </div>
        <div className="wp-chips">{BIS_CHIPS.map((n) => <button type="button" key={n} onClick={() => setBis(WP.tagPlus(von, n))}>+{n} Tage</button>)}{bis && <button type="button" onClick={() => setBis('')}>ohne</button>}</div>
        <FlaechenWahl k={k} status={p.status} value={naechste} onChange={setNaechste} ohne={flaeche} leer="– noch offen –" label="Danach (nächste Fläche, optional)" />
        <label>Notiz (optional)<input value={notiz} maxLength={500} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Wasser prüfen, Zaun Nordseite" /></label>
        {fehler && <p className="fehler gefahr">{fehler}</p>}
        <div className="knoepfe">
          <button type="submit" className="primaer">Speichern</button>
          {alt?.status === 'aktiv' && <button type="button" onClick={() => p.onUmtrieb(alt)}>Umtrieb …</button>}
          {alt && <button type="button" className="gefahr" onClick={() => { if (confirm('Diese Belegung löschen? (Nur für Fehleingaben – das Protokoll im Verlauf bleibt.)')) { k.plan.belegungLoeschen(alt.id); p.onFertig('Belegung gelöscht') } }}>Löschen</button>}
        </div>
      </form>
    </div>
  )
}

function UmtriebDialog(p: { k: K; b: Belegung; status: Map<string, FlaechenStatus>; onAbbrechen: () => void; onSpeichern: (op: UmtriebOp) => void }) {
  const { k, b } = p
  const heute = WP.heute()
  const h = WP.herdeVon(k.weideplan, b.herde)
  const [nach, setNach] = useState(b.naechste && k.eintraege.some((e) => e.id === b.naechste) ? b.naechste : '')
  const [abtrieb, setAbtrieb] = useState(false)
  const [datum, setDatum] = useState(heute)
  const [tiere, setTiere] = useState<Tiere>(b.tiere)
  const [bis, setBis] = useState('')
  const [naechste, setNaechste] = useState('')
  const [mitziehen, setMitziehen] = useState(mitziehenStandard)
  const s = nach ? p.status.get(nach) : undefined
  return (
    <div className="wp-dialog" role="dialog" aria-modal="true" aria-label="Umtrieb">
      <form className="wp-dialog-inhalt" onSubmit={(e) => {
        e.preventDefault()
        if (!abtrieb && !nach) return
        localStorage.setItem(MITZIEHEN, mitziehen ? 'an' : 'aus')
        p.onSpeichern({ id: neueId(), belegung: b.id, nach: abtrieb ? null : nach, datum, neu: neueId(), tiere, karte: mitziehen, ...(bis && !abtrieb ? { bis } : {}), ...(naechste && !abtrieb ? { naechste } : {}) })
      }}>
        <div className="sheet-kopf"><h2><HerdenPunkt h={h} /> Umtrieb: {h?.name ?? b.herdeName}</h2><button type="button" className="x" onClick={p.onAbbrechen} aria-label="Schließen"><X /></button></div>
        <p className="hinweis">Von <strong>{b.flaecheName}</strong> (seit {tagKurz(b.von)}, {tageText(Math.max(0, WP.tageZwischen(b.von, heute)))})</p>
        <div className="tabs"><button type="button" className={!abtrieb ? 'aktiv' : ''} onClick={() => setAbtrieb(false)}>Auf neue Fläche</button><button type="button" className={abtrieb ? 'aktiv' : ''} onClick={() => setAbtrieb(true)}>Abtrieb (Stall/Verkauf)</button></div>
        {!abtrieb && <FlaechenWahl k={k} status={p.status} value={nach} onChange={setNach} ohne={b.flaeche} leer="– Ziel wählen –" label="Nach" />}
        {s?.status === 'ruht' && <p className="wp-warnung">Ziel ruht erst seit {tageText(s.tage ?? 0)} von {s.ruhezeit} (bereit ab {tagKurz(s.bereitAb!)}).</p>}
        {s?.status === 'belegt' && <p className="wp-warnung">Dort steht schon: {s.belegungen.map((x) => x.herdeName).join(', ')}.</p>}
        <label>Datum<input type="date" value={datum} max={heute} required onChange={(e) => setDatum(e.target.value)} /></label>
        <span className="wp-feld-titel">Tiere beim Umtrieb</span>
        <TiereEingabe tiere={tiere} onChange={setTiere} />
        {!abtrieb && (
          <>
            <label>Dort geplant bis (optional)<input type="date" value={bis} min={datum} onChange={(e) => setBis(e.target.value)} /></label>
            <div className="wp-chips">{BIS_CHIPS.map((n) => <button type="button" key={n} onClick={() => setBis(WP.tagPlus(datum, n))}>+{n} Tage</button>)}</div>
            <FlaechenWahl k={k} status={p.status} value={naechste} onChange={setNaechste} ohne={nach} leer="– noch offen –" label="Danach (optional)" />
          </>
        )}
        <label className="haken"><input type="checkbox" checked={mitziehen} onChange={(e) => setMitziehen(e.target.checked)} /><span>Tierzahlen auf der Karte mitziehen (bei „{b.flaecheName}“ abziehen{abtrieb ? '' : ', beim Ziel dazuzählen'})</span></label>
        <div className="knoepfe"><button type="button" onClick={p.onAbbrechen}>Abbrechen</button><button type="submit" className="primaer" disabled={!abtrieb && !nach}>{abtrieb ? 'Abtrieb speichern' : 'Umtrieb speichern'}</button></div>
      </form>
    </div>
  )
}

// Zeitplan: Balken je Fläche über 8 Wochen (2 zurück, 6 voraus) + Terminliste
function Zeitplan(p: { k: K; heute: string; onBelegung: (b: Belegung) => void; name: (id?: string) => string }) {
  const plan = p.k.weideplan ?? WP.planLeer()
  // Handy: 7 px je Tag (ca. 5 Wochen sichtbar), Desktop: 12 px
  const TAG_PX = window.innerWidth < 560 ? 7 : 12
  const start = WP.tagPlus(p.heute, -14), tage = 56, ende = WP.tagPlus(start, tage)
  // ohne „geplant bis“: hell eine Woche über heute hinaus (offen)
  const endeVon = (b: Belegung) => b.ende ?? b.bis ?? (b.status === 'aktiv' ? WP.tagPlus(b.von > p.heute ? b.von : p.heute, 7) : b.von)
  const sichtbar = plan.belegungen.filter((b) => b.von < ende && endeVon(b) >= start)
  const zeilen = new Map<string, Belegung[]>()
  for (const b of sichtbar) zeilen.set(b.flaeche, [...(zeilen.get(b.flaeche) ?? []), b])
  const reihen = [...zeilen.entries()].sort((a, b) => (a[1][0].flaecheName || '').localeCompare(b[1][0].flaecheName || '', 'de'))
  const x = (tag: string) => Math.max(0, Math.min(tage, WP.tageZwischen(start, tag))) * TAG_PX
  const wochen = Array.from({ length: 8 }, (_, i) => WP.tagPlus(start, i * 7))
  const termine: { datum: string; text: ReactNode; b: Belegung }[] = []
  for (const b of plan.belegungen) {
    const h = WP.herdeVon(plan, b.herde)?.name ?? b.herdeName
    if (b.status === 'aktiv' && b.bis && b.bis >= WP.tagPlus(p.heute, -30)) termine.push({ datum: b.bis, b, text: <>Umtrieb <strong>{h}</strong>: {b.flaecheName}{b.naechste ? ` → ${p.name(b.naechste)}` : ''}</> })
    if (b.status === 'geplant') termine.push({ datum: b.von, b, text: <>Auftrieb <strong>{h}</strong> auf {b.flaecheName}{b.bis ? ` (bis ${tagKurz(b.bis)})` : ''}</> })
  }
  termine.sort((a, b) => a.datum.localeCompare(b.datum))
  return (
    <>
      {!reihen.length ? <p className="hinweis">Noch keine Belegungen in diesem Zeitraum.</p> : (
        <div className="wp-zeitplan" role="img" aria-label="Zeitplan der Belegungen">
          <div className="wp-zp-namen">
            <div className="wp-zp-kopfzeile" />
            {reihen.map(([id, l]) => <div key={id} className="wp-zp-name" title={l[0].flaecheName}>{p.name(id) || l[0].flaecheName}</div>)}
          </div>
          <div className="wp-zp-scroll" ref={(el) => { if (el && !el.dataset.gescrollt) { el.scrollLeft = 7 * TAG_PX; el.dataset.gescrollt = '1' } }}>
            <div style={{ width: tage * TAG_PX, position: 'relative' }}>
              <div className="wp-zp-kopfzeile">{wochen.map((w) => <span key={w} style={{ left: x(w) }}>{tagKurz(w)}</span>)}</div>
              {reihen.map(([id, l]) => (
                <div key={id} className="wp-zp-reihe">
                  {wochen.map((w) => <span key={w} className="wp-zp-linie" style={{ left: x(w) }} />)}
                  {l.map((b) => {
                    const h = WP.herdeVon(plan, b.herde)
                    const istEnde = b.ende ?? (b.status === 'aktiv' && b.von <= p.heute ? p.heute : null)
                    const links = x(b.von), rechtsIst = istEnde ? x(WP.tagPlus(istEnde, 1)) : links, rechtsPlan = x(WP.tagPlus(endeVon(b), 1))
                    return (
                      <button key={b.id} type="button" className={`wp-zp-balken${b.status === 'geplant' ? ' geplant' : ''}`} style={{ left: links, width: Math.max(TAG_PX, Math.max(rechtsIst, rechtsPlan) - links), ['--f' as string]: h?.farbe ?? '#9e9e9e', ['--ist' as string]: `${b.status === 'geplant' ? 0 : Math.max(0, rechtsIst - links)}px` }}
                        title={`${h?.name ?? b.herdeName}: ${tagKurz(b.von)} – ${b.ende ? tagKurz(b.ende) : b.bis ? `${tagKurz(b.bis)} (geplant)` : 'offen'}`} onClick={() => p.onBelegung(b)}>
                        <span>{h?.name ?? b.herdeName}</span>
                      </button>
                    )
                  })}
                </div>
              ))}
              <div className="wp-zp-heute" style={{ left: x(p.heute) + TAG_PX / 2 }} title="heute" />
            </div>
          </div>
        </div>
      )}
      <p className="hinweis klein">Kräftig = schon so gewesen, hell = geplant (ohne Enddatum: eine Woche angedeutet), gestrichelt = noch nicht aufgetrieben. Senkrechte Linie = heute. Balken antippen zum Bearbeiten.</p>
      <h3>Termine</h3>
      {!termine.length ? <p className="hinweis">Keine geplanten Termine. Tipp: Bei einer Belegung „geplant bis“ und „danach“ eintragen.</p> : (
        <ul className="wp-termine">
          {termine.slice(0, 40).map((t) => (
            <li key={t.b.id + t.datum} className={t.datum < p.heute ? 'vorbei' : t.datum === p.heute ? 'heute' : ''}>
              <button type="button" className="link-knopf" onClick={() => p.onBelegung(t.b)}><span className="wp-termin-datum">{t.datum === p.heute ? 'heute' : tagLang(t.datum)}</span> {t.text}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function FlaechenListe(p: { k: K; status: Map<string, FlaechenStatus>; onBelegen: (id: string) => void; onZeigen: (id: string) => void }) {
  const { k } = p
  const [offen, setOffen] = useState<string | null>(null)
  const [ruhe, setRuhe] = useState('')
  const rang = { bereit: 0, frei: 1, ruht: 2, belegt: 3 }
  const liste = [...p.status.entries()].map(([id, s]) => ({ id, s, e: k.eintraege.find((e) => e.id === id)! })).filter((x) => x.e)
    .sort((a, b) => rang[a.s.status] - rang[b.s.status] || (a.s.status === 'ruht' ? (a.s.bereitAb ?? '').localeCompare(b.s.bereitAb ?? '') : (b.s.tage ?? -1) - (a.s.tage ?? -1)) || (a.e.titel || '').localeCompare(b.e.titel || '', 'de'))
  const zahl = (st: FlaechenStatus['status']) => liste.filter((x) => x.s.status === st).length
  return (
    <>
      <p className="wp-legende">{(['belegt', 'ruht', 'bereit', 'frei'] as const).map((st) => <span key={st}><span className="wp-status" style={{ background: WP.STATUS_FARBEN[st] }} /> {STATUS_NAMEN[st]} ({zahl(st)})</span>)}</p>
      {!liste.length && <p className="hinweis">Noch keine Flächen auf der Karte. Zeichne Flächen (⬠) oder belege Nadeln über „＋ Belegung eintragen“.</p>}
      <ul className="wp-flaechen">
        {liste.map(({ id, s, e }) => (
          <li key={id}>
            <button type="button" className="wp-flaeche-zeile" aria-expanded={offen === id} onClick={() => { setOffen(offen === id ? null : id); setRuhe(k.weideplan?.ruhe?.[id] !== undefined ? String(k.weideplan.ruhe[id]) : '') }}>
              <StatusPunkt s={s} /><span className="wp-flaeche-name">{e.titel || 'ohne Namen'}</span><small>{statusText(s)}{s.status === 'belegt' ? ` · ${s.belegungen.map((b) => b.herdeName).join(', ')}` : ''}{s.geplant.length ? ` · geplant ab ${tagKurz(s.geplant[0].von)}` : ''}</small>
            </button>
            {offen === id && (
              <div className="wp-flaeche-mehr">
                <div className="knoepfe">
                  {k.darfBearbeiten && s.status !== 'belegt' && <button className="primaer" onClick={() => p.onBelegen(id)}>Belegen …</button>}
                  <button onClick={() => p.onZeigen(id)}>Auf der Karte zeigen</button>
                </div>
                {k.darfBearbeiten && (
                  <form className="wp-zeile" onSubmit={(ev) => { ev.preventDefault(); k.plan.einstellungen({ ruhe: { [id]: ruhe === '' ? null : Number(ruhe) } }) }}>
                    <label>Ruhezeit dieser Fläche (Tage, leer = Standard {k.weideplan?.ruhetage ?? WP.RUHE_STANDARD})<input type="number" min={0} max={365} inputMode="numeric" value={ruhe} onChange={(ev) => setRuhe(ev.target.value)} /></label>
                    <button type="submit">Speichern</button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Verlauf({ k }: { k: K }) {
  const plan = k.weideplan ?? WP.planLeer()
  const [alle, setAlle] = useState(false)
  const liste = [...plan.bewegungen].sort((a, b) => b.datum.localeCompare(a.datum) || b.zeitpunkt.localeCompare(a.zeitpunkt))
  const letzteJeHerde = new Set<string>()
  const seen = new Set<string>()
  for (const b of [...plan.bewegungen].sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))) if (!seen.has(b.herde)) { seen.add(b.herde); letzteJeHerde.add(b.id) }
  const ART = { auftrieb: 'Auftrieb', umtrieb: 'Umtrieb', abtrieb: 'Abtrieb' }
  return (
    <>
      <p className="hinweis klein">Jeder Auf-, Um- und Abtrieb wird mit Datum, Herde, Tierzahl, Herkunft und Ziel protokolliert. Als Excel-Liste: Einstellungen → Export.</p>
      {!liste.length && <p className="hinweis">Noch keine Umtriebe.</p>}
      <ul className="wp-verlauf">
        {(alle ? liste : liste.slice(0, 30)).map((b) => (
          <li key={b.id}>
            <div><span className="wp-termin-datum">{tagLang(b.datum)}</span> · <strong>{ART[b.art]}</strong> · {b.herdeName}</div>
            <div className="hinweis">{b.von?.name ?? (b.art === 'auftrieb' ? 'Stall/Zukauf' : '–')} → {b.nach?.name ?? (b.art === 'abtrieb' ? 'Stall/Abgang' : '–')} · {tiereText(b.tiere)}{b.autor ? ` · ${b.autor}` : ''}{b.karte ? ' · Karte angepasst' : ''}</div>
            <div className="knoepfe">
              {k.darfBearbeiten && b.art !== 'auftrieb' && letzteJeHerde.has(b.id) && (k.istAdmin || !k.karteId || b.autorId === k.ich?.id) && <button onClick={() => { if (confirm('Diesen Umtrieb rückgängig machen? Die Herde steht dann wieder auf der alten Fläche.')) k.plan.zurueck(b.id) }}>Rückgängig</button>}
              {k.istAdmin && <button className="gefahr" onClick={() => { if (confirm('Diesen Eintrag aus dem Protokoll löschen? (Belegungen bleiben unverändert.)')) k.plan.bewegungLoeschen(b.id) }}>Aus Protokoll löschen</button>}
            </div>
          </li>
        ))}
      </ul>
      {!alle && liste.length > 30 && <button onClick={() => setAlle(true)}>Alle {liste.length} anzeigen</button>}
    </>
  )
}

// Zeile in der Detailansicht einer Fläche/Nadel
export function PlanZeile(p: { k: K; e: Eintrag; onOeffnen: (s: PlanStart) => void }) {
  const st = WP.flaechenStatus(p.k.weideplan, [p.e]).get(p.e.id)
  if (!st) return null
  const b = st.belegungen[0]
  return (
    <div className="wp-detail">
      <span className="wp-detail-status"><StatusPunkt s={st} /> <strong>Weideplan:</strong> {statusText(st)}{b ? ` · ${st.belegungen.map((x) => `${x.herdeName} (${tiereText(x.tiere)})`).join(', ')}` : ''}{b?.bis ? ` · bis ${tagKurz(b.bis)}` : ''}{st.geplant.length ? ` · geplant ab ${tagKurz(st.geplant[0].von)}` : ''}</span>
      {p.k.darfBearbeiten && (b ? <button onClick={() => p.onOeffnen({ umtriebFuer: b.id })}>Umtrieb</button> : <button onClick={() => p.onOeffnen({ belegenFuer: p.e.id })}>Belegen</button>)}
    </div>
  )
}
