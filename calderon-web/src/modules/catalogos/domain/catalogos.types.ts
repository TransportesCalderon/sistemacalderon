import type { FechaDia } from '@/shared/types/dominio';

/**
 * Catálogos de la puesta en marcha (migración 28): proveedores, estaciones de servicio,
 * tipos de cambio y parámetros. Solo forma; las reglas (códigos únicos, estación externa con
 * proveedor, cotización usada que no se borra, parámetros que no cambian de tipo) son de la base.
 */
export const TIPOS_PROVEEDOR = ['combustible', 'mantenimiento', 'peaje', 'otro'] as const;
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number];
export const ETIQUETA_TIPO_PROVEEDOR: Record<TipoProveedor, string> = {
  combustible: 'Combustible',
  mantenimiento: 'Mantenimiento',
  peaje: 'Peaje',
  otro: 'Otro',
};
export const esTipoProveedor = (v: unknown): v is TipoProveedor => typeof v === 'string' && (TIPOS_PROVEEDOR as readonly string[]).includes(v);

export interface Proveedor {
  id: number;
  codigo: string;
  razonSocial: string;
  identificadorFiscal: string | null;
  pais: string;
  tipo: TipoProveedor;
  monedaDefecto: string | null;
  versionFila: number;
}

export interface Estacion {
  id: number;
  codigo: string;
  nombre: string;
  proveedorId: number | null;
  pais: string;
  esTanquePropio: boolean;
  versionFila: number;
}

/** Cotización: tasa = unidades de moneda base por 1 unidad de la moneda (como la guarda la base). */
export interface TipoCambio {
  id: number;
  fecha: FechaDia;
  moneda: string;
  monedaBase: string;
  tasa: number;
  tipo: string;
  fuente: string | null;
  versionFila: number;
}

export type TipoValorParametro = 'number' | 'string' | 'boolean' | 'array' | 'object' | 'null';

export interface Parametro {
  codigo: string;
  valor: unknown;
  tipoValor: TipoValorParametro;
  descripcion: string;
  provisional: boolean;
  obsoleto: boolean;
  actualizadoEn: string;
  versionFila: number;
}

export interface Opcion {
  codigo: string;
  nombre: string;
}

export function tipoValor(v: unknown): TipoValorParametro {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'number' || t === 'string' || t === 'boolean' ? t : 'object';
}

/** Tasa que guarda la base (unidades de la moneda base por 1 de la moneda), con 8 decimales. */
export function tasaDesde(valor: number, sentido: 'directa' | 'inversa'): number {
  return Math.round((sentido === 'directa' ? valor : 1 / valor) * 1e8) / 1e8;
}

/**
 * Forma legible de una cotización: "1 USD = 984,09 CLP" o "1 ARS = 0,6418 CLP". Si la tasa es
 * muy chica (por ejemplo CLP con base USD), se muestra al revés: "1 USD = 950 CLP".
 */
export function cotizacionLegible(moneda: string, base: string, tasa: number): { uno: string; valor: number; otra: string } {
  return tasa >= 0.01 ? { uno: moneda, valor: tasa, otra: base } : { uno: base, valor: 1 / tasa, otra: moneda };
}

/** Resultado de una actualización automática (fin.importacion_cotizacion). */
export interface ImportacionCotizacion {
  id: number;
  ejecutadoEn: string;
  origen: 'programada' | 'manual';
  ok: boolean;
  insertadas: number;
  detalle: string | null;
}

export interface Moneda {
  codigo: string;
  nombre: string;
  esBase: boolean;
}

/** mae.ubicacion: puertos, base, clientes… (la Pizarra Azul los usa como «Dónde»). */
export const TIPOS_UBICACION = ['base', 'puerto', 'cliente', 'frontera', 'estacion', 'otro'] as const;
export type TipoUbicacion = (typeof TIPOS_UBICACION)[number];
export const TIPO_UBICACION_ETIQUETA: Record<TipoUbicacion, string> = {
  base: 'Base',
  puerto: 'Puerto',
  cliente: 'Cliente',
  frontera: 'Frontera',
  estacion: 'Estación',
  otro: 'Otro',
};
export interface Ubicacion {
  id: number;
  codigo: string;
  nombre: string;
  tipo: TipoUbicacion;
  pais: string;
  latitud: number | null;
  longitud: number | null;
  radioM: number | null;
  versionFila: number;
}
