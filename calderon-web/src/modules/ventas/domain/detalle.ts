import { z } from 'zod';

/**
 * Migración 125 · Qué datos de la operación salen en cada renglón de la factura (CRT, contenedor,
 * N° de guía…). Se recuerda por cliente. La lista, el orden y el texto los arma la base.
 */
export const VERSION_DETALLE = 125;

export interface CampoDetalle {
  codigo: string;
  etiqueta: string;
}
export interface DetalleCliente {
  campos: CampoDetalle[];
  elegidos: string[];
  guardado: boolean;
  ejemplo: string | null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

export function parsearDetalleCliente(raw: unknown): DetalleCliente {
  const j = obj(raw);
  return {
    campos: (Array.isArray(j.campos) ? j.campos : []).map((c) => ({ codigo: String(obj(c).codigo ?? ''), etiqueta: String(obj(c).etiqueta ?? '') })),
    elegidos: Array.isArray(j.elegidos) ? j.elegidos.map(String) : [],
    guardado: j.guardado === true,
    ejemplo: typeof j.ejemplo === 'string' ? j.ejemplo : null,
  };
}

const id = z.number().int().positive();
export const rearmarDetalleSchema = z.object({ facturaId: id, campos: z.array(z.string()) });
export const comprobanteCobroSchema = z.object({ id, ruta: z.string(), nombre: z.string() });
