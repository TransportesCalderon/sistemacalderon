/**
 * Migración 365 · «Listado de facturación de remitos» que manda la estación (QA Gestión): la factura y los remitos que
 * incluye. Se lee el texto del PDF y se arma la lista; la base busca la carga de cada remito (fin.fn_cruzar_remitos).
 * Funciones puras: reciben los textos del PDF con su posición (así se prueban sin PDF).
 */

import type { TextoPdf } from '@/shared/lib/pdf-texto';

export type { TextoPdf };

export interface RenglonRemito {
  numero: string;
  /** AAAA-MM-DD */
  fecha: string;
  litros: number;
  precio: number;
  total: number;
}

export interface ListadoRemitos {
  /** Comprobante de la estación, por ejemplo «FAB-0102-00000349». */
  comprobante: string | null;
  /** AAAA-MM-DD */
  fecha: string | null;
  total: number | null;
  remitos: RenglonRemito[];
}

/** Arma los renglones del PDF: textos de la misma altura (±2 puntos) en la misma página, de izquierda a derecha. */
export function renglonesPdf(textos: TextoPdf[]): string[] {
  const orden = [...textos].sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  const grupos: TextoPdf[][] = [];
  for (const t of orden) {
    const g = grupos[grupos.length - 1];
    const primero = g?.[0];
    if (g && primero && primero.pagina === t.pagina && Math.abs(primero.y - t.y) <= 2) g.push(t);
    else grupos.push([t]);
  }
  return grupos.map((g) =>
    g
      .sort((a, b) => a.x - b.x)
      .map((t) => t.texto.trim())
      .filter(Boolean)
      .join(' '),
  );
}

/** Número argentino («7.857.637,60») a número. */
export function numeroAr(s: string | undefined): number {
  return Number((s ?? '').replace(/\./g, '').replace(',', '.'));
}

const fechaIso = (dmy: string | undefined): string => {
  const [d, m, a] = (dmy ?? '').split('/');
  return `${a}-${m}-${d}`;
};

const RE_REMITO = /(\d{2}\/\d{2}\/\d{4})\s+(?:REM-)?(\d{4}-\d{8})\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)/;
const RE_COMPROBANTE = /Comprobante:\s*([A-Z]{1,4}-\d{4}-\d{8})\s+(\d{2}\/\d{2}\/\d{4})/;
const RE_TOTAL = /Total:\s*([\d.]+,\d+)/;

/** Lee el listado: comprobante, fecha, total y un renglón por cada remito (el mismo remito puede venir en varios renglones). */
export function leerListadoRemitos(renglones: string[]): ListadoRemitos {
  const res: ListadoRemitos = { comprobante: null, fecha: null, total: null, remitos: [] };
  for (const r of renglones) {
    const c = RE_COMPROBANTE.exec(r);
    if (c && !res.comprobante) {
      res.comprobante = c[1] ?? null;
      res.fecha = fechaIso(c[2]);
      continue;
    }
    const m = RE_REMITO.exec(r);
    if (m) {
      res.remitos.push({ fecha: fechaIso(m[1]), numero: m[2] ?? '', litros: numeroAr(m[3]), precio: numeroAr(m[5]), total: numeroAr(m[6]) });
      continue;
    }
    const t = RE_TOTAL.exec(r);
    if (t) res.total = numeroAr(t[1]);
  }
  return res;
}

/** Lo que devuelve la base al cruzar los remitos con las cargas. */
export interface RemitoCruzado {
  numero: string;
  fecha: string;
  renglones: number;
  litros: number;
  total: number;
  cargaId: number | null;
  como: 'numero' | 'litros' | 'importe' | null;
  patente: string | null;
  cargaLitros: number | null;
  cargaImporte: number | null;
  otraFactura: string | null;
  difLitros: number | null;
  difImporte: number | null;
}
export interface CruceRemitos {
  remitos: RemitoCruzado[];
  sinRemito: { cargaId: number; fecha: string; patente: string | null; litros: number; importe: number }[];
}

type Obj = Record<string, unknown>;
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const t = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

export function parsearCruceRemitos(raw: unknown): CruceRemitos {
  const x = (raw ?? {}) as Obj;
  return {
    remitos: arr(x.remitos).map((r) => ({
      numero: String(r.numero ?? ''),
      fecha: String(r.fecha ?? ''),
      renglones: Number(r.renglones ?? 1),
      litros: Number(r.litros ?? 0),
      total: Number(r.total ?? 0),
      cargaId: n(r.carga_id),
      como: r.como === 'numero' || r.como === 'litros' || r.como === 'importe' ? r.como : null,
      patente: t(r.patente),
      cargaLitros: n(r.carga_litros),
      cargaImporte: n(r.carga_importe),
      otraFactura: t(r.otra_factura),
      difLitros: n(r.dif_litros),
      difImporte: n(r.dif_importe),
    })),
    sinRemito: arr(x.sin_remito).map((c) => ({
      cargaId: Number(c.carga_id),
      fecha: String(c.fecha ?? ''),
      patente: t(c.patente),
      litros: Number(c.litros ?? 0),
      importe: Number(c.importe ?? 0),
    })),
  };
}
