/**
 * XLSX mínimo, sin librerías: una hoja, textos y números, bordes finos, celdas combinadas y ancho de columnas.
 * El ZIP va sin comprimir (método «store»), que Excel abre sin problema.
 */
export type EstiloCelda = 'normal' | 'borde' | 'borde_centro';
export interface Celda {
  fila: number; // desde 1
  col: number; // desde 1
  valor: string | number;
  estilo?: EstiloCelda;
}
export interface Hoja {
  nombre: string;
  celdas: Celda[];
  combinadas?: string[]; // «A3:B3»
  anchos?: Record<number, number>; // columna (desde 1) → ancho
}

const ESTILO: Record<EstiloCelda, number> = { normal: 0, borde: 1, borde_centro: 2 };

export const letraColumna = (col: number): string => {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function hojaXml(h: Hoja): string {
  const filas = new Map<number, Celda[]>();
  for (const c of h.celdas) filas.set(c.fila, [...(filas.get(c.fila) ?? []), c]);
  const cuerpo = [...filas.keys()]
    .sort((a, b) => a - b)
    .map((f) => {
      const cs = filas
        .get(f)!
        .sort((a, b) => a.col - b.col)
        .map((c) => {
          const ref = `${letraColumna(c.col)}${c.fila}`;
          const s = ESTILO[c.estilo ?? 'normal'];
          if (typeof c.valor === 'number') return `<c r="${ref}" s="${s}"><v>${c.valor}</v></c>`;
          if (c.valor === '') return `<c r="${ref}" s="${s}"/>`;
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.valor)}</t></is></c>`;
        })
        .join('');
      return `<row r="${f}">${cs}</row>`;
    })
    .join('');
  const cols = Object.entries(h.anchos ?? {})
    .map(([c, w]) => `<col min="${c}" max="${c}" width="${w}" customWidth="1"/>`)
    .join('');
  const merges = (h.combinadas ?? []).map((m) => `<mergeCell ref="${m}"/>`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${cuerpo}</sheetData>` +
    (merges ? `<mergeCells count="${h.combinadas!.length}">${merges}</mergeCells>` : '') +
    '</worksheet>'
  );
}

const ESTILOS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right>' +
  '<top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function archivos(h: Hoja): [string, string][] {
  return [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<sheets><sheet name="${xml(h.nombre.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', hojaXml(h)],
  ];
}

// ─── ZIP sin compresión ────────────────────────────────────────────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of d) c = TABLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(entradas: [string, Uint8Array][]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const [nombre, datos] of entradas) {
    const n = enc.encode(nombre);
    const crc = crc32(datos);
    const local = new Uint8Array(30 + n.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true); // nombres en UTF-8
    dv.setUint16(8, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, datos.length, true);
    dv.setUint32(22, datos.length, true);
    dv.setUint16(26, n.length, true);
    local.set(n, 30);
    partes.push(local, datos);
    const c = new Uint8Array(46 + n.length);
    const dc = new DataView(c.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(8, 0x0800, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, datos.length, true);
    dc.setUint32(24, datos.length, true);
    dc.setUint16(28, n.length, true);
    dc.setUint32(42, offset, true);
    c.set(n, 46);
    central.push(c);
    offset += local.length + datos.length;
  }
  const tam = central.reduce((a, c) => a + c.length, 0);
  const fin = new Uint8Array(22);
  const df = new DataView(fin.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, entradas.length, true);
  df.setUint16(10, entradas.length, true);
  df.setUint32(12, tam, true);
  df.setUint32(16, offset, true);
  const todo = [...partes, ...central, fin];
  const out = new Uint8Array(todo.reduce((a, p) => a + p.length, 0));
  let i = 0;
  for (const p of todo) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** El archivo .xlsx de una hoja. */
export function armarXlsx(h: Hoja): Uint8Array {
  const enc = new TextEncoder();
  return zip(archivos(h).map(([n, t]) => [n, enc.encode(t)]));
}
