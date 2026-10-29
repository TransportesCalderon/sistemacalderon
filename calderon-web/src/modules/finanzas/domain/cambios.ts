import { z } from 'zod';

/**
 * Migración 123 · Cambios de moneda armados solos desde las cartolas (USD → CLP → ARS por bancos,
 * aplicaciones y billeteras). La base empareja cada salida con su llegada, dice cuáles son seguros,
 * crea las transferencias y calcula lo que costó cambiar. Acá solo se convierten tipos.
 */
export const VERSION_CAMBIOS = 123;

export interface ParCambio {
  salida: number;
  entrada: number;
  fechaSalida: string;
  fechaEntrada: string;
  origen: string;
  monedaOrigen: string;
  montoSalida: number;
  detalleSalida: string;
  destino: string;
  monedaDestino: string;
  montoEntrada: number;
  detalleEntrada: string;
  cambio: boolean;
  tasaReal: number;
  tasaOficial: number;
  desvioPct: number;
  costoClp: number | null;
  seguro: boolean;
}

export interface CambiosSugeridos {
  puedeConfirmar: boolean;
  dias: number;
  toleranciaPct: number;
  pares: ParCambio[];
  sinCotizacion: number;
}

export interface FilaCostoCambio {
  mes: string;
  origen: string;
  monedaOrigen: string;
  destino: string;
  monedaDestino: string;
  cambios: number;
  salio: number;
  llego: number;
  tasaReal: number | null;
  tasaOficial: number | null;
  costoClp: number | null;
  costoPct: number | null;
  sinCotizacion: boolean;
}

export interface CostoCambios {
  moneda: string;
  filas: FilaCostoCambio[];
  totalClp: number | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);
const numN = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function parsearSugeridos(raw: unknown): CambiosSugeridos {
  const j = obj(raw);
  return {
    puedeConfirmar: j.puede_confirmar === true,
    dias: Number(j.dias ?? 3),
    toleranciaPct: Number(j.tolerancia_pct ?? 15),
    sinCotizacion: Number(j.sin_cotizacion ?? 0),
    pares: arr(j.pares).map((p) => ({
      salida: Number(p.salida),
      entrada: Number(p.entrada),
      fechaSalida: str(p.fecha_salida),
      fechaEntrada: str(p.fecha_entrada),
      origen: str(p.origen),
      monedaOrigen: str(p.moneda_origen),
      montoSalida: Number(p.monto_salida),
      detalleSalida: str(p.detalle_salida),
      destino: str(p.destino),
      monedaDestino: str(p.moneda_destino),
      montoEntrada: Number(p.monto_entrada),
      detalleEntrada: str(p.detalle_entrada),
      cambio: p.cambio === true,
      tasaReal: Number(p.tasa_real),
      tasaOficial: Number(p.tasa_oficial),
      desvioPct: Number(p.desvio_pct),
      costoClp: numN(p.costo_clp),
      seguro: p.seguro === true,
    })),
  };
}

export function parsearCostoCambios(raw: unknown): CostoCambios {
  const j = obj(raw);
  return {
    moneda: str(j.moneda) || 'CLP',
    totalClp: numN(j.total_clp),
    filas: arr(j.filas).map((f) => ({
      mes: str(f.mes),
      origen: str(f.origen),
      monedaOrigen: str(f.moneda_origen),
      destino: str(f.destino),
      monedaDestino: str(f.moneda_destino),
      cambios: Number(f.cambios ?? 0),
      salio: Number(f.salio ?? 0),
      llego: Number(f.llego ?? 0),
      tasaReal: numN(f.tasa_real),
      tasaOficial: numN(f.tasa_oficial),
      costoClp: numN(f.costo_clp),
      costoPct: numN(f.costo_pct),
      sinCotizacion: f.sin_cotizacion === true,
    })),
  };
}

/** Clave de un par para elegirlo en la pantalla. */
export const clavePar = (p: Pick<ParCambio, 'salida' | 'entrada'>) => `${p.salida}-${p.entrada}`;

export const confirmarCambiosSchema = z.object({
  pares: z.array(z.object({ salida: z.number().int().positive(), entrada: z.number().int().positive() })).min(1, 'Elegí al menos un cambio.'),
});
