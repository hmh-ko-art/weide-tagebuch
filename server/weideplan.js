// Weideplan: Herden, Belegungen (welche Herde steht wann wo), Umtriebe (Protokoll) und Ruhezeiten.
// GEMEINSAME LOGIK für Server UND App: Die App wendet Änderungen sofort lokal an (auch offline, Postausgang),
// der Server prüft und speichert sie mit genau denselben Funktionen – so sehen alle dasselbe Ergebnis.
// Reine Funktionen auf einem Karten-Objekt { weideplan, eintraege }; kein Node- oder Browser-Code.
//
// Datenmodell (k.weideplan):
//   ruhetage: Standard-Ruhezeit in Tagen; ruhe: { [eintragId]: Tage } Abweichung je Fläche
//   herden:     [{ id, name, farbe, erstellt, von }]
//   belegungen: [{ id, herde, herdeName, flaeche, flaecheName, tiere: {schaf,bock,lamm}, von, bis?, ende?, naechste?,
//                  status: 'geplant'|'aktiv'|'beendet', notiz?, erstellt, erstelltVon, geaendert, geaendertVon }]
//   bewegungen: [{ id, art: 'auftrieb'|'umtrieb'|'abtrieb', datum, zeitpunkt, herde, herdeName, tiere,
//                  von: Ort|null, nach: Ort|null, belegungAlt?, belegungNeu?, neuAngelegt?, neuVorher?, karte?, autor, autorId? }]
//   Ort = { id, name, lat, lng } – Momentaufnahme, bleibt auch nach Löschen/Umbenennen der Fläche gültig.
//   Die Bewegungen sind die Grundlage für ein späteres Tierbewegungs-Register (Datum, Herkunft, Ziel, Anzahl je Tierart).

export const RUHE_STANDARD = 28
export const PLAN_MAX = { herden: 100, belegungen: 5000, bewegungen: 20000 }
export const TIER_ARTEN = ['schaf', 'bock', 'lamm']
export const HERDEN_FARBEN = ['#1e88e5', '#8e24aa', '#f57c00', '#00897b', '#d81b60', '#5d4037', '#3949ab', '#7cb342']
export const STATUS_FARBEN = { belegt: '#1e88e5', ruht: '#fdd835', bereit: '#43a047', frei: '#9e9e9e' }

const idOk = (x) => typeof x === 'string' && /^[\w-]{4,64}$/.test(x)
export const tagOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
const farbeOk = (f) => typeof f === 'string' && /^#[0-9a-f]{6}$/i.test(f)
const text = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const zeitOk = (s) => typeof s === 'string' && !isNaN(Date.parse(s))

// Heutiges Datum in Deutschland (Server läuft in UTC) als YYYY-MM-DD
export const heute = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d)
export const tageZwischen = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
export const tagPlus = (tag, n) => new Date(Date.parse(tag) + n * 86400000).toISOString().slice(0, 10)

export const planLeer = () => ({ ruhetage: RUHE_STANDARD, ruhe: {}, herden: [], belegungen: [], bewegungen: [] })
const plan = (k) => (k.weideplan ??= planLeer())

export function tiereSauber(t) {
  const aus = {}
  if (t && typeof t === 'object') for (const a of TIER_ARTEN) { const n = Math.round(Number(t[a])); if (Number.isFinite(n) && n > 0) aus[a] = Math.min(100000, n) }
  return aus
}
export const tiereSumme = (t) => TIER_ARTEN.reduce((s, a) => s + (t?.[a] ?? 0), 0)
// Tierzahlen eines Kartenpunkts (Einheiten) je Art zusammengefasst
export const tiereAusEinheiten = (einheiten) => tiereSauber(Object.fromEntries(TIER_ARTEN.map((a) => [a, (einheiten ?? []).reduce((s, x) => s + (x.art === a ? x.anzahl : 0), 0)])))

const eintrag = (k, id) => (k.eintraege ?? []).find((e) => e.id === id) ?? null
const mitte = (e) => {
  if (e.typ === 'pin') return e.position
  const n = e.punkte.length || 1
  return { lat: e.punkte.reduce((s, p) => s + p.lat, 0) / n, lng: e.punkte.reduce((s, p) => s + p.lng, 0) / n }
}
const ortVon = (k, id, name) => {
  if (!id) return null
  const e = eintrag(k, id)
  if (!e) return { id, name: name || 'gelöschte Fläche' }
  const m = mitte(e)
  return { id, name: e.titel || name || 'ohne Namen', lat: Math.round(m.lat * 1e6) / 1e6, lng: Math.round(m.lng * 1e6) / 1e6 }
}
export const herdeVon = (p, id) => (p?.herden ?? []).find((h) => h.id === id) ?? null
const herdeName = (p, b) => herdeVon(p, b.herde)?.name ?? b.herdeName ?? 'Herde'

// ---- Herden ----
export function herdeSetzen(k, roh, ich, jetzt) {
  const p = plan(k)
  if (!roh || !idOk(roh.id)) return { fehler: 'Ungültige Herde' }
  const name = text(roh.name, 40)
  if (!name) return { fehler: 'Bitte einen Namen für die Herde angeben' }
  const alt = herdeVon(p, roh.id)
  if (alt) {
    alt.name = name
    if (farbeOk(roh.farbe)) alt.farbe = roh.farbe.toLowerCase()
    for (const b of p.belegungen) if (b.herde === alt.id) b.herdeName = name
    return { ok: true }
  }
  if (p.herden.length >= PLAN_MAX.herden) return { fehler: 'Zu viele Herden' }
  const farbe = farbeOk(roh.farbe) ? roh.farbe.toLowerCase() : HERDEN_FARBEN.find((f) => !p.herden.some((h) => h.farbe === f)) ?? HERDEN_FARBEN[p.herden.length % HERDEN_FARBEN.length]
  p.herden.push({ id: roh.id, name, farbe, erstellt: zeitOk(roh.erstellt) ? roh.erstellt : jetzt, ...(ich?.id ? { von: ich.id } : {}) })
  return { ok: true }
}
export function herdeLoeschen(k, id) {
  const p = plan(k)
  if (p.belegungen.some((b) => b.herde === id && b.status !== 'beendet')) return { fehler: 'Die Herde steht noch auf einer Weide oder ist eingeplant – erst abtreiben bzw. Planung löschen.' }
  p.herden = p.herden.filter((h) => h.id !== id)
  return { ok: true }
}

// ---- Belegungen ----
function bewegungDazu(p, b) {
  if (p.bewegungen.some((x) => x.id === b.id)) return
  if (p.bewegungen.length >= PLAN_MAX.bewegungen) return
  p.bewegungen.push(b)
}
// basisGeaendert: Stand der Belegung, den das Gerät kannte (gleichzeitige Änderungen erkennen)
export function belegungSetzen(k, roh, ich, jetzt, basisGeaendert) {
  const p = plan(k)
  if (!roh || !idOk(roh.id)) return { fehler: 'Ungültige Belegung' }
  const herde = herdeVon(p, roh.herde)
  if (!herde) return { fehler: 'Herde nicht gefunden' }
  const alt = p.belegungen.find((b) => b.id === roh.id)
  const e = idOk(roh.flaeche) ? eintrag(k, roh.flaeche) : null
  if (!e && !(alt && alt.flaeche === roh.flaeche)) return { fehler: 'Fläche nicht gefunden' }
  if (!tagOk(roh.von)) return { fehler: 'Bitte ein gültiges Startdatum angeben' }
  const bis = tagOk(roh.bis) && roh.bis >= roh.von ? roh.bis : undefined
  const status = ['geplant', 'aktiv', 'beendet'].includes(roh.status) ? roh.status : roh.von > heute() ? 'geplant' : 'aktiv'
  const ende = status === 'beendet' ? (tagOk(roh.ende) && roh.ende >= roh.von ? roh.ende : alt?.ende ?? (heute() >= roh.von ? heute() : roh.von)) : undefined
  const naechste = idOk(roh.naechste) && roh.naechste !== roh.flaeche ? roh.naechste : undefined
  let konflikt = null
  if (alt && basisGeaendert && alt.geaendert !== basisGeaendert && alt.geaendertVon && alt.geaendertVon !== ich?.id) {
    const clientNeuer = (Date.parse(roh.geaendert) || 0) >= (Date.parse(alt.geaendert) || 0)
    konflikt = { art: 'plan-geaendert', titel: `${herde.name} auf ${alt.flaecheName}`, mitId: alt.geaendertVon, gewonnen: clientNeuer }
    if (!clientNeuer) return { ok: true, konflikt }
  }
  if (!alt && p.belegungen.length >= PLAN_MAX.belegungen) return { fehler: 'Zu viele Belegungen' }
  const b = {
    id: roh.id, herde: herde.id, herdeName: herde.name, flaeche: roh.flaeche, flaecheName: e ? e.titel || 'ohne Namen' : alt.flaecheName,
    tiere: tiereSauber(roh.tiere), von: roh.von, ...(bis ? { bis } : {}), ...(ende ? { ende } : {}), ...(naechste ? { naechste } : {}), status,
    ...(text(roh.notiz, 500) ? { notiz: text(roh.notiz, 500) } : {}),
    erstellt: alt?.erstellt ?? jetzt, ...(alt?.erstelltVon || ich?.id ? { erstelltVon: alt?.erstelltVon ?? ich.id } : {}),
    geaendert: jetzt, ...(ich?.id ? { geaendertVon: ich.id } : {}),
  }
  if (alt) { for (const x of Object.keys(alt)) delete alt[x]; Object.assign(alt, b) } else p.belegungen.push(b)
  // Protokoll: auf die Weide gebracht (Auftrieb) bzw. von der Weide genommen (Abtrieb)
  const autor = { autor: ich?.name ?? '', ...(ich?.id ? { autorId: ich.id } : {}) }
  if (status === 'aktiv' && (!alt || alt.status !== 'aktiv') && !p.bewegungen.some((x) => x.belegungNeu === b.id)) {
    bewegungDazu(p, { id: `${b.id}-auf`, art: 'auftrieb', datum: b.von, zeitpunkt: jetzt, herde: herde.id, herdeName: herde.name, tiere: b.tiere, von: null, nach: ortVon(k, b.flaeche, b.flaecheName), belegungNeu: b.id, ...autor })
  }
  if (status === 'beendet' && alt?.status === 'aktiv' && !p.bewegungen.some((x) => x.belegungAlt === b.id)) {
    bewegungDazu(p, { id: `${b.id}-ab`, art: 'abtrieb', datum: b.ende, zeitpunkt: jetzt, herde: herde.id, herdeName: herde.name, tiere: b.tiere, von: ortVon(k, b.flaeche, b.flaecheName), nach: null, belegungAlt: b.id, ...autor })
  }
  return { ok: true, ...(konflikt ? { konflikt } : {}) }
}
export function belegungLoeschen(k, id) {
  const p = plan(k)
  p.belegungen = p.belegungen.filter((b) => b.id !== id)
  return { ok: true }
}

// Tierzahlen auf der Karte mitziehen: von der alten Fläche abziehen, auf der neuen dazuzählen (feste IDs -> überall gleich)
function einheitenVerschieben(k, vonId, nachId, tiere, idBasis, jetzt, ichId) {
  const von = eintrag(k, vonId), nach = eintrag(k, nachId)
  const bewegt = {}
  if (von) {
    let liste = (von.einheiten ?? []).map((x) => ({ ...x }))
    for (const a of TIER_ARTEN) {
      let rest = tiere[a] ?? 0
      for (const u of liste) { if (u.art !== a || !rest) continue; const n = Math.min(u.anzahl, rest); u.anzahl -= n; rest -= n; bewegt[a] = (bewegt[a] ?? 0) + n; if (!u.anzahl) u.weg = true }
    }
    liste = liste.filter((u) => !u.weg)
    von.einheiten = liste; von.geaendert = jetzt; if (ichId) von.geaendertVon = ichId
  }
  if (nach) {
    const menge = von ? bewegt : tiere
    const liste = (nach.einheiten ?? []).map((x) => ({ ...x }))
    for (const a of TIER_ARTEN) {
      const n = menge[a] ?? 0
      if (!n) continue
      const u = liste.find((x) => x.art === a)
      if (u) u.anzahl += n; else liste.push({ id: `${idBasis}-${a}`, art: a, anzahl: n })
    }
    nach.einheiten = liste; nach.geaendert = jetzt; if (ichId) nach.geaendertVon = ichId
    return von ? bewegt : { ...tiere }
  }
  return bewegt
}

// ---- Umtrieb: Herde von ihrer aktuellen Belegung auf die nächste Fläche bringen (nach = null: Abtrieb, z. B. Stall) ----
// op = { id, belegung, nach, datum, neu, bis?, naechste?, tiere?, karte? }
export function umtrieb(k, op, ich, jetzt) {
  const p = plan(k)
  if (!op || !idOk(op.id) || !idOk(op.belegung)) return { fehler: 'Ungültiger Umtrieb' }
  if (p.bewegungen.some((x) => x.id === op.id)) return { ok: true, schon: true } // doppelt gesendet (Postausgang) -> nichts tun
  const alt = p.belegungen.find((b) => b.id === op.belegung)
  if (!alt) return { konflikt: { art: 'umtrieb-weg', titel: 'Umtrieb' } }
  const hn = herdeName(p, alt)
  if (alt.status !== 'aktiv') return { konflikt: { art: 'umtrieb-doppelt', titel: hn, mitId: alt.geaendertVon } }
  const nachE = op.nach ? eintrag(k, op.nach) : null
  if (op.nach && !nachE) return { fehler: 'Ziel-Fläche nicht gefunden' }
  if (op.nach === alt.flaeche) return { fehler: 'Ziel ist dieselbe Fläche' }
  const datum = tagOk(op.datum) ? op.datum : heute()
  const tiere = op.tiere ? tiereSauber(op.tiere) : { ...alt.tiere }
  const ichF = ich?.id ? { geaendertVon: ich.id } : {}
  Object.assign(alt, { status: 'beendet', ende: datum < alt.von ? alt.von : datum, geaendert: jetzt, ...ichF })
  let neuId = null, neuAngelegt = false, neuVorher = null
  if (nachE) {
    const geplant = p.belegungen.find((b) => b.herde === alt.herde && b.flaeche === op.nach && b.status === 'geplant')
    const bis = tagOk(op.bis) && op.bis >= datum ? op.bis : undefined
    const naechste = idOk(op.naechste) && op.naechste !== op.nach ? op.naechste : undefined
    if (geplant) {
      neuVorher = { von: geplant.von, ...(geplant.bis ? { bis: geplant.bis } : {}), ...(geplant.naechste ? { naechste: geplant.naechste } : {}), tiere: geplant.tiere }
      Object.assign(geplant, { status: 'aktiv', von: datum, tiere, geaendert: jetzt, ...ichF, ...(bis ? { bis } : {}), ...(naechste ? { naechste } : {}) })
      if (geplant.bis && geplant.bis < datum) delete geplant.bis
      neuId = geplant.id
    } else {
      if (!idOk(op.neu)) return { fehler: 'Ungültiger Umtrieb' }
      p.belegungen.push({ id: op.neu, herde: alt.herde, herdeName: hn, flaeche: op.nach, flaecheName: nachE.titel || 'ohne Namen', tiere, von: datum, ...(bis ? { bis } : {}), ...(naechste ? { naechste } : {}), status: 'aktiv', erstellt: jetzt, ...(ich?.id ? { erstelltVon: ich.id } : {}), geaendert: jetzt, ...ichF })
      neuId = op.neu; neuAngelegt = true
    }
  }
  const karte = op.karte && tiereSumme(tiere) ? einheitenVerschieben(k, alt.flaeche, nachE ? op.nach : null, tiere, op.id, jetzt, ich?.id) : null
  const bewegung = {
    id: op.id, art: nachE ? 'umtrieb' : 'abtrieb', datum, zeitpunkt: jetzt, herde: alt.herde, herdeName: hn, tiere,
    von: ortVon(k, alt.flaeche, alt.flaecheName), nach: nachE ? ortVon(k, op.nach) : null, belegungAlt: alt.id,
    ...(neuId ? { belegungNeu: neuId, neuAngelegt } : {}), ...(neuVorher ? { neuVorher } : {}), ...(karte && tiereSumme(karte) ? { karte } : {}),
    autor: ich?.name ?? '', ...(ich?.id ? { autorId: ich.id } : {}),
  }
  bewegungDazu(p, bewegung)
  return { ok: true, bewegung }
}

// Umtrieb rückgängig machen (nur der jeweils letzte Umtrieb einer Herde, solange die Herde noch dort steht)
export function umtriebZurueck(k, id, ich, jetzt) {
  const p = plan(k)
  const b = p.bewegungen.find((x) => x.id === id)
  if (!b) return { ok: true, schon: true }
  if (b.art === 'auftrieb') return { fehler: 'Ein Auftrieb wird über „Belegung löschen“ zurückgenommen' }
  const spaeter = p.bewegungen.some((x) => x.herde === b.herde && x.id !== b.id && (x.zeitpunkt > b.zeitpunkt))
  const neu = b.belegungNeu ? p.belegungen.find((x) => x.id === b.belegungNeu) : null
  if (spaeter || (neu && neu.status !== 'aktiv')) return { konflikt: { art: 'umtrieb-zurueck', titel: b.herdeName } }
  const alt = p.belegungen.find((x) => x.id === b.belegungAlt)
  const ichF = ich?.id ? { geaendertVon: ich.id } : {}
  if (alt) { alt.status = 'aktiv'; delete alt.ende; alt.geaendert = jetzt; Object.assign(alt, ichF) }
  if (neu) {
    if (b.neuAngelegt) p.belegungen = p.belegungen.filter((x) => x.id !== neu.id)
    else { Object.assign(neu, { status: 'geplant', geaendert: jetzt, ...ichF }, b.neuVorher ?? {}); if (!b.neuVorher?.bis) delete neu.bis }
  }
  if (b.karte) {
    // Rückwärts: auf der neuen Fläche abziehen, auf der alten wieder dazuzählen
    if (b.nach?.id) einheitenVerschieben(k, b.nach.id, b.von?.id ?? null, b.karte, `${b.id}-z`, jetzt, ich?.id)
    else if (b.von?.id) einheitenVerschieben(k, null, b.von.id, b.karte, `${b.id}-z`, jetzt, ich?.id)
  }
  p.bewegungen = p.bewegungen.filter((x) => x.id !== id)
  return { ok: true }
}
export function bewegungLoeschen(k, id) {
  const p = plan(k)
  p.bewegungen = p.bewegungen.filter((x) => x.id !== id)
  return { ok: true }
}

// ---- Einstellungen: Standard-Ruhezeit und Abweichung je Fläche (null = Standard) ----
export function einstellungenSetzen(k, op) {
  const p = plan(k)
  const tage = (x) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n >= 0 && n <= 365 ? n : null }
  if (op?.ruhetage !== undefined) { const n = tage(op.ruhetage); if (n === null) return { fehler: 'Ruhezeit: 0 bis 365 Tage' }; p.ruhetage = n }
  if (op?.ruhe && typeof op.ruhe === 'object') {
    for (const [id, v] of Object.entries(op.ruhe).slice(0, 500)) {
      if (!idOk(id)) continue
      if (v === null || v === '') delete p.ruhe[id]
      else { const n = tage(v); if (n !== null) p.ruhe[id] = n }
    }
  }
  return { ok: true }
}

// ---- Import / Wiederherstellen: nur Neues ergänzen (gleiche ID = vorhanden) ----
export function planErgaenzen(k, roh, nutzerIds, jetzt) {
  if (!roh || typeof roh !== 'object') return { neu: 0 }
  const war = !!k.weideplan
  const p = plan(k)
  let neu = 0
  if (!war && Number.isFinite(Number(roh.ruhetage))) einstellungenSetzen(k, { ruhetage: roh.ruhetage, ruhe: roh.ruhe })
  for (const h of Array.isArray(roh.herden) ? roh.herden : []) {
    if (!h || !idOk(h.id) || herdeVon(p, h.id)) continue
    if (herdeSetzen(k, h, null, jetzt).ok) neu++
  }
  for (const b of Array.isArray(roh.belegungen) ? roh.belegungen : []) {
    if (!b || !idOk(b.id) || p.belegungen.some((x) => x.id === b.id) || !herdeVon(p, b.herde) || !tagOk(b.von) || !idOk(b.flaeche)) continue
    if (p.belegungen.length >= PLAN_MAX.belegungen) break
    const e = eintrag(k, b.flaeche)
    p.belegungen.push({
      id: b.id, herde: b.herde, herdeName: herdeVon(p, b.herde).name, flaeche: b.flaeche, flaecheName: e?.titel || text(b.flaecheName, 200) || 'Fläche', tiere: tiereSauber(b.tiere), von: b.von,
      ...(tagOk(b.bis) ? { bis: b.bis } : {}), ...(tagOk(b.ende) ? { ende: b.ende } : {}), ...(idOk(b.naechste) ? { naechste: b.naechste } : {}),
      status: ['geplant', 'aktiv', 'beendet'].includes(b.status) ? b.status : 'beendet', ...(text(b.notiz, 500) ? { notiz: text(b.notiz, 500) } : {}),
      erstellt: zeitOk(b.erstellt) ? b.erstellt : jetzt, geaendert: zeitOk(b.geaendert) ? b.geaendert : jetzt,
      ...(nutzerIds.has(b.erstelltVon) ? { erstelltVon: b.erstelltVon } : {}),
    })
    neu++
  }
  const ort = (o) => (o && typeof o === 'object' && idOk(o.id) ? { id: o.id, name: text(o.name, 200), ...(Number.isFinite(o.lat) && Number.isFinite(o.lng) ? { lat: o.lat, lng: o.lng } : {}) } : null)
  for (const b of Array.isArray(roh.bewegungen) ? roh.bewegungen : []) {
    if (!b || !idOk(b.id) || p.bewegungen.some((x) => x.id === b.id) || !tagOk(b.datum) || !['auftrieb', 'umtrieb', 'abtrieb'].includes(b.art)) continue
    if (p.bewegungen.length >= PLAN_MAX.bewegungen) break
    p.bewegungen.push({
      id: b.id, art: b.art, datum: b.datum, zeitpunkt: zeitOk(b.zeitpunkt) ? b.zeitpunkt : jetzt, herde: idOk(b.herde) ? b.herde : '', herdeName: text(b.herdeName, 40) || 'Herde',
      tiere: tiereSauber(b.tiere), von: ort(b.von), nach: ort(b.nach), ...(idOk(b.belegungAlt) ? { belegungAlt: b.belegungAlt } : {}), ...(idOk(b.belegungNeu) ? { belegungNeu: b.belegungNeu } : {}),
      autor: text(b.autor, 60), ...(nutzerIds.has(b.autorId) ? { autorId: b.autorId } : {}),
    })
    neu++
  }
  return { neu }
}

// ---- Auswertung (App): Status je Fläche und fällige Umtriebe ----
// Leerer Plan (keine Herden/Belegungen/Protokoll, Standard-Ruhezeit) -> Feld ganz entfernen, Karte wieder wie vorher
export function planAufraeumen(k) {
  const p = k?.weideplan
  if (p && !p.herden?.length && !p.belegungen?.length && !p.bewegungen?.length && (p.ruhetage ?? RUHE_STANDARD) === RUHE_STANDARD && !Object.keys(p.ruhe ?? {}).length) delete k.weideplan
}
export function flaechenStatus(p, eintraege, tag = heute()) {
  const aus = new Map()
  const bel = p?.belegungen ?? []
  for (const e of eintraege) {
    const hier = bel.filter((b) => b.flaeche === e.id)
    if (!hier.length && e.typ !== 'flaeche') continue
    const ruhezeit = p?.ruhe?.[e.id] ?? p?.ruhetage ?? RUHE_STANDARD
    const aktiv = hier.filter((b) => b.status === 'aktiv' && b.von <= tag)
    const geplant = hier.filter((b) => b.status === 'geplant' || (b.status === 'aktiv' && b.von > tag)).sort((a, b) => a.von.localeCompare(b.von))
    if (aktiv.length) {
      const seit = aktiv.map((b) => b.von).sort()[0]
      aus.set(e.id, { status: 'belegt', tage: tageZwischen(seit, tag), seit, ruhezeit, belegungen: aktiv, geplant })
      continue
    }
    const zuletzt = hier.filter((b) => b.status === 'beendet' && b.ende).map((b) => b.ende).sort().pop()
    if (zuletzt) {
      const tage = Math.max(0, tageZwischen(zuletzt, tag))
      aus.set(e.id, { status: tage >= ruhezeit ? 'bereit' : 'ruht', tage, seit: zuletzt, ruhezeit, bereitAb: tagPlus(zuletzt, ruhezeit), belegungen: [], geplant })
    } else aus.set(e.id, { status: 'frei', tage: null, ruhezeit, belegungen: [], geplant })
  }
  return aus
}
// Fällig: Umtrieb heute/überfällig (geplant-bis erreicht), Auftrieb einer Planung heute/überfällig; „bald“ = in 1–3 Tagen
export function faellige(p, tag = heute()) {
  const aus = []
  for (const b of p?.belegungen ?? []) {
    const datum = b.status === 'aktiv' ? b.bis : b.status === 'geplant' ? b.von : null
    if (!datum) continue
    const d = tageZwischen(tag, datum)
    if (d > 3) continue
    aus.push({ belegung: b, art: b.status === 'aktiv' ? 'umtrieb' : 'auftrieb', datum, tage: d, stufe: d < 0 ? 'ueberfaellig' : d === 0 ? 'heute' : 'bald' })
  }
  return aus.sort((a, b) => a.datum.localeCompare(b.datum))
}

// Person entfernen (Zugang gelöscht): Protokoll bleibt, aber ohne Namen
export function planAnonymisieren(k, id, ersatz) {
  const p = k.weideplan
  if (!p) return
  for (const b of p.bewegungen) if (b.autorId === id) { b.autor = ersatz; delete b.autorId }
  for (const b of p.belegungen) { if (b.erstelltVon === id) b.erstelltVon = 'ehemalig'; if (b.geaendertVon === id) b.geaendertVon = 'ehemalig' }
  for (const h of p.herden) if (h.von === id) delete h.von
}
