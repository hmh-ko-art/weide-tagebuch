// PDF-Bericht: Titel (Hof, Karte, Datum), Kennzahlen, Übersichtskarte, Summen je Gruppe, Tabelle aller Einträge,
// optional je Gruppe eine eigene Seite (mit eigener Karte und allen Notizen).
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { kartenbild } from './kartenbild'
import { summenBauen, zahl, type Zeile } from './zeilen'
import type { Gruppe } from '../types'

// Standard-PDF-Schriften kennen nur westeuropäische Zeichen -> Sonderzeichen ersetzen, Emojis entfernen
export const pdfText = (s: string) => s
  .replace(/[–—]/g, '-').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/…/g, '...').replace(/≈/g, 'ca.').replace(/Σ/g, 'Summe')
  .replace(/⚠️?/g, '(!)').replace(/\p{Extended_Pictographic}\uFE0F?/gu, '').replace(/[^\u0000-\u00ff€\n]/g, '')
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const GRUEN: [number, number, number] = [30, 77, 43]

export interface BerichtOptionen { karte: string; hof?: string; autor?: string; filterText?: string; gesamtAnzahl: number; jeGruppe: boolean; mitKarte: boolean }

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
    const kb2 = await kartenbild(zeilen).catch(() => null)
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

  // Fußzeile auf jeder Seite
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(pdfText(`FlockMap · ${o.karte || ''} · ${stand}`), rand, 290)
    doc.text(`Seite ${i} von ${n}`, B - rand, 290, { align: 'right' })
  }
  return doc.output('blob')
}
