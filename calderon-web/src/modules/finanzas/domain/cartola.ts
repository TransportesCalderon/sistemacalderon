/**
 * Lectura de la cartola del banco (Excel .xlsx o CSV) en el navegador: solo se ubican las
 * columnas y se mandan los textos a la base, que interpreta fechas y montos y valida todo
 * (fin.fn_importar_cartola).
 */
export type Celda = string | number | boolean | Date | null | undefined;
export type Columna = 'fecha' | 'descripcion' | 'documento' | 'cargo' | 'abono' | 'monto' | 'saldo';
export type Mapeo = Partial<Record<Columna, number>>;

export const ETIQUETA_COLUMNA: Record<Columna, string> = {
  fecha: 'Fecha',
  descripcion: 'Descripción',
  documento: 'N° de documento',
  cargo: 'Cargos (salidas)',
  abono: 'Abonos (entradas)',
  monto: 'Monto con signo',
  saldo: 'Saldo',
};

const PATRONES: [Columna, RegExp][] = [
  ['fecha', /^fecha|^fec\.?$|^date/],
  ['saldo', /saldo|balance/],
  ['cargo', /cargo|d[eé]bito|giro|egreso|retiro/],
  ['abono', /abono|cr[eé]dito|dep[oó]sito|ingreso/],
  ['monto', /^monto|importe|^valor|amount/],
  ['documento', /doc|n[°º.]|n[uú]mero|serie|operaci[oó]n|^nro/],
  ['descripcion', /descrip|detalle|glosa|concepto|movimiento|transacci/],
];

/** Texto de una celda tal como lo entiende la base («1234.50», «2026-10-23»). */
export function textoCelda(v: Celda): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === 'boolean') return '';
  return String(v).trim();
}

const normal = (s: string) => s.toLowerCase().trim();

/** Fila de títulos: la primera (de las 20 primeras) que nombra la fecha y al menos otra columna. */
export function buscarTitulos(filas: Celda[][]): { fila: number; mapeo: Mapeo } | null {
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const mapeo: Mapeo = {};
    (filas[i] ?? []).forEach((c, j) => {
      const t = normal(textoCelda(c));
      if (!t) return;
      for (const [col, re] of PATRONES) {
        if (mapeo[col] === undefined && re.test(t)) {
          mapeo[col] = j;
          return;
        }
      }
    });
    const montos = mapeo.cargo !== undefined || mapeo.abono !== undefined || mapeo.monto !== undefined;
    if (mapeo.fecha !== undefined && montos) return { fila: i, mapeo };
  }
  return null;
}

/** Filas para la base a partir del mapeo (desde la fila siguiente a los títulos). */
export function filasParaImportar(filas: Celda[][], desde: number, mapeo: Mapeo) {
  const col = (f: Celda[], c: Columna) => (mapeo[c] === undefined ? '' : textoCelda(f[mapeo[c]!]));
  return filas
    .slice(desde)
    .map((f) => ({
      fecha: col(f, 'fecha'),
      descripcion: col(f, 'descripcion'),
      documento: col(f, 'documento'),
      cargo: col(f, 'cargo'),
      abono: col(f, 'abono'),
      monto: col(f, 'monto'),
      saldo: col(f, 'saldo'),
    }))
    .filter((f) => f.fecha !== '' || f.cargo !== '' || f.abono !== '' || f.monto !== '');
}

/** El mapeo sirve si tiene fecha y una forma de saber el monto. */
export const mapeoCompleto = (m: Mapeo) => m.fecha !== undefined && (m.monto !== undefined || m.cargo !== undefined || m.abono !== undefined);

/** CSV (separado por «;», «,» o tabulación; con comillas). */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, '');
  const primera = limpio.split(/\r?\n/, 1)[0] ?? '';
  const sep = [';', '\t', ','].map((s) => [s, primera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]!;
    if (comillas) {
      if (ch === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = '';
    } else celda += ch;
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}
