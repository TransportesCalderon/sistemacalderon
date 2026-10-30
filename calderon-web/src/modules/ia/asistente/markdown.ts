/**
 * Markdown corto de las respuestas del asistente (párrafos, listas, tablas chicas, títulos, negrita
 * y código). Se convierte a bloques y se dibuja con elementos de React: nunca HTML crudo.
 */
export type Trozo = { tipo: 'texto' | 'negrita' | 'codigo'; texto: string };
export type Bloque =
  | { tipo: 'parrafo'; lineas: Trozo[][] }
  | { tipo: 'titulo'; trozos: Trozo[] }
  | { tipo: 'lista'; ordenada: boolean; items: Trozo[][] }
  | { tipo: 'tabla'; encabezado: Trozo[][]; filas: Trozo[][][] };

export function trozos(linea: string): Trozo[] {
  const r: Trozo[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let ult = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(linea)) !== null) {
    if (m.index > ult) r.push({ tipo: 'texto', texto: linea.slice(ult, m.index) });
    r.push(m[1] !== undefined ? { tipo: 'negrita', texto: m[1] } : { tipo: 'codigo', texto: m[2] ?? '' });
    ult = re.lastIndex;
  }
  if (ult < linea.length) r.push({ tipo: 'texto', texto: linea.slice(ult) });
  return r;
}

const celdas = (linea: string) =>
  linea
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => trozos(c.trim()));
const esSeparador = (linea: string) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea.trim());
const ITEM = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/;

export function parsearMarkdown(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n');
  const bloques: Bloque[] = [];
  let parrafo: Trozo[][] = [];
  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: 'parrafo', lineas: parrafo });
    parrafo = [];
  };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i] ?? '';
    if (!l.trim()) {
      cerrarParrafo();
      continue;
    }
    // Tabla: una fila con | y la siguiente es la línea de guiones
    if (l.includes('|') && esSeparador(lineas[i + 1] ?? '')) {
      cerrarParrafo();
      const encabezado = celdas(l);
      const filas: Trozo[][][] = [];
      i += 2;
      while (i < lineas.length && (lineas[i] ?? '').includes('|') && (lineas[i] ?? '').trim()) filas.push(celdas(lineas[i++] ?? ''));
      i--;
      bloques.push({ tipo: 'tabla', encabezado, filas });
      continue;
    }
    const t = /^\s*#{1,6}\s+(.*)$/.exec(l);
    if (t) {
      cerrarParrafo();
      bloques.push({ tipo: 'titulo', trozos: trozos(t[1] ?? '') });
      continue;
    }
    const it = ITEM.exec(l);
    if (it) {
      cerrarParrafo();
      const ordenada = it[1] !== undefined;
      const items: Trozo[][] = [];
      while (i < lineas.length) {
        const m = ITEM.exec(lineas[i] ?? '');
        if (!m || (m[1] !== undefined) !== ordenada) break;
        items.push(trozos(m[2] ?? ''));
        i++;
      }
      i--;
      bloques.push({ tipo: 'lista', ordenada, items });
      continue;
    }
    parrafo.push(trozos(l.trim()));
  }
  cerrarParrafo();
  return bloques;
}
