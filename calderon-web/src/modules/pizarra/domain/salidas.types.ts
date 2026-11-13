import type { FechaISO } from '@/shared/types/dominio';

/**
 * Migración 196 · Libro de salidas de la base operativa (Mendoza): cuándo sale cada camión de la base
 * hacia su siguiente destino. La base detecta las salidas por GPS («detectada»), la oficina las
 * confirma o descarta, y también se cargan a mano. Acá solo se convierten tipos.
 */

export type EstadoSalida = 'detectada' | 'confirmada' | 'descartada';
export type OrigenSalida = 'gps' | 'manual' | 'importado';
export const ETIQUETA_ORIGEN: Record<OrigenSalida, string> = { gps: 'GPS', manual: 'A mano', importado: 'Libro anterior' };

export interface Salida {
  id: number;
  fecha: string;
  salidaTs: FechaISO | null;
  estado: EstadoSalida;
  origen: OrigenSalida;
  camionId: number | null;
  tractor: string | null;
  choferId: number | null;
  chofer: string | null;
  semiId: number | null;
  semi: string | null;
  gensetId: number | null;
  genset: string | null;
  producto: string | null;
  destino: string | null;
  devolucionVacio: string | null;
  observacion: string | null;
  motivoDescarte: string | null;
  confirmadaPor: string | null;
  faltan: string[];
}

export interface LibroSalidas {
  base: string | null;
  pendientes: number;
  /** Lugares de devolución ya usados (para sugerir). */
  lugaresDevolucion: string[];
  salidas: Salida[];
}

export interface DatosSalida {
  choferId: number | null;
  semiId: number | null;
  gensetId: number | null;
  producto: string | null;
  destino: string | null;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const txt = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export function parsearLibro(d: unknown): LibroSalidas {
  const x = obj(d);
  return {
    base: txt(x.base),
    pendientes: Number(x.pendientes ?? 0),
    lugaresDevolucion: Array.isArray(x.lugares_devolucion) ? x.lugares_devolucion.filter((l): l is string => typeof l === 'string') : [],
    salidas: (Array.isArray(x.salidas) ? (x.salidas as J[]) : []).map((s) => ({
      id: Number(s.id),
      fecha: txt(s.fecha) ?? '',
      salidaTs: txt(s.salida_ts) as FechaISO | null,
      estado: (s.estado === 'detectada' || s.estado === 'descartada' ? s.estado : 'confirmada') as EstadoSalida,
      origen: (s.origen === 'gps' || s.origen === 'importado' ? s.origen : 'manual') as OrigenSalida,
      camionId: n(s.camion_id),
      tractor: txt(s.tractor),
      choferId: n(s.chofer_id),
      chofer: txt(s.chofer),
      semiId: n(s.semi_id),
      semi: txt(s.semi),
      gensetId: n(s.genset_id),
      genset: txt(s.genset),
      producto: txt(s.producto),
      destino: txt(s.destino),
      devolucionVacio: txt(s.devolucion_vacio),
      observacion: txt(s.observacion),
      motivoDescarte: txt(s.motivo_descarte),
      confirmadaPor: txt(s.confirmada_por),
      faltan: Array.isArray(s.faltan) ? s.faltan.map(String) : [],
    })),
  };
}

export function parsearDatosSalida(d: unknown): DatosSalida {
  const x = obj(d);
  return { choferId: n(x.chofer_id), semiId: n(x.semi_id), gensetId: n(x.genset_id), producto: txt(x.producto), destino: txt(x.destino) };
}
