/**
 * Imprimir o guardar en PDF una respuesta de Iris. Si la respuesta tiene títulos, cada título abre
 * una lámina (hoja apaisada, una idea por lámina); si no, sale como una hoja común.
 * Se arma con elementos del navegador y textContent: nunca HTML crudo.
 */
import { parsearMarkdown, type Bloque, type Trozo } from './markdown';

const ESTILO = `
  @page { size: A4 landscape; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #1a1a1a; margin: 0; }
  section { page-break-after: always; break-after: page; min-height: 170mm; padding: 4mm 6mm; }
  section:last-child { page-break-after: auto; break-after: auto; }
  h1 { font-size: 30pt; margin: 0 0 10mm; line-height: 1.15; border-bottom: 2px solid #1a1a1a; padding-bottom: 4mm; }
  p, li { font-size: 17pt; line-height: 1.45; margin: 0 0 5mm; }
  ul, ol { margin: 0 0 5mm; padding-left: 9mm; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 6mm; }
  th, td { font-size: 14pt; text-align: left; padding: 2.5mm 3mm; border-bottom: 1px solid #bbb; }
  th { border-bottom: 2px solid #1a1a1a; }
  code { font-family: ui-monospace, Consolas, monospace; font-size: 0.9em; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 9pt; color: #666; }
`;

/** Las láminas: cada título abre una; lo que venga antes del primer título va en la primera. */
export function laminas(texto: string): Bloque[][] {
  const r: Bloque[][] = [];
  for (const b of parsearMarkdown(texto)) {
    if (b.tipo === 'titulo' || r.length === 0) r.push([]);
    r[r.length - 1]?.push(b);
  }
  return r.filter((l) => l.length > 0);
}

function poner(doc: Document, padre: HTMLElement, trozos: Trozo[]) {
  for (const t of trozos) {
    const el = t.tipo === 'negrita' ? doc.createElement('strong') : t.tipo === 'codigo' ? doc.createElement('code') : doc.createElement('span');
    el.textContent = t.texto;
    padre.appendChild(el);
  }
}

function dibujar(doc: Document, padre: HTMLElement, b: Bloque) {
  if (b.tipo === 'titulo') {
    const h = doc.createElement('h1');
    poner(doc, h, b.trozos);
    padre.appendChild(h);
  } else if (b.tipo === 'parrafo') {
    const p = doc.createElement('p');
    b.lineas.forEach((l, i) => {
      if (i > 0) p.appendChild(doc.createElement('br'));
      poner(doc, p, l);
    });
    padre.appendChild(p);
  } else if (b.tipo === 'lista') {
    const ul = doc.createElement(b.ordenada ? 'ol' : 'ul');
    for (const it of b.items) {
      const li = doc.createElement('li');
      poner(doc, li, it);
      ul.appendChild(li);
    }
    padre.appendChild(ul);
  } else {
    const tabla = doc.createElement('table');
    const fila = (celdas: Trozo[][], etiqueta: 'th' | 'td') => {
      const tr = doc.createElement('tr');
      for (const c of celdas) {
        const celda = doc.createElement(etiqueta);
        poner(doc, celda, c);
        tr.appendChild(celda);
      }
      tabla.appendChild(tr);
    };
    fila(b.encabezado, 'th');
    for (const f of b.filas) fila(f, 'td');
    padre.appendChild(tabla);
  }
}

/** Abre la respuesta lista para imprimir. Devuelve false si el navegador bloqueó la ventana. */
export function imprimirRespuesta(texto: string, pie: string): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  const doc = w.document;
  doc.title = 'Iris';
  const estilo = doc.createElement('style');
  estilo.textContent = ESTILO;
  doc.head.appendChild(estilo);
  for (const l of laminas(texto)) {
    const s = doc.createElement('section');
    for (const b of l) dibujar(doc, s, b);
    doc.body.appendChild(s);
  }
  const f = doc.createElement('footer');
  f.textContent = pie;
  doc.body.appendChild(f);
  w.focus();
  w.print();
  return true;
}
