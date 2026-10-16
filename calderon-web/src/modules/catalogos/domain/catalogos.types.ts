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

/**
 * La pantalla pide "1 USD = 950 CLP" (como se lee la cotización); la base guarda la inversa
 * (USD por 1 CLP) con 8 decimales. Conversión de unidades, no una regla.
 */
export const tasaDesdeCotizacion = (unidadesPorBase: number) => Math.round((1 / unidadesPorBase) * 1e8) / 1e8;
export const cotizacionDesdeTasa = (tasa: number) => 1 / tasa;
