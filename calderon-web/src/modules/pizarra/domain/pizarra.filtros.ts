import { hoyEnZona } from '@/shared/lib/fechas';
import type { EstadoUnidad, FilaPizarra } from './pizarra.types';

/**
 * Búsqueda y filtros de la Pizarra. Trabajan sobre lo que ya devolvió la base (18 filas):
 * no deciden nada que la base no haya decidido (estado y alertas vienen calculados).
 */

/** «PWTT 41», «pwtt-41» y «tt41» buscan lo mismo. */
export const normalizar = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[\s\-./]/g, '');

export function coincide(f: FilaPizarra, q: string): boolean {
  const n = normalizar(q);
  if (!n) return true;
  return [
    f.patente,
    f.codigoInterno,
    f.tractor,
    f.chofer,
    f.contenedor,
    f.cliente,
    f.gensetCodigo,
    f.numeroServicio,
    f.proxima?.cliente,
  ].some((c) => normalizar(c).includes(n));
}

export type FiltroDescarga = '' | 'vencida' | 'hoy' | 'manana' | 'futuro' | 'sin_fecha';

/** Día de la descarga respecto de hoy, en la zona de la operación. */
export function clasificarDescarga(iso: string | null, zona: string, ahora: Date = new Date()): Exclude<FiltroDescarga, ''> {
  if (!iso) return 'sin_fecha';
  const fecha = new Date(iso);
  if (fecha.getTime() < ahora.getTime()) return 'vencida';
  const hoy = hoyEnZona(zona, ahora);
  const manana = hoyEnZona(zona, new Date(ahora.getTime() + 86_400_000));
  const dia = hoyEnZona(zona, fecha);
  return dia === hoy ? 'hoy' : dia === manana ? 'manana' : 'futuro';
}

/** Requisito del filtro «Apto para…»: al menos `minimo` del accesorio (1 = que lo tenga). */
export interface RequisitoAccesorio {
  tipoId: number;
  minimo: number;
}

export interface FiltrosPizarra {
  q: string;
  estados: EstadoUnidad[];
  cliente: string;
  chofer: string;
  tractor: string;
  semi: string;
  descarga: FiltroDescarga;
  soloAlertas: boolean;
  apto: RequisitoAccesorio[];
}

export const FILTROS_VACIOS: FiltrosPizarra = {
  q: '',
  estados: [],
  cliente: '',
  chofer: '',
  tractor: '',
  semi: '',
  descarga: '',
  soloAlertas: false,
  apto: [],
};

export const hayFiltros = (f: FiltrosPizarra) =>
  !!(f.q || f.estados.length || f.cliente || f.chofer || f.tractor || f.semi || f.descarga || f.soloAlertas || f.apto.length);

export function cumpleApto(f: FilaPizarra, apto: RequisitoAccesorio[]): boolean {
  return apto.every((r) => (f.accesorios[r.tipoId] ?? -1) >= r.minimo);
}

export function filtrar(filas: FilaPizarra[], f: FiltrosPizarra, zona: string, ahora: Date = new Date()): FilaPizarra[] {
  return filas.filter(
    (x) =>
      coincide(x, f.q) &&
      (f.estados.length === 0 || f.estados.includes(x.estado)) &&
      (!f.cliente || x.cliente === f.cliente) &&
      (!f.chofer || x.chofer === f.chofer) &&
      (!f.tractor || x.tractor === f.tractor) &&
      (!f.semi || x.patente === f.semi) &&
      (!f.descarga || clasificarDescarga(x.descarga, zona, ahora) === f.descarga) &&
      (!f.soloAlertas || x.alertas.length > 0) &&
      cumpleApto(x, f.apto),
  );
}

/** Valores distintos de una columna, para las listas de los filtros. */
export const opciones = (filas: FilaPizarra[], campo: (f: FilaPizarra) => string | null) =>
  [...new Set(filas.map(campo).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'es'));

export const nivelFila = (f: FilaPizarra): 'critico' | 'aviso' | null =>
  f.alertas.some((a) => a.nivel === 'critico') ? 'critico' : f.alertas.length ? 'aviso' : null;
