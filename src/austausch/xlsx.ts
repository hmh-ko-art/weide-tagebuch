// Schlanker Excel-Schreiber (.xlsx = ZIP mit XML-Dateien) – ohne große Bibliothek.
// Unterstützt: mehrere Blätter, Text/Zahl/Datum, fette Kopfzeile, fixierte Kopfzeile, Autofilter, Spaltenbreiten, Zahlenformate.
import { zipSync, strToU8 } from 'fflate'

export type Zelle = string | number | null | { datum: string } | { zahl: number; format: 'koord' | 'ha' }
export interface Blatt { name: string; kopf: string[]; zeilen: Zelle[][]; breiten?: number[]; summenZeile?: Zelle[] }

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const spalte = (i: number) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
// Excel-Datum: Tage seit 1899-12-30
const serien = (iso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000)

// Stile: 0 normal, 1 Kopf fett, 2 Datum, 3 Koordinate 0.000000, 4 Hektar 0.00, 5 Text mit Umbruch, 6 Summe fett
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="0.000000"/><numFmt numFmtId="166" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F0E3"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function zelleXml(z: Zelle, ref: string, fett = false): string {
  if (z === null || z === '') return ''
  if (typeof z === 'number') return Number.isFinite(z) ? `<c r="${ref}"${fett ? ' s="6"' : ''}><v>${z}</v></c>` : ''
  if (typeof z === 'string') return `<c r="${ref}" t="inlineStr" s="${fett ? 6 : z.includes('\n') ? 5 : 0}"><is><t xml:space="preserve">${esc(z.slice(0, 32000))}</t></is></c>`
  if ('datum' in z) return /^\d{4}-\d{2}-\d{2}/.test(z.datum) ? `<c r="${ref}" s="2"><v>${serien(z.datum)}</v></c>` : ''
  return Number.isFinite(z.zahl) ? `<c r="${ref}" s="${z.format === 'koord' ? 3 : 4}"><v>${z.zahl}</v></c>` : ''
}

function blattXml(b: Blatt): string {
  const n = b.kopf.length
  const zeilen = [`<row r="1">${b.kopf.map((k, i) => `<c r="${spalte(i)}1" t="inlineStr" s="1"><is><t>${esc(k)}</t></is></c>`).join('')}</row>`]
  b.zeilen.forEach((z, r) => zeilen.push(`<row r="${r + 2}">${z.map((c, i) => zelleXml(c, `${spalte(i)}${r + 2}`)).join('')}</row>`))
  if (b.summenZeile) { const r = b.zeilen.length + 2; zeilen.push(`<row r="${r}">${b.summenZeile.map((c, i) => zelleXml(c, `${spalte(i)}${r}`, true)).join('')}</row>`) }
  const cols = (b.breiten ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const letzte = `${spalte(n - 1)}${b.zeilen.length + 1}`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${zeilen.join('')}</sheetData>${b.zeilen.length ? `<autoFilter ref="A1:${letzte}"/>` : ''}</worksheet>`
}

export function xlsxErzeugen(blaetter: Blatt[]): Uint8Array {
  const namen = blaetter.map((b, i) => (b.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || `Blatt${i + 1}`))
  const definiert = blaetter.map((b, i) => b.zeilen.length ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(namen[i]).replace(/'/g, "''")}'!$A$1:$${spalte(b.kopf.length - 1)}$${b.zeilen.length + 1}</definedName>` : '').join('')
  const dateien: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${blaetter.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`),
    'docProps/core.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>FlockMap</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${namen.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${definiert ? `<definedNames>${definiert}</definedNames>` : ''}</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${blaetter.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${blaetter.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
  }
  blaetter.forEach((b, i) => { dateien[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(blattXml(b)) })
  return zipSync(dateien, { level: 6 })
}
