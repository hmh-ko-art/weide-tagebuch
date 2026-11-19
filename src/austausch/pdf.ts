// PDF-Bericht: Titel (Hof, Karte, Datum), Kennzahlen, Übersichtskarte, Summen je Gruppe, Tabelle aller Einträge,
// optional je Gruppe eine eigene Seite (mit eigener Karte und allen Notizen).
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { kartenbild } from './kartenbild'
import { summenBauen, technikBauen, zahl, type Zeile } from './zeilen'
import { LINIEN_ARTEN, INFRA_ARTEN, laengeText } from '../../server/infrastruktur.js'
import type { Gruppe, Eintrag } from '../types'
import * as WP from '../../server/weideplan.js'
import type { Weideplan } from '../../server/weideplan.js'
import { tiereText, statusText } from '../weideplan/hilfen'
import * as FL from '../../server/flaechen.js'
import { kreisZeilen } from './kreise'
import { spannungZeilen } from './spannung'
import type { PachtListe } from '../../server/flaechen.js'
import { flaechenZeilen } from './flaechenliste'

// Standard-PDF-Schriften kennen nur westeuropäische Zeichen -> Sonderzeichen ersetzen, Emojis entfernen
export const pdfText = (s: string) => s
  .replace(/[–—]/g, '-').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/…/g, '...').replace(/≈/g, 'ca.').replace(/Σ/g, 'Summe')
  .replace(/⚠️?/g, '(!)').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/[^\u0000-\u00ff€\n]/g, '')
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const GRUEN: [number, number, number] = [30, 77, 43]

export interface BerichtOptionen { kreise?: Eintrag[]; spannungSchwelle?: number; karte: string; hof?: string; autor?: string; filterText?: string; gesamtAnzahl: number; jeGruppe: boolean; mitKarte: boolean; weideplan?: { plan: Weideplan; eintraege: Eintrag[] }; technik?: Eintrag[]; flaechen?: { eintraege: Eintrag[]; pacht: PachtListe | null } }

export async function pdfErzeugen(zeilen: Zeile[], gruppen: Gruppe[], o: BerichtOptionen): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const B = 210, rand = 14
  const stand = new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const summen = summenBauen(zeilen, gruppen)
  const s = summen.gesamt
  const nadeln = zeilen.filter((z) => z.typ === 'Nadel').length, flaechen = zeilen.length - nadeln

  // ---- Seite 1 ----
  doc.setFillColor(...GRUEN); doc.rect(0, 0, B, 26, 'F')
  doc.setTextColor(244, 236, 216); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(pdfText(`FLOCKMAP · WEIDEBERICHT${o.hof ? ` · Hof ${o.hof}` : ''}`), rand, 9)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(pdfText(o.karte || 'Weidekarte'), rand, 19)
  doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5)
  let y = 33
  doc.text(pdfText(`Stand: ${stand}${o.autor ? ` · erstellt von ${o.autor}` : ''}`), rand, y)
  if (o.filterText) { y += 5; doc.setTextColor(176, 74, 20); doc.text(pdfText(`Auswahl: ${o.filterText} – ${zeilen.length} von ${o.gesamtAnzahl} Einträgen`), rand, y); doc.setTextColor(40, 40, 40) }
  y += 5
  // Kennzahlen-Kästchen
  const kz: [string, string][] = [['Nadeln', zahl(nadeln)], ['Flächen', flaechen ? `${zahl(flaechen)} (${zahl(s.ha, 1)} ha)` : '0'], ['Schafe', zahl(s.schafe)], ['Böcke', zahl(s.boecke)], ['Lämmer', zahl(s.laemmer)]]
  const kb = (B - 2 * rand - 4 * 3) / 5
  kz.forEach(([t, w], i) => {
    const x = rand + i * (kb + 3)
    doc.setFillColor(238, 243, 234); doc.roundedRect(x, y, kb, 15, 2, 2, 'F')
    doc.setFontSize(8); doc.setTextColor(90, 100, 90); doc.text(pdfText(t), x + 3, y + 5)
    doc.setFontSize(12.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 40, 30); doc.text(pdfText(w), x + 3, y + 12)
    doc.setFont('helvetica', 'normal')
  })
  y += 20
  if (o.mitKarte) {
    const kb2 = await kartenbild(zeilen, 1500, 1000, o.technik ?? []).catch(() => null)
    if (kb2) { const h = (B - 2 * rand) * (2 / 3); doc.addImage(kb2.bild, 'JPEG', rand, y, B - 2 * rand, h); doc.setDrawColor(200); doc.rect(rand, y, B - 2 * rand, h); y += h + 6 }
  }
  // Summen je Gruppe
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Summen je Gruppe'), rand, y); doc.setFont('helvetica', 'normal')
  const sk = summen.gruppen
  autoTable(doc, {
    startY: y + 2, margin: { left: rand, right: rand },
    head: [['Gruppe', 'Einträge', 'Schafe', 'Böcke', 'Lämmer', 'Hektar']],
    body: sk.map((g) => [pdfText(g.name), zahl(g.anzahl), zahl(g.schafe), zahl(g.boecke), zahl(g.laemmer), g.ha ? zahl(g.ha, 2) : '']),
    foot: [['Gesamt', zahl(s.anzahl), zahl(s.schafe), zahl(s.boecke), zahl(s.laemmer), s.ha ? zahl(s.ha, 2) : '']],
    styles: { fontSize: 9, cellPadding: 1.6 }, headStyles: { fillColor: GRUEN }, footStyles: { fillColor: [232, 240, 227], textColor: 20 },
    columnStyles: { 0: { cellWidth: 70 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    didParseCell: (d) => { if (d.column.index > 0) d.cell.styles.halign = 'right'; if (d.section === 'body' && d.column.index === 0) d.cell.styles.cellPadding = { left: 6, top: 1.6, bottom: 1.6, right: 1.6 } },
    didDrawCell: (d) => { if (d.section === 'body' && d.column.index === 0) { doc.setFillColor(...rgb(sk[d.row.index].farbe)); doc.setDrawColor(120); doc.circle(d.cell.x + 3, d.cell.y + d.cell.height / 2, 1.4, 'FD') } },
  })

  // ---- Alle Einträge ----
  const tabelle = (liste: Zeile[], alleNotizen: boolean, startY: number) => autoTable(doc, {
    startY, margin: { left: rand, right: rand, bottom: 16 },
    head: [['Nr', 'Name', 'Gruppe', 'Schafe', 'Böcke', 'Lämmer', 'Datum', 'Lage', alleNotizen ? 'Notizen' : 'Letzte Notiz']],
    body: liste.map((z) => [z.nr ? String(z.nr) : z.typ === 'Fläche' ? 'F' : '', pdfText(z.name || '(ohne Namen)') + (z.herde ? `\nHerde: ${pdfText(z.herde)}` : '') + (z.typ === 'Fläche' ? `\n${zahl(z.ha, 2)} ha` : ''), pdfText(z.gruppe || (z.typ === 'Fläche' ? 'Fläche' : '')), z.schafe ? zahl(z.schafe) : '', z.boecke ? zahl(z.boecke) : '', z.laemmer ? zahl(z.laemmer) : '', z.datum.split('-').reverse().join('.'), `${z.lat.toFixed(5)}\n${z.lng.toFixed(5)}`, pdfText((alleNotizen ? z.notizen : z.letzteNotiz).slice(0, alleNotizen ? 3000 : 300))]),
    styles: { fontSize: 7.6, cellPadding: 1.3, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: GRUEN, fontSize: 8 },
    didParseCell: (d) => { if (d.section === 'head' && [0, 3, 4, 5].includes(d.column.index)) d.cell.styles.halign = 'right' },
    columnStyles: { 0: { cellWidth: 8, halign: 'right' }, 1: { cellWidth: 32 }, 2: { cellWidth: 21 }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 11, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 17 }, 7: { cellWidth: 18 }, 8: { cellWidth: 'auto' } },
    didDrawCell: (d) => { if (d.section === 'body' && d.column.index === 0) { doc.setFillColor(...rgb(liste[d.row.index].farbe)); doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F') } },
  })
  doc.addPage()
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(pdfText(`Alle Einträge (${zeilen.length})`), rand, 16); doc.setFont('helvetica', 'normal')
  tabelle(zeilen, false, 20)

  // ---- Zäune & Wasser: Längen je Art, Weidezaungeräte mit Prüfstand, Wasserstellen/Tore/Unterstände ----
  const tz = technikBauen(o.technik ?? [])
  if (tz.length) {
    const gruen = { fillColor: GRUEN }, st = { fontSize: 8, cellPadding: 1.4, overflow: 'linebreak' as const, valign: 'top' as const }
    const datum = (d?: string) => (d && /^\d{4}/.test(d) ? d.split('-').reverse().join('.') : d ?? '')
    const nachY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    doc.addPage()
    doc.setTextColor(30, 40, 30); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Zäune & Wasser'), rand, 16); doc.setFont('helvetica', 'normal')
    const linien = tz.filter((z) => z.gattung === 'Linie')
    let ty = 22
    if (linien.length) {
      const proArt = LINIEN_ARTEN.map((a) => ({ a, l: linien.filter((z) => z.artWert === a.wert) })).filter((x) => x.l.length)
      autoTable(doc, {
        startY: ty, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
        head: [['Art', 'Anzahl', 'Länge', 'Netze à 50 m']],
        body: proArt.map(({ a, l }) => { const m = l.reduce((x, z) => x + (z.laenge ?? 0), 0); return [pdfText(a.name), zahl(l.length), pdfText(laengeText(m)), a.wert === 'elektronetz' ? zahl(l.reduce((x, z) => x + (z.netze ?? 0), 0)) : ''] }),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      })
      ty = nachY()
      autoTable(doc, {
        startY: ty, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
        head: [['Linie', 'Art', 'Länge', 'Netze', 'Tore', 'Notizen']],
        body: linien.map((z) => [pdfText(z.name || '(ohne Namen)'), pdfText(z.art + (z.geschlossen ? ' (Ring)' : '')), pdfText(laengeText(z.laenge ?? 0)), z.netze != null ? zahl(z.netze) : '', z.tore ? zahl(z.tore) : '', pdfText(z.notizen.slice(0, 300))]),
        columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 28 }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 10, halign: 'right' } },
        didDrawCell: (d) => { if (d.section === 'body' && d.column.index === 0) { doc.setFillColor(...rgb(linien[d.row.index].farbe)); doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F') } },
      })
      ty = nachY()
    }
    const geraete = tz.filter((z) => z.artWert === 'geraet')
    if (geraete.length) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Weidezaungeräte'), rand, ty); doc.setFont('helvetica', 'normal')
      autoTable(doc, {
        startY: ty + 2, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
        head: [['Gerät', 'Zuletzt geprüft', 'Nächste Prüfung', 'Spannung', 'Strom', 'Ladestand', 'Lage']],
        body: geraete.map((z) => [pdfText(z.name || 'Weidezaungerät'), datum(z.geprueft) || 'nie', datum(z.faelligAb), z.kv != null ? `${zahl(z.kv, 1)} kV` : '', pdfText(z.strom), pdfText(z.stand), `${z.lat.toFixed(5)}\n${z.lng.toFixed(5)}`]),
      })
      ty = nachY()
    }
    const sonst = tz.filter((z) => z.gattung === 'Punkt' && z.artWert !== 'geraet')
    if (sonst.length) {
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(pdfText(INFRA_ARTEN.filter((a) => a.wert !== 'geraet' && sonst.some((z) => z.artWert === a.wert)).map((a) => a.name).join(', ')), rand, ty); doc.setFont('helvetica', 'normal')
      autoTable(doc, {
        startY: ty + 2, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
        head: [['Art', 'Name', 'Lage', 'Notizen']],
        body: sonst.map((z) => [pdfText(z.art), pdfText(z.name || '(ohne Namen)'), `${z.lat.toFixed(5)}\n${z.lng.toFixed(5)}`, pdfText(z.notizen.slice(0, 300))]),
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 45 }, 2: { cellWidth: 22 } },
      })
    }
  }

  // ---- Optional: Weideplan (aktuelle Belegung, Flächenstatus, letzte Umtriebe) ----
  if (o.weideplan && (o.weideplan.plan.belegungen.length || o.weideplan.plan.bewegungen.length)) {
    const { plan, eintraege } = o.weideplan
    const heute = WP.heute()
    const gruen = { fillColor: GRUEN }, st = { fontSize: 8, cellPadding: 1.4, overflow: 'linebreak' as const, valign: 'top' as const }
    const datum = (d?: string) => (d ? d.split('-').reverse().join('.') : '')
    const nachY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    doc.addPage()
    doc.setTextColor(30, 40, 30); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(pdfText(`Weideplan – Stand ${datum(heute)}`), rand, 16); doc.setFont('helvetica', 'normal')
    doc.setFontSize(9); doc.text(pdfText(`Ruhezeit Standard: ${plan.ruhetage ?? WP.RUHE_STANDARD} Tage`), rand, 22)
    const aktiv = plan.belegungen.filter((b) => b.status !== 'beendet').sort((a, b) => a.von.localeCompare(b.von))
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Aktuelle und geplante Belegungen'), rand, 30); doc.setFont('helvetica', 'normal')
    autoTable(doc, {
      startY: 32, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
      head: [['Herde', 'Fläche', 'Tiere', 'Seit / ab', 'Geplant bis', 'Danach', 'Status']],
      body: aktiv.length ? aktiv.map((b) => [pdfText(WP.herdeVon(plan, b.herde)?.name ?? b.herdeName ?? ''), pdfText(b.flaecheName), pdfText(tiereText(b.tiere)), datum(b.von), datum(b.bis), pdfText(b.naechste ? eintraege.find((e) => e.id === b.naechste)?.titel || '' : ''), b.status === 'geplant' || b.von > heute ? 'geplant' : 'auf der Fläche']) : [['Keine', '', '', '', '', '', '']],
    })
    const status = WP.flaechenStatus(plan, eintraege, heute)
    const fl = [...status.entries()].map(([id, x]) => ({ e: eintraege.find((e) => e.id === id)!, x })).filter((z) => z.e).sort((a, b) => (a.e.titel || '').localeCompare(b.e.titel || '', 'de'))
    let y = nachY()
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Flächen – Status'), rand, y); doc.setFont('helvetica', 'normal')
    autoTable(doc, {
      startY: y + 2, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
      head: [['Fläche', 'Status', 'Ruhezeit', 'Herde(n)']],
      body: fl.map(({ e, x }) => [pdfText(e.titel || '(ohne Namen)'), pdfText(statusText(x)), `${x.ruhezeit} T`, pdfText(x.belegungen.map((b) => b.herdeName).join(', '))]),
      didDrawCell: (d) => { if (d.section === 'body' && d.column.index === 1) { doc.setFillColor(...rgb(WP.STATUS_FARBEN[fl[d.row.index].x.status])); doc.rect(d.cell.x, d.cell.y, 1.2, d.cell.height, 'F') } },
    })
    const bew = [...plan.bewegungen].sort((a, b) => b.datum.localeCompare(a.datum) || b.zeitpunkt.localeCompare(a.zeitpunkt)).slice(0, 60)
    if (bew.length) {
      y = nachY()
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.text(pdfText(`Letzte Auf-, Um- und Abtriebe (${bew.length}${plan.bewegungen.length > bew.length ? ` von ${plan.bewegungen.length}` : ''})`), rand, y); doc.setFont('helvetica', 'normal')
      const ART = { auftrieb: 'Auftrieb', umtrieb: 'Umtrieb', abtrieb: 'Abtrieb' }
      autoTable(doc, {
        startY: y + 2, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
        head: [['Datum', 'Art', 'Herde', 'Von', 'Nach', 'Tiere', 'Erfasst von']],
        body: bew.map((b) => [datum(b.datum), ART[b.art], pdfText(b.herdeName), pdfText(b.von?.name ?? ''), pdfText(b.nach?.name ?? ''), pdfText(tiereText(b.tiere)), pdfText(b.autor ?? '')]),
      })
    }
  }

  // ---- Optional: je Gruppe eine Seite ----
  if (o.jeGruppe) {
    const teile: { name: string; farbe: string; liste: Zeile[] }[] = [
      ...gruppen.map((g) => ({ name: g.name, farbe: zeilen.find((z) => z.gruppeId === g.id)?.farbe ?? '#999999', liste: zeilen.filter((z) => z.gruppeId === g.id) })),
      { name: gruppen.length ? 'Nadeln ohne Gruppe' : 'Nadeln', farbe: '#9e9e9e', liste: zeilen.filter((z) => z.typ === 'Nadel' && !z.gruppeId) },
      { name: 'Flächen', farbe: '#2e7d32', liste: zeilen.filter((z) => z.typ === 'Fläche') },
    ].filter((t) => t.liste.length)
    for (const t of teile) {
      doc.addPage()
      doc.setFillColor(...rgb(t.farbe)); doc.rect(rand, 10, 4, 9, 'F')
      doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 40, 30); doc.text(pdfText(t.name), rand + 7, 17); doc.setFont('helvetica', 'normal')
      const gs = summenBauen(t.liste, []).gesamt
      doc.setFontSize(9.5); doc.text(pdfText(`${t.liste.length} Einträge · ${zahl(gs.schafe)} Schafe · ${zahl(gs.boecke)} Böcke · ${zahl(gs.laemmer)} Lämmer${gs.ha ? ` · ${zahl(gs.ha, 2)} ha` : ''}`), rand, 25)
      let gy = 29
      if (o.mitKarte) {
        const kb3 = await kartenbild(t.liste, 1500, 800).catch(() => null)
        if (kb3) { const h = (B - 2 * rand) * (800 / 1500); doc.addImage(kb3.bild, 'JPEG', rand, gy, B - 2 * rand, h); doc.setDrawColor(200); doc.rect(rand, gy, B - 2 * rand, h); gy += h + 4 }
      }
      tabelle(t.liste, true, gy)
    }
  }

  if (o.flaechen && o.flaechen.eintraege.some((e) => e.typ === 'flaeche')) { doc.addPage(); flaechenKapitel(doc, o.flaechen.eintraege, o.flaechen.pacht, 16) }
  if (o.kreise) {
    const kz = kreisZeilen(o.kreise)
    if (kz.length) {
      doc.addPage()
      doc.setTextColor(30, 40, 30); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Einkreisungen (eingezäunt)'), rand, 16); doc.setFont('helvetica', 'normal')
      doc.setFontSize(9); doc.setTextColor(60); doc.text(pdfText(`${kz.length} ${kz.length === 1 ? 'Kreis' : 'Kreise'} · zusammen ≈ ${zahl(kz.reduce((x, r) => x + r.ha, 0), 2)} ha · ${zahl(Math.round(kz.reduce((x, r) => x + r.umfang, 0)))} m Zaun · ${kz.reduce((x, r) => x + r.netze, 0)} Netze à ${FL.NETZ_LAENGE} m`), rand, 22)
      autoTable(doc, {
        startY: 26, margin: { left: rand, right: rand, bottom: 16 }, headStyles: { fillColor: GRUEN }, styles: { fontSize: 8, cellPadding: 1.3, overflow: 'linebreak' as const },
        head: [['Nadel', 'Art', 'Radius', 'Fläche ca.', 'Umfang', 'Netze', 'Verhalten', 'Seit'].map(pdfText)],
        body: kz.map((r) => [pdfText(r.name || '(ohne Namen)'), pdfText(r.art), `${zahl(r.radius)} m`, `${zahl(r.ha, 2)} ha`, `${zahl(Math.round(r.umfang))} m`, String(r.netze), pdfText(r.bindung), r.seit ? r.seit.split('-').reverse().join('.') : '']),
      })
    }
  }

  if (o.kreise) {
    const sw = o.spannungSchwelle ?? 4
    const sz = spannungZeilen(o.kreise, sw)
    if (sz.length) {
      doc.addPage()
      doc.setTextColor(30, 40, 30); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Zaunspannung (Weidezaungeräte)'), rand, 16); doc.setFont('helvetica', 'normal')
      const nadeln = new Set(sz.map((r) => r.e.id)).size, tief = sz.filter((r) => r.unter).length
      doc.setFontSize(9); doc.setTextColor(60); doc.text(pdfText(`${sz.length} ${sz.length === 1 ? 'Messung' : 'Messungen'} an ${nadeln} ${nadeln === 1 ? 'Nadel' : 'Nadeln'} · Warnschwelle ${zahl(sw, 1)} kV${tief ? ` · ${tief} darunter` : ''}`), rand, 22)
      autoTable(doc, {
        startY: 26, margin: { left: rand, right: rand, bottom: 16 }, headStyles: { fillColor: GRUEN }, styles: { fontSize: 8, cellPadding: 1.3, overflow: 'linebreak' as const },
        head: [['Nadel', 'Datum', 'Uhrzeit', 'Spannung', 'Eingetragen von'].map(pdfText)],
        body: sz.map((r) => [pdfText(r.name || '(ohne Namen)'), r.datum.split('-').reverse().join('.'), r.zeit, `${zahl(r.kv, 1)} kV${r.unter ? ' (!)' : ''}`, pdfText(r.autor)]),
        didParseCell: (d) => { if (d.section === 'body' && d.column.index === 3 && sz[d.row.index]?.unter) { d.cell.styles.textColor = [200, 30, 30]; d.cell.styles.fontStyle = 'bold' } },
      })
    }
  }

  // Fußzeile auf jeder Seite
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(pdfText(`FlockMap · ${o.karte || ''} · ${stand}`), rand, 290)
    doc.text(`Seite ${i} von ${n}`, B - rand, 290, { align: 'right' })
  }
  return doc.output('blob')
}

// ---- Flächenverzeichnis (Kapitel bzw. eigenes PDF): Summen, Tabelle aller Flächen, Fristen; Pacht nur wenn übergeben ----
function flaechenKapitel(doc: jsPDF, eintraege: Eintrag[], pacht: PachtListe | null, y: number) {
  const rand = 14
  const z = flaechenZeilen(eintraege, pacht), sm = FL.flaechenSummen(eintraege, pacht)
  const gruen = { fillColor: GRUEN }, st = { fontSize: 7.6, cellPadding: 1.3, overflow: 'linebreak' as const, valign: 'top' as const }
  const nachY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7
  const datum = (d?: string | null) => (d ? d.split('-').reverse().join('.') : '')
  doc.setTextColor(30, 40, 30); doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text(pdfText('Flächenverzeichnis'), rand, y); doc.setFont('helvetica', 'normal')
  doc.setFontSize(9); doc.setTextColor(60)
  const teile = [`${z.length} ${z.length === 1 ? 'Fläche' : 'Flächen'} · ${zahl(sm.ha, 2)} ha gesamt`, `Eigentum ${zahl(sm.eigentumHa, 2)} ha`, `Pacht ${zahl(sm.pachtHa, 2)} ha`, ...(pacht ? [`Pacht ${zahl(Math.round(sm.pachtEuro))} € pro Jahr`] : [])]
  doc.text(pdfText(teile.join(' · ')), rand, y + 6)
  const arten = Object.entries(sm.nachArt).map(([a, ha]) => `${a === 'ohne' ? 'ohne Art' : FL.flaechenArt(a)?.name}: ${zahl(ha, 2)} ha`).join(' · ')
  doc.text(pdfText(arten), rand, y + 10.5)
  autoTable(doc, {
    startY: y + 14, margin: { left: rand, right: rand, bottom: 16 }, headStyles: gruen, styles: st,
    head: [['Fläche', 'Art', 'Besitz', 'ha', 'Umfang', 'FLIK / Schlag', 'Förderung / Fristen', ...(pacht ? ['Pacht'] : [])]],
    body: z.map((r) => [pdfText(r.name || '(ohne Namen)') + (r.ueberschneidet ? '\n(!) Umriss prüfen' : ''), pdfText(r.art), pdfText(r.besitz), zahl(r.ha, 2), pdfText(FL.umfangText(r.umfang)), pdfText([r.flik, r.schlag && `Schlag ${r.schlag}`].filter(Boolean).join('\n')), pdfText([r.programme, r.fristen].filter(Boolean).join('\n')),
      ...(pacht ? [pdfText(r.pacht ? [r.pacht.verpaechter, r.pacht.preisHa !== undefined ? `${zahl(r.pacht.preisHa, 0)} €/ha = ${zahl(r.pachtEuro ?? 0, 0)} €/J.` : '', r.pacht.ende ? `bis ${datum(r.pacht.ende)}` : '', r.kuendigenBis ? `kündigen bis ${datum(r.kuendigenBis)}` : ''].filter(Boolean).join('\n') : '')] : [])]),
    foot: [['Summe', '', '', zahl(sm.ha, 2), '', '', '', ...(pacht ? [`${zahl(Math.round(sm.pachtEuro))} €/Jahr`] : [])]],
    footStyles: { fillColor: [232, 240, 227], textColor: 30, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 17 }, 2: { cellWidth: 15 }, 3: { cellWidth: 12, halign: 'right' }, 4: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 31 } },
  })
  return nachY()
}
export async function flaechenverzeichnisPdf(o: { karte: string; hof?: string; autor?: string; eintraege: Eintrag[]; pacht: PachtListe | null }): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const B = 210, rand = 14
  const stand = new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  doc.setFillColor(...GRUEN); doc.rect(0, 0, B, 22, 'F')
  doc.setTextColor(244, 236, 216); doc.setFontSize(9); doc.text(pdfText(`FLOCKMAP · FLÄCHENVERZEICHNIS${o.hof ? ` · Hof ${o.hof}` : ''}`), rand, 8)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(pdfText(o.karte || 'Weidekarte'), rand, 17); doc.setFont('helvetica', 'normal')
  doc.setTextColor(40); doc.setFontSize(9); doc.text(pdfText(`Stand: ${stand}${o.autor ? ` · erstellt von ${o.autor}` : ''}${o.pacht ? ' · enthält vertrauliche Pachtdaten' : ''}`), rand, 28)
  flaechenKapitel(doc, o.eintraege, o.pacht, 36)
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(pdfText(`FlockMap · Flächenverzeichnis · ${o.karte || ''} · ${stand} · Flächen gemessen aus den gezeichneten Umrissen`), rand, 290); doc.text(`Seite ${i} von ${n}`, B - rand, 290, { align: 'right' }) }
  return doc.output('blob')
}
