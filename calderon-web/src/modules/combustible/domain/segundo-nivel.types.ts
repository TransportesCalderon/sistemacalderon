import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 200 · Cierre de viaje: si se descuenta al chofer menos que la diferencia, hace falta una segunda
 * aprobación de un gerente habilitado. La base decide todo; acá solo se convierten tipos.
 */

export interface SegundoNivelCierre {
  diferenciaL: number;
  aDescontarL: number;
  requiere: boolean;
  primeraPor: string | null;
  primeraEn: FechaISO | null;
  primeraVigente: boolean;
  segundaPor: string | null;
  segundaEn: FechaISO | null;
}

export interface EsperaSegundoNivel {
  tipo: 'cierre' | 'quitar_descuento';
  cierreId: number;
  numero: string;
  patente: string;
  chofer: string | null;
  diferenciaL: number | null;
  aDescontarL: number | null;
  quitarL: number | null;
  primeraPor: string | null;
  motivo: string | null;
  desde: FechaISO;
}

type J = Record<string, unknown>;
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function parsearSegundoNivel(d: unknown): SegundoNivelCierre | null {
  if (!d || typeof d !== 'object') return null;
  const x = d as J;
  return {
    diferenciaL: Number(x.diferencia_l ?? 0),
    aDescontarL: Number(x.a_descontar_l ?? 0),
    requiere: x.requiere === true,
    primeraPor: txt(x.primera_por),
    primeraEn: txt(x.primera_en) as FechaISO | null,
    primeraVigente: x.primera_vigente === true,
    segundaPor: txt(x.segunda_por),
    segundaEn: txt(x.segunda_en) as FechaISO | null,
  };
}

export const parsearEsperas = (d: unknown): EsperaSegundoNivel[] =>
  (Array.isArray(d) ? (d as J[]) : []).map((x) => ({
    tipo: x.tipo === 'quitar_descuento' ? 'quitar_descuento' : 'cierre',
    cierreId: Number(x.cierre_id),
    numero: txt(x.numero) ?? '',
    patente: txt(x.patente) ?? '',
    chofer: txt(x.chofer),
    diferenciaL: n(x.diferencia_l),
    aDescontarL: n(x.a_descontar_l),
    quitarL: n(x.quitar_l),
    primeraPor: txt(x.primera_por),
    motivo: txt(x.motivo),
    desde: (txt(x.desde) ?? '') as FechaISO,
  }));
